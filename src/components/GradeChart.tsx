// GradeChart.tsx
//
// Read-only donut chart of the restaurant grade distribution for the
// current scope (map view or search radius circle). Narrowed by the
// active Borough filter and search; when a grade filter is active the
// chart is scoped to just those grades so it matches the map and list.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { PieChart, Pie, ResponsiveContainer, Sector } from "recharts";

import PanelHeader from "./PanelHeader";
import InfoPopupContent from "./InfoPopupContent";

import type { Filters } from "../types/filters";
import type { GradeCounts } from "../types/gradeCounts";
import { scopeGradeCounts } from "../types/gradeCounts";
import { SEARCH_RADIUS_LABELS } from "../types/searchRadius";
import type { SearchRadiusMiles } from "../types/searchRadius";
import { CATEGORY_COLORS } from "../utils/gradeCategory";

function gradeChartInfoContent(withinRadius: boolean) {
  return (
    <InfoPopupContent
      overview={
        <p>
          Shows the breakdown of restaurant grades and statuses{" "}
          {withinRadius
            ? "within the active Search Radius"
            : "within the current map view"}
          , narrowed by any active Borough filter and the search field.
        </p>
      }
      howToUse={
        <ul>
          <li>
            This chart is read-only. When a grade or status filter is active,
            the chart is limited to those grades and the center count is their
            total; center labels for grades with no restaurants in the current
            view are dimmed.
          </li>
        </ul>
      }
    />
  );
}

const SLICE_CONFIG = [
  { key: "A", label: "A", color: CATEGORY_COLORS.A },
  { key: "B", label: "B", color: CATEGORY_COLORS.B },
  { key: "C", label: "C", color: CATEGORY_COLORS.C },
  { key: "pending", label: "Pending", color: CATEGORY_COLORS.pending },
  {
    key: "uninspected",
    label: "Uninspected",
    color: CATEGORY_COLORS.uninspected,
  },
  { key: "closed", label: "Closed", color: CATEGORY_COLORS.closed },
] as const;

type GradeChartProps = {
  // Grade/status tally for the current map view, pre-computed in MapView
  // (see reportVisibleRestaurants there). This used to be a full
  // RestaurantProperties[] array, up to ~27,000 objects at city zoom, but
  // this component only ever needed the five counts derived from it, so
  // MapView now computes and passes just that instead.
  counts: GradeCounts;
  filters: Filters;
  // Set while the Search Radius tool is active; switches the panel title
  // (and info copy) from "Map View" to "Within <distance>".
  searchRadiusMiles?: SearchRadiusMiles | null;
};

type ChartDataItem = {
  name: string;
  label: string;
  value: number;
  color: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderCustomizedShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, payload } =
    props;

  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={payload?.color}
      stroke="var(--bg-panel)"
      strokeWidth={2}
    />
  );
};

export default function GradeChart({
  counts,
  filters,
  searchRadiusMiles = null,
}: GradeChartProps) {
  const [showInfo, setShowInfo] = useState(false);

  const scopeText =
    searchRadiusMiles != null
      ? `Within ${SEARCH_RADIUS_LABELS[searchRadiusMiles]}`
      : "Map View";

  const title =
    searchRadiusMiles != null ? (
      <>
        Grade Breakdown — Within{" "}
        <span className="unit-mi">
          {SEARCH_RADIUS_LABELS[searchRadiusMiles]}
        </span>
      </>
    ) : (
      "Grade Breakdown — Map View"
    );

  const infoContent = useMemo(
    () => gradeChartInfoContent(searchRadiusMiles != null),
    [searchRadiusMiles],
  );

  const hasGradeFilter = filters.grades.length > 0;

  const { data, totalCount, scopedCounts } = useMemo<{
    data: ChartDataItem[];
    totalCount: number;
    // The tally restricted to the selected grades (unchanged when none
    // are selected). Drives the slices, the centre count, and which
    // centre labels stay coloured.
    scopedCounts: GradeCounts;
  }>(() => {
    const scoped = scopeGradeCounts(counts, filters.grades);

    const chartData = SLICE_CONFIG.map(({ key, label, color }) => ({
      name: key,
      label,
      value: scoped[key] ?? 0,
      color,
    })).filter((item) => item.value > 0);

    const total =
      scoped.A +
      scoped.B +
      scoped.C +
      scoped.pending +
      scoped.uninspected +
      scoped.closed;

    return { data: chartData, totalCount: total, scopedCounts: scoped };
  }, [counts, filters.grades]);

  const chartAriaLabel = useMemo(() => {
    if (data.length === 0) {
      return `Grade breakdown, ${scopeText.toLowerCase()}: no data for the current view.`;
    }

    const parts = data
      .map((item) => `${item.label} ${item.value.toLocaleString()}`)
      .join(", ");

    return `Grade breakdown, ${scopeText.toLowerCase()}: ${parts}. ${totalCount.toLocaleString()} restaurants total.`;
  }, [data, scopeText, totalCount]);

  return (
    <section className="panel grade-chart-panel">
      <PanelHeader
        title={title}
        titleText={`Grade Breakdown — ${scopeText}`}
        infoContent={infoContent}
        onInfoClick={() => {
          setShowInfo((currentValue) => !currentValue);
        }}
        isInfoOpen={showInfo}
      />

      {showInfo ? (
        <div className="panel-scroll-content">{infoContent}</div>
      ) : (
        <div className="panel-scroll-content grade-chart-body">
          <div
            className="grade-chart-svg-wrap"
            role="img"
            aria-label={chartAriaLabel}>
            {data.length === 0 ? (
              <div className="details-empty grade-chart-empty">
                No data available for current view.
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data}
                      cx="50%"
                      cy="50%"
                      innerRadius="65%"
                      outerRadius="90%"
                      dataKey="value"
                      isAnimationActive={false}
                      shape={renderCustomizedShape}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="grade-chart-center">
                  <div className="grade-chart-legend">
                    {SLICE_CONFIG.map(({ key, label, color }, index) => {
                      // Coloured only when that category has restaurants in
                      // the scoped view (which already excludes grades not
                      // in the active filter). Everything else dims.
                      const isDimmed = (scopedCounts[key] ?? 0) === 0;
                      const isLast = index === SLICE_CONFIG.length - 1;

                      return (
                        <span
                          key={key}
                          className="grade-chart-legend-group"
                          data-dimmed={isDimmed ? "true" : undefined}>
                          <span
                            className="grade-chart-legend-item"
                            style={
                              { "--legend-color": color } as CSSProperties
                            }>
                            {label}
                          </span>
                          {!isLast && (
                            <span className="grade-chart-legend-sep">,</span>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  <div className="grade-chart-count">
                    <span
                      className="grade-chart-count-value"
                      data-emphasis={hasGradeFilter ? "true" : undefined}>
                      {totalCount.toLocaleString()}
                    </span>{" "}
                    Restaurants
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
