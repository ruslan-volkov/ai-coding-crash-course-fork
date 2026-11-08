import { test, expect } from "./fixtures";
import { COURSES, USERS } from "./data";

// Expected numbers come from the e2e seed — see scripts/seed-e2e.ts.
// Platform-wide = Alice (5 students, $175.00) + Bob (2 students, $150.00).

test.describe("admin analytics", () => {
  test("admins see an Analytics sidebar item leading to admin analytics", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto("/courses");

    await page
      .getByRole("navigation")
      .first()
      .getByRole("link", { name: "Analytics" })
      .click();
    await expect(page).toHaveURL(/\/admin\/analytics$/);
    await expect(
      page.getByRole("heading", { name: "Analytics", level: 1 })
    ).toBeVisible();
  });

  for (const role of ["student", "instructor"] as const) {
    test(`${role}s do not see the Analytics item`, async ({
      page,
      loginAs,
    }) => {
      await loginAs(role);
      await page.goto("/courses");
      await expect(page.locator('a[href="/admin/analytics"]')).toHaveCount(0);
    });
  }

  test("shows platform-wide totals, trends and every course with its instructor", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto("/admin/analytics");

    await expect(page.getByTestId("total-students")).toHaveText("7");
    await expect(page.getByTestId("total-revenue")).toHaveText("$325.00");
    // Mean of Intro 0/2, Advanced 1/3, Cooking 0/2.
    await expect(page.getByTestId("average-completion")).toHaveText("11%");
    await expect(page.getByTestId("average-rating")).toHaveText("4.0");
    await expect(page.getByTestId("unanswered-questions")).toHaveText("1");

    await expect(
      page.getByRole("img", { name: "Enrollments chart" })
    ).toBeVisible();
    await expect(page.getByRole("img", { name: "Revenue chart" })).toBeVisible();

    const table = page.getByRole("table", { name: "Course analytics" });
    await expect(
      table.getByRole("columnheader", { name: "Instructor" })
    ).toBeVisible();
    await expect(
      table.getByRole("row", { name: new RegExp(COURSES.aliceIntro.title) })
    ).toContainText(USERS.instructor.name);
    await expect(
      table.getByRole("row", { name: new RegExp(COURSES.bobCooking.title) })
    ).toContainText(USERS.otherInstructor.name);
  });

  test("selecting an instructor updates the URL and narrows every number", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto("/admin/analytics?range=all");

    const instructor = page.getByLabel("Instructor");
    await instructor.selectOption({ label: USERS.otherInstructor.name });

    await expect(page).toHaveURL(
      new RegExp(`[?&]instructor=${USERS.otherInstructor.id}(&|$)`)
    );
    await expect(page).toHaveURL(/[?&]range=all(&|$)/);
    await expect(page.getByTestId("total-students")).toHaveText("2");
    await expect(page.getByTestId("total-revenue")).toHaveText("$150.00");
    await expect(page.getByTestId("average-completion")).toHaveText("0%");
    await expect(page.getByTestId("average-rating")).toHaveText("—");
    await expect(page.getByTestId("unanswered-questions")).toHaveText("0");

    const table = page.getByRole("table", { name: "Course analytics" });
    await expect(table).toContainText(COURSES.bobCooking.title);
    await expect(table).not.toContainText(COURSES.aliceIntro.title);

    await instructor.selectOption({ label: "All instructors" });
    await expect(page).not.toHaveURL(/instructor=/);
    await expect(page.getByTestId("total-students")).toHaveText("7");
  });

  test("course table links to each course's analytics page", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto(
      `/admin/analytics?instructor=${USERS.instructor.id}&range=all`
    );

    await page
      .getByRole("table", { name: "Course analytics" })
      .getByRole("link", { name: COURSES.aliceIntro.title })
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/instructor/${COURSES.aliceIntro.id}/analytics\\?range=all$`)
    );
    await expect(page.getByTestId("course-students")).toHaveText("2");
  });

  test("instructors and students get 403, signed-out visitors get 401", async ({
    page,
    loginAs,
  }) => {
    const signedOut = await page.goto("/admin/analytics");
    expect(signedOut?.status()).toBe(401);

    await loginAs("instructor");
    const asInstructor = await page.goto("/admin/analytics");
    expect(asInstructor?.status()).toBe(403);
    await expect(
      page.getByRole("heading", { name: "Access denied" })
    ).toBeVisible();

    await loginAs("student");
    const asStudent = await page.goto("/admin/analytics");
    expect(asStudent?.status()).toBe(403);
  });
});
