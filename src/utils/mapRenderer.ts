// mapRenderer.ts
//
// The ArcGIS unique-value renderer for the restaurant points layer in
// MapView: inspection grade drives dot colour, inspection score drives
// dot size and opacity (a closed restaurant is weighted like a very high
// score so it always reads large). Pulled out of MapView.tsx to keep
// that file scannable; nothing here changes at runtime.

import { CATEGORY_COLORS } from "./gradeColours";

const gradeCategoryExpression = `
  var status = $feature.current_status_code;
  if (status == "closed") {
    return "closed";
  }

  var g = $feature.grade;
  if (g == "U") {
    return "uninspected";
  }
  if (g == "Z" || g == "P" || g == "N") {
    return "pending";
  }

  var s = $feature.score;
  if (s <= 13) return "A";
  if (s <= 27) return "B";
  return "C";
`;

const scoreWeightExpression = `
  var status = $feature.current_status_code;
  if (status == "closed") {
    return 60;
  }
  var s = $feature.score;
  if (!IsEmpty(s) && s >= 0) {
    return s;
  }
  return 20;
`;

export const pointsRenderer = {
  type: "unique-value",
  valueExpression: gradeCategoryExpression,
  defaultSymbol: {
    type: "simple-marker",
    color: "#FFFFFF",
    outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
  },
  uniqueValueInfos: [
    {
      value: "A",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.A,
        outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
      },
    },
    {
      value: "B",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.B,
        outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
      },
    },
    {
      value: "C",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.C,
        outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
      },
    },
    {
      value: "pending",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.pending,
        outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
      },
    },
    {
      value: "uninspected",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.uninspected,
        outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
      },
    },
    {
      value: "closed",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.closed,
        outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
      },
    },
  ],
  visualVariables: [
    {
      type: "size",
      valueExpression: scoreWeightExpression,
      stops: [
        { value: 0, size: 2.5 },
        { value: 13, size: 4.0 },
        { value: 14, size: 4.0 },
        { value: 27, size: 4.5 },
        { value: 28, size: 5.0 },
        { value: 45, size: 6.0 },
        { value: 60, size: 7.0 },
      ],
    },
    {
      type: "opacity",
      valueExpression: scoreWeightExpression,
      stops: [
        { value: 0, opacity: 0.7 },
        { value: 13, opacity: 0.75 },
        { value: 28, opacity: 0.95 },
        { value: 50, opacity: 1.0 },
      ],
    },
  ],
};
