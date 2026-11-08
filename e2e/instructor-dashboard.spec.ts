import { test, expect } from "./fixtures";
import { COURSES } from "./data";

// Expected numbers come from the e2e seed — see scripts/seed-e2e.ts.

test.describe("instructor dashboard", () => {
  test("instructors see a Dashboard sidebar item above My Courses", async ({
    page,
    loginAs,
  }) => {
    await loginAs("instructor");
    await page.goto("/courses");

    const nav = page.getByRole("navigation").first();
    const labels = await nav.getByRole("link").allTextContents();
    expect(labels.indexOf("Dashboard")).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf("Dashboard")).toBeLessThan(
      labels.indexOf("My Courses")
    );

    await nav.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/instructor\/dashboard$/);
  });

  for (const [role, path] of [
    ["instructor", "/instructor/dashboard"],
    ["admin", "/admin/analytics"],
    ["student", "/dashboard"],
  ] as const) {
    test(`the home page Dashboard button takes ${role}s to ${path}`, async ({
      page,
      loginAs,
    }) => {
      await loginAs(role);
      await page.goto("/");
      await page.getByRole("link", { name: "Dashboard", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    });
  }

  for (const role of ["student", "admin"] as const) {
    test(`${role}s do not see the instructor Dashboard item`, async ({
      page,
      loginAs,
    }) => {
      await loginAs(role);
      await page.goto("/courses");
      await expect(page.locator('a[href="/instructor/dashboard"]')).toHaveCount(
        0
      );
    });
  }

  test("shows totals and a course table for the instructor's own courses only", async ({
    page,
    loginAs,
  }) => {
    await loginAs("instructor");
    await page.goto("/instructor/dashboard");

    await expect(page.getByTestId("total-students")).toHaveText("5");
    await expect(page.getByTestId("total-revenue")).toHaveText("$175.00");

    const table = page.getByRole("table", { name: "Course analytics" });
    await expect(
      table.getByRole("row", { name: new RegExp(COURSES.aliceIntro.title) })
    ).toContainText("2$85.00");
    await expect(
      table.getByRole("row", { name: new RegExp(COURSES.aliceAdvanced.title) })
    ).toContainText("3$90.00");
    await expect(table).not.toContainText(COURSES.bobCooking.title);

    await expect(
      page.getByRole("img", { name: "Enrollments chart" })
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Revenue chart" })
    ).toBeVisible();
  });

  test("another instructor sees only their own numbers", async ({
    page,
    loginAs,
  }) => {
    await loginAs("otherInstructor");
    await page.goto("/instructor/dashboard");

    await expect(page.getByTestId("total-students")).toHaveText("2");
    await expect(page.getByTestId("total-revenue")).toHaveText("$150.00");
  });

  test("changing the date range updates the URL and the numbers", async ({
    page,
    loginAs,
  }) => {
    await loginAs("instructor");
    await page.goto("/instructor/dashboard");

    const range = page.getByRole("navigation", { name: "Date range" });

    await range.getByRole("link", { name: "Last 7 days" }).click();
    await expect(page).toHaveURL(/\?range=7d$/);
    await expect(page.getByTestId("total-students")).toHaveText("2");
    await expect(page.getByTestId("total-revenue")).toHaveText("$50.00");

    await range.getByRole("link", { name: "Last 30 days" }).click();
    await expect(page).toHaveURL(/\?range=30d$/);
    await expect(page.getByTestId("total-students")).toHaveText("4");
    await expect(page.getByTestId("total-revenue")).toHaveText("$140.00");

    await range.getByRole("link", { name: "All time" }).click();
    await expect(page).toHaveURL(/\?range=all$/);
    await expect(page.getByTestId("total-students")).toHaveText("5");
  });

  test("students get 403, admins get 403, signed-out visitors get 401", async ({
    page,
    loginAs,
  }) => {
    const signedOut = await page.goto("/instructor/dashboard");
    expect(signedOut?.status()).toBe(401);

    await loginAs("student");
    const asStudent = await page.goto("/instructor/dashboard");
    expect(asStudent?.status()).toBe(403);
    await expect(
      page.getByRole("heading", { name: "Access denied" })
    ).toBeVisible();

    await loginAs("admin");
    const asAdmin = await page.goto("/instructor/dashboard");
    expect(asAdmin?.status()).toBe(403);
  });
});
