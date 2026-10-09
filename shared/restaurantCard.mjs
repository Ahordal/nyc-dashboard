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

// Award certificate: faCertificate's 576x512 box, drawn AWARD_ICON_SIZE tall,
// centred a quarter of the way from the score's baseline to the footer's cap top.
const AWARD_ICON_SIZE = 32;
const FOOTER_CAP_TOP = 660;

const NO_CUISINE = "Not Listed/Not Applicable";

const MUTED_COLOR = "#a0a0a0"; // --text-muted
const NAME_SHADOW_COLOR = "#252525"; // --bg-alt

const GRADED = new Set(["A", "B", "C"]);

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

// The cards are a New York daily feature, so dates follow NYC's calendar.
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

// fontFacesCss embeds fonts for standalone files; inline in the dashboard
// it stays empty and the page's own @font-face rules apply.
function awardIconTransform(scoreY) {
  const centreY = scoreY + (FOOTER_CAP_TOP - scoreY) / 4;
  const scale = AWARD_ICON_SIZE / 512;
  return `translate(${250 - 288 * scale} ${(centreY - 256 * scale).toFixed(1)}) scale(${scale})`;
}

export function renderCard(
  { name, grade, score, boro, cuisine },
  { template, fontFacesCss = "", date = new Date() },
) {
  if (!GRADED.has(grade)) throw new Error(`Card needs a letter grade A/B/C, got ${grade}`);
  if (!Number.isFinite(score)) throw new Error(`Card needs a numeric score, got ${score}`);

  const fitted = fitName(name);
  const subs = subLines({ boro, cuisine });
  const { baselines, sublineYs, labelY, scoreY } = layoutText(
    fitted,
    subs.map((sub) => sub.gap),
  );
  const gradeColor = CATEGORY_COLORS[grade];
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
    TITLE: escapeXml(`${name}: grade ${grade}, score ${score}`),
    FONT_FACES: fontFacesCss,
    GRADE_COLOR: gradeColor,
    GRADE: grade,
    SCORE: escapeXml(score),
    NAME_LINES: nameLines,
    SCORE_GLYPHS: scoreGlyphs(score),
    SCORE_LABEL_Y: labelY,
    SCORE_Y: scoreY,
    AWARD_ICON_TRANSFORM: awardIconTransform(scoreY),
    SUB_LINES: subLineText,
    FOOTER: `FEATURED AWARD · ${formatCardDate(date)}`,
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) =>
    key in tokens ? String(tokens[key]) : match,
  );
}
