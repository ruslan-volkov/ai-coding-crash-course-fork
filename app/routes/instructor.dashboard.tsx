import { Link, data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/instructor.dashboard";
import { requireUserId } from "~/lib/access.server";
import { getUserById } from "~/services/userService";
import {
  getCourseTable,
  getEnrollmentTrend,
  getInstructorSummary,
  getRevenueTrend,
  parseRange,
} from "~/services/analyticsService";
import { UserRole } from "~/db/schema";
import { StatCard } from "~/components/analytics/stat-card";
import { RangeSelector } from "~/components/analytics/range-selector";
import { TrendChart } from "~/components/analytics/trend-chart";
import { CourseTable } from "~/components/analytics/course-table";
import { Button } from "~/components/ui/button";
import { AlertTriangle, DollarSign, Users } from "lucide-react";
import { formatCurrency } from "~/lib/utils";

// ─── Instructor Dashboard ───
// Cross-course analytics for the signed-in instructor. Admins have their own
// platform-wide analytics page, so this one is instructor-only.

export function meta() {
  return [
    { title: "Dashboard — Cadence" },
    { name: "description", content: "Analytics across your courses" },
  ];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const user = getUserById(userId);

  if (!user || user.role !== UserRole.Instructor) {
    throw data("Only instructors can access this page.", { status: 403 });
  }

  const range = parseRange(url.searchParams.get("range"));

  return {
    range,
    summary: getInstructorSummary(userId, range),
    enrollmentTrend: getEnrollmentTrend(userId, range),
    revenueTrend: getRevenueTrend(userId, range),
    courses: getCourseTable(userId, range),
  };
}

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

export default function InstructorAnalyticsDashboard({
  loaderData,
}: Route.ComponentProps) {
  const { range, summary, enrollmentTrend, revenueTrend, courses } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            How your courses are doing
          </p>
        </div>
        <RangeSelector current={range} />
      </div>

      <div className="mb-6 grid gap-6 sm:grid-cols-2">
        <StatCard
          label="Total students"
          value={formatCount(summary.totalStudents)}
          icon={<Users className="size-4" />}
          testId="total-students"
        />
        <StatCard
          label="Total revenue"
          value={formatCurrency(summary.totalRevenue)}
          icon={<DollarSign className="size-4" />}
          testId="total-revenue"
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <TrendChart
          title="Enrollments"
          points={enrollmentTrend}
          formatValue={formatCount}
          emptyMessage="No enrollments in this period."
        />
        <TrendChart
          title="Revenue"
          points={revenueTrend}
          formatValue={formatCurrency}
          emptyMessage="No revenue in this period."
        />
      </div>

      <CourseTable rows={courses} />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading your dashboard.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
    } else if (error.status === 403) {
      title = "Access denied";
    } else {
      title = `Error ${error.status}`;
    }
    message = typeof error.data === "string" ? error.data : error.statusText;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
