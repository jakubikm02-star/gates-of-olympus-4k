import { defineConfig } from "vitest/config";

/**
 * Standalone from vite.config.ts so the tajnička test does not boot TanStack, Nitro or the database.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/slot/koleso-reveal.test.ts"],
  },
});
