import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import { listInstructors } from "./userService";

describe("userService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("listInstructors", () => {
    it("lists only instructors, by name, as id and name", () => {
      const aaron = testDb
        .insert(schema.users)
        .values({
          name: "Aaron Early",
          email: "aaron@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
      testDb
        .insert(schema.users)
        .values({
          name: "Abe Admin",
          email: "abe@example.com",
          role: schema.UserRole.Admin,
        })
        .run();

      expect(listInstructors()).toEqual([
        { id: aaron.id, name: "Aaron Early" },
        { id: base.instructor.id, name: base.instructor.name },
      ]);
    });
  });
});
