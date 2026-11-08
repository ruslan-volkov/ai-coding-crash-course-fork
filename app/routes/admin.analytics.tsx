import { Link, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/admin.analytics";
import { requireAdmin } from "~/lib/access.server";
import { listInstructors } from "~/services/userService";
import {
  getCourseTable,
  getEnrollmentTrend,
  getInstructorSummary,
  getRevenueTrend,
  parseRange,
} from "~/services/analyticsService";
import { RangeSelector } from "~/components/analytics/range-selector";
import { LiveControls } from "~/components/analytics/live-controls";
import { InstructorSelector } from "~/components/analytics/instructor-selector";
import { AnalyticsOverview } from "~/components/analytics/analytics-overview";
import { Button } from "~/components/ui/button";
import { AlertTriangle } from "lucide-react";

// ─── Admin Analytics ───
// Platform-wide analytics, built from the same cards, trends and course table
// as the instructor dashboard. `?instructor=<id>` narrows every number to one
// instructor; absent (or not an instructor's id) means all instructors.

export function meta() {
  return [
    { title: "Analytics — Cadence" },
    { name: "description", content: "Platform-wide course analytics" },
  ];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  await requireAdmin(request);
  const range = parseRange(url.searchParams.get("range"));

  const instructors = listInstructors();

  const requestedInstructorId = Number(url.searchParams.get("instructor"));
  const instructorId =
    instructors.find((instructor) => instructor.id === requestedInstructorId)
      ?.id ?? null;

  return {
    range,
    instructors,
    instructorId,
    summary: getInstructorSummary(instructorId, range),
    enrollmentTrend: getEnrollmentTrend(instructorId, range),
    revenueTrend: getRevenueTrend(instructorId, range),
    courses: getCourseTable(instructorId, range),
  };
}

export default function AdminAnalytics({ loaderData }: Route.ComponentProps) {
  const {
    range,
    instructors,
    instructorId,
    summary,
    enrollmentTrend,
    revenueTrend,
    courses,
  } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            How courses are doing across the platform
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <LiveControls
            streamUrl={
              instructorId === null
                ? "/api/analytics-stream"
                : `/api/analytics-stream?instructor=${instructorId}`
            }
          />
          <div className="flex flex-wrap items-center gap-4">
            <InstructorSelector
              instructors={instructors}
              current={instructorId}
            />
            <RangeSelector current={range} />
          </div>
        </div>
      </div>

      <AnalyticsOverview
        summary={summary}
        enrollmentTrend={enrollmentTrend}
        revenueTrend={revenueTrend}
        courses={courses}
        range={range}
        showInstructor
      />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading analytics.";

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
