// restaurantCard.mjs
//
// Pure templating over restaurantCard.svg, so the pipeline and the
// dashboard draw the identical card.

import { CATEGORY_COLORS } from "./gradeColours.mjs";

// Name fitting: no real text measurement in Node, so approximate Archivo
// 700 caps at 0.62em per character and step the size down until it fits.
const NAME_SIZES = [44, 38, 32, 28];
const NAME_MAX_WIDTH = 400;
const NAME_MAX_LINES = 3;
const CHAR_WIDTH_EM = 0.62;
const CAP_HEIGHT_EM = 0.72;
const LINE_HEIGHT_EM = 1.09;

// Baseline gaps down the centre group, which is centred on GROUP_CENTRE_Y.
const LABEL_GAP = 62; // last line of the restaurant block -> SCORE label
const SCORE_GAP = 66; // label -> score (64px digits)
const GROUP_CENTRE_Y = 355;

// Award icons: Font Awesome paths (512 tall, width varies), drawn AWARD_ICON_SIZE
// tall, centred AWARD_ROW_POSITION of the way from the last text above (score,
// or status line if any) to the footer's cap top.
const AWARD_ICON_SIZE = 32;
const AWARD_ROW_POSITION = 0.3;
// Fine near-black outline, in card units. Drawn under the fill (paint-order), so
// only this much shows outside the icon and its shape stays intact.
const AWARD_OUTLINE = 1.5;
const AWARD_OUTLINE_COLOR = "#212121";
const AWARD_ICON_GAP = 12;
const FOOTER_CAP_TOP = 660;

// Corner letter per status. Closed gets Font Awesome's ban icon instead, so
// it can't read as grade C.
const CATEGORY_LABELS = { A: "A", B: "B", C: "C", pending: "P", uninspected: "U", closed: null };
// Spelled-out status under the score, where the corner mark isn't a grade.
const STATUS_LINES = { closed: "CLOSED BY DOHMH" };
const STATUS_LINE_GAP = 30; // score baseline -> status line baseline

export const BAN_ICON_PATH = "M367.2 412.5L99.5 144.8c-22.4 31.4-35.5 69.8-35.5 111.2 0 106 86 192 192 192 41.5 0 79.9-13.1 111.2-35.5zm45.3-45.3c22.4-31.4 35.5-69.8 35.5-111.2 0-106-86-192-192-192-41.5 0-79.9 13.1-111.2 35.5L412.5 367.2zM0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0z";

// Letter or icon centred in the 56px corner box (cardSlab.ts shifts the group
// to centre it in the 3D card's flush 64px box).
function gradeMark(label, color) {
  if (label === null) {
    const size = 28;
    const offset = 28 - size / 2;
    return `<path transform="translate(${offset} ${offset}) scale(${size / 512})" fill="${color}" d="${BAN_ICON_PATH}"/>`;
  }
  return `<text x="28" y="38" class="rc-label" font-weight="700" font-size="28" fill="${color}" text-anchor="middle">${escapeXml(label)}</text>`;
}

const NO_CUISINE = "Not Listed/Not Applicable";

const MUTED_COLOR = "#a0a0a0"; // --text-muted
const NAME_SHADOW_COLOR = "#1f1f1f"; // a step below the card body, as --bg-alt is to --bg-panel
const CARD_BODY_COLOR = "#252525";
// Grade colours on the card sit at 70%, blended into the body: softer
// against the dark card than the map's full-strength dots.
const CARD_COLOR_STRENGTH = 0.7;

// Solid hex of `color` at `strength` over `base`, so canvas and SVG both
// read it as a plain colour (cardSlab.ts takes it from the grade box).
export function blendHex(color, base, strength) {
  const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(channel(color, i) * strength + channel(base, i) * (1 - strength)))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function cardColor(category) {
  return blendHex(CATEGORY_COLORS[category], CARD_BODY_COLOR, CARD_COLOR_STRENGTH);
}


export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapWords(words, maxChars) {
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Largest size whose wrap fits; the smallest size is used regardless, so
// an unbreakable long word can overflow rather than vanish.
export function fitName(name) {
  const words = name.toUpperCase().trim().split(/\s+/).filter(Boolean);
  for (const size of NAME_SIZES) {
    const maxChars = Math.floor(NAME_MAX_WIDTH / (size * CHAR_WIDTH_EM));
    const lines = wrapWords(words, maxChars);
    if (lines.length <= NAME_MAX_LINES && lines.every((l) => l.length <= maxChars)) {
      return { size, lines };
    }
  }
  const size = NAME_SIZES.at(-1);
  return { size, lines: wrapWords(words, Math.floor(NAME_MAX_WIDTH / (size * CHAR_WIDTH_EM))) };
}

export function cuisineLine(cuisine) {
  return cuisine && cuisine !== NO_CUISINE ? cuisine.toUpperCase() : null;
}

// Muted lines under the name: who and where stay together, apart from the
// score block. `gap` is the baseline distance from the line above.
export function subLines({ boro, cuisine }) {
  const boroText = boro ? boro.toUpperCase() : null;
  const cuisineText = cuisineLine(cuisine);
  return [
    boroText && { text: boroText, size: 22, spacing: 1.3, gap: 40 },
    cuisineText && { text: cuisineText, size: 14, spacing: 1.4, gap: boroText ? 26 : 36 },
  ].filter(Boolean);
}

export function layoutText({ size, lines }, sublineGaps = []) {
  const cap = size * CAP_HEIGHT_EM;
  const lineHeight = Math.round(size * LINE_HEIGHT_EM);
  const sublineHeight = sublineGaps.reduce((sum, gap) => sum + gap, 0);
  const total = cap + (lines.length - 1) * lineHeight + sublineHeight + LABEL_GAP + SCORE_GAP;
  const firstBaseline = Math.round(GROUP_CENTRE_Y - total / 2 + cap);
  const baselines = lines.map((_, i) => firstBaseline + i * lineHeight);
  let y = baselines.at(-1);
  const sublineYs = sublineGaps.map((gap) => (y += gap));
  const labelY = y + LABEL_GAP;
  return { baselines, sublineYs, labelY, scoreY: labelY + SCORE_GAP };
}

// Background texture grid, in the rotated frame: each row steps a third
// of a column so the 45° turn doesn't collapse it into a square grid.
// Columns widen with digit count so two-digit scores don't overlap.
export function scoreGlyphs(score) {
  if (!Number.isFinite(score)) return "";
  const text = escapeXml(score);
  const colStep = 100 + 120 * String(score).length;
  const rowStep = 210;
  const rowShift = Math.round(colStep / 3);
  const glyphs = [];
  for (let r = -4; r <= 4; r++) {
    for (let c = -4; c <= 4; c++) {
      const x = 250 + c * colStep + (((r % 3) + 3) % 3) * rowShift + 40;
      const y = 350 + r * rowStep + 70;
      glyphs.push(`        <text x="${x}" y="${y}">${text}</text>`);
    }
  }
  return glyphs.join("\n");
}

// Card dates follow NYC's calendar.
export function formatCardDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
    .format(date)
    .toUpperCase();
}

