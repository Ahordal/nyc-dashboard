// DashboardTitle.tsx

export default function DashboardTitle() {
  return (
    <section className="panel dashboard-title-panel">
      <div className="title-wrapper">
        <span className="h1-large" aria-hidden="true">
          NYC
        </span>
        <h1>
          <span className="h1-med">Dining Under the Microscope</span>
          <span className="h1-small">Inspection Trends and Insights</span>
        </h1>
      </div>
    </section>
  );
}
