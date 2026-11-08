import Database from "better-sqlite3";
import type { Browser, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { COURSES, USERS } from "./data";

// Live updates over the analytics stream. A newcomer student buys Alice's
// Intro course through the real purchase flow in a separate browser context.
// Expected numbers come from the e2e seed (scripts/seed-e2e.ts): Alice's
// dashboard shows $175.00, Bob's $150.00; Intro costs $50.00.

const E2E_DATABASE = "e2e/.data/e2e.db";

// Each purchase is undone afterwards so other specs keep their seeded numbers.
test.afterEach(() => {
  const sqlite = new Database(E2E_DATABASE);
  try {
    sqlite
      .prepare("DELETE FROM enrollments WHERE user_id = ?")
      .run(USERS.newcomer.id);
    sqlite
      .prepare("DELETE FROM purchases WHERE user_id = ?")
      .run(USERS.newcomer.id);
  } finally {
    sqlite.close();
  }
});

async function signedInPage(browser: Browser, userId: number) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const response = await page.request.post("/api/switch-user", {
    form: { userId: String(userId) },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(302);
  return page;
}

/** Counts route-data (loader) fetches the page makes from now on. */
function countLoaderFetches(page: Page) {
  const fetches: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(".data")) {
      fetches.push(request.url());
    }
  });
  return fetches;
}

// On a cold dev server (no node_modules/.vite cache), the first visits make
// Vite optimise dependencies: pages can fail to hydrate (504 "Outdated
// Optimize Dep") and every open tab gets force-reloaded — which would fake or
// break a live update. Load the pages until they hydrate before any test runs.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(90_000);

  const student = await signedInPage(browser, USERS.newcomer.id);
  const alice = await signedInPage(browser, USERS.instructor.id);
  await expect(async () => {
    await student.goto("/courses/alice-intro/purchase");
    await alice.goto("/instructor/dashboard");
    await expect(alice.getByTestId("live-status")).toHaveText("Live", {
      timeout: 5_000,
    });
  }).toPass({ timeout: 80_000 });

  await student.context().close();
  await alice.context().close();
});

/**
 * Opens the purchase page as the newcomer; the returned function confirms
 * the purchase.
 */
async function openIntroCheckout(browser: Browser) {
  const student = await signedInPage(browser, USERS.newcomer.id);
  await student.goto("/courses/alice-intro/purchase");
  const confirm = student.getByRole("button", { name: "Confirm Purchase" });
  await expect(confirm).toBeVisible();

  return async function confirmPurchase() {
    await confirm.click();
    await expect(student).toHaveURL(/\/courses\/alice-intro\/welcome$/);
    await student.context().close();
  };
}

test.describe("live analytics", () => {
  test("a purchase updates the owning instructor's dashboard without reload, and no one else's", async ({
    browser,
  }) => {
    const confirmPurchase = await openIntroCheckout(browser);

    const alice = await signedInPage(browser, USERS.instructor.id);
    await alice.goto("/instructor/dashboard");
    await expect(alice.getByTestId("total-revenue")).toHaveText("$175.00");
    await expect(alice.getByTestId("live-status")).toHaveText("Live");

    const bob = await signedInPage(browser, USERS.otherInstructor.id);
    await bob.goto("/instructor/dashboard");
    await expect(bob.getByTestId("total-revenue")).toHaveText("$150.00");
    await expect(bob.getByTestId("live-status")).toHaveText("Live");
    const bobFetches = countLoaderFetches(bob);

    // Marks the document so a full reload would be detectable.
    await alice.evaluate(() => {
      (window as unknown as { __noReload: boolean }).__noReload = true;
    });

    await confirmPurchase();

    await expect(alice.getByTestId("total-revenue")).toHaveText("$225.00", {
      timeout: 10_000,
    });
    expect(
      await alice.evaluate(
        () => (window as unknown as { __noReload?: boolean }).__noReload
      )
    ).toBe(true);
    await expect(alice.getByTestId("updated-ago")).toHaveText(
      /Updated \ds ago/
    );

    // Past Bob's debounce window: his page never re-fetched.
    await bob.waitForTimeout(3_000);
    await expect(bob.getByTestId("total-revenue")).toHaveText("$150.00");
    expect(bobFetches).toEqual([]);
  });

  test("with ?live=0 the dashboard stays put until refreshed", async ({
    browser,
  }) => {
    const confirmPurchase = await openIntroCheckout(browser);

    const alice = await signedInPage(browser, USERS.instructor.id);
    await alice.goto("/instructor/dashboard?live=0");
    await expect(alice.getByTestId("live-status")).toHaveText("Paused");
    await expect(alice.getByTestId("total-revenue")).toHaveText("$175.00");

    await confirmPurchase();

    await alice.waitForTimeout(4_000);
    await expect(alice.getByTestId("total-revenue")).toHaveText("$175.00");

    await alice.getByRole("button", { name: "Refresh" }).click();
    await expect(alice.getByTestId("total-revenue")).toHaveText("$225.00");
  });

  test("pausing and resuming is kept in the URL", async ({ page, loginAs }) => {
    await loginAs("instructor");
    await page.goto("/instructor/dashboard?range=all");
    await expect(page.getByTestId("live-status")).toHaveText("Live");

    await page.getByRole("link", { name: "Pause" }).click();
    await expect(page).toHaveURL(/[?&]live=0(&|$)/);
    await expect(page).toHaveURL(/[?&]range=all(&|$)/);
    await expect(page.getByTestId("live-status")).toHaveText("Paused");

    await page.getByRole("link", { name: "Resume" }).click();
    await expect(page).not.toHaveURL(/live=0/);
    await expect(page.getByTestId("live-status")).toHaveText("Live");
  });

  test("course and admin analytics pages show live controls", async ({
    page,
    loginAs,
  }) => {
    await loginAs("admin");
    await page.goto("/admin/analytics");
    await expect(page.getByTestId("live-status")).toHaveText("Live");
    await expect(page.getByTestId("updated-ago")).toBeVisible();

    await page.goto(`/instructor/${COURSES.aliceIntro.id}/analytics`);
    await expect(page.getByTestId("live-status")).toHaveText("Live");
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
  });

  test("the stream refuses students and signed-out visitors", async ({
    page,
    loginAs,
  }) => {
    const signedOut = await page.request.get("/api/analytics-stream");
    expect(signedOut.status()).toBe(401);

    await loginAs("student");
    const student = await page.request.get("/api/analytics-stream");
    expect(student.status()).toBe(403);
    const studentCourse = await page.request.get(
      `/api/analytics-stream?courseId=${COURSES.aliceIntro.id}`
    );
    expect(studentCourse.status()).toBe(403);
  });

  test("the course stream refuses another instructor", async ({
    page,
    loginAs,
  }) => {
    await loginAs("otherInstructor");
    const response = await page.request.get(
      `/api/analytics-stream?courseId=${COURSES.aliceIntro.id}`
    );
    expect(response.status()).toBe(403);
  });
});