function statusLine(category, scoreY, color) {
  const text = STATUS_LINES[category];
  if (!text) return "";
  return `    <text x="250" y="${statusLineY(scoreY)}" class="rc-label" font-weight="700" font-size="14" letter-spacing="1.4" fill="${color}" text-anchor="middle">${text}</text>`;
}

function statusLineY(scoreY) {
  return scoreY + STATUS_LINE_GAP;
}

// Award icons as a centred row. Each is { width, d, color }: a Font Awesome
// path (512 tall) and its colour, supplied by the caller's award catalogue.
// aboveY: baseline of the last text line above the row.
export function awardIcons(awards, aboveY) {
  const centreY = aboveY + (FOOTER_CAP_TOP - aboveY) * AWARD_ROW_POSITION;
  const scale = AWARD_ICON_SIZE / 512;
  const widths = awards.map(({ width }) => width * scale);
  const rowWidth = widths.reduce((sum, w) => sum + w, 0) + (awards.length - 1) * AWARD_ICON_GAP;
  let x = 250 - rowWidth / 2;
  return awards
    .map(({ d, color }, i) => {
      const path = `    <path transform="translate(${x.toFixed(1)} ${(centreY - 256 * scale).toFixed(1)}) scale(${scale})" fill="${escapeXml(color)}" stroke="${AWARD_OUTLINE_COLOR}" stroke-width="${(2 * AWARD_OUTLINE) / scale}" stroke-linejoin="round" paint-order="stroke" d="${escapeXml(d)}"/>`;
      x += widths[i] + AWARD_ICON_GAP;
      return path;
    })
    .join("\n");
}

// category: the dashboard's grade category (getGradeCategory), which sets the
// card's colour and corner letter. footer: e.g. "INSPECTED · OCT 9, 2026".
// fontFacesCss embeds fonts for standalone files; inline in the dashboard
// it stays empty and the page's own @font-face rules apply.
export function renderCard(
  { name, category, score, boro, cuisine, awards = [] },
  { template, fontFacesCss = "", footer = "" },
) {
  if (!(category in CATEGORY_LABELS)) throw new Error(`Unknown card category: ${category}`);
  const hasScore = Number.isFinite(score);

  const fitted = fitName(name);
  const subs = subLines({ boro, cuisine });
  const { baselines, sublineYs, labelY, scoreY } = layoutText(
    fitted,
    subs.map((sub) => sub.gap),
  );
  const gradeColor = cardColor(category);
  const label = CATEGORY_LABELS[category];
  const nameText = (dx, dy, fill) =>
    fitted.lines
      .map(
        (line, i) =>
          `    <text x="${250 + dx}" y="${baselines[i] + dy}" class="rc-display" font-weight="700" font-size="${fitted.size}" fill="${fill}" text-anchor="middle">${escapeXml(line)}</text>`,
      )
      .join("\n");
  // Hard offset shadow, same as the dashboard's "NYC" wordmark text-shadow.
  const nameLines = `${nameText(-2, 3, NAME_SHADOW_COLOR)}\n${nameText(0, 0, gradeColor)}`;
  const subLineText = subs
    .map(
      ({ text, size, spacing }, i) =>
        `    <text x="250" y="${sublineYs[i]}" class="rc-display" font-weight="700" font-size="${size}" letter-spacing="${spacing}" fill="${MUTED_COLOR}" text-anchor="middle">${escapeXml(text)}</text>`,
    )
    .join("\n");

  const tokens = {
    TITLE: escapeXml(`${name}: ${label ?? "closed"}, score ${hasScore ? score : "none"}`),
    FONT_FACES: fontFacesCss,
    GRADE_COLOR: gradeColor,
    GRADE_MARK: gradeMark(label, gradeColor),
    SCORE: hasScore ? escapeXml(score) : "—",
    NAME_LINES: nameLines,
    SCORE_GLYPHS: scoreGlyphs(score),
    SCORE_LABEL_Y: labelY,
    SCORE_Y: scoreY,
    STATUS_LINE: statusLine(category, scoreY, gradeColor),
    AWARD_ICONS: awardIcons(awards, STATUS_LINES[category] ? statusLineY(scoreY) : scoreY),
    SUB_LINES: subLineText,
    FOOTER: escapeXml(footer),
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) =>
    key in tokens ? String(tokens[key]) : match,
  );
}
