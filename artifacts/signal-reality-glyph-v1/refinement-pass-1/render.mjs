import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(here, "source");
const outputDir = path.join(here, "screenshots");
const worldPath = path.join(here, "..", "source", "audit-world-reference.png");

const variants = [
  { id: "C1", family: "Confluence", file: "c1-triad-datum.svg", name: "Triad Datum", knob: "3 paths · offset core · 4.0 stroke" },
  { id: "C2", family: "Confluence", file: "c2-triad-radial.svg", name: "Triad Radial", knob: "3 paths · 120° balance · 4.0 stroke" },
  { id: "C3", family: "Confluence", file: "c3-four-gap.svg", name: "Four Gap", knob: "4 paths · larger boundary · 3.75 stroke" },
  { id: "C4", family: "Confluence", file: "c4-four-core.svg", name: "Four Core", knob: "4 paths · solid center · 4.0 stroke" },
  { id: "C5", family: "Confluence", file: "c5-weighted-arrival.svg", name: "Weighted Arrival", knob: "4 paths · weight gain · 3.0→4.5 stroke" },
  { id: "P1", family: "Phase Lock", file: "p1-open-point.svg", name: "Open Point", knob: "point result · no stop line · 4.0 stroke" },
  { id: "P2", family: "Phase Lock", file: "p2-datum-ring.svg", name: "Datum Ring", knob: "bounded point · no stop line · 4.0 stroke" },
  { id: "P3", family: "Phase Lock", file: "p3-short-pulse.svg", name: "Short Pulse", knob: "7-unit pulse · 5.0 destination" },
  { id: "P4", family: "Phase Lock", file: "p4-quiet-datum.svg", name: "Quiet Datum", knob: "point + quiet field · 3.5 stroke" },
  { id: "P5", family: "Phase Lock", file: "p5-weighted-settle.svg", name: "Weighted Settle", knob: "certainty weight shift · point result" },
];

const C = {
  void: "#080b0d", bg: "#0b0f12", panel: "#12171b", raised: "#182026",
  line: "#253038", strong: "#34434d", text: "#f3f0e6", soft: "#9ca8af",
  faint: "#64717a", cyan: "#46c3d6", cyanSoft: "#17353c", mint: "#4ad9a8",
  amber: "#e0b04a", red: "#ef6b5b",
};

function esc(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function text(x, y, value, size, color = C.text, weight = 400, anchor = "start", tracking = 0) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${tracking}">${esc(value)}</text>`;
}

function frame(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="groundGlow" cx="16%" cy="-5%" r="75%"><stop stop-color="${C.cyan}" stop-opacity=".12"/><stop offset=".58" stop-color="${C.cyan}" stop-opacity="0"/></radialGradient>
    <pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0v22" fill="none" stroke="#fff" stroke-opacity=".022"/></pattern>
  </defs>
  <rect width="100%" height="100%" fill="${C.void}"/><rect width="100%" height="100%" fill="url(#groundGlow)"/>
  ${body}
  </svg>`;
}

function glyph(inner, x, y, size, color = C.cyan, opacity = 1) {
  return `<g transform="translate(${x} ${y}) scale(${size / 64})" color="${color}" opacity="${opacity}">${inner}</g>`;
}

const loaded = await Promise.all(variants.map(async (variant) => {
  const source = await fs.readFile(path.join(sourceDir, variant.file), "utf8");
  const inner = source.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1]
    .replace(/<(title|desc)[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/[ \t]+(?=\n)/g, "")
    .trim() ?? "";
  return { ...variant, inner };
}));

await fs.mkdir(outputDir, { recursive: true });

// 01 — Ten optical variants, grouped as the same two inherited families.
{
  const W = 1800, H = 930;
  let body = text(72, 72, "SIGNAL · REALITY GLYPH · FOCUSED OPTICAL PASS", 14, C.cyan, 700, "start", 2.8);
  body += text(72, 128, "Two families. Ten controlled variants.", 43, C.text, 620, "start", -1.8);
  body += text(72, 163, "No new concept families · static geometry remains primary", 17, C.soft);

  for (const [index, variant] of loaded.entries()) {
    const familyIndex = index < 5 ? 0 : 1;
    const col = index % 5;
    const x = 72 + col * 334;
    const y = 230 + familyIndex * 326;
    const w = 310, h = 292;
    body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.panel}" stroke="${C.line}"/>`;
    body += `<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="11" fill="url(#grid)"/>`;
    body += text(x + 18, y + 29, variant.id, 11, C.cyan, 700, "start", 1.5);
    body += text(x + w - 18, y + 29, variant.family.toUpperCase(), 9, C.faint, 700, "end", 1.1);
    body += `<circle cx="${x + w / 2}" cy="${y + 105}" r="58" fill="${C.cyan}" fill-opacity=".025" stroke="${C.cyan}" stroke-opacity=".1"/>`;
    body += glyph(variant.inner, x + w / 2 - 39, y + 66, 78);
    body += text(x + 18, y + 189, variant.name, 19, C.text, 610, "start", -.25);
    body += text(x + 18, y + 213, variant.knob, 11, C.soft);
    body += `<line x1="${x + 18}" y1="${y + 232}" x2="${x + w - 18}" y2="${y + 232}" stroke="${C.line}"/>`;
    [16, 24, 40, 64].forEach((size, scaleIndex) => {
      const cx = x + 42 + scaleIndex * 72;
      body += glyph(variant.inner, cx - size / 2, y + 241 + (40 - Math.min(size, 40)) / 2, size, C.text);
    });
  }

  body += text(72, 212, "CONFLUENCE", 11, C.soft, 700, "start", 1.8);
  body += text(72, 538, "PHASE LOCK", 11, C.soft, 700, "start", 1.8);
  body += `<line x1="72" y1="886" x2="1728" y2="886" stroke="${C.line}"/>`;
  body += text(72, 914, "OPTICAL VARIABLES: PATH COUNT · CENTER BOUNDARY · CURVATURE · WEIGHT · RESULT SHAPE", 11, C.faint, 650, "start", 1.65);
  const svg = frame(W, H, body);
  await fs.writeFile(path.join(outputDir, "01-optical-variants.svg"), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, "01-optical-variants.png"));
}

