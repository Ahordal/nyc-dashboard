// StatsPanel.tsx
//
// One-line summary of the restaurants currently visible in the map view:
// total count plus a breakdown by grade category. 

import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUtensils } from "@fortawesome/free-solid-svg-icons";
import type { RestaurantProperties } from "../types/restaurant";
import {
  getGradeCategory,
  CATEGORY_COLORS,
  type GradeCategory,
} from "../utils/gradeCategory";

// Display order and labels for the breakdown -- mirrors GRADE_FILTER_COLORS'
// key order in Dashboard.tsx (A, B, C, Pending, Closed).
const CATEGORY_ORDER: { category: GradeCategory; label: string }[] = [
  { category: "A", label: "A" },
  { category: "B", label: "B" },
  { category: "C", label: "C" },
  { category: "pending", label: "Pending" },
  { category: "closed", label: "Closed" },
];





type StatsPanelProps = {
  restaurants: RestaurantProperties[];
};

export default function StatsPanel({ restaurants }: StatsPanelProps) {
  const counts = useMemo(() => {
    const tally: Record<GradeCategory, number> = {
      A: 0,
      B: 0,
      C: 0,
      pending: 0,
      closed: 0,
    };

    for (const restaurant of restaurants) {
      const category = getGradeCategory(
        restaurant.action,
        restaurant.grade,
        restaurant.score,
      );
      tally[category] += 1;
    }

    return tally;
  }, [restaurants]);

  return (
    <section className="panel stats-panel">
     
      <div className="stats-panel-line">
        <span className="stats-total">
          <FontAwesomeIcon
            icon={faUtensils}
            className="stats-total-icon"
            aria-hidden="true"
          />
          <span className="stats-total-count">
            {restaurants.length.toLocaleString()}
          </span>
          <span className="stats-total-label">restaurants in map view</span>
        </span>

        <span className="stats-breakdown">
          {CATEGORY_ORDER.map(({ category, label }) => (
            <span className="stats-breakdown-item" key={category}>
              <span
                className="stats-breakdown-value"
                style={{ color: CATEGORY_COLORS[category] }}
              >
                {counts[category].toLocaleString()}
              </span>
              <span className="stats-breakdown-label">{label}</span>
            </span>
          ))}
        </span>
      </div>
    </section>
  );
}