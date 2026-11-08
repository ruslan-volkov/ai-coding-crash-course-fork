import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  getCourseTable,
  getEnrollmentTrend,
  getInstructorSummary,
  getRevenueTrend,
  parseRange,
} from "./analyticsService";

// A Sunday, so weekly buckets (starting Monday) are easy to reason about.
const NOW = new Date("2026-03-15T12:00:00.000Z");

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

let emailCounter = 0;

function createStudent() {
  emailCounter++;
  return testDb
    .insert(schema.users)
    .values({
      name: `Student ${emailCounter}`,
      email: `student${emailCounter}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

function createInstructorWithCourse() {
  emailCounter++;
  const instructor = testDb
    .insert(schema.users)
    .values({
      name: `Instructor ${emailCounter}`,
      email: `instructor${emailCounter}@example.com`,
      role: schema.UserRole.Instructor,
    })
    .returning()
    .get();
  const course = createCourse(instructor.id);
  return { instructor, course };
}

function createCourse(instructorId: number) {
  emailCounter++;
  return testDb
    .insert(schema.courses)
    .values({
      title: `Course ${emailCounter}`,
      slug: `course-${emailCounter}`,
      description: "A course",
      salesCopy: "Sales copy",
      instructorId,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

function enroll(userId: number, courseId: number, enrolledAt: string) {
  testDb
    .insert(schema.enrollments)
    .values({ userId, courseId, enrolledAt })
    .run();
}

function purchase(
  userId: number,
  courseId: number,
  amountPaid: number,
  createdAt: string
) {
  return testDb
    .insert(schema.purchases)
    .values({ userId, courseId, amountPaid, country: null, createdAt })
    .returning()
    .get();
}

/** A direct purchase: one payment and the buyer's own enrollment. */
function buy(userId: number, courseId: number, amountPaid: number, at: string) {
  purchase(userId, courseId, amountPaid, at);
  enroll(userId, courseId, at);
}

describe("analyticsService", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getInstructorSummary", () => {
    it("counts only the instructor's own courses", () => {
      const other = createInstructorWithCourse();
      const second = createStudent();

      buy(base.user.id, base.course.id, 5000, daysAgo(3));
      buy(second.id, base.course.id, 4000, daysAgo(4));
      buy(base.user.id, other.course.id, 9900, daysAgo(2));

      expect(getInstructorSummary(base.instructor.id, "all")).toEqual({
        totalStudents: 2,
        totalRevenue: 9000,
      });
      expect(getInstructorSummary(other.instructor.id, "all")).toEqual({
        totalStudents: 1,
        totalRevenue: 9900,
      });
    });

    it("counts a team purchase once and coupon redemptions as students without revenue", () => {
      const buyer = createStudent();
      const redeemerA = createStudent();
      const redeemerB = createStudent();

      // Three seats bought for 15000; the buyer is not enrolled themselves.
      const teamPurchase = purchase(
        buyer.id,
        base.course.id,
        15000,
        daysAgo(10)
      );
      const team = testDb.insert(schema.teams).values({}).returning().get();
      for (const [i, redeemer] of [redeemerA, redeemerB, null].entries()) {
        testDb
          .insert(schema.coupons)
          .values({
            teamId: team.id,
            courseId: base.course.id,
            code: `code-${i}`,
            purchaseId: teamPurchase.id,
            redeemedByUserId: redeemer?.id ?? null,
            redeemedAt: redeemer ? daysAgo(5) : null,
          })
          .run();
        if (redeemer) enroll(redeemer.id, base.course.id, daysAgo(5));
      }

      expect(getInstructorSummary(base.instructor.id, "all")).toEqual({
        totalStudents: 2,
        totalRevenue: 15000,
      });
    });

    it("filters enrollments and revenue by their own timestamps, inclusive of the range start", () => {
      const second = createStudent();
      const third = createStudent();

      // Paid 40 days ago, enrolled exactly on the 7-day boundary.
      purchase(base.user.id, base.course.id, 5000, daysAgo(40));
      enroll(base.user.id, base.course.id, daysAgo(7));
      // Just outside the 7-day window.
      buy(second.id, base.course.id, 3000, daysAgo(7.001));
      // Exactly on the 30-day boundary.
      buy(third.id, base.course.id, 2000, daysAgo(30));

      expect(getInstructorSummary(base.instructor.id, "7d")).toEqual({
        totalStudents: 1,
        totalRevenue: 0,
      });
      expect(getInstructorSummary(base.instructor.id, "30d")).toEqual({
        totalStudents: 3,
        totalRevenue: 5000,
      });
      expect(getInstructorSummary(base.instructor.id, "90d")).toEqual({
        totalStudents: 3,
        totalRevenue: 10000,
      });
    });
  });

  describe("trends", () => {
    it("buckets enrollments daily for the last 7 days, filling empty days with zero", () => {
      const second = createStudent();
      const third = createStudent();
      const fourth = createStudent();

      enroll(base.user.id, base.course.id, daysAgo(0));
      enroll(second.id, base.course.id, daysAgo(1));
      enroll(third.id, base.course.id, daysAgo(1.1));
      enroll(fourth.id, base.course.id, daysAgo(3));

      expect(getEnrollmentTrend(base.instructor.id, "7d")).toEqual([
        { bucket: "2026-03-08", value: 0 },
        { bucket: "2026-03-09", value: 0 },
        { bucket: "2026-03-10", value: 0 },
        { bucket: "2026-03-11", value: 0 },
        { bucket: "2026-03-12", value: 1 },
        { bucket: "2026-03-13", value: 0 },
        { bucket: "2026-03-14", value: 2 },
        { bucket: "2026-03-15", value: 1 },
      ]);
    });

    it("buckets daily for 30 days", () => {
      enroll(base.user.id, base.course.id, daysAgo(30));

      const trend = getEnrollmentTrend(base.instructor.id, "30d");
      expect(trend).toHaveLength(31);
      expect(trend[0]).toEqual({ bucket: "2026-02-13", value: 1 });
      expect(trend[30]).toEqual({ bucket: "2026-03-15", value: 0 });
    });

    it("buckets weekly (weeks starting Monday) for 90 days", () => {
      const second = createStudent();
      const third = createStudent();

      enroll(base.user.id, base.course.id, daysAgo(0)); // Sun 15 Mar
      enroll(second.id, base.course.id, daysAgo(6)); // Mon 9 Mar
      enroll(third.id, base.course.id, daysAgo(7)); // Sun 8 Mar

      const trend = getEnrollmentTrend(base.instructor.id, "90d");
      // 90 days back is Mon 15 Dec 2025.
      expect(trend[0]).toEqual({ bucket: "2025-12-15", value: 0 });
      expect(trend.slice(-2)).toEqual([
        { bucket: "2026-03-02", value: 1 },
        { bucket: "2026-03-09", value: 2 },
      ]);
      expect(trend).toHaveLength(13);
    });

    it("buckets monthly for all time, from the first record to now", () => {
      const second = createStudent();

      enroll(base.user.id, base.course.id, daysAgo(0));
      enroll(second.id, base.course.id, daysAgo(60)); // 14 Jan

      expect(getEnrollmentTrend(base.instructor.id, "all")).toEqual([
        { bucket: "2026-01", value: 1 },
        { bucket: "2026-02", value: 0 },
        { bucket: "2026-03", value: 1 },
      ]);
    });

    it("starts all-time enrollment and revenue trends at the same month", () => {
      // Paid in January, enrolled in March: both charts must share an x-axis.
      purchase(base.user.id, base.course.id, 5000, daysAgo(60));
      enroll(base.user.id, base.course.id, daysAgo(0));

      const enrollmentBuckets = getEnrollmentTrend(base.instructor.id, "all");
      const revenueBuckets = getRevenueTrend(base.instructor.id, "all");
      expect(enrollmentBuckets.map((point) => point.bucket)).toEqual([
        "2026-01",
        "2026-02",
        "2026-03",
      ]);
      expect(revenueBuckets.map((point) => point.bucket)).toEqual([
        "2026-01",
        "2026-02",
        "2026-03",
      ]);
    });

    it("returns no buckets for all time when there is no data", () => {
      expect(getEnrollmentTrend(base.instructor.id, "all")).toEqual([]);
    });

    it("sums revenue per bucket for the instructor's courses only", () => {
      const other = createInstructorWithCourse();
      const second = createStudent();

      buy(base.user.id, base.course.id, 5000, daysAgo(0));
      buy(second.id, base.course.id, 2500, daysAgo(0.2));
      buy(base.user.id, other.course.id, 9900, daysAgo(0));

      expect(getRevenueTrend(base.instructor.id, "all")).toEqual([
        { bucket: "2026-03", value: 7500 },
      ]);
      expect(getRevenueTrend(base.instructor.id, "7d").at(-1)).toEqual({
        bucket: "2026-03-15",
        value: 7500,
      });
    });
  });

  describe("getCourseTable", () => {
    it("lists each of the instructor's courses with students and revenue in range", () => {
      const other = createInstructorWithCourse();
      const quietCourse = createCourse(base.instructor.id);
      const second = createStudent();

      buy(base.user.id, base.course.id, 5000, daysAgo(2));
      buy(second.id, base.course.id, 4000, daysAgo(20));
      enroll(second.id, quietCourse.id, daysAgo(50)); // free, outside 30d
      buy(base.user.id, other.course.id, 9900, daysAgo(1));

      const rowFor = (rows: ReturnType<typeof getCourseTable>, id: number) =>
        rows.find((row) => row.courseId === id);

      const allTime = getCourseTable(base.instructor.id, "all");
      expect(allTime).toHaveLength(2);
      expect(rowFor(allTime, base.course.id)).toMatchObject({
        title: base.course.title,
        students: 2,
        revenue: 9000,
      });
      expect(rowFor(allTime, quietCourse.id)).toMatchObject({
        students: 1,
        revenue: 0,
      });

      const lastWeek = getCourseTable(base.instructor.id, "7d");
      expect(rowFor(lastWeek, base.course.id)).toMatchObject({
        students: 1,
        revenue: 5000,
      });
      expect(rowFor(lastWeek, quietCourse.id)).toMatchObject({
        students: 0,
        revenue: 0,
      });
    });

    it("includes every course platform-wide when no instructor is given", () => {
      createInstructorWithCourse();
      expect(getCourseTable(null, "all")).toHaveLength(2);
    });
  });

  describe("parseRange", () => {
    it("accepts the known ranges and defaults anything else to all time", () => {
      expect(parseRange("7d")).toBe("7d");
      expect(parseRange("30d")).toBe("30d");
      expect(parseRange("90d")).toBe("90d");
      expect(parseRange("all")).toBe("all");
      expect(parseRange(null)).toBe("all");
      expect(parseRange("1y")).toBe("all");
    });
  });
});
