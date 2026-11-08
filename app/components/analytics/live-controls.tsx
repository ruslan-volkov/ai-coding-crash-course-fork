import { useEffect, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import {
  useLiveRevalidation,
  type LiveStatus,
} from "~/components/analytics/use-live-revalidation";

const STATUS_LABEL: Record<LiveStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
  paused: "Paused",
};

const STATUS_DOT: Record<LiveStatus, string> = {
  connecting: "bg-amber-500",
  live: "bg-green-500 animate-pulse",
  reconnecting: "bg-amber-500",
  paused: "bg-muted-foreground",
};

function formatAge(seconds: number) {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

/**
 * Live-update controls for an analytics page: connection status, time since
 * the numbers were loaded, a manual refresh, and a pause toggle kept in the
 * URL as `?live=0` (pausing closes the stream and stops refresh-on-focus).
 */
export function LiveControls({ streamUrl }: { streamUrl: string }) {
  const [searchParams] = useSearchParams();
  const enabled = searchParams.get("live") !== "0";
  const { status, refresh, refreshing } = useLiveRevalidation(
    streamUrl,
    enabled
  );

  // Loader data is a new object whenever the loader re-runs.
  const loaderData = useLoaderData();
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [now, setNow] = useState(updatedAt);

  useEffect(() => {
    const at = Date.now();
    setUpdatedAt(at);
    setNow(at);
  }, [loaderData]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, []);

  const toggled = new URLSearchParams(searchParams);
  if (enabled) toggled.set("live", "0");
  else toggled.delete("live");
  const toggledSearch = toggled.toString();

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span
        className="inline-flex items-center gap-2 font-medium"
        data-testid="live-status"
        role="status"
      >
        <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
        {STATUS_LABEL[status]}
      </span>
      <span className="text-muted-foreground" data-testid="updated-ago">
        Updated {formatAge(Math.max(0, Math.floor((now - updatedAt) / 1000)))}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void refresh()}
        disabled={refreshing}
      >
        <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
        Refresh
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link
          to={toggledSearch ? `?${toggledSearch}` : "?"}
          preventScrollReset
          replace
        >
          {enabled ? (
            <>
              <Pause className="size-4" /> Pause
            </>
          ) : (
            <>
              <Play className="size-4" /> Resume
            </>
          )}
        </Link>
      </Button>
    </div>
  );
}
