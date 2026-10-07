// build-featured-slab.mjs (prototype)
//
// Builds a standalone three.js page: the generated card as a thick matte block. Corner
// grade boxes sit flush and wrap across the edges, the border runs on the card edge and
// joins front to back across the thickness, edges carry a faint 45-degree hatch, and the
// back has an og-image-style grade donut. Run generate-featured-card.mjs first.
// Usage: node pipeline/prototypes/build-featured-slab.mjs <repoRoot> <outPath.html>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [repo, outPath] = process.argv.slice(2);
const svg = fs.readFileSync(path.join(repo, "public/data/featured-card.svg"), "utf8");
const { CLOSED_ACTIONS, UNINSPECTED_GRADE } = await import(pathToFileURL(path.join(repo, "shared/inspectionStatus.mjs")).href);
const { CATEGORY_COLORS } = await import(pathToFileURL(path.join(repo, "shared/gradeColours.mjs")).href);

// Same precedence as getGradeCategory (closed, uninspected, pending, then score bands).
const counts = { A: 0, B: 0, C: 0, pending: 0, uninspected: 0, closed: 0 };
const geojson = JSON.parse(fs.readFileSync(path.join(repo, "public/data/latest-inspections.geojson"), "utf8"));
for (const { properties: r } of geojson.features) {
  const cat = CLOSED_ACTIONS.includes(r.action) ? "closed"
    : r.grade === UNINSPECTED_GRADE ? "uninspected"
    : ["Z", "P", "N"].includes(r.grade) || r.score == null ? "pending"
    : r.score <= 13 ? "A" : r.score <= 27 ? "B" : "C";
  counts[cat]++;
}
const segments = Object.entries(counts).map(([cat, n]) => ({ n, color: CATEGORY_COLORS[cat] }));

