// generate-featured-card.mjs
//
// Writes a restaurant's playing card as a standalone SVG, using the
// shared renderer (shared/restaurantCard.mjs). Dashboard fonts are
// embedded so it renders identically as a local file, offline, or when
// rasterised later.
//
// Usage: node pipeline/generate-featured-card.mjs <camis> [outPath]
// Reads public/data/latest-inspections.geojson, so run the build (or
// fetch-inspection.mjs) first.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatCardDate, renderCard } from "../shared/restaurantCard.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
export const TEMPLATE_PATH = path.join(ROOT, "shared", "restaurantCard.svg");
const GEOJSON_PATH = path.join(ROOT, "public", "data", "latest-inspections.geojson");
const DEFAULT_OUT_PATH = path.join(ROOT, "public", "data", "featured-card.svg");

const FONTS = [
  { family: "Archivo", weight: 700, file: "archivo-v25-latin_latin-ext-700.woff2" },
  { family: "Archivo", weight: 800, file: "archivo-v25-latin_latin-ext-800.woff2" },
  { family: "'Public Sans'", weight: 700, file: "public-sans-v21-latin_latin-ext-700.woff2" },
];

function fontFaces() {
  return FONTS.map(({ family, weight, file }) => {
    const data = readFileSync(path.join(ROOT, "public", "fonts", file)).toString("base64");
    return `    @font-face { font-family: ${family}; font-weight: ${weight}; src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
  }).join("\n");
}

function findRestaurant(camis) {
  const geojson = JSON.parse(readFileSync(GEOJSON_PATH, "utf8"));
  const feature = geojson.features.find((f) => f.properties.camis === camis);
  if (!feature) throw new Error(`No restaurant with CAMIS ${camis} in ${GEOJSON_PATH}`);
  return feature.properties;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [camis, outPath = DEFAULT_OUT_PATH] = process.argv.slice(2);
  if (!camis) {
    console.error("Usage: node pipeline/generate-featured-card.mjs <camis> [outPath]");
    process.exit(1);
  }
  const restaurant = findRestaurant(camis);
  const { name, grade, score, inspection_date: inspected } = restaurant;
  // The dashboard colours cards with getGradeCategory (TypeScript, not
  // importable here); this dev tool only draws plainly graded restaurants.
  if (!["A", "B", "C"].includes(grade)) {
    console.error(`${name} has no letter grade (${grade}); only A/B/C cards can be generated here.`);
    process.exit(1);
  }
  const svg = renderCard(
    { ...restaurant, category: grade },
    {
      template: readFileSync(TEMPLATE_PATH, "utf8"),
      fontFacesCss: fontFaces(),
      footer: `INSPECTED · ${formatCardDate(new Date(`${inspected.slice(0, 10)}T12:00:00Z`))}`,
    },
  );
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, svg);
  console.log(`Wrote ${outPath} (${name}, grade ${grade}, score ${score})`);
}
