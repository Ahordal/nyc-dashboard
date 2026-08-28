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
  test: {
    // Scoped to src/ only; pipeline/*.test.mjs is its own suite, run
    // separately via `npm test` (node:test), not picked up here.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});