// AwardsPanel.tsx
//
// The Awards & Statistics modal's side panel: every award in catalogue order
// (held ones in colour, the rest muted but readable), then figures from the
// restaurant's inspection history.

import { useId, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { AwardCounts } from "../types/dashboardMeta";
import type { InspectionEvent, RestaurantProperties } from "../types/restaurant";
import { AWARDS, awardShare, formatAwardDate, heldAwards } from "../utils/awards";
import { CATEGORY_COLORS } from "../utils/gradeCategory";
import { restaurantStats, type InspectionOutcome } from "../utils/restaurantStats";

type AwardsPanelProps = {
  restaurant: RestaurantProperties;
  featuredDate: string | null;
  awardCounts: AwardCounts | null;
  history: InspectionEvent[];
  isLoadingHistory: boolean;
};

// "A / 2", in the grade colour its score falls in. Ungraded inspections show
// DOHMH's code, or N/A, as the inspection history does.
function Outcome({ outcome }: { outcome: InspectionOutcome | null }) {
  if (!outcome) return <>—</>;
  return (
    <span className="awards-stat-graded" style={{ color: CATEGORY_COLORS[outcome.category] }}>
      {outcome.grade ?? "N/A"} / {outcome.score}
    </span>
  );
}

export default function AwardsPanel({
  restaurant,
  featuredDate,
  awardCounts,
  history,
  isLoadingHistory,
}: AwardsPanelProps) {
  const awardsHeadingId = useId();
  const statsHeadingId = useId();

  const held = useMemo(
    () => new Map(heldAwards(restaurant, featuredDate).map((h) => [h.award.id, h])),
    [restaurant, featuredDate],
  );
  const stats = useMemo(() => restaurantStats(history), [history]);

  return (
    <>
      <section className="awards-legend" aria-labelledby={awardsHeadingId}>
        <h3 id={awardsHeadingId} className="section-header awards-section-header">
          <span>
            Awards
            <span className="awards-header-note awards-earned-count">
              {held.size} of {AWARDS.length} earned
            </span>
          </span>
          {/* Labels the share column below. */}
          <span className="awards-header-note" aria-hidden="true">
            Rarity
          </span>
        </h3>

        <ul className="awards-legend-list">
          {AWARDS.map((award) => {
            const holding = held.get(award.id);
            const share = awardShare(award.id, awardCounts);
            let status = "Not earned";
            if (holding) {
              status = holding.since ? `Earned ${formatAwardDate(holding.since)}` : "Current";
            }

            return (
              <li
                key={award.id}
                className="awards-legend-row"
                data-held={holding ? "true" : undefined}>
                <FontAwesomeIcon
                  icon={award.icon}
                  className="awards-legend-icon"
                  style={holding ? { color: award.color } : undefined}
                  aria-hidden="true"
                />
                <div className="awards-legend-text">
                  <p className="awards-legend-name">
                    {award.name}
                    {/* Unheld rows say so to screen readers; sighted users get the muted icon. */}
                    <span className={holding ? "awards-legend-status" : "visually-hidden"}>
                      {holding ? status : `, ${status.toLowerCase()}`}
                    </span>
                  </p>
                  <p className="awards-legend-description">{award.description}</p>
                </div>
                {share && (
                  <span className="awards-legend-share" title="Share of restaurants holding it">
                    {share}
                    {award.id !== "featured" && (
                      <span className="visually-hidden"> of restaurants hold it</span>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="awards-stats" aria-labelledby={statsHeadingId}>
        <h3 id={statsHeadingId} className="section-header">
          Statistics
        </h3>

        {isLoadingHistory && <p className="details-loading">Loading statistics…</p>}

        {!isLoadingHistory && stats.inspections === 0 && (
          <p className="details-empty">No inspections on record yet.</p>
        )}

        {!isLoadingHistory && stats.inspections > 0 && (
          <table className="details-table">
            <tbody>
              <tr>
                <td>Inspections on record</td>
                <td>{stats.inspections}</td>
              </tr>
              <tr>
                <td>Current A streak</td>
                <td>{stats.aStreak}</td>
              </tr>
              <tr>
                <td>Best grade / score</td>
                <td>
                  <Outcome outcome={stats.best} />
                </td>
              </tr>
              <tr>
                <td>Worst grade / score</td>
                <td>
                  <Outcome outcome={stats.worst} />
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
