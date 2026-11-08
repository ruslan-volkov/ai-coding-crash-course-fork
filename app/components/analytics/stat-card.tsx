import { Link } from "react-router";
import { Card, CardContent } from "~/components/ui/card";

interface StatCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  testId?: string;
  /** Makes the whole card a link, e.g. to the page where the number is acted on. */
  to?: string;
}

export function StatCard({ label, value, icon, testId, to }: StatCardProps) {
  const card = (
    <Card className={to ? "py-5 transition-colors hover:bg-accent" : "py-5"}>
      <CardContent className="px-5">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        <div className="mt-2 text-3xl font-bold" data-testid={testId}>
          {value}
        </div>
      </CardContent>
    </Card>
  );

  return to ? (
    <Link to={to} aria-label={`${label}: ${value}`} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}
