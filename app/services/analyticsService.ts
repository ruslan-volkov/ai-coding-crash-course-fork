import { and, eq, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "~/db";
import {
  coupons,
  courses,
  enrollments,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
  purchases,
  quizAnswers,
  quizAttempts,
  quizOptions,
  quizQuestions,
  quizzes,
} from "~/db/schema";

// ─── Analytics Service ───
// Owns every analytics metric definition. Uses aggregate SQL so cost does not
// scale with roster size — never loop over students calling per-user helpers.
//
// Summary functions take (instructorId | null, range): an instructor id scopes
// to that instructor's courses, null means platform-wide.
//
// Definitions:
// - Students = enrollments, filtered by enrolledAt.
// - Completion = enrollments with completedAt / enrollments, for the cohort
//   that enrolled in range.
// - Revenue = gross sum of purchases.amountPaid in cents, filtered by
//   purchases.createdAt. A team purchase is one purchase row, so it counts once
//   at purchase time; coupon redemptions create enrollments but no purchase.
//
// Uses positional parameters (project convention).

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";

/**
 * A share returned as its parts, so the UI can show a raw fraction ("2/3")
 * instead of a percentage when the sample is small.
 */
export type Ratio = { count: number; total: number };

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
    .select({
      count: sql<number>`count(*)`,
      completed: sql<number>`coalesce(sum(case when ${enrollments.completedAt} is not null then 1 else 0 end), 0)`,
    })
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

  const totalStudents = studentRow?.count ?? 0;
  return {
    totalStudents,
    totalRevenue: revenueRow?.total ?? 0,
    // Pooled across courses, so larger courses weigh more. The students who
    // enrolled in range are the cohort, as on the course analytics page.
    completion: {
      count: studentRow?.completed ?? 0,
      total: totalStudents,
    } satisfies Ratio,
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
  /** Cohort enrollments that completed the course. */
  completion: Ratio;
  /** Mean best score (0–1) over the cohort's (student, quiz) pairs; null when none. */
  averageQuizScore: number | null;
};

/**
 * Every course in scope, with students and revenue in range (0 when none), and
 * completion and average quiz score for the cohort that enrolled in range.
 */
export function getCourseTable(
  instructorId: number | null,
  range: AnalyticsRange
): CourseTableRow[] {
  const studentCounts = db
    .select({
      courseId: enrollments.courseId,
      students: sql<number>`count(*)`.as("students"),
      completed:
        sql<number>`sum(case when ${enrollments.completedAt} is not null then 1 else 0 end)`.as(
          "completed"
        ),
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

  const bestScores = db
    .select({
      courseId: modules.courseId,
      best: sql<number>`max(${quizAttempts.score})`.as("best"),
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .innerJoin(lessons, eq(lessons.id, quizzes.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .innerJoin(
      enrollments,
      and(
        eq(enrollments.userId, quizAttempts.userId),
        eq(enrollments.courseId, modules.courseId)
      )
    )
    .where(
      and(
        instructorScope(instructorId),
        sinceRangeStart(enrollments.enrolledAt, range)
      )
    )
    .groupBy(modules.courseId, quizAttempts.userId, quizAttempts.quizId)
    .as("best_scores");

  const quizAverages = db
    .select({
      courseId: bestScores.courseId,
      averageQuizScore: sql<number>`avg(${bestScores.best})`.as(
        "average_quiz_score"
      ),
    })
    .from(bestScores)
    .groupBy(bestScores.courseId)
    .as("quiz_averages");

  return db
    .select({
      courseId: courses.id,
      title: courses.title,
      students: sql<number>`coalesce(${studentCounts.students}, 0)`,
      revenue: sql<number>`coalesce(${revenueTotals.revenue}, 0)`,
      completed: sql<number>`coalesce(${studentCounts.completed}, 0)`,
      averageQuizScore: sql<number | null>`${quizAverages.averageQuizScore}`,
    })
    .from(courses)
    .leftJoin(studentCounts, eq(studentCounts.courseId, courses.id))
    .leftJoin(revenueTotals, eq(revenueTotals.courseId, courses.id))
    .leftJoin(quizAverages, eq(quizAverages.courseId, courses.id))
    .where(instructorScope(instructorId))
    .orderBy(courses.title)
    .all()
    .map(({ completed, ...row }) => ({
      ...row,
      completion: { count: completed, total: row.students },
    }));
}

// ─── Course Analytics ───
// Course-level functions take (courseId, range). Enrollment counts filter by
// enrolledAt. Completion, progress, drop-off and quiz metrics are a cohort
// view: they describe the students who enrolled in the range, whenever those
// students did the work.

/** The course's enrollments in range — the cohort the course metrics describe. */
function cohort(courseId: number, range: AnalyticsRange) {
  return db
    .select({
      userId: enrollments.userId,
      completedAt: enrollments.completedAt,
    })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, courseId),
        sinceRangeStart(enrollments.enrolledAt, range)
      )
    )
    .as("cohort");
}

export type EnrollmentBreakdown = {
  total: number;
  purchased: number;
  couponRedeemed: number;
  free: number;
  unredeemedSeats: number;
};

/**
 * Where the course's students came from. An enrollment with a matching
 * purchase is a direct purchase; otherwise one via a redeemed coupon is a
 * coupon redemption; anything else is free. Unredeemed seats are the course's
 * coupons nobody has redeemed yet, whenever they were bought.
 */
export function getEnrollmentBreakdown(
  courseId: number,
  range: AnalyticsRange
): EnrollmentBreakdown {
  const hasPurchase = sql`exists (select 1 from ${purchases} where ${purchases.userId} = ${enrollments.userId} and ${purchases.courseId} = ${enrollments.courseId})`;
  const hasCoupon = sql`exists (select 1 from ${coupons} where ${coupons.redeemedByUserId} = ${enrollments.userId} and ${coupons.courseId} = ${enrollments.courseId})`;

  const row = db
    .select({
      total: sql<number>`count(*)`,
      purchased: sql<number>`coalesce(sum(case when ${hasPurchase} then 1 else 0 end), 0)`,
      couponRedeemed: sql<number>`coalesce(sum(case when not ${hasPurchase} and ${hasCoupon} then 1 else 0 end), 0)`,
    })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, courseId),
        sinceRangeStart(enrollments.enrolledAt, range)
      )
    )
    .get();

  const seats = db
    .select({ count: sql<number>`count(*)` })
    .from(coupons)
    .where(
      and(eq(coupons.courseId, courseId), isNull(coupons.redeemedByUserId))
    )
    .get();

  const total = row?.total ?? 0;
  const purchased = row?.purchased ?? 0;
  const couponRedeemed = row?.couponRedeemed ?? 0;
  return {
    total,
    purchased,
    couponRedeemed,
    free: total - purchased - couponRedeemed,
    unredeemedSeats: seats?.count ?? 0,
  };
}

/** Distinct (student, lesson) completions in the course by the cohort, per lesson. */
function cohortLessonCompletions(courseId: number, range: AnalyticsRange) {
  const students = cohort(courseId, range);
  return db
    .select({
      lessonId: lessonProgress.lessonId,
      completed: sql<number>`count(distinct ${lessonProgress.userId})`.as(
        "completed"
      ),
    })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(students, eq(students.userId, lessonProgress.userId))
    .where(
      and(
        eq(modules.courseId, courseId),
        eq(lessonProgress.status, LessonProgressStatus.Completed)
      )
    )
    .groupBy(lessonProgress.lessonId)
    .as("lesson_completions");
}

export type CourseCompletion = {
  /** Cohort enrollments with a completion date, out of cohort enrollments. */
  completion: Ratio;
  /** Mean share of the course's lessons each student completed (0–1); null with no lessons or no students. */
  averageProgress: number | null;
};

export function getCourseCompletion(
  courseId: number,
  range: AnalyticsRange
): CourseCompletion {
  const students = cohort(courseId, range);
  const completionRow = db
    .select({
      total: sql<number>`count(*)`,
      count: sql<number>`coalesce(sum(case when ${students.completedAt} is not null then 1 else 0 end), 0)`,
    })
    .from(students)
    .get();
  const completion = {
    count: completionRow?.count ?? 0,
    total: completionRow?.total ?? 0,
  };

  const perLesson = cohortLessonCompletions(courseId, range);
  const lessonRow = db
    .select({
      lessonCount: sql<number>`count(*)`,
      completions: sql<number>`coalesce(sum(${perLesson.completed}), 0)`,
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .leftJoin(perLesson, eq(perLesson.lessonId, lessons.id))
    .where(eq(modules.courseId, courseId))
    .get();
  const lessonCount = lessonRow?.lessonCount ?? 0;

  const averageProgress =
    lessonCount === 0 || completion.total === 0
      ? null
      : (lessonRow?.completions ?? 0) / (lessonCount * completion.total);

  return { completion, averageProgress };
}

export type LessonDropOffRow = {
  lessonId: number;
  title: string;
  moduleTitle: string;
  /** Cohort students who completed the lesson, out of the cohort. */
  completed: Ratio;
};

/** Every lesson in module/lesson position order, with the cohort's completion. */
export function getLessonDropOff(
  courseId: number,
  range: AnalyticsRange
): LessonDropOffRow[] {
  const total = getCourseCompletion(courseId, range).completion.total;
  const perLesson = cohortLessonCompletions(courseId, range);

  return db
    .select({
      lessonId: lessons.id,
      title: lessons.title,
      moduleTitle: modules.title,
      count: sql<number>`coalesce(${perLesson.completed}, 0)`,
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .leftJoin(perLesson, eq(perLesson.lessonId, lessons.id))
    .where(eq(modules.courseId, courseId))
    .orderBy(modules.position, lessons.position)
    .all()
    .map(({ count, ...lesson }) => ({
      ...lesson,
      completed: { count, total },
    }));
}

export type QuizQuestionStat = {
  questionId: number;
  questionText: string;
  /** Correct answers out of answers recorded by the cohort, across all attempts. */
  correct: Ratio;
};

export type QuizPerformance = {
  quizId: number;
  title: string;
  lessonTitle: string;
  /** 0–1, same scale as attempt scores. */
  passingScore: number;
  studentsAttempted: number;
  /** Mean of each student's best score (0–1); null when nobody attempted. */
  averageBestScore: number | null;
  /** Students whose best score reaches the quiz's current passing score, out of students attempted. */
  passed: Ratio;
  averageAttempts: number | null;
  questions: QuizQuestionStat[];
};

/**
 * Per quiz, in module/lesson position order, how the cohort performed. Each
 * student counts once, by their best attempt; per-question correct rates use
 * every answer the cohort recorded.
 */
export function getQuizPerformance(
  courseId: number,
  range: AnalyticsRange
): QuizPerformance[] {
  const courseQuizzes = db
    .select({
      quizId: quizzes.id,
      title: quizzes.title,
      lessonTitle: lessons.title,
      passingScore: quizzes.passingScore,
    })
    .from(quizzes)
    .innerJoin(lessons, eq(lessons.id, quizzes.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(eq(modules.courseId, courseId))
    .orderBy(modules.position, lessons.position, quizzes.id)
    .all();
  if (courseQuizzes.length === 0) return [];
  const quizIds = courseQuizzes.map((quiz) => quiz.quizId);

  const students = cohort(courseId, range);
  const bestAttempts = db
    .select({
      quizId: quizAttempts.quizId,
      best: sql<number>`max(${quizAttempts.score})`.as("best"),
      attempts: sql<number>`count(*)`.as("attempts"),
    })
    .from(quizAttempts)
    .innerJoin(students, eq(students.userId, quizAttempts.userId))
    .where(inArray(quizAttempts.quizId, quizIds))
    .groupBy(quizAttempts.quizId, quizAttempts.userId)
    .as("best_attempts");

  const attemptStats = new Map(
    db
      .select({
        quizId: bestAttempts.quizId,
        students: sql<number>`count(*)`,
        averageBest: sql<number>`avg(${bestAttempts.best})`,
        passed: sql<number>`sum(case when ${bestAttempts.best} >= ${quizzes.passingScore} then 1 else 0 end)`,
        attempts: sql<number>`sum(${bestAttempts.attempts})`,
      })
      .from(bestAttempts)
      .innerJoin(quizzes, eq(quizzes.id, bestAttempts.quizId))
      .groupBy(bestAttempts.quizId)
      .all()
      .map((row) => [row.quizId, row])
  );

  const answerStats = db
    .select({
      questionId: quizAnswers.questionId,
      answered: sql<number>`count(*)`.as("answered"),
      correct:
        sql<number>`sum(case when ${quizOptions.isCorrect} then 1 else 0 end)`.as(
          "correct"
        ),
    })
    .from(quizAnswers)
    .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.attemptId))
    .innerJoin(students, eq(students.userId, quizAttempts.userId))
    .innerJoin(quizOptions, eq(quizOptions.id, quizAnswers.selectedOptionId))
    .where(inArray(quizAttempts.quizId, quizIds))
    .groupBy(quizAnswers.questionId)
    .as("answer_stats");

  const questions = db
    .select({
      quizId: quizQuestions.quizId,
      questionId: quizQuestions.id,
      questionText: quizQuestions.questionText,
      count: sql<number>`coalesce(${answerStats.correct}, 0)`,
      total: sql<number>`coalesce(${answerStats.answered}, 0)`,
    })
    .from(quizQuestions)
    .leftJoin(answerStats, eq(answerStats.questionId, quizQuestions.id))
    .where(inArray(quizQuestions.quizId, quizIds))
    .orderBy(quizQuestions.position, quizQuestions.id)
    .all();

  return courseQuizzes.map((quiz) => {
    const stats = attemptStats.get(quiz.quizId);
    const studentsAttempted = stats?.students ?? 0;
    return {
      ...quiz,
      studentsAttempted,
      averageBestScore: stats ? stats.averageBest : null,
      passed: { count: stats?.passed ?? 0, total: studentsAttempted },
      averageAttempts: stats ? stats.attempts / studentsAttempted : null,
      questions: questions
        .filter((question) => question.quizId === quiz.quizId)
        .map(({ questionId, questionText, count, total }) => ({
          questionId,
          questionText,
          correct: { count, total },
        })),
    };
  });
}
