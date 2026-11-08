import { StatCard } from "~/components/analytics/stat-card";
import { TrendChart } from "~/components/analytics/trend-chart";
import { CourseTable } from "~/components/analytics/course-table";
import {
  CheckCircle2,
  DollarSign,
  MessageCircleQuestion,
  Star,
  Users,
} from "lucide-react";
import { formatCurrency } from "~/lib/utils";
import {
  formatAverage,
  formatCount,
  formatPercent,
} from "~/components/analytics/format";
import type {
  AnalyticsRange,
  CourseTableRow,
  TrendPoint,
  getInstructorSummary,
} from "~/services/analyticsService";

interface AnalyticsOverviewProps {
  summary: ReturnType<typeof getInstructorSummary>;
  enrollmentTrend: TrendPoint[];
  revenueTrend: TrendPoint[];
  courses: CourseTableRow[];
  range: AnalyticsRange;
  /** Adds the course table's Instructor column — for platform-wide views. */
  showInstructor?: boolean;
}

/**
 * Headline cards, enrollment and revenue trends, and the course table —
 * shared by the instructor dashboard and admin analytics.
 */
export function AnalyticsOverview({
  summary,
  enrollmentTrend,
  revenueTrend,
  courses,
  range,
  showInstructor = false,
}: AnalyticsOverviewProps) {
  return (
    <>
      <div className="mb-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
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
        <StatCard
          label="Average completion"
          value={formatPercent(summary.averageCompletion)}
          icon={<CheckCircle2 className="size-4" />}
          testId="average-completion"
        />
        <StatCard
          label="Average rating"
          value={formatAverage(summary.averageRating)}
          icon={<Star className="size-4" />}
          testId="average-rating"
        />
        <StatCard
          label="Unanswered questions"
          value={formatCount(summary.unansweredQuestions)}
          icon={<MessageCircleQuestion className="size-4" />}
          testId="unanswered-questions"
          to="/instructor/questions"
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

      <CourseTable
        rows={courses}
        range={range}
        showInstructor={showInstructor}
      />
    </>
  );
}
