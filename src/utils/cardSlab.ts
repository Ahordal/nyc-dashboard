// cardSlab.ts
//
// The featured card as a thick matte three.js block, ported from
// pipeline/prototypes/build-featured-slab.mjs. Lazy-loaded with three.js,
// so only someone who opens a card pays for it.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { CATEGORY_COLORS } from "./gradeColours";
import { EMPTY_GRADE_COUNTS, type GradeCounts } from "../types/gradeCounts";

// Rasterised SVG can't see page fonts, so the front embeds them.
const CARD_FONTS = [
  { family: "Archivo", weight: 700, file: "archivo-v25-latin_latin-ext-700.woff2" },
  { family: "Archivo", weight: 800, file: "archivo-v25-latin_latin-ext-800.woff2" },
  { family: "'Public Sans'", weight: 700, file: "public-sans-v21-latin_latin-ext-700.woff2" },
];

let fontFacesPromise: Promise<string> | null = null;

async function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Fetched once per visit; the files are already cached from the page CSS.
export function cardFontFacesCss(): Promise<string> {
  fontFacesPromise ??= Promise.all(
    CARD_FONTS.map(async ({ family, weight, file }) => {
      const response = await fetch(`/fonts/${file}`);
      if (!response.ok) throw new Error(`Font ${file}: HTTP ${response.status}`);
      const url = (await toDataUrl(await response.blob())).replace(
        /^data:[^;]*;/,
        "data:font/woff2;",
      );
      return `@font-face { font-family: ${family}; font-weight: ${weight}; src: url(${url}) format("woff2"); }`;
    }),
  ).then((faces) => faces.join("\n"));
  fontFacesPromise.catch(() => {
    fontFacesPromise = null;
  });
  return fontFacesPromise;
}

const BOX = 128; // flush corner box, 64 card units
const CARD_HEIGHT = 3.5; // world units, 5:7 with the 2.5 width
const REST_DISTANCE = 8.1;
// Opens this much larger than the flat card; bigger on screen also means less
// texture downscaling, so crisper text.
const START_ZOOM = 1.3;
// The flat SVG's viewBox is 744 tall, of which the card is 700 (the rest is shadow).
const CARD_FRACTION_OF_ART = 700 / 744;
const DEPTH = 64; // card thickness 0.16 world units = 32 card units

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("2D canvas unavailable");
  return [c, g];
}

function texture(c: HTMLCanvasElement, maxAnisotropy: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAnisotropy;
  return t;
}

