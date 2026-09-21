// PrivacyPolicyContent.tsx
//
// Content for the standalone Privacy Policy modal, opened from
// DashboardFooter. Kept separate from InfoPopupSharedContent since it
// isn't part of the data-focused Dashboard Information guide.

export default function PrivacyPolicyContent() {
  return (
    <div className="info-popup-content">
      <div className="info-popup-section">
        <h3 className="section-header">Analytics</h3>

        <ul>
          <li>
            This site uses Google Analytics to see how the dashboard is
            used, such as page views and general location and device
            info, so it can be improved.
          </li>

          <li>
            No account or personal information is collected, and nothing
            is sold or shared with third parties.
          </li>
        </ul>
      </div>

      <div className="info-popup-section">
        <h3 className="section-header">Map Location</h3>

        <ul>
          <li>
            The map&apos;s locate-me control uses your browser&apos;s
            location API to centre the map and show a dot for your
            position. That location is used only in your browser and is
            never sent to or stored on any server.
          </li>
        </ul>
      </div>

      <div className="info-popup-section">
        <h3 className="section-header">What This Site Doesn&apos;t Do</h3>

        <ul>
          <li>No user accounts, forms, or sign-ups.</li>
          <li>No advertising or ad tracking.</li>
        </ul>
      </div>
    </div>
  );
}
