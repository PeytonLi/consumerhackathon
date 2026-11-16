import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    env: { NICKEL_DEMO: "1", OPENAI_API_KEY: "" },
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
