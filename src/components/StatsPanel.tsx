// StatsPanel.tsx
//
// One-line summary of the restaurants in scope (the current map view, or
// the Search Radius circle when that tool is active): total count plus a
// breakdown by grade category.

import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUtensils } from "@fortawesome/free-solid-svg-icons";
import type { RestaurantProperties } from "../types/restaurant";
import { SEARCH_RADIUS_LABELS } from "../types/searchRadius";
import type { SearchRadiusMiles } from "../types/searchRadius";
import {
  getGradeCategory,
  CATEGORY_COLORS,
  type GradeCategory,
} from "../utils/gradeCategory";
import { largestRemainderPercents, formatShare } from "../utils/percentShare";

// Display order and labels for the breakdown, mirroring
// GRADE_FILTER_COLORS' key order in Dashboard.tsx (A, B, C, Pending, Closed).
const CATEGORY_ORDER: { category: GradeCategory; label: string }[] = [
  { category: "A", label: "A" },
  { category: "B", label: "B" },
  { category: "C", label: "C" },
  { category: "pending", label: "Pending" },
  { category: "uninspected", label: "Uninspected" },
  { category: "closed", label: "Closed" },
];





type StatsPanelProps = {
  restaurants: RestaurantProperties[];
  // Set while the Search Radius tool is active; switches the total's
  // label from "in map view" to "within <distance>".
  searchRadiusMiles?: SearchRadiusMiles | null;
  // Show each category's share of the total next to its count
  // ("18,276 / 64% A"). Used where the donut's own percentage line is
  // dropped in favour of a single combined row (the phone drawer).
  showShare?: boolean;
};

export default function StatsPanel({
  restaurants,
  searchRadiusMiles = null,
  showShare = false,
}: StatsPanelProps) {
  const counts = useMemo(() => {
    const tally: Record<GradeCategory, number> = {
      A: 0,
      B: 0,
      C: 0,
      pending: 0,
      uninspected: 0,
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

  // Each category's share of the total, only computed when it's shown.
  const shares = useMemo(() => {
    if (!showShare) return null;
    const values = CATEGORY_ORDER.map(({ category }) => counts[category]);
    const pcts = largestRemainderPercents(values);
    return CATEGORY_ORDER.reduce(
      (acc, { category }, index) => {
        acc[category] = formatShare(pcts[index], values[index]);
        return acc;
      },
      {} as Record<GradeCategory, string>,
    );
  }, [counts, showShare]);

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
          <span className="stats-total-label">
            {searchRadiusMiles != null ? (
              <>
                restaurants within{" "}
                <span className="unit-mi">
                  {SEARCH_RADIUS_LABELS[searchRadiusMiles]}
                </span>
              </>
            ) : (
              "restaurants in map view"
            )}
          </span>
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
              {shares && (
                <span
                  className="stats-breakdown-share"
                  style={{ color: CATEGORY_COLORS[category] }}
                >
                  / {shares[category]}
                </span>
              )}
              <span className="stats-breakdown-label">{label}</span>
            </span>
          ))}
        </span>
      </div>
    </section>
  );
}