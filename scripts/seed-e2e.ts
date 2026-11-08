import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as schema from "../app/db/schema";
import {
  CourseStatus,
  LessonProgressStatus,
  QuestionType,
  TeamMemberRole,
  UserRole,
} from "../app/db/schema";
import { COURSES, USERS } from "../e2e/data";

// ─── E2E Seed ───
// Rebuilds the end-to-end database from scratch: deletes the file named by
// DATABASE_PATH, applies the real migrations, and inserts a small deterministic
// data set. Timestamps are relative to now so date-range filters have fixed
// answers. Refuses to touch the dev database.
//
// Expected numbers (asserted in e2e/*.spec.ts):
//   Alice, all time / 90d: 5 students, $175.00
//     Intro to Testing:  Sam bought 3d ago ($50), Lee bought 60d ago ($35)
//     Advanced Testing:  Kim free 10d ago; Max bought 3 team seats 20d ago
//                        ($90), Sam redeemed 15d ago, Lee redeemed 5d ago,
//                        one seat unredeemed
//   Alice, 30d: 4 students, $140.00
//   Alice, 7d:  2 students, $50.00
//   Bob, all time: 2 students, $150.00 (Kim 1d ago, Max 200d ago)
//
// Course analytics (Alice, all time):
//   Average completion 17%: mean of Intro 0/2 and Advanced 1/3 (Kim)
//   Intro to Testing: 2 purchased; completion 0/2; avg progress 25%;
//     drop-off "Why Test?" 1/2, "Check Your Understanding" 0/2;
//     quiz "Testing Basics": best scores 100% (Sam 1 attempt, Lee 2 —
//     wrong then right), pass 2/2, 1.5 attempts, question correct 2/3
//   Advanced Testing: 2 coupon + 1 free, 1 unredeemed seat; completion 1/3;
//     no lessons, no quizzes
//   7d cohort, Intro: Sam only — completion 0/1, progress 50%, "Why Test?"
//     1/1, quiz 1 attempt, question 1/1
//
// Videos, ratings & questions (Alice):
//   Intro "Why Test?" (8 min video): started 2/2 (Sam, Lee), finished 1/2
//     (Sam reached 480s; Lee 120s = 25%); 7d cohort: started 1/1, finished 1/1
//   Intro ratings: 5 (Sam) and 3 (Lee) — average 4.0, 2 ratings
//   Intro questions: 2; unanswered 1 (Lee's); median first reply 1d (Sam's,
//     answered by Alice a day later)
//   Advanced: no videos, no ratings, no questions
//   Dashboard: average rating 4.0 (only Intro rated), 1 unanswered question;
//     Bob: no ratings, 0 unanswered

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, "../drizzle");

const databasePath = process.env.DATABASE_PATH;
if (!databasePath) {
  throw new Error("DATABASE_PATH must be set for the e2e seed.");
}
if (path.resolve(databasePath) === path.resolve("data.db")) {
  throw new Error("Refusing to seed the dev database (data.db) for e2e.");
}

fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(`${databasePath}${suffix}`, { force: true });
}

const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder });

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// ─── Users ───

const roles: Record<keyof typeof USERS, UserRole> = {
  instructor: UserRole.Instructor,
  otherInstructor: UserRole.Instructor,
  admin: UserRole.Admin,
  student: UserRole.Student,
  learnerLee: UserRole.Student,
  learnerKim: UserRole.Student,
  teamBuyer: UserRole.Student,
};

for (const [key, user] of Object.entries(USERS)) {
  db.insert(schema.users)
    .values({
      id: user.id,
      name: user.name,
      email: `${key}@e2e.test`,
      role: roles[key as keyof typeof USERS],
      createdAt: daysAgo(365),
    })
    .run();
}

// ─── Courses ───

const category = db
  .insert(schema.categories)
  .values({ name: "Testing", slug: "testing" })
  .returning()
  .get();

const owners = {
  aliceIntro: USERS.instructor.id,
  aliceAdvanced: USERS.instructor.id,
  bobCooking: USERS.otherInstructor.id,
};

for (const [key, course] of Object.entries(COURSES)) {
  db.insert(schema.courses)
    .values({
      id: course.id,
      title: course.title,
      slug: key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
      description: `${course.title} — an e2e course.`,
      salesCopy: `## ${course.title}`,
      instructorId: owners[key as keyof typeof owners],
      categoryId: category.id,
      status: CourseStatus.Published,
      price: course.price,
      pppEnabled: false,
      createdAt: daysAgo(365),
      updatedAt: daysAgo(365),
    })
    .run();
}

// ─── Purchases & Enrollments ───

function purchase(userId: number, courseId: number, cents: number, at: number) {
  return db
    .insert(schema.purchases)
    .values({
      userId,
      courseId,
      amountPaid: cents,
      country: null,
      createdAt: daysAgo(at),
    })
    .returning()
    .get();
}

function enroll(
  userId: number,
  courseId: number,
  at: number,
  completedAt: number | null = null
) {
  db.insert(schema.enrollments)
    .values({
      userId,
      courseId,
      enrolledAt: daysAgo(at),
      completedAt: completedAt === null ? null : daysAgo(completedAt),
    })
    .run();
}

const intro = COURSES.aliceIntro.id;
const advanced = COURSES.aliceAdvanced.id;
const cooking = COURSES.bobCooking.id;

purchase(USERS.student.id, intro, 5000, 3);
enroll(USERS.student.id, intro, 3);
purchase(USERS.learnerLee.id, intro, 3500, 60);
enroll(USERS.learnerLee.id, intro, 60);

// Free enrollment, no purchase; completed the course 2 days ago.
enroll(USERS.learnerKim.id, advanced, 10, 2);

