import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { TrendPoint } from "~/services/analyticsService";

interface TrendChartProps {
  title: string;
  points: TrendPoint[];
  formatValue: (value: number) => string;
  emptyMessage: string;
}

export function TrendChart({
  title,
  points,
  formatValue,
  emptyMessage,
}: TrendChartProps) {
  const hasData = points.some((point) => point.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="h-64" role="img" aria-label={`${title} chart`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tickFormatter={formatValue}
                  width={72}
                />
                <Tooltip
                  formatter={(value) => formatValue(Number(value))}
                  cursor={{ fillOpacity: 0.1 }}
                />
                <Bar
                  dataKey="value"
                  name={title}
                  fill="var(--color-primary)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
