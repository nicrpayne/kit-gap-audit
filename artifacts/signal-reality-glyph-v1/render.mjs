import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(here, "source");
const outputDir = path.join(here, "screenshots");

const concepts = [
  { file: "01-phase-lock.svg", name: "Phase Lock", tag: "RECOMMENDED 01", score: "9.0", note: "Three readings settle against one exact datum." },
  { file: "02-confluence.svg", name: "Confluence", tag: "RECOMMENDED 02", score: "8.8", note: "Four independent paths bend into one bounded center." },
  { file: "03-signal-fold.svg", name: "Signal Fold", tag: "RECOMMENDED 03", score: "8.6", note: "Differing waves cross phase and stabilize at one point." },
  { file: "04-resolution-gate.svg", name: "Resolution Gate", tag: "SYSTEMIC", score: "8.3", note: "Evidence lanes resolve through an acceptance gate." },
  { file: "05-quiet-core.svg", name: "Quiet Core", tag: "RADAR RISK", score: "7.6", note: "Observation waves lose noise near the center." },
  { file: "06-triangulate.svg", name: "Triangulate", tag: "NETWORK RISK", score: "7.7", note: "Three observations establish one accepted center." },
];

const C = {
  void: "#080b0d", bg: "#0b0f12", panel: "#12171b", raised: "#182026",
  line: "#253038", strong: "#34434d", text: "#f3f0e6", soft: "#9ca8af",
  faint: "#64717a", cyan: "#46c3d6", mint: "#4ad9a8", amber: "#e0b04a",
};

function esc(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function frame(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <radialGradient id="groundGlow" cx="16%" cy="-5%" r="75%"><stop stop-color="${C.cyan}" stop-opacity=".12"/><stop offset=".58" stop-color="${C.cyan}" stop-opacity="0"/></radialGradient>
      <radialGradient id="coreGlow"><stop stop-color="${C.cyan}" stop-opacity=".22"/><stop offset=".46" stop-color="${C.bg}"/><stop offset=".72" stop-color="${C.bg}"/><stop offset=".74" stop-color="${C.cyan}" stop-opacity=".5"/><stop offset=".76" stop-color="${C.bg}"/><stop offset="1" stop-color="${C.bg}" stop-opacity=".15"/></radialGradient>
      <filter id="shadow"><feGaussianBlur stdDeviation="12"/></filter>
      <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0v24" fill="none" stroke="#fff" stroke-opacity=".025"/></pattern>
    </defs>
    <rect width="100%" height="100%" fill="${C.void}"/><rect width="100%" height="100%" fill="url(#groundGlow)"/>
    ${body}
  </svg>`;
}

function text(x, y, value, size, color = C.text, weight = 400, anchor = "start", tracking = 0) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${tracking}">${esc(value)}</text>`;
}

function glyph(inner, x, y, size, color = C.cyan) {
  const scale = size / 64;
  return `<g transform="translate(${x} ${y}) scale(${scale})" color="${color}">${inner}</g>`;
}

const loaded = await Promise.all(concepts.map(async (concept) => {
  const source = await fs.readFile(path.join(sourceDir, concept.file), "utf8");
  const inner = source.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1]
    .replace(/<(title|desc)[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/[ \t]+(?=\n)/g, "")
    .trim() ?? "";
  return { ...concept, inner };
}));

await fs.mkdir(outputDir, { recursive: true });

// 01 — Full concept sheet and exact scale ladder.
{
  const W = 1800, H = 1320;
  let body = text(72, 82, "SIGNAL · AUDIT-LOCAL EXPLORATION", 14, C.cyan, 700, "start", 3.1);
  body += text(72, 154, "Reality glyphs", 64, C.text, 620, "start", -3.1);
  body += text(72, 194, "Many signals resolve into one accepted Reality · V1 · not a corporate logo", 20, C.soft);
  body += `<line x1="72" y1="226" x2="1728" y2="226" stroke="${C.line}"/>`;

  loaded.forEach((concept, index) => {
    const col = index % 3, row = Math.floor(index / 3);
    const x = 72 + col * 564, y = 270 + row * 490, w = 540, h = 448;
    const recommended = index < 3;
    body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.panel}" stroke="${recommended ? C.cyan : C.line}" stroke-opacity="${recommended ? .55 : 1}"/>`;
    body += `<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="13" fill="url(#grid)"/>`;
    body += text(x + 24, y + 36, String(index + 1).padStart(2, "0"), 13, C.faint, 700, "start", 1.3);
    body += text(x + w - 24, y + 36, concept.tag, 11, recommended ? C.cyan : C.faint, 700, "end", 1.5);
    body += `<circle cx="${x + w / 2}" cy="${y + 155}" r="76" fill="none" stroke="${C.cyan}" stroke-opacity=".1"/><circle cx="${x + w / 2}" cy="${y + 155}" r="52" fill="${C.cyan}" fill-opacity=".025"/>`;
    body += glyph(concept.inner, x + w / 2 - 48, y + 107, 96);
    body += text(x + 24, y + 268, concept.name, 25, C.text, 610, "start", -.5);
    body += text(x + w - 24, y + 268, concept.score, 20, C.cyan, 650, "end");
    body += text(x + 24, y + 299, concept.note, 14, C.soft);
    body += `<line x1="${x + 24}" y1="${y + 326}" x2="${x + w - 24}" y2="${y + 326}" stroke="${C.line}"/>`;
    [16, 24, 40, 64].forEach((size, scaleIndex) => {
      const cx = x + 65 + scaleIndex * 118;
      body += glyph(concept.inner, cx - size / 2, y + 346 + (64 - size) / 2, size, C.text);
      body += text(cx, y + 427, `${size}px`, 11, C.faint, 500, "middle", .4);
    });
  });
  body += text(72, 1276, "STATIC FORM PRIMARY · CURRENTCOLOR SVG · GRAPHITE / CYAN / WARM WHITE", 12, C.faint, 650, "start", 1.8);
  const svg = frame(W, H, body);
  await fs.writeFile(path.join(outputDir, "01-concept-sheet.svg"), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, "01-concept-sheet.png"));
}

