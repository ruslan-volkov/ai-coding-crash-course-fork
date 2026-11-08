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
import { logWatchEvent } from "./videoTrackingService";

function createVideoLesson(courseId: number, durationMinutes: number | null) {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId, title: "Module", position: 1 })
    .returning()
    .get();
  return testDb
    .insert(schema.lessons)
    .values({
      moduleId: mod.id,
      title: "Video",
      position: 1,
      videoUrl: "https://www.youtube.com/watch?v=abc",
      durationMinutes,
    })
    .returning()
    .get();
}

describe("videoTrackingService analytics events", () => {
  const events = captureAnalyticsEvents();

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  it("publishes video-completed once, when the video crosses the finished threshold", () => {
    // 10 minutes = 600s; finished at 90% = 540s.
    const lesson = createVideoLesson(base.course.id, 10);

    logWatchEvent(base.user.id, lesson.id, "play", 0);
    logWatchEvent(base.user.id, lesson.id, "pause", 300);
    logWatchEvent(base.user.id, lesson.id, "progress", 530);
    expect(events).toEqual([]);

    logWatchEvent(base.user.id, lesson.id, "progress", 540);
    expect(events).toEqual([
      { type: "video-completed", courseId: base.course.id },
    ]);

    logWatchEvent(base.user.id, lesson.id, "ended", 600);
    logWatchEvent(base.user.id, lesson.id, "play", 0);
    expect(events).toHaveLength(1);
  });

  it("finishing is per student", () => {
    const lesson = createVideoLesson(base.course.id, 10);
    logWatchEvent(base.user.id, lesson.id, "ended", 600);

    logWatchEvent(base.instructor.id, lesson.id, "ended", 600);

    expect(events).toHaveLength(2);
  });

  it("never publishes for a video without a duration", () => {
    const lesson = createVideoLesson(base.course.id, null);

    logWatchEvent(base.user.id, lesson.id, "ended", 600);

    expect(events).toEqual([]);
  });

  it("publishes nothing when the event can't be stored", () => {
    expect(() => logWatchEvent(base.user.id, 9999, "ended", 600)).toThrow();
    expect(events).toEqual([]);
  });
});
