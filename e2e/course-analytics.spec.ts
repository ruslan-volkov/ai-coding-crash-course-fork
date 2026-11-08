import { test, expect } from "./fixtures";
import { COURSES } from "./data";

// Expected numbers come from the e2e seed — see scripts/seed-e2e.ts.

const introAnalytics = `/instructor/${COURSES.aliceIntro.id}/analytics`;
const advancedAnalytics = `/instructor/${COURSES.aliceAdvanced.id}/analytics`;

test.describe("course analytics", () => {
  test("dashboard shows average completion and per-course completion and quiz score", async ({
    page,
    loginAs,
  }) => {
    await loginAs("instructor");
    await page.goto("/instructor/dashboard");

    // Mean of per-course rates: (Intro 0/2 + Advanced 1/3) / 2.
    await expect(page.getByTestId("average-completion")).toHaveText("17%");

    const table = page.getByRole("table", { name: "Course analytics" });
    const intro = table.getByRole("row", {
      name: new RegExp(COURSES.aliceIntro.title),
    });
    const advanced = table.getByRole("row", {
      name: new RegExp(COURSES.aliceAdvanced.title),
    });
    // Students, revenue, completion (raw fraction: < 5), average quiz score.
    await expect(intro.getByRole("cell")).toHaveText([
      COURSES.aliceIntro.title,
      "2",
      "$85.00",
      "0/2",
      "100%",
    ]);
    await expect(advanced.getByRole("cell")).toHaveText([
      COURSES.aliceAdvanced.title,
      "3",
      "$90.00",
      "1/3",
      "—",
    ]);
  });

  test("drills down from the dashboard course table, keeping the range", async ({
    page,
    loginAs,
  }) => {
    await loginAs("instructor");
    await page.goto("/instructor/dashboard?range=90d");

    await page
      .getByRole("table", { name: "Course analytics" })
      .getByRole("link", { name: COURSES.aliceIntro.title })
      .click();

    await expect(page).toHaveURL(new RegExp(`${introAnalytics}\\?range=90d$`));
    await expect(
      page.getByRole("heading", { level: 1, name: COURSES.aliceIntro.title })
    ).toBeVisible();
  });

  test("renders every section with the seeded numbers, as raw fractions for small samples", async ({
    page,
    loginAs,
  }) => {
    await loginAs("instructor");
    await page.goto(introAnalytics);

    await expect(page.getByTestId("course-students")).toHaveText("2");
    await expect(page.getByTestId("completion-rate")).toHaveText("0/2");
    await expect(page.getByTestId("average-progress")).toHaveText("25%");

    const enrollments = page.getByRole("region", { name: "Enrollments" });
    await expect(enrollments).toContainText("Direct purchase2");
    await expect(enrollments).toContainText("Team coupon0");
    await expect(enrollments).toContainText("Free0");
    await expect(page.getByTestId("unredeemed-seats")).toHaveText("0");

    const dropOff = page.getByRole("region", { name: "Lesson drop-off" });
    await expect(
      dropOff.getByRole("img", { name: "Lesson drop-off chart" })
    ).toBeVisible();
    const lessons = dropOff.getByRole("table", { name: "Lesson completion" });
    await expect(
      lessons.getByRole("row", { name: /Why Test\?/ })
    ).toContainText("1/2");
    await expect(
      lessons.getByRole("row", { name: /Check Your Understanding/ })
    ).toContainText("0/2");

    const quiz = page
      .getByRole("region", { name: "Quizzes" })
      .getByRole("article", { name: "Testing Basics" });
    await expect(quiz).toContainText("Average best score100%");
    await expect(quiz).toContainText("Pass rate2/2");
    await expect(quiz).toContainText("Average attempts1.5");
    await expect(quiz).toContainText("Students attempted2");
    await expect(
      quiz.getByRole("row", { name: /Do tests catch regressions\?/ })
    ).toContainText("2/3");
  });

  test("filters completion, drop-off and quiz metrics to the cohort that enrolled in range", async ({
    page,
    loginAs,
  }) => {
    await loginAs("instructor");
    await page.goto(`${introAnalytics}?range=7d`);

    await expect(page.getByTestId("course-students")).toHaveText("1");
    await expect(page.getByTestId("completion-rate")).toHaveText("0/1");
    await expect(page.getByTestId("average-progress")).toHaveText("50%");
    await expect(
      page
        .getByRole("table", { name: "Lesson completion" })
        .getByRole("row", { name: /Why Test\?/ })
    ).toContainText("1/1");
    const quiz = page.getByRole("article", { name: "Testing Basics" });
    await expect(quiz).toContainText("Average attempts1.0");
    await expect(
      quiz.getByRole("row", { name: /Do tests catch regressions\?/ })
    ).toContainText("1/1");
  });

  test("shows the enrollment breakdown, unredeemed seats and empty states for a course with no lessons or quizzes", async ({
    page,
    loginAs,
  }) => {
    await loginAs("instructor");
    await page.goto(advancedAnalytics);

    await expect(page.getByTestId("completion-rate")).toHaveText("1/3");
    await expect(page.getByTestId("average-progress")).toHaveText("—");

    const enrollments = page.getByRole("region", { name: "Enrollments" });
    await expect(enrollments).toContainText("Direct purchase0");
    await expect(enrollments).toContainText("Team coupon2");
    await expect(enrollments).toContainText("Free1");
    await expect(page.getByTestId("unredeemed-seats")).toHaveText("1");

    await expect(
      page.getByRole("region", { name: "Lesson drop-off" })
    ).toContainText("No lessons in this course");
    await expect(page.getByRole("region", { name: "Quizzes" })).toContainText(
      "No quizzes in this course"
    );
  });

  test("admins can view any course's analytics", async ({ page, loginAs }) => {
    await loginAs("admin");
    const response = await page.goto(introAnalytics);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("course-students")).toHaveText("2");
  });

  test("another instructor and students get 403", async ({ page, loginAs }) => {
    await loginAs("otherInstructor");
    const asOtherInstructor = await page.goto(introAnalytics);
    expect(asOtherInstructor?.status()).toBe(403);
    await expect(
      page.getByRole("heading", { name: "Access denied" })
    ).toBeVisible();

    await loginAs("student");
    const asStudent = await page.goto(introAnalytics);
    expect(asStudent?.status()).toBe(403);
  });
});
