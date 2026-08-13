// PerformanceChart.tsx
//
// Main line chart component tracking NYC restaurant inspection scores over time.
//
// Uses custom point-only tooltips rather than Recharts' built-in Tooltip.
// Direct pointer hover, history-row preview, keyboard navigation, and pinned
// report selection are maintained independently.
//
// Tooltip priority:
// 1. A chart dot directly under the pointer.
// 2. A history row currently hovered or keyboard-focused.
// 3. The current keyboard-navigation point.
// 4. The report currently pinned by Dashboard.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { FocusEvent, KeyboardEvent } from "react";

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
import PerformanceDot from "./PerformanceDot";
import PerformanceTooltip from "./PerformanceTooltip";

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

type TooltipPoint = {
  cx: number;
  cy: number;
  payload: ChartPoint;
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
  <>
    <div className="info-popup-section">
      <h4 className="section-header">What This Chart Shows</h4>
      <ul>
        <li>
          Shows the selected restaurant&apos;s scored inspections over time.
        </li>
        <li>Lower scores generally indicate fewer food-safety violations.</li>
        <li>Each point represents one inspection report.</li>
      </ul>
    </div>

    <div className="info-popup-section">
      <h4 className="section-header">Grade Ranges</h4>
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
          <strong style={{ color: CATEGORY_COLORS.C }}>C</strong> — 28 or more
          points
        </li>
        <li>
          Background bands show where each inspection falls relative to those
          grade thresholds.
        </li>
      </ul>
    </div>

    <div className="info-popup-section">
      <h4 className="section-header">Interaction</h4>
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
    </div>

    <div className="info-popup-section">
      <h4 className="section-header">Data Notes</h4>
      <ul>
        <li>
          Inspections without a numerical score are excluded from the timeline.
        </li>
        <li>
          A single point without a line means only one scored inspection is
          available.
        </li>
        <li>
          <span className="violation-tag status-flag status-closed">
            Closed by DOHMH
          </span>{" "}
          identifies an inspection that resulted in a closure. It describes that
          historical inspection, not necessarily the restaurant&apos;s current
          status.
        </li>
      </ul>
    </div>
  </>
);

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

