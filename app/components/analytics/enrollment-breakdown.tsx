import type { EnrollmentBreakdown as Breakdown } from "~/services/analyticsService";
import { Section } from "./section";
import { formatCount, formatRatio } from "./format";

export function EnrollmentBreakdown({ breakdown }: { breakdown: Breakdown }) {
  const rows = [
    { label: "Direct purchase", value: breakdown.purchased },
    { label: "Team coupon", value: breakdown.couponRedeemed },
    { label: "Free", value: breakdown.free },
  ];

  return (
    <Section title="Enrollments">
      {breakdown.total === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No enrollments in this period.
        </p>
      ) : (
        <dl className="divide-y text-sm">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-2"
            >
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="tabular-nums">
                <span className="font-medium">{formatCount(row.value)}</span>
                <span className="ml-2 text-muted-foreground">
                  {formatRatio({ count: row.value, total: breakdown.total })}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-2 flex items-center justify-between border-t pt-3 text-sm">
        <span className="text-muted-foreground">Unredeemed team seats</span>
        <span
          className="font-medium tabular-nums"
          data-testid="unredeemed-seats"
        >
          {formatCount(breakdown.unredeemedSeats)}
        </span>
      </div>
    </Section>
  );
}
