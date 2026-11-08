import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { and, eq } from "drizzle-orm";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  getCourseTable,
  getCourseCompletion,
  getEnrollmentBreakdown,
  getLessonDropOff,
  getQuizPerformance,
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

/**
 * A team purchase of one seat per entry; a user id redeems that seat 5 days
 * ago (and enrolls), null leaves it unredeemed. The buyer is not enrolled.
 */
function redeemTeamSeats(
  buyerId: number,
  courseId: number,
  redeemers: (number | null)[]
) {
  const teamPurchase = purchase(buyerId, courseId, 3000, daysAgo(10));
  const team = testDb.insert(schema.teams).values({}).returning().get();
  for (const [i, redeemer] of redeemers.entries()) {
    testDb
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId,
        code: `seat-${teamPurchase.id}-${i}`,
        purchaseId: teamPurchase.id,
        redeemedByUserId: redeemer,
        redeemedAt: redeemer === null ? null : daysAgo(5),
      })
      .run();
    if (redeemer !== null) enroll(redeemer, courseId, daysAgo(5));
  }
}

function createModule(courseId: number, position: number) {
  return testDb
    .insert(schema.modules)
    .values({ courseId, title: `Module ${position}`, position })
    .returning()
    .get();
}

function createLesson(moduleId: number, position: number, title: string) {
  return testDb
    .insert(schema.lessons)
    .values({ moduleId, title, position })
    .returning()
    .get();
}

function completeLesson(userId: number, lessonId: number) {
  testDb
    .insert(schema.lessonProgress)
    .values({
      userId,
      lessonId,
      status: schema.LessonProgressStatus.Completed,
      completedAt: daysAgo(1),
    })
    .run();
}

function markCourseCompleted(userId: number, courseId: number) {
  testDb
    .update(schema.enrollments)
    .set({ completedAt: daysAgo(1) })
    .where(
      and(
        eq(schema.enrollments.userId, userId),
        eq(schema.enrollments.courseId, courseId)
      )
    )
    .run();
}

/** A quiz on the lesson with true/false questions; returns each question's options. */
function createQuiz(lessonId: number, passingScore: number, questions: number) {
  const quiz = testDb
    .insert(schema.quizzes)
    .values({ lessonId, title: `Quiz on ${lessonId}`, passingScore })
    .returning()
    .get();
  const items = Array.from({ length: questions }, (_, i) => {
    const question = testDb
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: `Question ${i + 1}`,
        questionType: schema.QuestionType.TrueFalse,
        position: i + 1,
      })
      .returning()
      .get();
    const [right, wrong] = [true, false].map((isCorrect) =>
      testDb
        .insert(schema.quizOptions)
        .values({
          questionId: question.id,
          optionText: String(isCorrect),
          isCorrect,
        })
        .returning()
        .get()
    );
    return { question, right, wrong };
  });
  return { quiz, items };
}

