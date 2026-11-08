import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CourseRatings } from "~/services/analyticsService";
import { Section } from "./section";
import { formatAverage, formatCount } from "./format";

/** Average, count and 1–5 distribution of the course's ratings (all time). */
export function RatingSummary({ ratings }: { ratings: CourseRatings }) {
  const points = [...ratings.distribution].reverse().map((bucket) => ({
    label: `${bucket.rating}★`,
    count: bucket.count,
  }));

  return (
    <Section
      title="Ratings"
      description="All time"
      emptyMessage={ratings.count === 0 ? "No ratings yet" : null}
    >
      <dl className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs text-muted-foreground">Average rating</dt>
          <dd
            className="text-xl font-bold tabular-nums"
            data-testid="rating-average"
          >
            {formatAverage(ratings.average)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Ratings</dt>
          <dd
            className="text-xl font-bold tabular-nums"
            data-testid="rating-count"
          >
            {formatCount(ratings.count)}
          </dd>
        </div>
      </dl>
      <div className="h-48" role="img" aria-label="Rating distribution chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip cursor={{ fillOpacity: 0.1 }} />
            <Bar
              dataKey="count"
              name="Ratings"
              fill="var(--color-primary)"
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only" aria-label="Rating distribution">
        <thead>
          <tr>
            <th>Stars</th>
            <th>Ratings</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <td>{point.label}</td>
              <td>{point.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
