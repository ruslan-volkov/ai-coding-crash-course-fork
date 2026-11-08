import { Card, CardContent } from "~/components/ui/card";

interface StatCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  testId?: string;
}

export function StatCard({ label, value, icon, testId }: StatCardProps) {
  return (
    <Card className="py-5">
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
}
