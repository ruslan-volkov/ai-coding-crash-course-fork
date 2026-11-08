import { useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

// ─── Live Revalidation ───
// Keeps an analytics page's loader data fresh from the analytics stream. The
// stream only says "something changed"; the page re-runs its loader, so the
// numbers always come from the analytics service.

/** Quiet period after the last event in a burst before revalidating. */
export const LIVE_DEBOUNCE_MS = 2_000;
/** Wait before reopening a stream the server closed outright. */
const RECONNECT_MS = 5_000;

export type LiveStatus = "connecting" | "live" | "reconnecting" | "paused";

/**
 * Subscribes to `streamUrl` while `enabled`, revalidating the route:
 * once per burst of events (debounced), once after a reconnect, and on window
 * focus. Revalidations never overlap — a request made mid-flight runs once
 * when the current one finishes. `refresh` revalidates immediately.
 */
export function useLiveRevalidation(streamUrl: string, enabled: boolean) {
  const revalidator = useRevalidator();
  const revalidateRef = useRef(revalidator.revalidate);
  revalidateRef.current = revalidator.revalidate;

  const inFlight = useRef(false);
  const queued = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    try {
      await revalidateRef.current();
    } finally {
      inFlight.current = false;
    }
    if (queued.current) {
      queued.current = false;
      await refresh();
    }
  }, []);

  const [status, setStatus] = useState<LiveStatus>(
    enabled ? "connecting" : "paused"
  );

  useEffect(() => {
    if (!enabled) {
      setStatus("paused");
      return;
    }

    let source: EventSource | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let hasConnected = false;
    let lostConnection = false;

    const connect = () => {
      source = new EventSource(streamUrl);

      source.onopen = () => {
        setStatus("live");
        // Catch up on anything missed while disconnected.
        if (hasConnected && lostConnection) void refresh();
        hasConnected = true;
        lostConnection = false;
      };

      source.onmessage = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => void refresh(), LIVE_DEBOUNCE_MS);
      };

      source.onerror = () => {
        setStatus("reconnecting");
        if (hasConnected) lostConnection = true;
        // EventSource retries dropped connections itself, but gives up for
        // good on an HTTP error response — retry those by hand.
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          reconnect = setTimeout(connect, RECONNECT_MS);
        }
      };
    };

    setStatus("connecting");
    connect();

    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      clearTimeout(debounce);
      clearTimeout(reconnect);
      source?.close();
    };
  }, [streamUrl, enabled, refresh]);

  return {
    status,
    refresh,
    refreshing: revalidator.state === "loading",
  };
}
