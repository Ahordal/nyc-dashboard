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
import { GradeRangeInfo } from "./InfoPopupSharedContent";

import type { RestaurantProperties } from "../types/restaurant";
import type { Filters, SetFilters } from "../types/filters";
import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";

const GRADE_CHART_INFO_CONTENT = (
  <>
    <div className="info-popup-section">
      <h4 className="section-header">What This Shows</h4>
      <ul>
        <li>
          Displays the proportion of restaurant inspection grades based on the
          current map view.
        </li>
      </ul>
    </div>

    <div className="info-popup-section">
      <h4 className="section-header">Interaction</h4>
      <ul>
        <li>Hover over any slice to inspect its details in the center.</li>
        <li>Click any slice to filter the map view by that specific grade.</li>
        <li>Click again to clear the filter.</li>
      </ul>
    </div>

    <div className="info-popup-section">
      <h4 className="section-header">Grade Ranges</h4>
      <GradeRangeInfo />
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

// Custom shape renderer for maximized slice scaling and glowing shadows
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
  const currentOuterRadius = isActive ? outerRadius + 6 : outerRadius;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={currentOuterRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="var(--bg-panel)"
        strokeWidth={2}
        style={{
          filter: isActive
            ? "drop-shadow(0px 0px 8px var(--accent))"
            : "none",
          cursor: "pointer",
        }}
      />
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
  const handleClick = (entry: any) => {
    const clickedGrade = entry.label;

    const isAlreadySelected =
      filters.grades.length === 1 && filters.grades[0] === clickedGrade;

    setFilters({
      ...filters,
      grades: isAlreadySelected ? [] : [clickedGrade],
    });
  };

  return (
    <section className="panel grade-chart-panel">
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
        <div style={{ flex: 1, minHeight: 0, width: "100%", height: "100%", position: "relative" }}>
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
                    outerRadius="98%"
                    dataKey="value"
                    isAnimationActive={false}
                    onMouseEnter={(_, index) => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    shape={renderCustomizedShape}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onClick={(entry: any) => handleClick(entry)}
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
                {activeItem ? (
                  <>
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        color: activeItem.color,
                        lineHeight: 1.1,
                      }}
                    >
                      {activeItem.label}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        color: "var(--text-heading)",
                        marginTop: "0.2rem",
                        lineHeight: 1,
                      }}
                    >
                      {activeItem.value.toLocaleString()}
                    </span>
                  </>
                ) : (
                  <>
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
                      <span>
                        <span style={{ color: CATEGORY_COLORS.A }}>A</span>
                        <span style={{ color: "var(--text-muted)" }}>,</span>
                      </span>
                      <span>
                        <span style={{ color: CATEGORY_COLORS.B }}>B</span>
                        <span style={{ color: "var(--text-muted)" }}>,</span>
                      </span>
                      <span>
                        <span style={{ color: CATEGORY_COLORS.C }}>C</span>
                        <span style={{ color: "var(--text-muted)" }}>,</span>
                      </span>
                      <span>
                        <span style={{ color: CATEGORY_COLORS.pending }}>Pending</span>
                        <span style={{ color: "var(--text-muted)" }}>,</span>
                      </span>
                      <span style={{ color: CATEGORY_COLORS.closed }}>Closed</span>
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        marginTop: "0.25rem",
                        lineHeight: 1.1,
                        textTransform: "uppercase",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {totalCount.toLocaleString()} Restaurants
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}