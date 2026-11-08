import { Link } from "react-router";
import type { CourseQuestions } from "~/services/analyticsService";
import { Section } from "./section";
import { formatCount, formatDuration } from "./format";

/** The course's student questions and how quickly staff reply (all time). */
export function QuestionSummary({
  questions,
}: {
  questions: CourseQuestions;
}) {
  const stats = [
    { label: "Questions", value: formatCount(questions.total) },
    { label: "Unanswered", value: formatCount(questions.unanswered) },
    {
      label: "Median first reply",
      value: formatDuration(questions.medianFirstReplySeconds),
    },
  ];

  return (
    <Section
      title="Student questions"
      description="All time"
      emptyMessage={questions.total === 0 ? "No questions yet" : null}
    >
      <dl className="grid grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="text-xl font-bold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      {questions.unanswered > 0 ? (
        <Link
          to="/instructor/questions"
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          Answer questions
        </Link>
      ) : null}
    </Section>
  );
}
