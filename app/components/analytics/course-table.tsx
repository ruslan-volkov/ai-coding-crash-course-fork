import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { formatCurrency } from "~/lib/utils";
import type {
  AnalyticsRange,
  CourseTableRow,
} from "~/services/analyticsService";
import { formatPercent, formatRating, formatRatio } from "./format";

interface CourseTableProps {
  rows: CourseTableRow[];
  /** Carried into each row's course analytics link. */
  range: AnalyticsRange;
  /** Adds an Instructor column — for platform-wide (admin) views. */
  showInstructor?: boolean;
}

export function CourseTable({
  rows,
  range,
  showInstructor = false,
}: CourseTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Courses</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No courses yet.
          </p>
        ) : (
          <table className="w-full text-sm" aria-label="Course analytics">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-medium">Course</th>
                {showInstructor && (
                  <th className="py-2 font-medium">Instructor</th>
                )}
                <th className="py-2 text-right font-medium">Students</th>
                <th className="py-2 text-right font-medium">Revenue</th>
                <th className="py-2 text-right font-medium">Completion</th>
                <th className="py-2 text-right font-medium">Avg quiz score</th>
                <th className="py-2 text-right font-medium">Rating</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.courseId} className="border-b last:border-0">
                  <td className="py-2 font-medium">
                    <Link
                      to={`/instructor/${row.courseId}/analytics?range=${range}`}
                      className="hover:underline"
                    >
                      {row.title}
                    </Link>
                  </td>
                  {showInstructor && (
                    <td className="py-2">{row.instructor.name}</td>
                  )}
                  <td className="py-2 text-right tabular-nums">
                    {row.students}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCurrency(row.revenue)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatRatio(row.completion)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatPercent(row.averageQuizScore)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatRating(row.rating)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
