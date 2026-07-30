import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Astro exposes client-side env vars prefixed with PUBLIC_; Vite's
  // default is VITE_. Adding PUBLIC_ here keeps PUBLIC_ARCGIS_API_KEY
  // (read in MapView.tsx) working without renaming the env var or
  // touching that file.
  envPrefix: ["VITE_", "PUBLIC_"],
});