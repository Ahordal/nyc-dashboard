// DashboardTitle.tsx
//
// Renders the dashboard's top-level header panel, displaying the main application 
// title ("NYC Dining Under the Microscope: Inspection Trends and Insights").

import PanelHeader from "./PanelHeader";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicroscope } from "@fortawesome/free-solid-svg-icons";

export default function DashboardTitle() {
  return (
    <section className="panel dashboard-title-panel">
      <PanelHeader />
      <div className="title-wrapper">
        <span className="h1-large" aria-hidden="true">
          NYC
        </span>
        <h1>
          <span className="h1-med">Dining Under the Microscope  <FontAwesomeIcon
              icon={faMicroscope}
              
              aria-hidden="true"
            /></span>
          <span className="h1-small">
            Inspection Trends and Insights{" "}
           
          </span>
        </h1>
      </div>
    </section>
  );
}