const teamPurchase = purchase(USERS.teamBuyer.id, advanced, 9000, 20);
const team = db
  .insert(schema.teams)
  .values({ createdAt: daysAgo(20) })
  .returning()
  .get();
db.insert(schema.teamMembers)
  .values({
    teamId: team.id,
    userId: USERS.teamBuyer.id,
    role: TeamMemberRole.Admin,
    createdAt: daysAgo(20),
  })
  .run();
const seats: { code: string; redeemer: number | null; at: number | null }[] = [
  { code: "E2E-SEAT-1", redeemer: USERS.student.id, at: 15 },
  { code: "E2E-SEAT-2", redeemer: USERS.learnerLee.id, at: 5 },
  { code: "E2E-SEAT-3", redeemer: null, at: null },
];
for (const seat of seats) {
  db.insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: advanced,
      code: seat.code,
      purchaseId: teamPurchase.id,
      redeemedByUserId: seat.redeemer,
      redeemedAt: seat.at === null ? null : daysAgo(seat.at),
      createdAt: daysAgo(20),
    })
    .run();
  if (seat.redeemer !== null && seat.at !== null) {
    enroll(seat.redeemer, advanced, seat.at);
  }
}

purchase(USERS.learnerKim.id, cooking, 7500, 1);
enroll(USERS.learnerKim.id, cooking, 1);
purchase(USERS.teamBuyer.id, cooking, 7500, 200);
enroll(USERS.teamBuyer.id, cooking, 200);

// ─── Content: module, lessons, quiz ───

const introModule = db
  .insert(schema.modules)
  .values({ courseId: intro, title: "Getting Started", position: 1 })
  .returning()
  .get();

const videoLesson = db
  .insert(schema.lessons)
  .values({
    moduleId: introModule.id,
    title: "Why Test?",
    content: "Tests catch regressions.",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    position: 1,
    durationMinutes: 8,
  })
  .returning()
  .get();

const quizLesson = db
  .insert(schema.lessons)
  .values({
    moduleId: introModule.id,
    title: "Check Your Understanding",
    content: "Quiz time.",
    position: 2,
  })
  .returning()
  .get();

const quiz = db
  .insert(schema.quizzes)
  .values({
    lessonId: quizLesson.id,
    title: "Testing Basics",
    passingScore: 0.5,
  })
  .returning()
  .get();

const question = db
  .insert(schema.quizQuestions)
  .values({
    quizId: quiz.id,
    questionText: "Do tests catch regressions?",
    questionType: QuestionType.TrueFalse,
    position: 1,
  })
  .returning()
  .get();

const correct = db
  .insert(schema.quizOptions)
  .values({ questionId: question.id, optionText: "True", isCorrect: true })
  .returning()
  .get();
const wrong = db
  .insert(schema.quizOptions)
  .values({ questionId: question.id, optionText: "False", isCorrect: false })
  .returning()
  .get();

function attempt(userId: number, optionId: number, at: number) {
  const isCorrect = optionId === correct.id;
  const row = db
    .insert(schema.quizAttempts)
    .values({
      userId,
      quizId: quiz.id,
      score: isCorrect ? 1 : 0,
      passed: isCorrect,
      attemptedAt: daysAgo(at),
    })
    .returning()
    .get();
  db.insert(schema.quizAnswers)
    .values({
      attemptId: row.id,
      questionId: question.id,
      selectedOptionId: optionId,
    })
    .run();
}

attempt(USERS.student.id, correct.id, 2);
attempt(USERS.learnerLee.id, wrong.id, 50);
attempt(USERS.learnerLee.id, correct.id, 49);

// ─── Progress, ratings, comments, watch events ───

db.insert(schema.lessonProgress)
  .values({
    userId: USERS.student.id,
    lessonId: videoLesson.id,
    status: LessonProgressStatus.Completed,
    completedAt: daysAgo(2),
  })
  .run();

db.insert(schema.courseRatings)
  .values([
    {
      userId: USERS.student.id,
      courseId: intro,
      rating: 5,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
    {
      userId: USERS.learnerLee.id,
      courseId: intro,
      rating: 3,
      createdAt: daysAgo(40),
      updatedAt: daysAgo(40),
    },
  ])
  .run();

const answered = db
  .insert(schema.comments)
  .values({
    lessonId: videoLesson.id,
    userId: USERS.student.id,
    body: "Should I test private functions?",
    createdAt: daysAgo(2),
  })
  .returning()
  .get();
db.insert(schema.comments)
  .values({
    lessonId: videoLesson.id,
    userId: USERS.instructor.id,
    parentId: answered.id,
    body: "Test through the public interface.",
    createdAt: daysAgo(1),
  })
  .run();
db.insert(schema.comments)
  .values({
    lessonId: videoLesson.id,
    userId: USERS.learnerLee.id,
    body: "Is there a recording of the live session?",
    createdAt: daysAgo(4),
  })
  .run();

db.insert(schema.videoWatchEvents)
  .values([
    {
      userId: USERS.student.id,
      lessonId: videoLesson.id,
      eventType: "play",
      positionSeconds: 0,
      createdAt: daysAgo(2),
    },
    {
      userId: USERS.student.id,
      lessonId: videoLesson.id,
      eventType: "ended",
      positionSeconds: 480,
      createdAt: daysAgo(2),
    },
    {
      userId: USERS.learnerLee.id,
      lessonId: videoLesson.id,
      eventType: "play",
      positionSeconds: 0,
      createdAt: daysAgo(50),
    },
    {
      userId: USERS.learnerLee.id,
      lessonId: videoLesson.id,
      eventType: "pause",
      positionSeconds: 120,
      createdAt: daysAgo(50),
    },
  ])
  .run();

sqlite.close();
console.log(`Seeded e2e database at ${databasePath}`);