function tooltipPointsMatch(
  firstPoint: TooltipPoint | null,
  secondPoint: TooltipPoint | null,
): boolean {
  if (firstPoint === null || secondPoint === null) {
    return firstPoint === secondPoint;
  }

  return (
    firstPoint.payload.id === secondPoint.payload.id &&
    firstPoint.cx === secondPoint.cx &&
    firstPoint.cy === secondPoint.cy
  );
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

  const dotRefs = useRef<Map<string, SVGCircleElement>>(new Map());

  // Direct hover over a chart dot.
  const [pointerPoint, setPointerPoint] = useState<TooltipPoint | null>(null);

  // Hover or keyboard focus from the RestaurantDetails history list.
  const [historyPreviewPoint, setHistoryPreviewPoint] =
    useState<TooltipPoint | null>(null);

  // Current point selected through chart keyboard navigation.
  const [keyboardPoint, setKeyboardPoint] = useState<TooltipPoint | null>(null);

  // Current report selection while Dashboard permits it to remain pinned.
  const [selectedPoint, setSelectedPoint] = useState<TooltipPoint | null>(null);

  const [focusedPointId, setFocusedPointId] = useState<string | null>(null);

  const [isKeyboardModeActive, setIsKeyboardModeActive] = useState(false);

  const [isChartFocusVisible, setIsChartFocusVisible] = useState(false);

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

  const activeKeyboardPoint = useMemo(() => {
    return (
      chartData.find((point) => point.id === focusedPointId) ??
      selectedChartPoint ??
      chartData[0] ??
      null
    );
  }, [chartData, focusedPointId, selectedChartPoint]);

  const activeTooltipPoint =
    pointerPoint ??
    historyPreviewPoint ??
    (isKeyboardModeActive ? keyboardPoint : selectedPoint);

  useEffect(() => {
    setFocusedPointId(chartData[0]?.id ?? null);

    setPointerPoint(null);
    setHistoryPreviewPoint(null);
    setKeyboardPoint(null);
    setSelectedPoint(null);
    setIsKeyboardModeActive(false);
    setIsChartFocusVisible(false);
  }, [chartData]);

  // A newly selected report becomes the keyboard-navigation starting point.
  useEffect(() => {
    if (selectedChartPoint) {
      setFocusedPointId(selectedChartPoint.id);
    }
  }, [selectedChartPoint]);

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

  const registerDotRef = useCallback(
    (id: string, element: SVGCircleElement | null) => {
      if (element) {
        dotRefs.current.set(id, element);
      } else {
        dotRefs.current.delete(id);
      }
    },
    [],
  );

  const getRenderedTooltipPoint = useCallback(
    (point: ChartPoint | null): TooltipPoint | null => {
      if (!point) {
        return null;
      }

      const dot = dotRefs.current.get(point.id);

      if (!dot) {
        return null;
      }

      const cx = Number(dot.getAttribute("cx"));

      const cy = Number(dot.getAttribute("cy"));

      if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
        return null;
      }

      return {
        cx,
        cy,
        payload: point,
      };
    },
    [],
  );

  // Synchronize the pinned report point.
  useEffect(() => {
    const syncPoint = () => {
      const nextSelectedPoint = getRenderedTooltipPoint(selectedChartPoint);

      setSelectedPoint((currentPoint) =>
        tooltipPointsMatch(currentPoint, nextSelectedPoint)
          ? currentPoint
          : nextSelectedPoint,
      );
    };

    // 1. Try to sync immediately
    syncPoint();

    // 2. Try again slightly later to ensure Recharts has finished its layout paint
    const timeoutId = setTimeout(syncPoint, 100);

    return () => clearTimeout(timeoutId);
  }, [
    selectedChartPoint,
    getRenderedTooltipPoint,
    chartSize.width,
    chartSize.height,
    xMin,
    xMax,
    yMax,
  ]);

  // Synchronize the history-row hover/focus preview.
  useEffect(() => {
    const nextPreviewPoint = getRenderedTooltipPoint(historyPreviewChartPoint);

    setHistoryPreviewPoint((currentPoint) =>
      tooltipPointsMatch(currentPoint, nextPreviewPoint)
        ? currentPoint
        : nextPreviewPoint,
    );
  }, [
    historyPreviewChartPoint,
    getRenderedTooltipPoint,
    chartSize.width,
    chartSize.height,
    xMin,
    xMax,
    yMax,
  ]);

  // Synchronize the chart's keyboard-navigation point.
  useEffect(() => {
    if (!isKeyboardModeActive) {
      setKeyboardPoint(null);
      return;
    }

    const nextKeyboardPoint = getRenderedTooltipPoint(activeKeyboardPoint);

    setKeyboardPoint((currentPoint) =>
      tooltipPointsMatch(currentPoint, nextKeyboardPoint)
        ? currentPoint
        : nextKeyboardPoint,
    );
  }, [
    activeKeyboardPoint,
    getRenderedTooltipPoint,
    isKeyboardModeActive,
    chartSize.width,
    chartSize.height,
    xMin,
    xMax,
    yMax,
  ]);

  const handlePointerPointChange = useCallback((point: TooltipPoint | null) => {
    if (point) {
      setIsKeyboardModeActive(false);

      setKeyboardPoint(null);
    }

    setPointerPoint(point);
  }, []);

  const handleChartFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    const focusIsVisible = event.currentTarget.matches(":focus-visible");

    setIsChartFocusVisible(focusIsVisible);

    if (!focusIsVisible) {
      return;
    }

    const point = activeKeyboardPoint ?? selectedChartPoint ?? chartData[0];

    if (!point) {
      return;
    }

    setPointerPoint(null);

    setFocusedPointId(point.id);

    setIsKeyboardModeActive(true);
  };

  const handleChartBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocusedElement = event.relatedTarget;

    if (
      nextFocusedElement instanceof Node &&
      event.currentTarget.contains(nextFocusedElement)
    ) {
      return;
    }

    setIsChartFocusVisible(false);

    setIsKeyboardModeActive(false);

    setKeyboardPoint(null);
  };

  const handleChartKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      return;
    }

    if (chartData.length === 0) {
      return;
    }

    const currentPoint =
      activeKeyboardPoint ?? selectedChartPoint ?? chartData[0];

    const currentIndex = Math.max(
      chartData.findIndex((point) => point.id === currentPoint.id),
      0,
    );

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      setIsChartFocusVisible(true);

      setPointerPoint(null);

      setIsKeyboardModeActive(true);

      onSelectInspection?.(currentPoint.id);

      return;
    }

    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = Math.min(currentIndex + 1, chartData.length - 1);
        break;

      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = Math.max(currentIndex - 1, 0);
        break;

      case "Home":
        nextIndex = 0;
        break;

      case "End":
        nextIndex = chartData.length - 1;
        break;

      default:
        return;
    }

    event.preventDefault();

    const nextPoint = chartData[nextIndex];

    setIsChartFocusVisible(true);

    setPointerPoint(null);

    setIsKeyboardModeActive(true);

    setFocusedPointId(nextPoint.id);
  };

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
        onFocus={handleChartFocus}
        onBlur={handleChartBlur}
        onKeyDown={handleChartKeyDown}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          outline: "none",

          boxShadow: isChartFocusVisible
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
          {isKeyboardModeActive && activeKeyboardPoint
            ? formatKeyboardPointLabel(activeKeyboardPoint)
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
                dx: -10,
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
                    activeTooltipPoint?.payload.id === props.payload?.id
                  }
                  hoveredInspectionId={hoveredInspectionId}
                  onPointerPointChange={handlePointerPointChange}
                  onSelectInspection={onSelectInspection}
                  registerDotRef={registerDotRef}
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
          hoveredPoint={activeTooltipPoint}
          formattedDate={
            activeTooltipPoint
              ? formatTooltipDate(activeTooltipPoint.payload.timestamp)
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