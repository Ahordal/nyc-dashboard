import { createRoot } from "react-dom/client";
import Dashboard from "./components/dashboard";
import "./styles/global.css";
import "@arcgis/core/assets/esri/themes/dark/main.css";

const rootElement = document.getElementById("root")!;

createRoot(rootElement).render(<Dashboard />);