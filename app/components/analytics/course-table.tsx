import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { formatCurrency } from "~/lib/utils";
import type { CourseTableRow } from "~/services/analyticsService";

export function CourseTable({ rows }: { rows: CourseTableRow[] }) {
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
                <th className="py-2 text-right font-medium">Students</th>
                <th className="py-2 text-right font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.courseId} className="border-b last:border-0">
                  <td className="py-2 font-medium">{row.title}</td>
                  <td className="py-2 text-right tabular-nums">
                    {row.students}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCurrency(row.revenue)}
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
