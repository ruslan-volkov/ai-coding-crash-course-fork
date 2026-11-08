import type { QuizPerformance as Quiz } from "~/services/analyticsService";
import { Section } from "./section";
import {
  formatAverage,
  formatCount,
  formatPercent,
  formatRatio,
} from "./format";

export function QuizPerformance({ quizzes }: { quizzes: Quiz[] }) {
  return (
    <Section
      title="Quizzes"
      emptyMessage={quizzes.length === 0 ? "No quizzes in this course" : null}
    >
      <div className="space-y-8">
        {quizzes.map((quiz) => (
          <QuizStats key={quiz.quizId} quiz={quiz} />
        ))}
      </div>
    </Section>
  );
}

function QuizStats({ quiz }: { quiz: Quiz }) {
  const stats = [
    {
      label: "Average best score",
      value: formatPercent(quiz.averageBestScore),
    },
    { label: "Pass rate", value: formatRatio(quiz.passed) },
    { label: "Average attempts", value: formatAverage(quiz.averageAttempts) },
    { label: "Students attempted", value: formatCount(quiz.studentsAttempted) },
  ];

  return (
    <article aria-label={quiz.title}>
      <h3 className="font-semibold">{quiz.title}</h3>
      <p className="text-sm text-muted-foreground">
        {quiz.lessonTitle} · pass mark {formatPercent(quiz.passingScore)}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="text-xl font-bold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {quiz.studentsAttempted === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No attempts in this period.
        </p>
      ) : null}

      {quiz.questions.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No questions in this quiz.
        </p>
      ) : (
        <table
          className="mt-3 w-full text-sm"
          aria-label={`${quiz.title} questions`}
        >
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 font-medium">Question</th>
              <th className="py-2 text-right font-medium">
                Answered correctly
              </th>
            </tr>
          </thead>
          <tbody>
            {quiz.questions.map((question) => (
              <tr key={question.questionId} className="border-b last:border-0">
                <td className="py-2">{question.questionText}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatRatio(question.correct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}
