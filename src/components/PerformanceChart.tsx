// PerformanceChart.tsx
//
// Main line chart component tracking NYC restaurant inspection scores over time.
//
// Uses custom point-only tooltips rather than Recharts' built-in Tooltip.
// Direct pointer hover, history-row preview, keyboard navigation, and pinned
// report selection are maintained independently.
//
// Tooltip-priority logic lives in useTooltipPriority; keyboard navigation
// lives in useChartKeyboardNav. This component wires chart-data derivation,
// sizing, and rendering, plus the one bit of cross-hook coordination: a
// pointer hover cancels keyboard mode.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";

import PanelHeader from "./PanelHeader";
import InfoPopupContent from "./InfoPopupContent";
import PerformanceDot from "./PerformanceDot";
import PerformanceTooltip from "./PerformanceTooltip";

import { useChartKeyboardNav } from "../hooks/useChartKeyboardNav";
import { useTooltipPriority } from "../hooks/useTooltipPriority";
import type { TooltipPoint } from "../hooks/useTooltipPriority";

import type {
  ChartPoint,
  InspectionEvent,
  RestaurantProperties,
} from "../types/restaurant";

import { CATEGORY_COLORS } from "../utils/gradeCategory";

type PerformanceChartProps = {
  restaurant: RestaurantProperties | null;
  history: InspectionEvent[];
  isLoadingHistory?: boolean;
  onSelectInspection?: (inspectionId: string) => void;
  hoveredInspectionId?: string | null;
  selectedInspectionId?: string | null;
};

type RechartsDotProps = {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
};

type ChartSize = {
  width: number;
  height: number;
};

const GRADE_BAND_MINS = [
  {
    grade: "A" as const,
    min: 0,
  },
  {
    grade: "B" as const,
    min: 14,
  },
  {
    grade: "C" as const,
    min: 28,
  },
];

const PERFORMANCE_CHART_INFO_CONTENT = (
  <InfoPopupContent
    overview={
      <>
        <ul>
          <li>
            Shows the selected restaurant&apos;s scored inspections over time.
          </li>
          <li>Lower scores generally indicate fewer food-safety violations.</li>
          <li>Each point represents one inspection report.</li>
        </ul>
        <p>
          The background bands mark each inspection&apos;s score against the
          same thresholds used elsewhere on the dashboard:{" "}
          <strong style={{ color: CATEGORY_COLORS.A }}>A</strong> (0–13),{" "}
          <strong style={{ color: CATEGORY_COLORS.B }}>B</strong> (14–27), and{" "}
          <strong style={{ color: CATEGORY_COLORS.C }}>C</strong> (28+).
        </p>
      </>
    }
    howToUse={
      <ul>
        <li>
          Hover over a chart point or Inspection History row in the restaurant
          details panel to preview that inspection.
        </li>
        <li>
          Select an inspection to open its full report and keep its chart popup
          visible.
        </li>
        <li>
          Use the arrow keys to move between chart points, then press Enter or
          Space to open the selected report.
        </li>
      </ul>
    }
    statuses={
      <ul>
        <li>
          <span className="violation-tag status-flag status-closed">
            Closed by DOHMH
          </span>{" "}
          identifies an inspection that resulted in a closure. It describes that
          historical inspection, not necessarily the restaurant&apos;s current
          status.
        </li>
      </ul>
    }
    dataNotes={
      <ul>
        <li>
          Inspections without a numerical score are excluded from the timeline.
        </li>
        <li>
          A single point without a line means only one scored inspection is
          available.
        </li>
      </ul>
    }
  />);

const AXIS_TITLE_STYLE = {
  fill: "var(--text-muted)",
  fontSize: "0.9rem",
  fontWeight: 600,
  textTransform: "uppercase" as const,
};

const VISUALLY_HIDDEN_STYLE = {
  position: "absolute" as const,
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap" as const,
  border: 0,
};

function formatQuarterDate(timestamp: number): string {
  const date = new Date(timestamp);

  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;

  return `Q${quarter} ${date.getUTCFullYear()}`;
}

function formatTooltipDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatAxisMonthDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatKeyboardPointLabel(point: ChartPoint): string {
  const gradeLabel = point.grade ? `Grade ${point.grade}` : "No grade";

  return [
    formatTooltipDate(point.timestamp),
    `score ${point.score}`,
    gradeLabel,
  ].join(", ");
}

function generateTimeTicks(
  minTimestamp: number,
  maxTimestamp: number,
): number[] {
  if (
    !Number.isFinite(minTimestamp) ||
    !Number.isFinite(maxTimestamp) ||
    minTimestamp >= maxTimestamp
  ) {
    return [];
  }

  const spanDays = (maxTimestamp - minTimestamp) / 86400000;

  const ticks: number[] = [];

  const start = new Date(minTimestamp);

  const end = new Date(maxTimestamp);

  let iterations = 0;

  const MAX_ITERATIONS = 500;

  if (spanDays <= 365) {
    let year = start.getUTCFullYear();

    let month = start.getUTCMonth();

    while (iterations++ < MAX_ITERATIONS) {
      const tick = Date.UTC(year, month, 1);

      if (tick >= minTimestamp && tick <= maxTimestamp) {
        ticks.push(tick);
      }

      if (tick > maxTimestamp) {
        break;
      }

      month++;

      if (month > 11) {
        month = 0;
        year++;
      }
    }

    return ticks;
  }

  if (spanDays <= 365 * 5) {
    let year = start.getUTCFullYear();

    let quarter = Math.floor(start.getUTCMonth() / 3);

    while (iterations++ < MAX_ITERATIONS) {
      const tick = Date.UTC(year, quarter * 3, 1);

      if (tick >= minTimestamp && tick <= maxTimestamp) {
        ticks.push(tick);
      }

      if (tick > maxTimestamp) {
        break;
      }

      quarter++;

      if (quarter > 3) {
        quarter = 0;
        year++;
      }
    }

    return ticks;
  }

  for (
    let year = start.getUTCFullYear();
    year <= end.getUTCFullYear();
    year++
  ) {
    const tick = Date.UTC(year, 0, 1);

    if (tick >= minTimestamp && tick <= maxTimestamp) {
      ticks.push(tick);
    }
  }

  return ticks;
}

