import { eq } from "drizzle-orm";
import { db } from "~/db";
import { courses } from "~/db/schema";
import {
  subscribeToAnalyticsEvents,
  type AnalyticsEvent,
  type AnalyticsEventListener,
} from "~/lib/analytics-events.server";

// ─── Analytics Stream Service ───
// Server-side filtering for the live analytics stream: each open analytics
// page subscribes with the scope it is allowed to see, and only receives the
// change events that could move its numbers.

export type AnalyticsStreamScope =
  /** Admin with no instructor filter — the whole platform. */
  | { kind: "all" }
  /** An instructor's own dashboard, or admin analytics filtered to them. */
  | { kind: "instructor"; instructorId: number }
  /** One course's analytics page. */
  | { kind: "course"; courseId: number };

function inScope(scope: AnalyticsStreamScope, event: AnalyticsEvent) {
  switch (scope.kind) {
    case "all":
      return true;
    case "course":
      return event.courseId === scope.courseId;
    case "instructor": {
      // Looked up per event so courses created after subscribing still count.
      const course = db
        .select({ instructorId: courses.instructorId })
        .from(courses)
        .where(eq(courses.id, event.courseId))
        .get();
      return course?.instructorId === scope.instructorId;
    }
  }
}

/** Subscribes to analytics events within a scope; returns the unsubscribe. */
export function subscribeToAnalyticsStream(
  scope: AnalyticsStreamScope,
  listener: AnalyticsEventListener
): () => void {
  return subscribeToAnalyticsEvents((event) => {
    if (inScope(scope, event)) listener(event);
  });
}