async function cardFront(svgText: string, maxAnisotropy: number) {
  // Corner boxes sit flush and the border runs on the card edge, so they wrap the edges.
  const flush = svgText
    .replace('<rect x="0.5" y="0.5" width="55" height="55"', '<rect x="0.5" y="0.5" width="63" height="63"')
    .replace('<text x="28" y="38"', '<text x="32" y="42"')
    .replace('<use href="#rc-grade-box" x="8" y="8"/>', '<use href="#rc-grade-box" x="0" y="0"/>')
    .replace('<use href="#rc-grade-box" x="436" y="8"/>', '<use href="#rc-grade-box" x="436" y="0"/>')
    .replace(
      '<use href="#rc-grade-box" x="8" y="636" transform="rotate(180 36 664)"/>',
      '<use href="#rc-grade-box" x="0" y="636" transform="rotate(180 32 668)"/>',
    )
    .replace(
      '<use href="#rc-grade-box" x="436" y="636" transform="rotate(180 464 664)"/>',
      '<use href="#rc-grade-box" x="436" y="636" transform="rotate(180 468 668)"/>',
    )
    .replaceAll(
      "M72.5 8.5 L427.5 8.5 L427.5 72.5 L491.5 72.5 L491.5 627.5 L427.5 627.5 L427.5 691.5 L72.5 691.5 L72.5 627.5 L8.5 627.5 L8.5 72.5 L72.5 72.5 Z",
      "M72.5 0.5 L427.5 0.5 L427.5 72.5 L499.5 72.5 L499.5 627.5 L427.5 627.5 L427.5 699.5 L72.5 699.5 L72.5 627.5 L0.5 627.5 L0.5 72.5 L72.5 72.5 Z",
    );
  // Rasterise at 2x, then crop away the SVG's shadow margin.
  const big = flush.replace('width="700" height="900"', 'width="1400" height="1800"');
  const url = URL.createObjectURL(new Blob([big], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const [c, g] = canvas(1000, 1400);
    g.drawImage(img, 200, 200, 1000, 1400, 0, 0, 1000, 1400);
    return texture(c, maxAnisotropy);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Back: the og-image's grade donut and title, recomposed for portrait.
function cardBack(
  svgText: string,
  gradeColor: string,
  line: string,
  counts: GradeCounts,
  maxAnisotropy: number,
) {
  const [c, g] = canvas(1000, 1400);
  g.fillStyle = "#2b2b2b";
  g.fillRect(0, 0, 1000, 1400);
  g.strokeStyle = line;
  g.lineWidth = 2;
  g.beginPath();
  for (const [x, y] of [[145, 1], [855, 1], [855, 145], [999, 145], [999, 1255], [855, 1255], [855, 1399], [145, 1399], [145, 1255], [1, 1255], [1, 145], [145, 145]]) {
    g.lineTo(x, y);
  }
  g.closePath();
  g.stroke();

  // Corner boxes match the front's: grade letter, bottom pair upside down.
  const letter = svgText.match(/<g id="rc-grade-box">[^]*?<text[^>]*>([^<]+)<\/text>/)?.[1] ?? "";
  const corners: [number, number, boolean][] = [
    [0, 0, false],
    [1000 - BOX, 0, false],
    [0, 1400 - BOX, true],
    [1000 - BOX, 1400 - BOX, true],
  ];
  for (const [x, y, flip] of corners) {
    g.fillStyle = "#272727";
    g.fillRect(x, y, BOX, BOX);
    g.strokeStyle = line;
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, BOX - 2, BOX - 2);
    g.save();
    g.translate(x + BOX / 2, y + BOX / 2);
    if (flip) g.rotate(Math.PI);
    g.font = "700 56px 'Public Sans'";
    g.fillStyle = gradeColor;
    g.textAlign = "center";
    g.fillText(letter, 0, 20);
    g.restore();
  }

  // Ring of the current map view's grade mix.
  const cx = 500, cy = 508, outer = 220, inner = 148;
  const segments = (Object.keys(EMPTY_GRADE_COUNTS) as (keyof GradeCounts)[]).map((key) => ({
    n: counts[key],
    color: CATEGORY_COLORS[key],
  }));
  const total = segments.reduce((sum, seg) => sum + seg.n, 0);
  let angle = -Math.PI / 2;
  for (const { n, color } of total > 0 ? segments : []) {
    if (!n) continue;
    const end = angle + (n / total) * Math.PI * 2;
    g.beginPath();
    g.arc(cx, cy, outer, angle, end);
    g.arc(cx, cy, inner, end, angle, true);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.strokeStyle = "#1a1a1a";
    g.lineWidth = 3;
    g.stroke();
    angle = end;
  }

  g.textAlign = "center";
  // Wordmark with the dashboard's hard offset shadow, as on the front title.
  g.font = "800 170px Archivo";
  g.letterSpacing = "-3px";
  g.fillStyle = "#252525";
  g.fillText("NYC", 494, 928);
  g.fillStyle = "#a0a0a0";
  g.fillText("NYC", 500, 920);
  g.letterSpacing = "0px";
  g.font = "700 52px Archivo";
  g.fillStyle = "#ffffff";
  g.fillText("DINING UNDER", 500, 991);
  g.fillText("THE MICROSCOPE", 500, 1051);
  g.font = "700 24px Archivo";
  g.fillStyle = "#a0a0a0";
  g.letterSpacing = "3px";
  g.fillText("MAPPING RESTAURANT HEALTH INSPECTIONS", 500, 1112);

  // Same size and height as the front's footer line (12px at y 669, doubled).
  const parts: [string, string][] = [
    ["WWW.ALEXHORDAL.CA", "#a0a0a0"],
    ["   |   ", "#424242"],
    ["NYC OPEN DATA", "#a0a0a0"],
  ];
  g.font = "700 24px Archivo";
  g.letterSpacing = "2.4px";
  g.textAlign = "left";
  let x = 500 - parts.reduce((w, [t]) => w + g.measureText(t).width, 0) / 2;
  for (const [t, color] of parts) {
    g.fillStyle = color;
    g.fillText(t, x, 1338);
    x += g.measureText(t).width;
  }
  return texture(c, maxAnisotropy);
}

function edgeStrip(lengthPx: number, vertical: boolean, line: string, maxAnisotropy: number) {
  const [c, g] = vertical ? canvas(DEPTH, lengthPx) : canvas(lengthPx, DEPTH);
  g.fillStyle = "#2b2b2b";
  g.fillRect(0, 0, c.width, c.height);

  // Clipped per region from one line set, so stripes align across the gaps.
  // One shade darker than its fill, like the faded score on the face.
  const hatch = (from: number, len: number, color: string) => {
    g.save();
    g.beginPath();
    if (vertical) g.rect(0, from, DEPTH, len);
    else g.rect(from, 0, len, DEPTH);
    g.clip();
    g.strokeStyle = color;
    g.lineWidth = 3;
    for (let t = -DEPTH; t < lengthPx + DEPTH; t += 14) {
      g.beginPath();
      if (vertical) {
        g.moveTo(0, t);
        g.lineTo(DEPTH, t + DEPTH);
      } else {
        g.moveTo(t, 0);
        g.lineTo(t + DEPTH, DEPTH);
      }
      g.stroke();
    }
    g.restore();
  };
  hatch(BOX + 17, lengthPx - 2 * (BOX + 17), "#272727");

  for (const start of [0, lengthPx - BOX]) {
    const inner = start === 0 ? BOX - 1 : lengthPx - BOX + 1;
    g.fillStyle = "#272727";
    if (vertical) g.fillRect(0, start, DEPTH, BOX);
    else g.fillRect(start, 0, BOX, DEPTH);
    hatch(start, BOX, "#222222");
    g.strokeStyle = line;
    g.lineWidth = 2;
    g.beginPath();
    if (vertical) {
      g.moveTo(0, inner);
      g.lineTo(DEPTH, inner);
    } else {
      g.moveTo(inner, 0);
      g.lineTo(inner, DEPTH);
    }
    g.stroke();
  }

  // The edge border joins the front and back borders across the thickness.
  g.strokeStyle = line;
  g.lineWidth = 2;
  const step = BOX + 17;
  const far = lengthPx - step;
  const segment = (x1: number, y1: number, x2: number, y2: number) => {
    g.beginPath();
    if (vertical) {
      g.moveTo(y1, x1);
      g.lineTo(y2, x2);
    } else {
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    }
    g.stroke();
  };
  segment(1, 0, 1, DEPTH);
  segment(lengthPx - 1, 0, lengthPx - 1, DEPTH);
  for (const [a, b] of [[0, BOX], [lengthPx - BOX, lengthPx]]) {
    segment(a, 1, b, 1);
    segment(a, DEPTH - 1, b, DEPTH - 1);
  }
  segment(step, 0, step, DEPTH);
  segment(far, 0, far, DEPTH);
  segment(step, 1, far, 1);
  segment(step, DEPTH - 1, far, DEPTH - 1);
  return texture(c, maxAnisotropy);
}

type MountOptions = {
  // renderCard output with fonts embedded (see cardFontFacesCss).
  cardSvg: string;
  gradeCounts: GradeCounts;
  autoRotate: boolean;
};

// Builds the scene into `container`; resolves to a teardown function.
// `container` is the canvas area; `frame` is the flat card it lines up with.
export async function mountCardSlab(
  container: HTMLElement,
  frame: HTMLElement,
  { cardSvg, gradeCounts, autoRotate }: MountOptions,
): Promise<() => void> {
  const gradeColor = cardSvg.match(/<g id="rc-grade-box">[^]*?stroke="([^"]+)"/)?.[1] ?? "#a0a0a0";
  const line = `rgba(${[1, 3, 5].map((i) => parseInt(gradeColor.slice(i, i + 2), 16)).join(",")},0.8)`;

  // Canvas text needs these loaded, or the back draws in fallback fonts.
  await Promise.all([
    document.fonts.load("700 56px 'Public Sans'"),
    document.fonts.load("800 170px Archivo"),
    document.fonts.load("700 52px Archivo"),
  ]);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const disposables: { dispose: () => void }[] = [];

  try {
    const front = await cardFront(cardSvg, maxAnisotropy);
    const back = cardBack(cardSvg, gradeColor, line, gradeCounts, maxAnisotropy);
    const sideMap = edgeStrip(1400, true, line, maxAnisotropy);
    const endMap = edgeStrip(1000, false, line, maxAnisotropy);
    disposables.push(front, back, sideMap, endMap);

    const side = new THREE.MeshLambertMaterial({ map: sideMap });
    const end = new THREE.MeshLambertMaterial({ map: endMap });
    const frontMat = new THREE.MeshLambertMaterial({ map: front });
    const backMat = new THREE.MeshLambertMaterial({ map: back });
    const geometry = new THREE.BoxGeometry(2.5, CARD_HEIGHT, 0.16);
    disposables.push(side, end, frontMat, backMat, geometry);

    const scene = new THREE.Scene();
    // Mostly ambient so faces keep their true colours; keys just separate the edges.
    const key = new THREE.DirectionalLight("#ffffff", 0.45);
    key.position.set(3, 4, 6);
    const backKey = new THREE.DirectionalLight("#ffffff", 0.45);
    backKey.position.set(-3, 4, -6);
    scene.add(key, backKey, new THREE.AmbientLight("#ffffff", 0.75));
    // Box face order: +x, -x, +y, -y, front, back.
    scene.add(new THREE.Mesh(geometry, [side, side, end, end, frontMat, backMat]));

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, REST_DISTANCE / START_ZOOM);

    // The canvas can be bigger than the card; fov and a view offset centre it
    // on the flat card, matching its size at REST_DISTANCE.
    const resize = () => {
      const area = container.getBoundingClientRect();
      const card = frame.getBoundingClientRect();
      if (!area.width || !area.height || !card.height) return;
      const worldPerPx = CARD_HEIGHT / (card.height * CARD_FRACTION_OF_ART);
      const visibleHeight = area.height * worldPerPx;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(visibleHeight / (2 * REST_DISTANCE)));
      camera.aspect = area.width / area.height;
      const dx = card.left + card.width / 2 - (area.left + area.width / 2);
      const dy = card.top + card.height / 2 - (area.top + area.height / 2);
      camera.setViewOffset(area.width, area.height, -dx, -dy, area.width, area.height);
      renderer.setSize(area.width, area.height);
    };
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    resize();
    container.append(renderer.domElement);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    observer.observe(frame);

    // Zoom stays near the resting framing; scroll over the card zooms, not scrolls.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 12;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.5;
    controls.addEventListener("start", () => {
      controls.autoRotate = false;
    });

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      for (const item of disposables) item.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  } catch (err) {
    for (const item of disposables) item.dispose();
    renderer.dispose();
    throw err;
  }
}
