import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { captureAnalyticsEvents } from "~/test/analytics-events";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import { computeResult } from "./quizScoringService";

function createQuizWithQuestion(courseId: number) {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId, title: "Module", position: 1 })
    .returning()
    .get();
  const lesson = testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Quiz lesson", position: 1 })
    .returning()
    .get();
  const quiz = testDb
    .insert(schema.quizzes)
    .values({ lessonId: lesson.id, title: "Quiz", passingScore: 0.7 })
    .returning()
    .get();
  const question = testDb
    .insert(schema.quizQuestions)
    .values({
      quizId: quiz.id,
      questionText: "True?",
      questionType: schema.QuestionType.TrueFalse,
      position: 1,
    })
    .returning()
    .get();
  const correct = testDb
    .insert(schema.quizOptions)
    .values({ questionId: question.id, optionText: "True", isCorrect: true })
    .returning()
    .get();

  return { quiz, question, correct };
}

describe("quizScoringService analytics events", () => {
  const events = captureAnalyticsEvents();

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  it("publishes a quiz-attempt event for the quiz's course after an attempt", () => {
    const { quiz, question, correct } = createQuizWithQuestion(base.course.id);

    const result = computeResult(base.user.id, quiz.id, {
      [question.id]: correct.id,
    });

    expect(result.passed).toBe(true);
    expect(events).toEqual([
      { type: "quiz-attempt", courseId: base.course.id },
    ]);
  });

  it("publishes nothing when the quiz doesn't exist", () => {
    expect(computeResult(base.user.id, 9999, {})).toBeNull();
    expect(events).toEqual([]);
  });
});
