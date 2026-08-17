// GradeChart.tsx
//
// Displays a maximized interactive donut chart breaking down restaurant grades
// for the current map view, with dynamic center-hole content and no outer labels.

import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  ResponsiveContainer,
  Sector,
} from "recharts";

import PanelHeader from "./PanelHeader";

import type { RestaurantProperties } from "../types/restaurant";
import type { Filters, SetFilters } from "../types/filters";
import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";

const GRADE_CHART_INFO_CONTENT = (
  <>
    <div className="info-popup-section">
      <h4 className="section-header">What This Shows</h4>
      <ul>
        <li>
          Displays the proportion of restaurant inspection grades and
          statuses based on the current map view.
        </li>
      </ul>
    </div>

    <div className="info-popup-section">
      <h4 className="section-header">Interaction</h4>
      <ul>
        <li>Hover over any slice to inspect its details in the center.</li>
        <li>Click any slice to filter the map view by that specific grade or status.</li>
        <li>Click again to clear the filter.</li>
      </ul>
    </div>

    <div className="info-popup-section">
      <h4 className="section-header">Grade & Status Reference</h4>
      <ul>
        <li>
          <strong style={{ color: CATEGORY_COLORS.A }}>A</strong> — 0 to 13
          points
        </li>

        <li>
          <strong style={{ color: CATEGORY_COLORS.B }}>B</strong> — 14 to 27
          points
        </li>

        <li>
          <strong style={{ color: CATEGORY_COLORS.C }}>C</strong> — 28 or
          more points
        </li>

        <li>
          <strong style={{ color: CATEGORY_COLORS.closed }}>Closed</strong>{" "}
          — Closed by DOHMH; violations requiring immediate action were
          cited
        </li>

        <li>
          <strong style={{ color: CATEGORY_COLORS.pending }}>Pending</strong>{" "}
          — Grade not yet finalized (includes N, P, and Z)
        </li>
      </ul>
    </div>
  </>
);

const SLICE_CONFIG = [
  { key: "A", label: "A", color: CATEGORY_COLORS.A },
  { key: "B", label: "B", color: CATEGORY_COLORS.B },
  { key: "C", label: "C", color: CATEGORY_COLORS.C },
  { key: "pending", label: "Pending", color: CATEGORY_COLORS.pending },
  { key: "closed", label: "Closed", color: CATEGORY_COLORS.closed },
];

type GradeChartProps = {
  restaurants: RestaurantProperties[];
  filters: Filters;
  setFilters: SetFilters;
};

type ChartDataItem = {
  name: string;
  label: string;
  value: number;
  color: string;
  isHovered: boolean;
  isSelected: boolean;
};

