import { asc, eq } from "drizzle-orm";
import { db } from "~/db";
import { users, UserRole } from "~/db/schema";

// ─── User Service ───
// Handles user CRUD operations and role management.
// Uses positional parameters (project convention).

export function getAllUsers() {
  return db.select().from(users).all();
}

export function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function getUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email)).get();
}

export function getUsersByRole(role: UserRole) {
  return db.select().from(users).where(eq(users.role, role)).all();
}

export type InstructorRef = { id: number; name: string };

/** Every instructor as id and name, ordered by name — e.g. for filter dropdowns. */
export function listInstructors(): InstructorRef[] {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.role, UserRole.Instructor))
    .orderBy(asc(users.name))
    .all();
}

export function createUser(
  name: string,
  email: string,
  role: UserRole,
  avatarUrl: string | null
) {
  return db
    .insert(users)
    .values({ name, email, role, avatarUrl })
    .returning()
    .get();
}

export function updateUser(
  id: number,
  name: string,
  email: string,
  bio: string | null
) {
  return db
    .update(users)
    .set({ name, email, bio })
    .where(eq(users.id, id))
    .returning()
    .get();
}

export function updateUserRole(id: number, role: UserRole) {
  return db
    .update(users)
    .set({ role })
    .where(eq(users.id, id))
    .returning()
    .get();
}
