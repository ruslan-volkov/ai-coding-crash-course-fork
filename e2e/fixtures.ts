import { test as base, expect } from "@playwright/test";
import { USERS, type Role } from "./data";

type Fixtures = {
  /** Signs the page's browser context in as the e2e user for that role. */
  loginAs: (role: Role) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  loginAs: async ({ page }, use) => {
    await use(async (role) => {
      // page.request shares the context's cookie jar, so the session cookie
      // set by the switch-user endpoint applies to subsequent navigations.
      const response = await page.request.post("/api/switch-user", {
        form: { userId: String(USERS[role].id) },
        maxRedirects: 0,
      });
      expect(response.status()).toBe(302);
    });
  },
});

export { expect };
