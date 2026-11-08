// ─── Analytics Events ───
// In-process publish/subscribe bus for "something analytics-relevant changed".
// Services publish after a successful write; the analytics stream endpoint
// subscribes and forwards change events (never data) to open analytics pages,
// which re-run their loaders.
//
// Single-process only, matching the single-node SQLite deployment. The
// listener set lives on globalThis so a dev-server module reload doesn't split
// publishers and subscribers across two copies of this module.

export const ANALYTICS_EVENT_TYPES = [
  "enrollment",
  "purchase",
  "coupon-redeemed",
  "lesson-progress",
  "quiz-attempt",
  "rating",
  "comment",
  "video-completed",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export type AnalyticsEvent = { type: AnalyticsEventType; courseId: number };

export type AnalyticsEventListener = (event: AnalyticsEvent) => void;

const globalBus = globalThis as typeof globalThis & {
  __analyticsEventListeners?: Set<AnalyticsEventListener>;
};

const listeners = (globalBus.__analyticsEventListeners ??= new Set());

export function publishAnalyticsEvent(event: AnalyticsEvent) {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch (error) {
      // A broken subscriber must never fail the write that published.
      console.error("Analytics event listener failed", error);
    }
  }
}

/** Registers a listener; returns the function that removes it. */
export function subscribeToAnalyticsEvents(
  listener: AnalyticsEventListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