// Custom shape renderer, split into two layers:
//
//   1. A stable "hit" Sector, always rendered at its natural (unmoved,
//      un-grown) geometry. This is what actually receives hover/click
//      events. Its geometry NEVER changes based on active state --
//      that's deliberate. Moving/growing the element that owns mouse
//      events is what caused hover to feel "sticky": once the shape's
//      geometry shifts, the pointer is no longer over it, but the
//      browser only recomputes hover targets on the next mousemove --
//      so leaving fires late or not at all until the cursor happens to
//      move again. Keeping this layer's geometry fixed means hover
//      detection is rock solid regardless of what's drawn on top.
//      Invisible when active (opacity: 0) but still fully hoverable/
//      clickable -- opacity doesn't affect SVG hit-testing under the
//      default pointer-events: visiblePainted (only fill: none or
//      visibility: hidden would).
//
//   2. A visual-only "display" Sector, rendered on top ONLY when active,
//      with pointer-events: none so it never interferes with #1. This
//      is what actually explodes -- by growing outerRadius rather than
//      translating cx/cy. Radius growth pushes every point along the
//      arc outward along ITS OWN angle, so it reads as "expanding" for
//      a sliver slice and a 70%-of-the-ring slice alike. A single
//      directional translate (the previous approach) only ever looks
//      right for small slices -- a dominant slice just slides toward
//      one side instead of visibly growing.
const ACTIVE_RADIUS_GROWTH = 10; // px

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderCustomizedShape = (props: any) => {
  const {
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    payload,
  } = props;

  const isHovered = payload?.isHovered;
  const isSelected = payload?.isSelected;
  const fill = payload?.color;

  const isActive = isHovered || isSelected;

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
          cursor: "pointer",
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
  restaurants,
  filters,
  setFilters,
}: GradeChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // By explicitly providing the generic type here, TypeScript can no longer infer 'never'
  const { data, totalCount, activeItem } = useMemo<{
    data: ChartDataItem[];
    totalCount: number;
    activeItem: ChartDataItem | null;
  }>(() => {
    const tally: Record<string, number> = {
      A: 0,
      B: 0,
      C: 0,
      pending: 0,
      closed: 0,
    };

    let total = 0;
    for (const restaurant of restaurants) {
      const category = getGradeCategory(
        restaurant.action,
        restaurant.grade,
        restaurant.score,
      );
      if (tally[category] !== undefined) {
        tally[category] += 1;
        total += 1;
      }
    }

    let hoveredDataObj: ChartDataItem | null = null;
    let selectedDataObj: ChartDataItem | null = null;

    const chartData = SLICE_CONFIG.map(({ key, label, color }, index) => {
      const isSelected =
        filters.grades.length === 1 && filters.grades[0] === label;

      const isHovered = hoveredIndex === index;

      const item: ChartDataItem = {
        name: key,
        label,
        value: tally[key] ?? 0,
        color,
        isHovered,
        isSelected,
      };

      if (isHovered) hoveredDataObj = item;
      if (isSelected) selectedDataObj = item;

      return item;
    }).filter((item) => item.value > 0);

    const active = hoveredDataObj || selectedDataObj;

    return {
      data: chartData,
      totalCount: total,
      activeItem: active,
    };
  }, [restaurants, filters.grades, hoveredIndex]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = (entry: any, _index: number, event: any) => {
    // Recharts bubbles the underlying DOM click up through the SVG --
    // without stopping it here, clicking a slice would ALSO trigger the
    // background click handler below (meant for clicking off a slice to
    // clear the filter), immediately undoing the selection this click
    // just made.
    event?.stopPropagation?.();

    const clickedGrade = entry.label;

    const isAlreadySelected =
      filters.grades.length === 1 && filters.grades[0] === clickedGrade;

    setFilters({
      ...filters,
      grades: isAlreadySelected ? [] : [clickedGrade],
    });
  };

  // Clicking anywhere in the chart that ISN'T a slice (the donut hole,
  // the space around the ring, etc.) clears the grade filter -- same
  // idea as clicking outside an open dropdown to close it. Slice clicks
  // stop propagation (see handleClick above) before they ever reach this.
  const handleBackgroundClick = () => {
    if (filters.grades.length > 0) {
      setFilters({ ...filters, grades: [] });
    }
  };

  return (
    <section className="panel grade-chart-panel">
      {/* Recharts makes Pie/Sector elements focusable for keyboard/screen-reader
          access, which is good -- but it also means clicking a slice leaves a
          visible browser focus outline around the SVG. This suppresses that
          outline visually only; focusability itself is untouched, so tabbing
          through the chart still works the same as before. */}
      <style>{`
        .grade-chart-svg-wrap svg:focus,
        .grade-chart-svg-wrap svg *:focus {
          outline: none;
        }
      `}</style>

      <PanelHeader
        title="Grade Breakdown"
        infoContent={GRADE_CHART_INFO_CONTENT}
        infoPlacement="up"
      />

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
        }}
      >
        <div
          className="grade-chart-svg-wrap"
          onClick={handleBackgroundClick}
          style={{ flex: 1, minHeight: 0, width: "100%", height: "100%", position: "relative" }}
        >
          {data.length === 0 ? (
            <div
              className="details-empty"
              style={{ textAlign: "center", padding: "2rem" }}
            >
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
                    onMouseEnter={(_, index) => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    shape={renderCustomizedShape}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onClick={(entry: any, index: any, event: any) =>
                      handleClick(entry, index, event)
                    }
                    style={{ cursor: "pointer" }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Maximized Centered Content Inside the Donut Hole */}
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
                }}
              >
                {/* Legend row - stays visible at all times; dims non-active entries
                    when something is hovered or selected, rather than disappearing. */}
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
                  }}
                >
                  {SLICE_CONFIG.map(({ key, label, color }, index) => {
                    const isActive = activeItem?.label === label;
                    const isDimmed = activeItem !== null && !isActive;
                    const isLast = index === SLICE_CONFIG.length - 1;

                    return (
                      <span key={key}>
                        <span
                          style={{
                            color: isDimmed ? "var(--text-muted)" : color,
                            opacity: isDimmed ? 0.45 : 1,
                            transition: "opacity 0.15s ease, color 0.15s ease",
                          }}
                        >
                          {label}
                        </span>
                        {!isLast && (
                          <span
                            style={{
                              color: "var(--text-muted)",
                              opacity: isDimmed ? 0.45 : 1,
                            }}
                          >
                            ,
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>

                {/* Second line - active grade + its count, or the running total */}
                {activeItem ? (
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
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: activeItem.color,
                      }}
                    >
                      {activeItem.value.toLocaleString()}
                    </span>{" "}
                    Restaurants
                    <br />
                    in map view
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
                    }}
                  >
                    <span style={{ color: "var(--text-body)" }}>
                      {totalCount.toLocaleString()}
                    </span>{" "}
                    Restaurants
                    <br />
                    in map view
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}