/** Records an attempt answering each question right (true) or wrong (false). */
function attemptQuiz(
  userId: number,
  { quiz, items }: ReturnType<typeof createQuiz>,
  answers: boolean[]
) {
  const score = answers.filter(Boolean).length / answers.length;
  const attempt = testDb
    .insert(schema.quizAttempts)
    .values({
      userId,
      quizId: quiz.id,
      score,
      passed: score >= quiz.passingScore,
    })
    .returning()
    .get();
  answers.forEach((correct, i) => {
    testDb
      .insert(schema.quizAnswers)
      .values({
        attemptId: attempt.id,
        questionId: items[i].question.id,
        selectedOptionId: correct ? items[i].right.id : items[i].wrong.id,
      })
      .run();
  });
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

      expect(getInstructorSummary(base.instructor.id, "all")).toMatchObject({
        totalStudents: 2,
        totalRevenue: 9000,
      });
      expect(getInstructorSummary(other.instructor.id, "all")).toMatchObject({
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

      expect(getInstructorSummary(base.instructor.id, "all")).toMatchObject({
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

      expect(getInstructorSummary(base.instructor.id, "7d")).toMatchObject({
        totalStudents: 1,
        totalRevenue: 0,
      });
      expect(getInstructorSummary(base.instructor.id, "30d")).toMatchObject({
        totalStudents: 3,
        totalRevenue: 5000,
      });
      expect(getInstructorSummary(base.instructor.id, "90d")).toMatchObject({
        totalStudents: 3,
        totalRevenue: 10000,
      });
    });
    it("pools course completion across the instructor's courses for the cohort in range", () => {
      const other = createInstructorWithCourse();
      const secondCourse = createCourse(base.instructor.id);
      const second = createStudent();
      const third = createStudent();

      enroll(base.user.id, base.course.id, daysAgo(2));
      markCourseCompleted(base.user.id, base.course.id);
      enroll(second.id, secondCourse.id, daysAgo(3));
      enroll(third.id, secondCourse.id, daysAgo(40));
      markCourseCompleted(third.id, secondCourse.id);
      enroll(base.user.id, other.course.id, daysAgo(1));
      markCourseCompleted(base.user.id, other.course.id);

      expect(
        getInstructorSummary(base.instructor.id, "all").completion
      ).toEqual({
        count: 2,
        total: 3,
      });
      expect(
        getInstructorSummary(base.instructor.id, "30d").completion
      ).toEqual({
        count: 1,
        total: 2,
      });
      expect(getInstructorSummary(null, "all").completion).toEqual({
        count: 3,
        total: 4,
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

    it("adds completion and the average best quiz score per course, by enrollment cohort", () => {
      const quietCourse = createCourse(base.instructor.id);
      const mod = createModule(base.course.id, 1);
      const quizA = createQuiz(createLesson(mod.id, 1, "A").id, 0.5, 2);
      const quizB = createQuiz(createLesson(mod.id, 2, "B").id, 0.5, 1);
      const second = createStudent();
      const veteran = createStudent();

      enroll(base.user.id, base.course.id, daysAgo(2));
      enroll(second.id, base.course.id, daysAgo(2));
      enroll(veteran.id, base.course.id, daysAgo(60));
      markCourseCompleted(base.user.id, base.course.id);
      markCourseCompleted(veteran.id, base.course.id);

      // Best scores: user A=1.0 (after 0.5), B=0; second A=0.5; veteran A=1.0.
      attemptQuiz(base.user.id, quizA, [true, false]);
      attemptQuiz(base.user.id, quizA, [true, true]);
      attemptQuiz(base.user.id, quizB, [false]);
      attemptQuiz(second.id, quizA, [false, true]);
      attemptQuiz(veteran.id, quizA, [true, true]);

      const rowFor = (rows: ReturnType<typeof getCourseTable>, id: number) =>
        rows.find((row) => row.courseId === id);

      const allTime = getCourseTable(base.instructor.id, "all");
      expect(rowFor(allTime, base.course.id)).toMatchObject({
        completion: { count: 2, total: 3 },
        averageQuizScore: 0.625, // (1 + 0 + 0.5 + 1) / 4
      });
      expect(rowFor(allTime, quietCourse.id)).toMatchObject({
        completion: { count: 0, total: 0 },
        averageQuizScore: null,
      });

      expect(
        rowFor(getCourseTable(base.instructor.id, "30d"), base.course.id)
      ).toMatchObject({
        completion: { count: 1, total: 2 },
        averageQuizScore: 0.5, // (1 + 0 + 0.5) / 3
      });
    });

    it("includes every course platform-wide when no instructor is given", () => {
      createInstructorWithCourse();
      expect(getCourseTable(null, "all")).toHaveLength(2);
    });
  });

  describe("getEnrollmentBreakdown", () => {
    it("splits enrollments into direct purchases, coupon redemptions and free, and counts unredeemed seats", () => {
      const buyer = createStudent();
      const redeemer = createStudent();
      const freeStudent = createStudent();
      const other = createInstructorWithCourse();

      buy(base.user.id, base.course.id, 5000, daysAgo(2));
      enroll(freeStudent.id, base.course.id, daysAgo(3));
      redeemTeamSeats(buyer.id, base.course.id, [redeemer.id, null, null]);
      // Noise on another course.
      buy(redeemer.id, other.course.id, 9900, daysAgo(1));

      expect(getEnrollmentBreakdown(base.course.id, "all")).toEqual({
        total: 3,
        purchased: 1,
        couponRedeemed: 1,
        free: 1,
        unredeemedSeats: 2,
      });
    });

    it("filters enrollments by enrollment date", () => {
      const second = createStudent();
      buy(base.user.id, base.course.id, 5000, daysAgo(2));
      enroll(second.id, base.course.id, daysAgo(40));

      expect(getEnrollmentBreakdown(base.course.id, "30d")).toMatchObject({
        total: 1,
        purchased: 1,
        free: 0,
      });
    });

    it("is all zeros for a course with no enrollments", () => {
      expect(getEnrollmentBreakdown(base.course.id, "all")).toEqual({
        total: 0,
        purchased: 0,
        couponRedeemed: 0,
        free: 0,
        unredeemedSeats: 0,
      });
    });
  });

  describe("getCourseCompletion", () => {
    it("reports completed enrollments and the mean share of lessons completed", () => {
      const mod = createModule(base.course.id, 1);
      const lessonA = createLesson(mod.id, 1, "A");
      const lessonB = createLesson(mod.id, 2, "B");
      const second = createStudent();
      const third = createStudent();

      enroll(base.user.id, base.course.id, daysAgo(5));
      enroll(second.id, base.course.id, daysAgo(5));
      enroll(third.id, base.course.id, daysAgo(5));

      completeLesson(base.user.id, lessonA.id);
      completeLesson(base.user.id, lessonB.id);
      markCourseCompleted(base.user.id, base.course.id);
      completeLesson(second.id, lessonA.id);
      // In-progress lessons don't count.
      testDb
        .insert(schema.lessonProgress)
        .values({
          userId: third.id,
          lessonId: lessonA.id,
          status: schema.LessonProgressStatus.InProgress,
        })
        .run();

      const result = getCourseCompletion(base.course.id, "all");
      expect(result.completion).toEqual({ count: 1, total: 3 });
      // (2/2 + 1/2 + 0/2) / 3 = 0.5
      expect(result.averageProgress).toBeCloseTo(0.5);
    });

    it("ignores progress from users who are not enrolled", () => {
      const mod = createModule(base.course.id, 1);
      const lesson = createLesson(mod.id, 1, "A");
      const second = createStudent();

      enroll(base.user.id, base.course.id, daysAgo(5));
      completeLesson(second.id, lesson.id); // not enrolled

      expect(getCourseCompletion(base.course.id, "all").averageProgress).toBe(
        0
      );
    });

    it("has no average progress for a course with no lessons", () => {
      enroll(base.user.id, base.course.id, daysAgo(5));
      markCourseCompleted(base.user.id, base.course.id);

      expect(getCourseCompletion(base.course.id, "all")).toEqual({
        completion: { count: 1, total: 1 },
        averageProgress: null,
      });
    });

    it("has no average progress for a course with no enrollments", () => {
      const mod = createModule(base.course.id, 1);
      createLesson(mod.id, 1, "A");

      expect(getCourseCompletion(base.course.id, "all")).toEqual({
        completion: { count: 0, total: 0 },
        averageProgress: null,
      });
    });

    it("describes only the cohort that enrolled in the range", () => {
      const mod = createModule(base.course.id, 1);
      const lesson = createLesson(mod.id, 1, "A");
      const veteran = createStudent();

      enroll(base.user.id, base.course.id, daysAgo(3));
      // Enrolled long ago, finished recently — outside the 7-day cohort.
      enroll(veteran.id, base.course.id, daysAgo(60));
      completeLesson(veteran.id, lesson.id);
      markCourseCompleted(veteran.id, base.course.id);

      expect(getCourseCompletion(base.course.id, "7d")).toEqual({
        completion: { count: 0, total: 1 },
        averageProgress: 0,
      });
    });
  });

  describe("getLessonDropOff", () => {
    it("lists each lesson in module then lesson order with the share of the cohort that completed it", () => {
      // Modules and lessons inserted out of order on purpose.
      const second = createModule(base.course.id, 2);
      const first = createModule(base.course.id, 1);
      const lesson3 = createLesson(second.id, 1, "Third");
      const lesson2 = createLesson(first.id, 2, "Second");
      const lesson1 = createLesson(first.id, 1, "First");
      const student2 = createStudent();
      const late = createStudent();

      enroll(base.user.id, base.course.id, daysAgo(2));
      enroll(student2.id, base.course.id, daysAgo(2));
      enroll(late.id, base.course.id, daysAgo(60));

      completeLesson(base.user.id, lesson1.id);
      completeLesson(base.user.id, lesson2.id);
      completeLesson(student2.id, lesson1.id);
      completeLesson(late.id, lesson3.id);

      expect(getLessonDropOff(base.course.id, "30d")).toEqual([
        {
          lessonId: lesson1.id,
          title: "First",
          moduleTitle: "Module 1",
          completed: { count: 2, total: 2 },
        },
        {
          lessonId: lesson2.id,
          title: "Second",
          moduleTitle: "Module 1",
          completed: { count: 1, total: 2 },
        },
        {
          lessonId: lesson3.id,
          title: "Third",
          moduleTitle: "Module 2",
          completed: { count: 0, total: 2 },
        },
      ]);
    });

    it("is empty for a course with no lessons", () => {
      enroll(base.user.id, base.course.id, daysAgo(2));
      expect(getLessonDropOff(base.course.id, "all")).toEqual([]);
    });
  });

  describe("getQuizPerformance", () => {
    it("uses each student's best attempt for average score and pass rate", () => {
      const mod = createModule(base.course.id, 1);
      const lesson = createLesson(mod.id, 1, "Quiz lesson");
      const quiz = createQuiz(lesson.id, 0.75, 4);
      const second = createStudent();
      const third = createStudent();

      enroll(base.user.id, base.course.id, daysAgo(5));
      enroll(second.id, base.course.id, daysAgo(5));
      enroll(third.id, base.course.id, daysAgo(5)); // never attempts

      // Student 1: 0.25 then 1.0 then 0.5 → best 1.0, passes.
      attemptQuiz(base.user.id, quiz, [true, false, false, false]);
      attemptQuiz(base.user.id, quiz, [true, true, true, true]);
      attemptQuiz(base.user.id, quiz, [true, true, false, false]);
      // Student 2: one attempt at 0.5 → fails a 0.75 pass mark.
      attemptQuiz(second.id, quiz, [true, false, true, false]);

      const [result] = getQuizPerformance(base.course.id, "all");
      expect(result).toMatchObject({
        quizId: quiz.quiz.id,
        lessonTitle: "Quiz lesson",
        passingScore: 0.75,
        studentsAttempted: 2,
        averageBestScore: 0.75,
        passed: { count: 1, total: 2 },
        averageAttempts: 2,
      });
    });

    it("counts a best score exactly on the passing score as a pass", () => {
      const mod = createModule(base.course.id, 1);
      const lesson = createLesson(mod.id, 1, "Quiz lesson");
      const quiz = createQuiz(lesson.id, 0.5, 2);

      enroll(base.user.id, base.course.id, daysAgo(5));
      attemptQuiz(base.user.id, quiz, [true, false]);

      const [result] = getQuizPerformance(base.course.id, "all");
      expect(result.passed).toEqual({ count: 1, total: 1 });
    });

    it("reports each question's correct-answer rate across recorded answers, in question order", () => {
      const mod = createModule(base.course.id, 1);
      const lesson = createLesson(mod.id, 1, "Quiz lesson");
      const quiz = createQuiz(lesson.id, 0.5, 2);
      const second = createStudent();

      enroll(base.user.id, base.course.id, daysAgo(5));
      enroll(second.id, base.course.id, daysAgo(5));
      attemptQuiz(base.user.id, quiz, [false, true]);
      attemptQuiz(base.user.id, quiz, [true, true]);
      attemptQuiz(second.id, quiz, [false, false]);

      const [result] = getQuizPerformance(base.course.id, "all");
      expect(result.questions).toEqual([
        {
          questionId: quiz.items[0].question.id,
          questionText: "Question 1",
          correct: { count: 1, total: 3 },
        },
        {
          questionId: quiz.items[1].question.id,
          questionText: "Question 2",
          correct: { count: 2, total: 3 },
        },
      ]);
    });

    it("lists a quiz nobody attempted with no averages", () => {
      const mod = createModule(base.course.id, 1);
      const lesson = createLesson(mod.id, 1, "Quiz lesson");
      const quiz = createQuiz(lesson.id, 0.5, 1);
      enroll(base.user.id, base.course.id, daysAgo(5));

      expect(getQuizPerformance(base.course.id, "all")).toEqual([
        {
          quizId: quiz.quiz.id,
          title: quiz.quiz.title,
          lessonTitle: "Quiz lesson",
          passingScore: 0.5,
          studentsAttempted: 0,
          averageBestScore: null,
          passed: { count: 0, total: 0 },
          averageAttempts: null,
          questions: [
            {
              questionId: quiz.items[0].question.id,
              questionText: "Question 1",
              correct: { count: 0, total: 0 },
            },
          ],
        },
      ]);
    });

    it("only counts attempts by the cohort that enrolled in the range", () => {
      const mod = createModule(base.course.id, 1);
      const lesson = createLesson(mod.id, 1, "Quiz lesson");
      const quiz = createQuiz(lesson.id, 0.5, 1);
      const veteran = createStudent();
      const outsider = createStudent();

      enroll(base.user.id, base.course.id, daysAgo(3));
      enroll(veteran.id, base.course.id, daysAgo(60));
      attemptQuiz(base.user.id, quiz, [false]);
      attemptQuiz(veteran.id, quiz, [true]); // enrolled outside 7d
      attemptQuiz(outsider.id, quiz, [true]); // never enrolled

      const [result] = getQuizPerformance(base.course.id, "7d");
      expect(result).toMatchObject({
        studentsAttempted: 1,
        averageBestScore: 0,
        passed: { count: 0, total: 1 },
      });
      expect(result.questions[0].correct).toEqual({ count: 0, total: 1 });
    });

    it("orders quizzes by module and lesson position", () => {
      const later = createModule(base.course.id, 2);
      const earlier = createModule(base.course.id, 1);
      const second = createQuiz(createLesson(later.id, 1, "Late").id, 0.5, 1);
      const first = createQuiz(createLesson(earlier.id, 1, "Early").id, 0.5, 1);

      expect(
        getQuizPerformance(base.course.id, "all").map((quiz) => quiz.quizId)
      ).toEqual([first.quiz.id, second.quiz.id]);
    });

    it("is empty for a course with no quizzes", () => {
      const mod = createModule(base.course.id, 1);
      createLesson(mod.id, 1, "Plain lesson");
      expect(getQuizPerformance(base.course.id, "all")).toEqual([]);
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
