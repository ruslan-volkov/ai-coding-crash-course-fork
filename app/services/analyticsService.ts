import { and, eq, gte, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "~/db";
import { courses, enrollments, purchases } from "~/db/schema";

// ─── Analytics Service ───
// Owns every analytics metric definition. Uses aggregate SQL so cost does not
// scale with roster size — never loop over students calling per-user helpers.
//
// Summary functions take (instructorId | null, range): an instructor id scopes
// to that instructor's courses, null means platform-wide.
//
// Definitions:
// - Students = enrollments, filtered by enrolledAt.
// - Revenue = gross sum of purchases.amountPaid in cents, filtered by
//   purchases.createdAt. A team purchase is one purchase row, so it counts once
//   at purchase time; coupon redemptions create enrollments but no purchase.
//
// Uses positional parameters (project convention).

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";

export const ANALYTICS_RANGES: readonly AnalyticsRange[] = [
  "7d",
  "30d",
  "90d",
  "all",
];

/** Reads a `?range=` value; anything missing or unknown means all time. */
export function parseRange(value: string | null): AnalyticsRange {
  return ANALYTICS_RANGES.find((range) => range === value) ?? "all";
}

const RANGE_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** ISO timestamp the range starts at (inclusive), or null for all time. */
export function getRangeStart(range: AnalyticsRange): string | null {
  if (range === "all") return null;
  return new Date(Date.now() - RANGE_DAYS[range] * 86_400_000).toISOString();
}

function sinceRangeStart(
  column: SQLiteColumn,
  range: AnalyticsRange
): SQL | undefined {
  const start = getRangeStart(range);
  return start === null ? undefined : gte(column, start);
}

function instructorScope(instructorId: number | null): SQL | undefined {
  return instructorId === null
    ? undefined
    : eq(courses.instructorId, instructorId);
}

export function getInstructorSummary(
  instructorId: number | null,
  range: AnalyticsRange
) {
  const studentRow = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(
      and(
        instructorScope(instructorId),
        sinceRangeStart(enrollments.enrolledAt, range)
      )
    )
    .get();

  const revenueRow = db
    .select({ total: sql<number>`coalesce(sum(${purchases.amountPaid}), 0)` })
    .from(purchases)
    .innerJoin(courses, eq(courses.id, purchases.courseId))
    .where(
      and(
        instructorScope(instructorId),
        sinceRangeStart(purchases.createdAt, range)
      )
    )
    .get();

  return {
    totalStudents: studentRow?.count ?? 0,
    totalRevenue: revenueRow?.total ?? 0,
  };
}

// ─── Trends ───
// Bucketing: daily for 7d/30d, weekly (weeks start Monday) for 90d, monthly for
// all time. Buckets are UTC and labelled by their first day ("2026-03-09") or,
// for months, "2026-03". Empty buckets are filled with 0; all-time trends start
// at the month of the first enrollment or purchase in scope, so the enrollment
// and revenue charts share an x-axis.

export type TrendPoint = { bucket: string; value: number };

type Granularity = "day" | "week" | "month";

function granularityFor(range: AnalyticsRange): Granularity {
  if (range === "all") return "month";
  if (range === "90d") return "week";
  return "day";
}

function bucketExpression(column: SQLiteColumn, granularity: Granularity) {
  switch (granularity) {
    case "day":
      return sql<string>`substr(${column}, 1, 10)`;
    case "week":
      return sql<string>`date(${column}, 'weekday 0', '-6 days')`;
    case "month":
      return sql<string>`substr(${column}, 1, 7)`;
  }
}

function bucketOf(date: Date, granularity: Granularity): string {
  const iso = date.toISOString();
  if (granularity === "month") return iso.slice(0, 7);
  if (granularity === "day") return iso.slice(0, 10);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - daysSinceMonday * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function nextBucket(bucket: string, granularity: Granularity): string {
  if (granularity === "month") {
    const [year, month] = bucket.split("-").map(Number);
    return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  }
  const step = granularity === "week" ? 7 : 1;
  const next = new Date(`${bucket}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + step);
  return next.toISOString().slice(0, 10);
}

/** Earliest enrollment or purchase timestamp in scope, or null when none. */
function getFirstActivityAt(instructorId: number | null): string | null {
  const firstEnrollment = db
    .select({ at: sql<string | null>`min(${enrollments.enrolledAt})` })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(instructorScope(instructorId))
    .get()?.at;

  const firstPurchase = db
    .select({ at: sql<string | null>`min(${purchases.createdAt})` })
    .from(purchases)
    .innerJoin(courses, eq(courses.id, purchases.courseId))
    .where(instructorScope(instructorId))
    .get()?.at;

  const candidates = [firstEnrollment, firstPurchase].filter(
    (at): at is string => typeof at === "string"
  );
  return candidates.length > 0 ? candidates.sort()[0] : null;
}

function fillBuckets(
  rows: TrendPoint[],
  instructorId: number | null,
  range: AnalyticsRange,
  granularity: Granularity
): TrendPoint[] {
  const values = new Map(rows.map((row) => [row.bucket, row.value]));
  const start = getRangeStart(range) ?? getFirstActivityAt(instructorId);
  if (start === null) return [];

  const first = bucketOf(new Date(start), granularity);

  const last = bucketOf(new Date(), granularity);
  const points: TrendPoint[] = [];
  for (
    let bucket = first;
    bucket <= last;
    bucket = nextBucket(bucket, granularity)
  ) {
    points.push({ bucket, value: values.get(bucket) ?? 0 });
  }
  return points;
}

export function getEnrollmentTrend(
  instructorId: number | null,
  range: AnalyticsRange
): TrendPoint[] {
  const granularity = granularityFor(range);
  const bucket = bucketExpression(enrollments.enrolledAt, granularity);

  const rows = db
    .select({ bucket, value: sql<number>`count(*)` })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(
      and(
        instructorScope(instructorId),
        sinceRangeStart(enrollments.enrolledAt, range)
      )
    )
    .groupBy(bucket)
    .all();

  return fillBuckets(rows, instructorId, range, granularity);
}

export function getRevenueTrend(
  instructorId: number | null,
  range: AnalyticsRange
): TrendPoint[] {
  const granularity = granularityFor(range);
  const bucket = bucketExpression(purchases.createdAt, granularity);

  const rows = db
    .select({ bucket, value: sql<number>`sum(${purchases.amountPaid})` })
    .from(purchases)
    .innerJoin(courses, eq(courses.id, purchases.courseId))
    .where(
      and(
        instructorScope(instructorId),
        sinceRangeStart(purchases.createdAt, range)
      )
    )
    .groupBy(bucket)
    .all();

  return fillBuckets(rows, instructorId, range, granularity);
}

// ─── Course Table ───

export type CourseTableRow = {
  courseId: number;
  title: string;
  students: number;
  revenue: number;
};

/** Every course in scope, with students and revenue in range (0 when none). */
export function getCourseTable(
  instructorId: number | null,
  range: AnalyticsRange
): CourseTableRow[] {
  const studentCounts = db
    .select({
      courseId: enrollments.courseId,
      students: sql<number>`count(*)`.as("students"),
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(
      and(
        instructorScope(instructorId),
        sinceRangeStart(enrollments.enrolledAt, range)
      )
    )
    .groupBy(enrollments.courseId)
    .as("student_counts");

  const revenueTotals = db
    .select({
      courseId: purchases.courseId,
      revenue: sql<number>`sum(${purchases.amountPaid})`.as("revenue"),
    })
    .from(purchases)
    .innerJoin(courses, eq(courses.id, purchases.courseId))
    .where(
      and(
        instructorScope(instructorId),
        sinceRangeStart(purchases.createdAt, range)
      )
    )
    .groupBy(purchases.courseId)
    .as("revenue_totals");

  return db
    .select({
      courseId: courses.id,
      title: courses.title,
      students: sql<number>`coalesce(${studentCounts.students}, 0)`,
      revenue: sql<number>`coalesce(${revenueTotals.revenue}, 0)`,
    })
    .from(courses)
    .leftJoin(studentCounts, eq(studentCounts.courseId, courses.id))
    .leftJoin(revenueTotals, eq(revenueTotals.courseId, courses.id))
    .where(instructorScope(instructorId))
    .orderBy(courses.title)
    .all();
}
