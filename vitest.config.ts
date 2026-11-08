import { configDefaults, defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    // Playwright specs live in e2e/ and run via `npm run test:e2e`.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
