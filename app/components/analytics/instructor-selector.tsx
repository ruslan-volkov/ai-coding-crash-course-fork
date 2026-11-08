import { useNavigate, useSearchParams } from "react-router";
import type { InstructorRef } from "~/services/userService";

interface InstructorSelectorProps {
  instructors: InstructorRef[];
  /** The selected instructor's id, or null for all instructors. */
  current: number | null;
}

/**
 * Instructor filter kept in the URL as `?instructor=<id>` (absent = all),
 * preserving other params such as `?range=`.
 */
export function InstructorSelector({
  instructors,
  current,
}: InstructorSelectorProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  function select(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === "") params.delete("instructor");
    else params.set("instructor", value);
    navigate(`?${params}`, { preventScrollReset: true });
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Instructor</span>
      <select
        value={current === null ? "" : String(current)}
        onChange={(event) => select(event.target.value)}
        className="h-9 rounded-md border bg-background px-3 font-medium"
      >
        <option value="">All instructors</option>
        {instructors.map((instructor) => (
          <option key={instructor.id} value={instructor.id}>
            {instructor.name}
          </option>
        ))}
      </select>
    </label>
  );
}
