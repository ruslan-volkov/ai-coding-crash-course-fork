import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

interface SectionProps {
  title: string;
  /** A short note under the title, e.g. that the section ignores the date range. */
  description?: string;
  /** Rendered instead of the children when set — every section has an explicit empty state. */
  emptyMessage?: string | null;
  children?: React.ReactNode;
}

/** A titled analytics card, labelled for assistive tech and tests. */
export function Section({
  title,
  description,
  emptyMessage,
  children,
}: SectionProps) {
  return (
    <Card>
      <section aria-label={title}>
        <CardHeader>
          <CardTitle>
            <h2>{title}</h2>
          </CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {emptyMessage ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            children
          )}
        </CardContent>
      </section>
    </Card>
  );
}
