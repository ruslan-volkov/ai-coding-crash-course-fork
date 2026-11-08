import { Link, data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/instructor.$courseId.analytics";
import { requireStaff } from "~/lib/access.server";
import { getCourseById } from "~/services/courseService";
import {
  getCourseCompletion,
  getEnrollmentBreakdown,
  getLessonDropOff,
  getQuizPerformance,
  parseRange,
} from "~/services/analyticsService";
import { StatCard } from "~/components/analytics/stat-card";
import { RangeSelector } from "~/components/analytics/range-selector";
import { EnrollmentBreakdown } from "~/components/analytics/enrollment-breakdown";
import { DropOffChart } from "~/components/analytics/drop-off-chart";
import { QuizPerformance } from "~/components/analytics/quiz-performance";
import {
  formatCount,
  formatPercent,
  formatRatio,
} from "~/components/analytics/format";
import { Button } from "~/components/ui/button";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  TrendingUp,
  Users,
} from "lucide-react";

// ─── Course Analytics ───
// Per-course drill-down from the dashboard course table. The owning instructor
// and admins may view it. Enrollment counts filter by enrollment date;
// completion, progress, drop-off and quiz metrics describe the cohort that
// enrolled in the range.

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.course.title ?? "Course";
  return [
    { title: `Analytics: ${title} — Cadence` },
    { name: "description", content: `Analytics for ${title}` },
  ];
}

export async function loader({ params, request, url }: Route.LoaderArgs) {
  const courseId = Number(params.courseId);
  if (!Number.isInteger(courseId)) {
    throw data("Invalid course ID.", { status: 400 });
  }

  const access = await requireStaff(request, courseId);

  const course = getCourseById(courseId);
  if (!course) {
    throw data("Course not found.", { status: 404 });
  }

  const range = parseRange(url.searchParams.get("range"));

  return {
    course: { id: course.id, title: course.title },
    isAdmin: access.isAdmin,
    range,
    enrollments: getEnrollmentBreakdown(courseId, range),
    completion: getCourseCompletion(courseId, range),
    dropOff: getLessonDropOff(courseId, range),
    quizzes: getQuizPerformance(courseId, range),
  };
}

export default function CourseAnalytics({ loaderData }: Route.ComponentProps) {
  const { course, isAdmin, range, enrollments, completion, dropOff, quizzes } =
    loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <Link
        to={isAdmin ? "/admin/courses" : `/instructor/dashboard?range=${range}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {isAdmin ? "All courses" : "Dashboard"}
      </Link>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{course.title}</h1>
          <p className="mt-1 text-muted-foreground">Course analytics</p>
        </div>
        <RangeSelector current={range} />
      </div>

      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <StatCard
          label="Students"
          value={formatCount(enrollments.total)}
          icon={<Users className="size-4" />}
          testId="course-students"
        />
        <StatCard
          label="Completion rate"
          value={formatRatio(completion.completion)}
          icon={<CheckCircle2 className="size-4" />}
          testId="completion-rate"
        />
        <StatCard
          label="Average progress"
          value={formatPercent(completion.averageProgress)}
          icon={<TrendingUp className="size-4" />}
          testId="average-progress"
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <EnrollmentBreakdown breakdown={enrollments} />
        <div className="lg:col-span-2">
          <DropOffChart
            lessons={dropOff}
            students={completion.completion.total}
          />
        </div>
      </div>

      <QuizPerformance quizzes={quizzes} />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading course analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
    } else if (error.status === 403) {
      title = "Access denied";
    } else if (error.status === 404) {
      title = "Course not found";
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