const finalistIds = ["C3", "C4", "P2", "P1"];
const finalists = finalistIds.map((id) => loaded.find((variant) => variant.id === id));

// 02 — Exact 40/48/64 px centers plus selected and Trace-terminal states in
// the real Phase 3 Audit World composition.
{
  const W = 2000, H = 1230;
  const world = await fs.readFile(worldPath);
  const base = sharp({ create: { width: W, height: H, channels: 4, background: C.void } });
  let chrome = text(72, 72, "02 · REAL PRODUCT CONTEXT", 14, C.cyan, 700, "start", 2.8);
  chrome += text(72, 128, "Audit World scale and state proof", 43, C.text, 620, "start", -1.8);
  chrome += text(72, 163, "Exact mark sizes · selected Reality · Trace terminates at the accepted center", 17, C.soft);
  chrome += text(350, 217, "40 PX", 10, C.faint, 700, "start", 1.5);
  chrome += text(670, 217, "48 PX", 10, C.faint, 700, "start", 1.5);
  chrome += text(990, 217, "64 PX", 10, C.faint, 700, "start", 1.5);
  chrome += text(1310, 217, "SELECTED REALITY", 10, C.faint, 700, "start", 1.5);
  chrome += text(1630, 217, "TRACE → REALITY", 10, C.faint, 700, "start", 1.5);
  chrome += text(72, 1194, "MASTER CONTROL ROOM MATERIAL · GRAPHITE / SIGNAL CYAN · NO RUBRIC ORANGE", 11, C.faint, 650, "start", 1.65);
  const layers = [{ input: Buffer.from(frame(W, H, chrome)), left: 0, top: 0 }];

  for (const [row, finalist] of finalists.entries()) {
    const rowY = 235 + row * 230;
    const rowBack = `<svg xmlns="http://www.w3.org/2000/svg" width="1856" height="210"><rect x=".5" y=".5" width="1855" height="209" rx="12" fill="${C.panel}" stroke="${C.line}"/>${text(24, 52, finalist.id, 11, C.cyan, 700, "start", 1.5)}${text(24, 86, finalist.name, 22, C.text, 610, "start", -.35)}${text(24, 111, finalist.family.toUpperCase(), 10, C.soft, 700, "start", 1.4)}${text(24, 168, row < 2 ? "REALITY CENTER" : "UTILITY / AUDIT", 10, C.faint, 650, "start", 1.3)}</svg>`;
    layers.push({ input: Buffer.from(rowBack), left: 72, top: rowY });

    for (let col = 0; col < 5; col++) {
      const tileW = 300, tileH = 188;
      const tileX = 340 + col * 320;
      const tileY = rowY + 11;
      const cx = tileW * .433, cy = tileH * .567;
      const markSize = col < 3 ? [40, 48, 64][col] : 48;
      const selected = col === 3;
      const traced = col === 4;
      const coverR = markSize / 2 + 7;
      const ringR = markSize / 2 + 14;
      const trace = traced
        ? `<path d="M282 49C238 46 210 73 ${cx + ringR + 1} ${cy - 4}" fill="none" stroke="${C.cyan}" stroke-width="2" stroke-linecap="round"/><circle cx="264" cy="50" r="3" fill="${C.cyan}"/><circle cx="231" cy="59" r="2.5" fill="${C.cyan}" fill-opacity=".8"/><circle cx="200" cy="73" r="2" fill="${C.cyan}" fill-opacity=".65"/>`
        : "";
      const selection = selected
        ? `<circle cx="${cx}" cy="${cy}" r="${ringR + 8}" fill="none" stroke="${C.cyan}" stroke-width="2"/><path d="M${cx - ringR - 12} ${cy - 11}v-8h8M${cx + ringR + 12} ${cy - 11}v-8h-8M${cx - ringR - 12} ${cy + 11}v8h8M${cx + ringR + 12} ${cy + 11}v8h-8" fill="none" stroke="${C.cyan}" stroke-width="2" stroke-linecap="round"/>`
        : "";
      const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}" viewBox="0 0 ${tileW} ${tileH}">
        ${trace}
        <circle cx="${cx}" cy="${cy}" r="${coverR}" fill="${C.bg}" fill-opacity=".98"/>
        <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="${C.cyan}" fill-opacity=".065" stroke="${C.cyan}" stroke-opacity=".36"/>
        ${selection}
        ${glyph(finalist.inner, cx - markSize / 2, cy - markSize / 2, markSize)}
        <rect x=".5" y=".5" width="${tileW - 1}" height="${tileH - 1}" rx="8" fill="none" stroke="${selected ? C.cyan : C.line}" stroke-opacity="${selected ? .75 : 1}"/>
      </svg>`;
      const tile = await sharp(world).resize(tileW, tileH, { fit: "fill" }).composite([{ input: Buffer.from(overlay), left: 0, top: 0 }]).png().toBuffer();
      layers.push({ input: tile, left: tileX, top: tileY });
    }
  }
  await base.composite(layers).png().toFile(path.join(outputDir, "02-product-contexts.png"));
}

// 03 — Rail, favicon, strict monochrome, cyan, white, and warm-white checks.
{
  const W = 2000, H = 1180;
  let body = text(72, 72, "03 · COMPACT AND MATERIAL USAGE", 14, C.cyan, 700, "start", 2.8);
  body += text(72, 128, "Finalists outside the center", 43, C.text, 620, "start", -1.8);
  body += text(72, 163, "16/24 px rail · favicon-like tile · monochrome · cyan / white / warm white", 17, C.soft);

  finalists.forEach((finalist, row) => {
    const y = 220 + row * 223;
    body += `<rect x="72" y="${y}" width="1856" height="201" rx="12" fill="${C.panel}" stroke="${C.line}"/>`;
    body += text(98, y + 43, finalist.id, 11, C.cyan, 700, "start", 1.5);
    body += text(98, y + 78, finalist.name, 22, C.text, 610, "start", -.35);
    body += text(98, y + 105, finalist.family, 12, C.soft);

    // 16 and 24 px rail holders.
    body += `<rect x="360" y="${y + 26}" width="355" height="149" rx="10" fill="${C.raised}" stroke="${C.line}"/>`;
    body += `<rect x="377" y="${y + 44}" width="321" height="50" rx="8" fill="${C.cyan}" fill-opacity=".09"/><rect x="377" y="${y + 44}" width="2" height="50" fill="${C.cyan}"/>`;
    body += `<rect x="393" y="${y + 53}" width="32" height="32" rx="7" fill="${C.cyan}" fill-opacity=".07" stroke="${C.cyan}" stroke-opacity=".3"/>`;
    body += glyph(finalist.inner, 401, y + 61, 16);
    body += text(440, y + 66, "AUDIT WORLD", 10, C.text, 700, "start", 1.05);
    body += text(440, y + 83, "Reality", 10, C.faint);
    body += glyph(finalist.inner, 397, y + 119, 24, C.text);
    body += text(433, y + 136, "16 PX / 24 PX", 10, C.faint, 650, "start", 1.15);

    // Favicon-like usage at a true 16 px mark.
    body += `<rect x="746" y="${y + 26}" width="150" height="149" rx="10" fill="${C.bg}" stroke="${C.line}"/>`;
    body += `<rect x="795" y="${y + 49}" width="52" height="52" rx="11" fill="${C.raised}" stroke="${C.strong}"/>`;
    body += glyph(finalist.inner, 813, y + 67, 16);
    body += text(821, y + 135, "FAVICON", 9, C.faint, 700, "middle", 1.3);

    const swatches = [
      { x: 928, bg: C.cyan, fg: C.bg, label: "CYAN" },
      { x: 1132, bg: "#ffffff", fg: C.bg, label: "WHITE" },
      { x: 1336, bg: C.text, fg: C.bg, label: "WARM WHITE" },
      { x: 1540, bg: C.bg, fg: C.text, label: "MONO DARK" },
      { x: 1744, bg: "#f7f7f5", fg: "#101417", label: "MONO LIGHT" },
    ];
    swatches.forEach((swatch) => {
      body += `<rect x="${swatch.x}" y="${y + 26}" width="164" height="149" rx="10" fill="${swatch.bg}" stroke="${C.line}"/>`;
      body += glyph(finalist.inner, swatch.x + 50, y + 57, 64, swatch.fg);
      body += text(swatch.x + 82, y + 151, swatch.label, 8.5, swatch.fg, 700, "middle", 1.15);
    });
  });
  body += `<line x1="72" y1="1130" x2="1928" y2="1130" stroke="${C.line}"/>`;
  body += text(72, 1158, "STATIC FORM RETAINS IDENTITY IN EVERY MATERIAL CHECK", 11, C.faint, 650, "start", 1.65);
  const svg = frame(W, H, body);
  await fs.writeFile(path.join(outputDir, "03-finalist-usage.svg"), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, "03-finalist-usage.png"));
}

const scores = [
  { id: "C3", name: "Four Gap", meaning: 9.5, distinct: 8.6, tiny: 9.1, circle: 9.8, brand: 8.9, risk: 2.7, fit: 9.6, overall: 9.2 },
  { id: "C4", name: "Four Core", meaning: 9.3, distinct: 8.8, tiny: 8.8, circle: 9.6, brand: 9.0, risk: 2.5, fit: 9.4, overall: 9.1 },
  { id: "P2", name: "Datum Ring", meaning: 9.6, distinct: 8.2, tiny: 9.4, circle: 8.5, brand: 8.8, risk: 3.7, fit: 9.6, overall: 9.0 },
  { id: "P1", name: "Open Point", meaning: 9.4, distinct: 7.9, tiny: 9.7, circle: 7.8, brand: 8.4, risk: 4.2, fit: 9.3, overall: 8.8 },
];

// 04 — Finalist scorecard. Risk is inverse: 1 is safer and 10 is riskier.
{
  const W = 1800, H = 760;
  let body = text(72, 72, "04 · FINALIST SCORECARD", 14, C.cyan, 700, "start", 2.8);
  body += text(72, 128, "Four marks worth Nic's review", 43, C.text, 620, "start", -1.8);
  body += text(72, 163, "Risk is inverse: lower is safer · scores remain directional, not legal clearance", 17, C.soft);

  const columns = [
    ["MEANING", 740], ["DISTINCT", 875], ["16 PX", 1010], ["CIRCLE", 1145],
    ["BRAND", 1280], ["RISK ↓", 1415], ["PHILOSOPHY", 1550], ["OVERALL", 1690],
  ];
  body += `<rect x="72" y="214" width="1656" height="425" rx="12" fill="${C.panel}" stroke="${C.line}"/>`;
  body += text(104, 254, "FINALIST", 10, C.faint, 700, "start", 1.4);
  columns.forEach(([label, x]) => { body += text(x, 254, label, 9.5, C.faint, 700, "middle", 1.2); });
  scores.forEach((score, row) => {
    const y = 291 + row * 82;
    const finalist = finalists.find((item) => item.id === score.id);
    if (row > 0) body += `<line x1="96" y1="${y - 24}" x2="1704" y2="${y - 24}" stroke="${C.line}"/>`;
    body += glyph(finalist.inner, 106, y - 22, 44);
    body += text(172, y - 1, `${score.id} · ${score.name}`, 18, C.text, 610, "start", -.2);
    body += text(390, y - 1, finalist.family.toUpperCase(), 10, C.soft, 700, "start", 1.25);
    [score.meaning, score.distinct, score.tiny, score.circle, score.brand, score.risk, score.fit, score.overall].forEach((value, col) => {
      const x = columns[col][1];
      const color = col === 5 ? (value <= 3 ? C.mint : C.amber) : col === 7 ? C.cyan : C.text;
      body += text(x, y, value.toFixed(1), col === 7 ? 18 : 15, color, col === 7 ? 700 : 560, "middle");
    });
  });
  body += text(104, 606, "BEST CONFLUENCE", 10, C.cyan, 700, "start", 1.4);
  body += text(275, 606, "C3 Four Gap · C4 Four Core", 13, C.text, 560);
  body += text(715, 606, "BEST PHASE LOCK", 10, C.cyan, 700, "start", 1.4);
  body += text(872, 606, "P2 Datum Ring · P1 Open Point", 13, C.text, 560);
  body += `<line x1="72" y1="690" x2="1728" y2="690" stroke="${C.line}"/>`;
  body += text(72, 724, "ADVANCE A DIRECTION FOR OPTICAL V2 · DO NOT DECLARE A CORPORATE LOGO", 11, C.faint, 650, "start", 1.65);
  const svg = frame(W, H, body);
  await fs.writeFile(path.join(outputDir, "04-finalist-scorecard.svg"), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, "04-finalist-scorecard.png"));
}

console.log(`Rendered refinement package to ${outputDir}`);
