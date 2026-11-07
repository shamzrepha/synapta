import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // third-party skill packages under .agent/ ship their own tests (and need their own dependencies): not ours to run
    exclude: [...configDefaults.exclude, ".agent/**", ".antigravity/**", ".claude/**"],
    // the simulator-backed studio tests run whole circuits; the CI runners are slower than a dev machine
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./"),
    },
  },
});
