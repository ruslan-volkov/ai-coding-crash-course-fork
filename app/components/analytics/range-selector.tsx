import { Link, useSearchParams } from "react-router";
import { cn } from "~/lib/utils";
import type { AnalyticsRange } from "~/services/analyticsService";

const OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

/** Date range filter kept in the URL as `?range=`, preserving other params. */
export function RangeSelector({ current }: { current: AnalyticsRange }) {
  const [searchParams] = useSearchParams();

  return (
    <nav
      aria-label="Date range"
      className="inline-flex rounded-lg border bg-muted p-1 text-sm"
    >
      {OPTIONS.map((option) => {
        const params = new URLSearchParams(searchParams);
        params.set("range", option.value);
        const active = option.value === current;
        return (
          <Link
            key={option.value}
            to={`?${params}`}
            preventScrollReset
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
