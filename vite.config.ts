// vite.config.ts
//
// Vite + Vitest config. Adds the PUBLIC_ env prefix and scopes the
// frontend test run to src/.

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vite only exposes client-side env vars to import.meta.env when
  // prefixed VITE_ by default. PUBLIC_ARCGIS_API_KEY (read in
  // MapView.tsx) uses a PUBLIC_ prefix instead, so it's added here
  // explicitly to keep it exposed.
  envPrefix: ["VITE_", "PUBLIC_"],
  build: {
    // Emit source maps for the production bundle. They aren't downloaded
    // by browsers unless devtools is open, so there's no user-facing
    // cost, but they make production stack traces and Lighthouse's
    // bundle analysis usable.
    sourcemap: true,
  },
  test: {
    // Scoped to src/ only; pipeline/*.test.mjs is its own suite, run
    // separately via `npm test` (node:test), not picked up here.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});