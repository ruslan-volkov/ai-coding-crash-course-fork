// ─── E2E Fixture Data ───
// Fixed ids for the deterministic e2e seed (scripts/seed-e2e.ts). Tests import
// these to log in and to assert exact numbers. Separate from the dev seed so dev
// data can evolve without breaking e2e assertions.

export const USERS = {
  instructor: { id: 1, name: "Alice Instructor" },
  otherInstructor: { id: 2, name: "Bob Instructor" },
  admin: { id: 3, name: "Ada Admin" },
  student: { id: 4, name: "Sam Student" },
  learnerLee: { id: 5, name: "Lee Learner" },
  learnerKim: { id: 6, name: "Kim Learner" },
  teamBuyer: { id: 7, name: "Max Buyer" },
} as const;

export type Role = "student" | "instructor" | "otherInstructor" | "admin";

export const COURSES = {
  aliceIntro: { id: 1, title: "Intro to Testing", price: 5000 },
  aliceAdvanced: { id: 2, title: "Advanced Testing", price: 3000 },
  bobCooking: { id: 3, title: "Cooking Basics", price: 7500 },
} as const;
