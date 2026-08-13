import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vite only exposes client-side env vars to import.meta.env when
  // prefixed VITE_ by default. PUBLIC_ARCGIS_API_KEY (read in
  // MapView.tsx) uses a PUBLIC_ prefix instead, so it's added here
  // explicitly to keep it exposed.
  envPrefix: ["VITE_", "PUBLIC_"],
});