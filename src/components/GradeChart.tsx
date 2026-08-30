// GradeChart.tsx
//
// Read-only donut chart showing the full restaurant grade distribution for
// the current scope (map view or search radius circle, minus active filters).
// Slices matching the active grade filter are highlighted, but the chart
// itself is non-filtering.

import { useMemo, useState } from "react";
import { PieChart, Pie, ResponsiveContainer, Sector } from "recharts";

import PanelHeader from "./PanelHeader";
import InfoPopupContent from "./InfoPopupContent";

import type { Filters, SetFilters } from "../types/filters";
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
  setFilters: SetFilters;
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
            filter: "drop-shadow(0px 0px 8px var(--accent))",
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
  // setFilters is no longer used: this chart is a pure display of the
  // current scope (see the comment on gradeCounts in MapView.tsx), not an
  // input. Left in GradeChartProps since the parent still passes it and
  // other consumers of this type may rely on it.

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

  const { data, totalCount, activeLabels, activeValue, activeColor } = useMemo<{
    data: ChartDataItem[];
    totalCount: number;
    // Labels currently exploded in the pie and highlighted in the centre
    // summary: every slice matching the active grade filter (there can be
    // more than one, since the grade filter is multi-select).
    activeLabels: Set<string>;
    activeValue: number;
    activeColor: string;
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
    // A single highlighted slice gets its own color; multiple (a
    // multi-grade filter) fall back to a neutral color rather than
    // picking one arbitrarily.
    const color =
      activeSlices.length === 1 ? activeSlices[0].color : "var(--text-body)";

    return {
      data: chartData,
      totalCount: total,
      activeLabels: labels,
      activeValue: summedValue,
      activeColor: color,
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
      <style>{`
        .grade-chart-svg-wrap svg:focus,
        .grade-chart-svg-wrap svg *:focus {
          outline: none;
        }
      `}</style>

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
        <div
          className="panel-scroll-content"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            padding: "1rem",
            position: "relative",
            boxSizing: "border-box",
          }}>
          <div
            className="grade-chart-svg-wrap"
            role="img"
            aria-label={chartAriaLabel}
            style={{
              flex: 1,
              minHeight: 0,
              width: "100%",
              height: "100%",
              position: "relative",
            }}>
            {data.length === 0 ? (
              <div
                className="details-empty"
                style={{ textAlign: "center", padding: "2rem" }}>
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

                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    textAlign: "center",
                    pointerEvents: "none",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "65%",
                    maxWidth: "180px",
                  }}>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.02em",
                      lineHeight: 1.35,
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "center",
                      gap: "0rem 0.25rem",
                    }}>
                    {SLICE_CONFIG.map(({ key, label, color }, index) => {
                      const isActive = activeLabels.has(label);
                      const isDimmed = activeLabels.size > 0 && !isActive;
                      const isLast = index === SLICE_CONFIG.length - 1;

                      return (
                        <span key={key}>
                          <span
                            style={{
                              color: isDimmed ? "var(--text-muted)" : color,
                              opacity: isDimmed ? 0.45 : 1,
                              transition: "opacity 0.15s ease, color 0.15s ease",
                            }}>
                            {label}
                          </span>
                          {!isLast && (
                            <span
                              style={{
                                color: "var(--text-muted)",
                                opacity: isDimmed ? 0.45 : 1,
                              }}>
                              ,
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  {activeLabels.size > 0 ? (
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        marginTop: "0.45rem",
                        lineHeight: 1.3,
                        textTransform: "uppercase",
                        letterSpacing: "0.02em",
                        textAlign: "center",
                      }}>
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          color: activeColor,
                        }}>
                        {activeValue.toLocaleString()}
                      </span>{" "}
                      Restaurants
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        marginTop: "0.45rem",
                        lineHeight: 1.3,
                        textTransform: "uppercase",
                        letterSpacing: "0.02em",
                        textAlign: "center",
                      }}>
                      <span style={{ color: "var(--text-body)" }}>
                        {totalCount.toLocaleString()}
                      </span>{" "}
                      Restaurants
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