// 02 — All candidates over the actual Phase 3 Audit World screenshot.
{
  const W = 1800, H = 1010;
  const world = await fs.readFile(path.join(sourceDir, "audit-world-reference.png"));
  const worldHref = "../source/audit-world-reference.png";
  let body = text(72, 78, "02 · AUDIT WORLD CONTEXT", 14, C.cyan, 700, "start", 3.1);
  body += text(72, 136, "Does it hold the center?", 44, C.text, 620, "start", -1.8);
  body += text(72, 172, "Each mark covers the current text disc in this static composition only.", 18, C.soft);

  loaded.forEach((concept, index) => {
    const col = index % 3, row = Math.floor(index / 3);
    const x = 72 + col * 564, y = 218 + row * 376, w = 540, h = 338;
    body += `<clipPath id="clip-${index}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/></clipPath>`;
    body += `<g clip-path="url(#clip-${index})"><image href="${worldHref}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
    const cx = x + w * .433, cy = y + h * .567;
    body += `<circle cx="${cx}" cy="${cy}" r="40" fill="${C.bg}" fill-opacity=".98"/><circle cx="${cx}" cy="${cy}" r="58" fill="${C.cyan}" fill-opacity=".07" stroke="${C.cyan}" stroke-opacity=".16"/><circle cx="${cx}" cy="${cy}" r="46" fill="none" stroke="${C.cyan}" stroke-opacity=".42"/>`;
    body += glyph(concept.inner, cx - 30, cy - 30, 60);
    body += `<rect x="${x + 12}" y="${y + 12}" width="190" height="32" rx="6" fill="${C.void}" fill-opacity=".88" stroke="#fff" stroke-opacity=".14"/>`;
    body += text(x + 25, y + 33, `${String(index + 1).padStart(2, "0")} · ${concept.name.toUpperCase()}`, 11, C.text, 700, "start", 1.2);
    body += `</g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="none" stroke="${index < 3 ? C.cyan : C.line}" stroke-opacity="${index < 3 ? .5 : 1}"/>`;
  });
  body += text(72, 970, "REAL PHASE 3 COMPOSITION REFERENCE · NO RUNTIME FILES MODIFIED", 12, C.faint, 650, "start", 1.8);
  const svg = frame(W, H, body);
  await fs.writeFile(path.join(outputDir, "02-audit-world-context.svg"), svg);

  // Keep the real screenshot raster in the rendered proof. Some SVG renderers
  // skip embedded raster data URIs, so the PNG is explicitly composited.
  const base = sharp({ create: { width: W, height: H, channels: 4, background: C.void } });
  const header = frame(W, H,
    text(72, 78, "02 · AUDIT WORLD CONTEXT", 14, C.cyan, 700, "start", 3.1) +
    text(72, 136, "Does it hold the center?", 44, C.text, 620, "start", -1.8) +
    text(72, 172, "Each mark covers the current text disc in this static composition only.", 18, C.soft) +
    text(72, 970, "REAL PHASE 3 COMPOSITION REFERENCE · NO RUNTIME FILES MODIFIED", 12, C.faint, 650, "start", 1.8));
  const layers = [{ input: Buffer.from(header), left: 0, top: 0 }];

  for (const [index, concept] of loaded.entries()) {
    const col = index % 3, row = Math.floor(index / 3);
    const x = 72 + col * 564, y = 218 + row * 376, w = 540, h = 338;
    const cx = w * .433, cy = h * .567;
    const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <circle cx="${cx}" cy="${cy}" r="40" fill="${C.bg}" fill-opacity=".98"/>
      <circle cx="${cx}" cy="${cy}" r="58" fill="${C.cyan}" fill-opacity=".07" stroke="${C.cyan}" stroke-opacity=".16"/>
      <circle cx="${cx}" cy="${cy}" r="46" fill="none" stroke="${C.cyan}" stroke-opacity=".42"/>
      ${glyph(concept.inner, cx - 30, cy - 30, 60)}
      <rect x="12" y="12" width="190" height="32" rx="6" fill="${C.void}" fill-opacity=".88" stroke="#fff" stroke-opacity=".14"/>
      ${text(25, 33, `${String(index + 1).padStart(2, "0")} · ${concept.name.toUpperCase()}`, 11, C.text, 700, "start", 1.2)}
      <rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="12" fill="none" stroke="${index < 3 ? C.cyan : C.line}" stroke-opacity="${index < 3 ? .5 : 1}"/>
    </svg>`;
    const tile = await sharp(world)
      .resize(w, h, { fit: "fill" })
      .composite([{ input: Buffer.from(overlay), left: 0, top: 0 }])
      .png()
      .toBuffer();
    layers.push({ input: tile, left: x, top: y });
  }
  await base.composite(layers).png().toFile(path.join(outputDir, "02-audit-world-context.png"));
}

// 03 — Shortlist in hero, rail, cyan/white, and strict monochrome contexts.
{
  const W = 1800, H = 1060;
  let body = text(72, 78, "03 · RECOMMENDED SHORTLIST", 14, C.cyan, 700, "start", 3.1);
  body += text(72, 136, "Three directions for Nic review", 44, C.text, 620, "start", -1.8);
  body += text(72, 172, "Selection advances a direction to optical refinement; it does not declare a final logo.", 18, C.soft);

  loaded.slice(0, 3).forEach((concept, index) => {
    const y = 225 + index * 255;
    body += `<rect x="72" y="${y}" width="1656" height="224" rx="13" fill="${C.panel}" stroke="${C.line}"/>`;
    body += `<rect x="96" y="${y + 24}" width="176" height="176" rx="12" fill="${C.bg}" stroke="${C.line}"/>`;
    body += `<circle cx="184" cy="${y + 112}" r="63" fill="${C.cyan}" fill-opacity=".04" stroke="${C.cyan}" stroke-opacity=".12"/>`;
    body += glyph(concept.inner, 136, y + 64, 96);
    body += text(308, y + 61, `${String(index + 1).padStart(2, "0")} · ${concept.name}`, 26, C.text, 610, "start", -.4);
    body += text(308, y + 92, concept.note, 14, C.soft);
    body += text(308, y + 134, index === 0 ? "BEST OVERALL" : index === 1 ? "BEST IN WORLD" : "MOST DISTINCTIVE", 11, C.cyan, 700, "start", 1.6);
    body += text(308, y + 171, `SCORE  ${concept.score}`, 14, C.text, 650, "start", 1.2);

    const railX = 780;
    body += `<rect x="${railX}" y="${y + 39}" width="310" height="146" rx="10" fill="${C.raised}" stroke="${C.line}"/>`;
    body += `<rect x="${railX + 16}" y="${y + 55}" width="278" height="54" rx="8" fill="${C.cyan}" fill-opacity=".09"/><rect x="${railX + 16}" y="${y + 55}" width="2" height="54" fill="${C.cyan}"/>`;
    body += `<rect x="${railX + 30}" y="${y + 64}" width="36" height="36" rx="8" fill="${C.cyan}" fill-opacity=".08" stroke="${C.cyan}" stroke-opacity=".28"/>`;
    body += glyph(concept.inner, railX + 36, y + 70, 24);
    body += text(railX + 82, y + 80, "AUDIT WORLD", 11, C.text, 700, "start", 1.1);
    body += text(railX + 82, y + 98, "Accepted Reality", 11, C.faint);
    body += text(railX + 30, y + 143, "24px RAIL / AVATAR", 10, C.faint, 650, "start", 1.3);

    const swatches = [{ x: 1130, bg: C.cyan, fg: C.bg, label: "CYAN" }, { x: 1310, bg: C.text, fg: C.bg, label: "WARM WHITE" }, { x: 1490, bg: C.bg, fg: C.text, label: "MONO" }];
    for (const swatch of swatches) {
      body += `<rect x="${swatch.x}" y="${y + 39}" width="156" height="146" rx="10" fill="${swatch.bg}" stroke="${C.line}"/>`;
      body += glyph(concept.inner, swatch.x + 46, y + 65, 64, swatch.fg);
      body += text(swatch.x + 78, y + 164, swatch.label, 9, swatch.fg, 700, "middle", 1.25);
    }
  });
  body += `<line x1="72" y1="1005" x2="1728" y2="1005" stroke="${C.line}"/>`;
  body += text(72, 1037, "PHASE LOCK → CONFLUENCE → SIGNAL FOLD", 12, C.cyan, 700, "start", 1.8);
  body += text(1728, 1037, "STATIC RECOGNIZABILITY PRESERVED", 12, C.faint, 650, "end", 1.8);
  const svg = frame(W, H, body);
  await fs.writeFile(path.join(outputDir, "03-top-three-usage.svg"), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, "03-top-three-usage.png"));
}

console.log(`Rendered three review sheets to ${outputDir}`);