// Page script kept as a raw string (no interpolation) to avoid escaping layers.
const pageScript = String.raw`
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const SEGMENTS = JSON.parse(document.getElementById("segments").textContent);
const svgText = document.getElementById("card-svg").textContent.trim();

// Reuse the card's embedded dashboard fonts for the back.
for (const m of svgText.matchAll(/font-family: ([^;]+); font-weight: (\d+); src: url\((data:font\/woff2;base64,[^)]+)\)/g)) {
  const face = new FontFace(m[1].replace(/'/g, ""), "url(" + m[3] + ")", { weight: m[2] });
  document.fonts.add(await face.load());
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}

function texture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

const GRADE_COLOR = svgText.match(/<g id="grade-box">[^]*?stroke="([^"]+)"/)[1];
const BOX = 128;   // flush corner box, 64 card units
const DEPTH = 64;  // card thickness 0.16 world units = 32 card units
const LINE = "rgba(" + [1, 3, 5].map((i) => parseInt(GRADE_COLOR.slice(i, i + 2), 16)).join(",") + ",0.8)";

async function cardFront() {
  // Rasterise at 2x, then crop away the SVG's shadow margin.
  const flush = svgText
    .replace('<rect x="0.5" y="0.5" width="55" height="55"', '<rect x="0.5" y="0.5" width="63" height="63"')
    .replace('<text x="28" y="38"', '<text x="32" y="42"')
    .replace('<use href="#grade-box" x="8" y="8"/>', '<use href="#grade-box" x="0" y="0"/>')
    .replace('<use href="#grade-box" x="436" y="8"/>', '<use href="#grade-box" x="436" y="0"/>')
    .replace('<use href="#grade-box" x="8" y="636" transform="rotate(180 36 664)"/>', '<use href="#grade-box" x="0" y="636" transform="rotate(180 32 668)"/>')
    .replace('<use href="#grade-box" x="436" y="636" transform="rotate(180 464 664)"/>', '<use href="#grade-box" x="436" y="636" transform="rotate(180 468 668)"/>')
    // Border (and the texture clip that shares its path) runs on the card edge, stepping 8 around each box.
    .replaceAll(
      "M72.5 8.5 L427.5 8.5 L427.5 72.5 L491.5 72.5 L491.5 627.5 L427.5 627.5 L427.5 691.5 L72.5 691.5 L72.5 627.5 L8.5 627.5 L8.5 72.5 L72.5 72.5 Z",
      "M72.5 0.5 L427.5 0.5 L427.5 72.5 L499.5 72.5 L499.5 627.5 L427.5 627.5 L427.5 699.5 L72.5 699.5 L72.5 627.5 L0.5 627.5 L0.5 72.5 L72.5 72.5 Z",
    );
  const big = flush.replace('width="700" height="900"', 'width="1400" height="1800"');
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([big], { type: "image/svg+xml" }));
  await img.decode();
  const [c, g] = canvas(1000, 1400);
  g.drawImage(img, 200, 200, 1000, 1400, 0, 0, 1000, 1400);
  return texture(c);
}

// Back: the og-image's grade donut and title, recomposed for portrait.
function cardBack() {
  const [c, g] = canvas(1000, 1400);
  g.fillStyle = "#2b2b2b"; g.fillRect(0, 0, 1000, 1400);
  g.strokeStyle = LINE; g.lineWidth = 2;
  g.beginPath();
  for (const [x, y] of [[145,1],[855,1],[855,145],[999,145],[999,1255],[855,1255],[855,1399],[145,1399],[145,1255],[1,1255],[1,145],[145,145]]) g.lineTo(x, y);
  g.closePath(); g.stroke();
  // Corner boxes match the front's: grade letter, bottom pair upside down.
  const letter = svgText.match(/<g id="grade-box">[^]*?<text[^>]*>([^<]+)<.text>/)[1];
  for (const [x, y, flip] of [[0, 0, false], [1000 - BOX, 0, false], [0, 1400 - BOX, true], [1000 - BOX, 1400 - BOX, true]]) {
    g.fillStyle = "#272727"; g.fillRect(x, y, BOX, BOX);
    g.strokeStyle = LINE; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, BOX - 2, BOX - 2);
    g.save();
    g.translate(x + BOX / 2, y + BOX / 2);
    if (flip) g.rotate(Math.PI);
    g.font = "700 56px 'Public Sans'"; g.fillStyle = GRADE_COLOR; g.textAlign = "center";
    g.fillText(letter, 0, 20);
    g.restore();
  }

  // Stack, centred vertically: ring, NYC wordmark, title, tagline (og-image order).
  const cx = 500, cy = 508, outer = 220, inner = 148;
  const total = SEGMENTS.reduce((sum, seg) => sum + seg.n, 0);
  let angle = -Math.PI / 2;
  for (const { n, color } of SEGMENTS) {
    if (!n) continue;
    const end = angle + (n / total) * Math.PI * 2;
    g.beginPath();
    g.arc(cx, cy, outer, angle, end);
    g.arc(cx, cy, inner, end, angle, true);
    g.closePath();
    g.fillStyle = color; g.fill();
    g.strokeStyle = "#1a1a1a"; g.lineWidth = 3; g.stroke();
    angle = end;
  }

  g.textAlign = "center";
  // Wordmark with the dashboard's hard offset shadow, as on the front title.
  g.font = "800 170px Archivo"; g.letterSpacing = "-3px";
  g.fillStyle = "#252525"; g.fillText("NYC", 494, 928);
  g.fillStyle = "#a0a0a0"; g.fillText("NYC", 500, 920);
  g.letterSpacing = "0px";
  g.font = "700 52px Archivo"; g.fillStyle = "#ffffff";
  g.fillText("DINING UNDER", 500, 991);
  g.fillText("THE MICROSCOPE", 500, 1051);
  g.font = "700 24px Archivo"; g.fillStyle = "#a0a0a0"; g.letterSpacing = "3px";
  g.fillText("MAPPING RESTAURANT HEALTH INSPECTIONS", 500, 1112);

  // Footer like the dashboard's: muted caps, panel-border "|" divider; same size and
  // height as the front's footer line (12px at y 669, doubled for this canvas).
  const parts = [["WWW.ALEXHORDAL.CA", "#a0a0a0"], ["   |   ", "#424242"], ["NYC OPEN DATA", "#a0a0a0"]];
  g.font = "700 24px Archivo"; g.letterSpacing = "2.4px"; g.textAlign = "left";
  let x = 500 - parts.reduce((w, [t]) => w + g.measureText(t).width, 0) / 2;
  for (const [t, color] of parts) {
    g.fillStyle = color; g.fillText(t, x, 1338);
    x += g.measureText(t).width;
  }
  return texture(c);
}

function edgeStrip(lengthPx, vertical) {
  const [c, g] = vertical ? canvas(DEPTH, lengthPx) : canvas(lengthPx, DEPTH);
  g.fillStyle = "#2b2b2b"; g.fillRect(0, 0, c.width, c.height);

  // Faint 45° hatch on the border span and the corner boxes, never in the gaps between them.
  // One continuous line set, clipped per region, so the stripes line up across the gaps.
  const hatch = (from, len) => {
    g.save();
    g.beginPath();
    if (vertical) g.rect(0, from, DEPTH, len);
    else g.rect(from, 0, len, DEPTH);
    g.clip();
    g.strokeStyle = "#1e1e1e"; g.lineWidth = 3;
    for (let t = -DEPTH; t < lengthPx + DEPTH; t += 14) {
      g.beginPath();
      if (vertical) { g.moveTo(0, t); g.lineTo(DEPTH, t + DEPTH); }
      else { g.moveTo(t, 0); g.lineTo(t + DEPTH, DEPTH); }
      g.stroke();
    }
    g.restore();
  };
  hatch(BOX + 17, lengthPx - 2 * (BOX + 17));

  for (const start of [0, lengthPx - BOX]) {
    const inner = start === 0 ? BOX - 1 : lengthPx - BOX + 1;
    g.fillStyle = "#272727";
    if (vertical) g.fillRect(0, start, DEPTH, BOX);
    else g.fillRect(start, 0, BOX, DEPTH);
    hatch(start, BOX);
    g.strokeStyle = LINE; g.lineWidth = 2;
    g.beginPath();
    if (vertical) { g.moveTo(0, inner); g.lineTo(DEPTH, inner); }
    else { g.moveTo(inner, 0); g.lineTo(inner, DEPTH); }
    g.stroke();
  }
  g.strokeStyle = LINE; g.lineWidth = 2;
  // The edge border continues the front and back borders: lines along both long edges
  // between the steps, joined across the thickness where the border steps in at each box.
  const step = BOX + 17, far = lengthPx - step;
  const line = (x1, y1, x2, y2) => vertical
    ? (g.beginPath(), g.moveTo(y1, x1), g.lineTo(y2, x2), g.stroke())
    : (g.beginPath(), g.moveTo(x1, y1), g.lineTo(x2, y2), g.stroke());
  // Corner box outline on this side: outer end and its front/back edges.
  line(1, 0, 1, DEPTH);
  line(lengthPx - 1, 0, lengthPx - 1, DEPTH);
  for (const [a, b] of [[0, BOX], [lengthPx - BOX, lengthPx]]) {
    line(a, 1, b, 1);
    line(a, DEPTH - 1, b, DEPTH - 1);
  }
  line(step, 0, step, DEPTH);
  line(far, 0, far, DEPTH);
  line(step, 1, far, 1);
  line(step, DEPTH - 1, far, DEPTH - 1);
  return texture(c);
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#212121");

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 9);

// Mostly ambient so the faces keep their true colours; the key light just separates the edges.
const key = new THREE.DirectionalLight("#ffffff", 0.45);
key.position.set(3, 4, 6);
// Mirror of the key behind the card, so the back face is lit as evenly as the front.
const backKey = new THREE.DirectionalLight("#ffffff", 0.45);
backKey.position.set(-3, 4, -6);
scene.add(key, backKey, new THREE.AmbientLight("#ffffff", 0.75));

// The card as a solid block: 2.5 x 3.5 (5:7), matte; corner boxes wrap across the edges.
// Box face order: +x, -x, +y, -y, front, back.
const side = new THREE.MeshLambertMaterial({ map: edgeStrip(1400, true) });
const end = new THREE.MeshLambertMaterial({ map: edgeStrip(1000, false) });
const card = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.5, 0.16), [
  side, side, end, end,
  new THREE.MeshLambertMaterial({ map: await cardFront() }),
  new THREE.MeshLambertMaterial({ map: cardBack() }),
]);
scene.add(card);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 16;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.5;
controls.addEventListener("start", () => { controls.autoRotate = false; });

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Card Slab</title>
<style>
  html, body { margin: 0; height: 100%; background: #212121; overflow: hidden; }
  canvas { display: block; }
  .hint { position: fixed; left: 0; right: 0; bottom: 16px; text-align: center; font: 700 12px/1 system-ui, sans-serif; letter-spacing: 0.1em; color: #767676; pointer-events: none; }
</style>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"
} }
</script>
</head>
<body>
<div class="hint">DRAG TO ROTATE · SCROLL TO ZOOM</div>
<script type="application/json" id="segments">${JSON.stringify(segments)}</script>
<script type="text/plain" id="card-svg">${svg}</script>
<script type="module">${pageScript}</script>
</body>
</html>
`;
fs.writeFileSync(outPath, html);
console.log(`Wrote ${outPath}`, counts);
