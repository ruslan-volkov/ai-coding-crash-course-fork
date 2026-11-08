import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LessonDropOffRow } from "~/services/analyticsService";
import { Section } from "./section";
import { formatRatio } from "./format";

interface DropOffChartProps {
  lessons: LessonDropOffRow[];
  students: number;
}

/** Share of the cohort that completed each lesson, in course order. */
export function DropOffChart({ lessons, students }: DropOffChartProps) {
  const emptyMessage =
    lessons.length === 0
      ? "No lessons in this course"
      : students === 0
        ? "No students enrolled in this period"
        : null;

  const points = lessons.map((lesson, index) => ({
    label: `${index + 1}. ${lesson.title}`,
    share: lesson.completed.count / lesson.completed.total,
  }));

  return (
    <Section title="Lesson drop-off" emptyMessage={emptyMessage}>
      <div className="h-64" role="img" aria-label="Lesson drop-off chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12 }}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis
              domain={[0, 1]}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(share) => `${Math.round(share * 100)}%`}
              width={48}
            />
            <Tooltip
              formatter={(share) => `${Math.round(Number(share) * 100)}%`}
              cursor={{ fillOpacity: 0.1 }}
            />
            <Bar
              dataKey="share"
              name="Completed"
              fill="var(--color-primary)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-4 w-full text-sm" aria-label="Lesson completion">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 font-medium">Lesson</th>
            <th className="py-2 font-medium">Module</th>
            <th className="py-2 text-right font-medium">Completed</th>
          </tr>
        </thead>
        <tbody>
          {lessons.map((lesson) => (
            <tr key={lesson.lessonId} className="border-b last:border-0">
              <td className="py-2 font-medium">{lesson.title}</td>
              <td className="py-2 text-muted-foreground">
                {lesson.moduleTitle}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatRatio(lesson.completed)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
