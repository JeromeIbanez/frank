import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/domain/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws on import outside a React Server Component, so
      // point it at the same empty module Next uses under the "react-server"
      // condition. The production guarantee is unaffected: Next still fails
      // the build if a client component imports it.
      "server-only": path.resolve(
        __dirname,
        "./node_modules/server-only/empty.js"
      ),
    },
  },
});
