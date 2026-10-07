// build-featured-slab.mjs (prototype)
//
// Builds a standalone three.js page: the generated card as a thick matte block,
// og-image-style grade donut on the back. Run generate-featured-card.mjs first.
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

async function cardFront() {
  // Rasterise at 2x, then crop away the SVG's shadow margin.
  const big = svgText.replace('width="700" height="900"', 'width="1400" height="1800"');
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
  g.strokeStyle = "#424242"; g.lineWidth = 2; g.strokeRect(17, 17, 966, 1366);

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

// The card as a solid block: 2.5 x 3.5 (5:7), matte, panel-grey edges.
// Box face order: +x, -x, +y, -y, front, back.
const body = new THREE.MeshLambertMaterial({ color: "#2b2b2b" });
const card = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.5, 0.16), [
  body, body, body, body,
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
