// main.tsx
//
// Application entry point: mounts the Dashboard into #root.

import { createRoot } from "react-dom/client";
import Dashboard from "./components/dashboard";
import "./styles/global.css";
// The @arcgis/core Esri theme CSS is imported inside MapView.tsx instead
// of here, so Vite splits it into the lazy MapView chunk rather than the
// render-blocking entry stylesheet (it's ~344 KB / 60 KB gzip, and the
// map is lazy-loaded anyway).

const rootElement = document.getElementById("root")!;

createRoot(rootElement).render(<Dashboard />);