export default function PerformanceChart({
  restaurant,
  history,
  isLoadingHistory = false,
  onSelectInspection,
  hoveredInspectionId,
  selectedInspectionId,
}: PerformanceChartProps) {
  const instructionsId = useId();

  const chartBodyRef = useRef<HTMLDivElement | null>(null);

  const [chartSize, setChartSize] = useState<ChartSize>({
    width: 0,
    height: 0,
  });

  const chartData = useMemo<ChartPoint[]>(() => {
    const points = history.flatMap<ChartPoint>((event) => {
      const score = event.score;

      const timestamp = event.date
        ? new Date(event.date).getTime()
        : Number.NaN;

      if (
        typeof score !== "number" ||
        !Number.isFinite(score) ||
        !Number.isFinite(timestamp)
      ) {
        return [];
      }

      return [
        {
          id: event.id,
          timestamp,
          score,
          grade: event.grade ?? null,
          action: event.action ?? null,
        },
      ];
    });

    return points.sort(
      (firstPoint, secondPoint) => firstPoint.timestamp - secondPoint.timestamp,
    );
  }, [history]);

  const { xMin, xMax, yMax, maxScore } = useMemo(() => {
    if (chartData.length === 0) {
      return {
        xMin: 0,
        xMax: 0,
        yMax: 30,
        maxScore: 0,
      };
    }

    const scores = chartData.map((point) => point.score);

    const timestamps = chartData.map((point) => point.timestamp);

    const highestScore = Math.max(...scores);

    const rawXMin = Math.min(...timestamps);

    const rawXMax = Math.max(...timestamps);

    const timeSpan = rawXMax === rawXMin ? 86400000 * 180 : rawXMax - rawXMin;

    const paddedYMax = Math.ceil(
      highestScore + Math.max(highestScore * 0.12, 6),
    );

    return {
      xMin: rawXMin - timeSpan * 0.08,

      xMax: rawXMax + timeSpan * 0.08,

      yMax: Math.max(30, paddedYMax),

      maxScore: highestScore,
    };
  }, [chartData]);

  const xTicks = useMemo(() => generateTimeTicks(xMin, xMax), [xMin, xMax]);

  const yTicks = useMemo(() => {
    const ticks = [0, 14, 28];

    if (maxScore > 28 && !ticks.includes(maxScore)) {
      ticks.push(maxScore);
    }

    return ticks.sort((firstValue, secondValue) => firstValue - secondValue);
  }, [maxScore]);

  const selectedChartPoint = useMemo(() => {
    if (!selectedInspectionId) {
      return null;
    }

    return chartData.find((point) => point.id === selectedInspectionId) ?? null;
  }, [chartData, selectedInspectionId]);

  const historyPreviewChartPoint = useMemo(() => {
    if (!hoveredInspectionId) {
      return null;
    }

    return chartData.find((point) => point.id === hoveredInspectionId) ?? null;
  }, [chartData, hoveredInspectionId]);

  const keyboardNav = useChartKeyboardNav({
    chartData,
    selectedChartPoint,
    onSelectInspection,
  });

  const tooltipPriority = useTooltipPriority({
    chartData,
    selectedChartPoint,
    historyPreviewChartPoint,
    activeKeyboardPoint: keyboardNav.activeKeyboardPoint,
    isKeyboardModeActive: keyboardNav.isKeyboardModeActive,
    chartSize,
    xMin,
    xMax,
    yMax,
  });

  // Pulled out so the callback below depends on the (stable) functions
  // themselves rather than calling through the hook-result objects.
  const { exitKeyboardMode } = keyboardNav;
  const { setPointerPoint } = tooltipPriority;

  // Watch ResponsiveContainer so tooltip positions remain aligned with dots.
  useEffect(() => {
    const chartBody = chartBodyRef.current;

    if (!chartBody || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width;

      const nextHeight = entry.contentRect.height;

      setChartSize((currentSize) => {
        if (
          currentSize.width === nextWidth &&
          currentSize.height === nextHeight
        ) {
          return currentSize;
        }

        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    });

    resizeObserver.observe(chartBody);

    return () => {
      resizeObserver.disconnect();
    };
  }, [chartData.length]);

  // The one bit of cross-hook coordination: a fresh pointer hover always
  // wins, so it cancels keyboard mode rather than the other way around.
  const handlePointerPointChange = useCallback(
    (point: TooltipPoint | null) => {
      if (point) {
        exitKeyboardMode();
      }

      setPointerPoint(point);
    },
    [exitKeyboardMode, setPointerPoint],
  );

  let content;

  if (!restaurant) {
    content = (
      <div className="panel-scroll-content">
        <p className="details-empty">
          Select a restaurant to see its inspection score history.
        </p>
      </div>
    );
  } else if (isLoadingHistory) {
    content = (
      <div className="panel-scroll-content">
        <p className="details-loading">Loading inspection history…</p>
      </div>
    );
  } else if (history.length === 0) {
    content = (
      <div className="panel-scroll-content">
        <p className="details-empty">
          No inspection history available for this restaurant.
        </p>
      </div>
    );
  } else if (chartData.length === 0) {
    content = (
      <div className="panel-scroll-content">
        <p className="details-empty">
          This restaurant&apos;s inspections are all administratively graded and
          don&apos;t have a numerical score to chart.
        </p>
      </div>
    );
  } else {
    content = (
      <div
        ref={chartBodyRef}
        className="performance-chart-body"
        tabIndex={0}
        role="group"
        aria-label="Inspection score history chart"
        aria-describedby={instructionsId}
        onFocus={keyboardNav.handleChartFocus}
        onBlur={keyboardNav.handleChartBlur}
        onKeyDown={keyboardNav.handleChartKeyDown}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          outline: "none",

          boxShadow: keyboardNav.isChartFocusVisible
            ? "inset 0 0 0 2px var(--text-heading)"
            : "none",
        }}>
        <span id={instructionsId} style={VISUALLY_HIDDEN_STYLE}>
          Use the left and right arrow keys to move between inspections. Press
          Enter or Space to open the selected inspection report.
        </span>

        <span
          aria-live="polite"
          aria-atomic="true"
          style={VISUALLY_HIDDEN_STYLE}>
          {keyboardNav.isKeyboardModeActive && keyboardNav.activeKeyboardPoint
            ? formatKeyboardPointLabel(keyboardNav.activeKeyboardPoint)
            : ""}
        </span>

        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            accessibilityLayer={false}
            margin={{
              top: 0,
              right: 0,
              bottom: 10,
              left: 10,
            }}>
            {GRADE_BAND_MINS.map((band, index) => {
              const nextMin = GRADE_BAND_MINS[index + 1]?.min ?? yMax;

              return (
                <ReferenceArea
                  key={band.grade}
                  y1={band.min}
                  y2={Math.min(nextMin, yMax)}
                  fill={CATEGORY_COLORS[band.grade]}
                  fillOpacity={0.8}
                  stroke="none"
                  ifOverflow="hidden"
                />
              );
            })}

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255, 255, 255, 1)"
              vertical={true}
              horizontal={false}
            />

            <XAxis
              dataKey="timestamp"
              type="number"
              domain={[xMin, xMax]}
              ticks={xTicks}
              tickFormatter={(value) => {
                const spanDays = (xMax - xMin) / 86400000;

                if (spanDays <= 365) {
                  return formatAxisMonthDate(value);
                }

                if (spanDays <= 365 * 5) {
                  return formatQuarterDate(value);
                }

                return new Date(value).getUTCFullYear().toString();
              }}
              stroke="none"
              tick={{
                fontSize: 11,
                fontWeight: 600,
                fill: "var(--text-muted)",
                dy: 4,
              }}
              label={{
                value: "Date",
                position: "insideBottom",
                dy: 12,
                style: AXIS_TITLE_STYLE,
              }}
            />

            <YAxis
              domain={[0, yMax]}
              ticks={yTicks}
              allowDecimals={false}
              stroke="none"
              tickFormatter={(value) => {
                switch (value) {
                  case 28:
                    return "C (28)";

                  case 14:
                    return "B (14)";

                  case 0:
                    return "A (0)";

                  default:
                    return value === maxScore && maxScore > 28
                      ? `${maxScore}`
                      : "";
                }
              }}
              tick={{
                fontSize: 11,
                fontWeight: 600,
                fill: "var(--text-muted)",
              }}
              label={{
                value: "Score",
                angle: -90,
                position: "insideLeft",
                dx: -4,
                style: {
                  ...AXIS_TITLE_STYLE,
                  textAnchor: "middle",
                },
              }}
            />

            <Line
              type="linear"
              dataKey="score"
              stroke="var(--text-heading)"
              strokeWidth={1.5}
              activeDot={false}
              isAnimationActive={false}
              dot={(props: RechartsDotProps) => (
                <PerformanceDot
                  {...props}
                  isActive={
                    tooltipPriority.activeTooltipPoint?.payload.id ===
                    props.payload?.id
                  }
                  hoveredInspectionId={hoveredInspectionId}
                  onPointerPointChange={handlePointerPointChange}
                  onSelectInspection={onSelectInspection}
                  registerDotRef={tooltipPriority.registerDotRef}
                />
              )}
            />

            <ReferenceArea
              y1={0}
              y2={yMax}
              stroke="var(--border-panel)"
              strokeWidth={1}
              fill="none"
              ifOverflow="visible"
            />
          </LineChart>
        </ResponsiveContainer>

        <PerformanceTooltip
          hoveredPoint={tooltipPriority.activeTooltipPoint}
          formattedDate={
            tooltipPriority.activeTooltipPoint
              ? formatTooltipDate(
                  tooltipPriority.activeTooltipPoint.payload.timestamp,
                )
              : ""
          }
        />
      </div>
    );
  }

  return (
    <section className="panel performance-chart-panel">
      <PanelHeader
        title="Restaurant Performance Over Time"
        infoContent={PERFORMANCE_CHART_INFO_CONTENT}
        infoPlacement="up"
      />

      {content}
    </section>
  );
}
