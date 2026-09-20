// GradeChart.tsx
//
// Read-only donut chart of the restaurant grade distribution for the
// current scope (map view or search radius circle). Narrowed by the
// active Borough filter and search; when a grade filter is active the
// chart is scoped to just those grades so it matches the map and list.

import { memo, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { PieChart, Pie, ResponsiveContainer, Sector } from "recharts";
import type { PieSectorShapeProps } from "recharts";

import PanelHeader from "./PanelHeader";
import InfoPopupContent from "./InfoPopupContent";

import type { Filters } from "../types/filters";
import type { GradeCounts } from "../types/gradeCounts";
import { scopeGradeCounts } from "../types/gradeCounts";
import { SEARCH_RADIUS_LABELS } from "../types/searchRadius";
import type { SearchRadiusMiles } from "../types/searchRadius";
import { CATEGORY_COLORS } from "../utils/gradeCategory";
import { largestRemainderPercents, formatShare } from "../utils/percentShare";

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
            This chart is read-only. Each category&apos;s share of the total
            (%) appears in the panel below it.
          </li>
          <li>
            When a grade or status filter is active, the chart and the
            percentages are both limited to the selected categories; an
            active search further narrows which restaurants are counted.
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
  // (reportVisibleRestaurants). Used to be a full RestaurantProperties[]
  // (~27,000 objects at city zoom); this only ever needed the five counts.
  counts: GradeCounts;
  filters: Filters;
  // Current search text, if any. Used only for the footnote that flags
  // when the tally is narrowed by inputs the donut doesn't itself show.
  searchQuery?: string;
  // Set while the Search Radius tool is active; switches the panel title
  // (and info copy) from "Map View" to "Within <distance>".
  searchRadiusMiles?: SearchRadiusMiles | null;
  // The mobile drawer drops the centre grade labels and the footnote
  // (it shows its own KPI row + filter summary instead); elsewhere keeps both.
  showCenterLegend?: boolean;
  showFilterNote?: boolean;
  // Per-category share line under the donut — the donut's own readout
  // (proportion), separate from the absolute counts in the stats panel.
  showPercentages?: boolean;
};

type ChartDataItem = {
  name: string;
  label: string;
  value: number;
  color: string;
};

const renderCustomizedShape = (props: PieSectorShapeProps) => {
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

function GradeChart({
  counts,
  filters,
  searchQuery = "",
  searchRadiusMiles = null,
  showCenterLegend = true,
  showFilterNote = true,
  showPercentages = true,
}: GradeChartProps) {
  const [showInfo, setShowInfo] = useState(false);

  // Grade filters already scope the slices and centre count, so they need
  // no callout; borough and search narrow the tally invisibly, so name
  // them below the chart when active.
  const filterNote = useMemo(() => {
    const parts = [...filters.boroughs];
    const query = searchQuery.trim();
    if (query) parts.push(`"${query}"`);
    return parts.join(", ");
  }, [filters.boroughs, searchQuery]);

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

  const { data, totalCount, scopedCounts, percentItems } = useMemo<{
    data: ChartDataItem[];
    totalCount: number;
    // The tally restricted to the selected grades (unchanged when none
    // are selected). Drives the slices, the centre count, and which
    // centre labels stay coloured.
    scopedCounts: GradeCounts;
    // Categories for the percentage line — all of them with no grade
    // filter, else just the selected ones — kept at zero count so e.g.
    // "Closed 0%" shows rather than vanishing.
    percentItems: ChartDataItem[];
  }>(() => {
    const scoped = scopeGradeCounts(counts, filters.grades);
    const activeLabels =
      filters.grades.length === 0 ? null : new Set(filters.grades);

    const allItems = SLICE_CONFIG.map(({ key, label, color }) => ({
      name: key,
      label,
      value: scoped[key] ?? 0,
      color,
    }));

    const chartData = allItems.filter((item) => item.value > 0);
    const inScope = allItems.filter(
      (item) => activeLabels === null || activeLabels.has(item.label),
    );

    const total =
      scoped.A +
      scoped.B +
      scoped.C +
      scoped.pending +
      scoped.uninspected +
      scoped.closed;

    return {
      data: chartData,
      totalCount: total,
      scopedCounts: scoped,
      percentItems: inScope,
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

  // Largest-remainder rounded so the line sums to 100. A tiny nonzero
  // category rounds to "<1%"; a genuinely empty one still shows "0%".
  const percentages = useMemo(() => {
    if (totalCount === 0) return [];
    const pcts = largestRemainderPercents(
      percentItems.map((item) => item.value),
    );
    return percentItems.map((item, index) => ({
      name: item.name,
      label: item.label,
      color: item.color,
      display: formatShare(pcts[index], item.value),
    }));
  }, [percentItems, totalCount]);

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

                {showCenterLegend && (
                  <div className="grade-chart-center">
                    <div className="grade-chart-legend">
                      {SLICE_CONFIG.map(({ key, label, color }, index) => {
                        // Coloured only when that category has restaurants in the scoped view.
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
                  </div>
                )}
              </>
            )}
          </div>

          {showPercentages && data.length > 0 && (
            <ul className="grade-chart-percentages" aria-label="Grade share">
              {percentages.map(({ name, label, color, display }) => (
                <li key={name} className="grade-chart-percentage">
                  <span
                    className="grade-chart-percentage-value"
                    style={{ color }}>
                    {display}
                  </span>{" "}
                  {label}
                </li>
              ))}
            </ul>
          )}

          {/* Reserved space is permanent; only the text toggles, so the
              donut never shifts when a filter is added or cleared. */}
          {showFilterNote && (
            <div className="grade-chart-filter-note" aria-live="polite">
              {filterNote && `Filters applied: ${filterNote}`}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default memo(GradeChart);
