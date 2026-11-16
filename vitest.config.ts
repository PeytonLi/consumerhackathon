import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    env: { NICKEL_DEMO: "1" },
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
