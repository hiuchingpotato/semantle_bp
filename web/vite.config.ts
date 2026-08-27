import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, not from the domain root,
  // so the deploy workflow sets PAGES_BASE. Vite rewrites asset URLs with this
  // and exposes it as import.meta.env.BASE_URL, which is how loader.ts finds the
  // game data. Left as "/" locally so `npm run dev` is unaffected.
  base: process.env.PAGES_BASE ?? "/",
  plugins: [react()],
  server: { port: 5183, host: "127.0.0.1" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The integration tests walk a 105,000-word vocabulary across 216 puzzle
    // files. That is comfortable on a dev machine and several times slower on a
    // CI runner, where the 5s default is not enough headroom.
    testTimeout: 30_000,
  },
});
