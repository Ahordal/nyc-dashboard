// GradeChart.tsx
//
// Read-only donut chart showing the full restaurant grade distribution for
// the current scope (map view or search radius circle, minus active filters).
// Slices matching the active grade filter are highlighted, but the chart
// itself is non-filtering.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { PieChart, Pie, ResponsiveContainer, Sector } from "recharts";

import PanelHeader from "./PanelHeader";
import InfoPopupContent from "./InfoPopupContent";

import type { Filters } from "../types/filters";
import type { GradeCounts } from "../types/gradeCounts";
import { SEARCH_RADIUS_LABELS } from "../types/searchRadius";
import type { SearchRadiusMiles } from "../types/searchRadius";
import { CATEGORY_COLORS } from "../utils/gradeCategory";

function gradeChartInfoContent(withinRadius: boolean) {
  return (
    <InfoPopupContent
      overview={
        <p>
          Shows the full breakdown of restaurant grades and statuses{" "}
          {withinRadius
            ? "within the active Search Radius"
            : "within the current map view"}
          , also narrowed by any active Borough filter and the search field, but
          not by the active grade filter — so the grade mix stays complete
          alongside whatever grade you've selected.
        </p>
      }
      howToUse={
        <ul>
          <li>
            This chart is read-only. When a grade or status filter is active,
            the matching slice(s) are exploded to show their share of the
            total, the center count updates to their combined total, and the
            remaining labels dim.
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
  isSelected: boolean;
};

const ACTIVE_RADIUS_GROWTH = 10; // px

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderCustomizedShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, payload } =
    props;

  const isSelected = payload?.isSelected;
  const fill = payload?.color;

  const isActive = isSelected;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="var(--bg-panel)"
        strokeWidth={2}
        style={{
          opacity: isActive ? 0 : 1,
        }}
      />

      {isActive && (
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + ACTIVE_RADIUS_GROWTH}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          stroke="var(--bg-panel)"
          strokeWidth={2}
          style={{
            pointerEvents: "none",
          }}
        />
      )}
    </g>
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

  const { data, totalCount, activeLabels, activeValue } = useMemo<{
    data: ChartDataItem[];
    totalCount: number;
    // Labels currently exploded in the pie and highlighted in the centre
    // summary: every slice matching the active grade filter (there can be
    // more than one, since the grade filter is multi-select).
    activeLabels: Set<string>;
    activeValue: number;
  }>(() => {
    const labels = new Set<string>(filters.grades);

    const chartData = SLICE_CONFIG.map(({ key, label, color }) => {
      const isSelected = labels.has(label);

      return {
        name: key,
        label,
        value: counts[key] ?? 0,
        color,
        isSelected,
      } satisfies ChartDataItem;
    }).filter((item) => item.value > 0);

    const total =
      counts.A +
      counts.B +
      counts.C +
      counts.pending +
      counts.uninspected +
      counts.closed;

    const activeSlices = chartData.filter((item) => labels.has(item.label));
    const summedValue = activeSlices.reduce((sum, item) => sum + item.value, 0);

    return {
      data: chartData,
      totalCount: total,
      activeLabels: labels,
      activeValue: summedValue,
    };
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
                      const isActive = activeLabels.has(label);
                      const isDimmed = activeLabels.size > 0 && !isActive;
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
                      data-emphasis={
                        activeLabels.size > 0 ? "true" : undefined
                      }>
                      {(activeLabels.size > 0
                        ? activeValue
                        : totalCount
                      ).toLocaleString()}
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
