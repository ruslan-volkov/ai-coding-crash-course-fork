import { afterEach, beforeEach } from "vitest";
import {
  subscribeToAnalyticsEvents,
  type AnalyticsEvent,
} from "~/lib/analytics-events.server";

/**
 * Records every analytics event published during each test. Call at the top
 * of a describe block; the returned array is emptied before each test.
 */
export function captureAnalyticsEvents(): AnalyticsEvent[] {
  const events: AnalyticsEvent[] = [];
  let stop = () => {};

  beforeEach(() => {
    events.length = 0;
    stop = subscribeToAnalyticsEvents((event) => events.push(event));
  });

  afterEach(() => stop());

  return events;
}
