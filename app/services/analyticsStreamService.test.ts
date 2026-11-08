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

// Import after mock so the module picks up our test db
import {
  publishAnalyticsEvent,
  type AnalyticsEvent,
} from "~/lib/analytics-events.server";
import {
  subscribeToAnalyticsStream,
  type AnalyticsStreamScope,
} from "./analyticsStreamService";

function createInstructorWithCourse(name: string, slug: string) {
  const instructor = testDb
    .insert(schema.users)
    .values({
      name,
      email: `${slug}@example.com`,
      role: schema.UserRole.Instructor,
    })
    .returning()
    .get();
  const course = testDb
    .insert(schema.courses)
    .values({
      title: name,
      slug,
      description: "Another course",
      salesCopy: "Sales copy",
      instructorId: instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
  return { instructor, course };
}

describe("subscribeToAnalyticsStream", () => {
  let stops: (() => void)[] = [];
  let other: ReturnType<typeof createInstructorWithCourse>;

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    other = createInstructorWithCourse("Other", "other-course");
  });

  afterEach(() => {
    stops.forEach((stop) => stop());
    stops = [];
  });

  function subscribe(scope: AnalyticsStreamScope) {
    const received: AnalyticsEvent[] = [];
    stops.push(
      subscribeToAnalyticsStream(scope, (event) => received.push(event))
    );
    return received;
  }

  const ownPurchase = () =>
    ({ type: "purchase", courseId: base.course.id }) as const;
  const otherPurchase = () =>
    ({ type: "purchase", courseId: other.course.id }) as const;

  it("delivers an instructor only events for courses they own", () => {
    const received = subscribe({
      kind: "instructor",
      instructorId: base.instructor.id,
    });

    publishAnalyticsEvent(ownPurchase());
    publishAnalyticsEvent(otherPurchase());

    expect(received).toEqual([ownPurchase()]);
  });

  it("delivers an instructor events for a course created after subscribing", () => {
    const received = subscribe({
      kind: "instructor",
      instructorId: other.instructor.id,
    });
    const later = testDb
      .insert(schema.courses)
      .values({
        title: "Later",
        slug: "later",
        description: "Later",
        salesCopy: "Later",
        instructorId: other.instructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Draft,
      })
      .returning()
      .get();

    publishAnalyticsEvent({ type: "enrollment", courseId: later.id });

    expect(received).toEqual([{ type: "enrollment", courseId: later.id }]);
  });

  it("delivers a course subscriber only that course's events", () => {
    const received = subscribe({ kind: "course", courseId: other.course.id });

    publishAnalyticsEvent(ownPurchase());
    publishAnalyticsEvent({ type: "rating", courseId: other.course.id });

    expect(received).toEqual([{ type: "rating", courseId: other.course.id }]);
  });

  it("delivers every event to an unfiltered admin", () => {
    const received = subscribe({ kind: "all" });

    publishAnalyticsEvent(ownPurchase());
    publishAnalyticsEvent(otherPurchase());

    expect(received).toEqual([ownPurchase(), otherPurchase()]);
  });

  it("stops delivering after unsubscribing", () => {
    const received: AnalyticsEvent[] = [];
    const stop = subscribeToAnalyticsStream({ kind: "all" }, (event) =>
      received.push(event)
    );

    stop();
    publishAnalyticsEvent(ownPurchase());

    expect(received).toEqual([]);
  });
});
