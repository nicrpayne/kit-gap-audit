import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.env.SIGNAL_VISUAL_BASE || "0700dea7a51c69655d3afd974bd62a7186c705d5";
let failures = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function blobAt(revision, path) {
  return git("rev-parse", `${revision}:${path}`);
}

const protectedPrefixes = [
  "public/audit-rubric-phase1/",
  "public/audit-rubric-phase2/",
  "public/audit-rubric-phase3/",
  "components/audit/canvas/",
  "components/audit/renderer/",
  "lib/audit/spatial/",
];
const protectedFiles = [
  "artifacts/rubric-production-parity/jsa-production-mirror.json",
  "components/audit/CanvasAuditRenderer.tsx",
  "components/audit/SignalGraph.tsx",
  "components/audit/cameraMotion.ts",
  "components/audit/graphTokens.ts",
  "components/audit/rubricCamera.ts",
  "lib/audit/focus.ts",
  "lib/audit/graphLayout.ts",
  "lib/audit/rubricVisualAdapter.ts",
  "lib/audit/structuralWeb.ts",
  "lib/audit/visualScene.ts",
];
const baseFiles = git("ls-tree", "-r", "--name-only", BASE).split("\n");
const protectedWorld = [...new Set([
  ...protectedFiles,
  ...baseFiles.filter((path) => protectedPrefixes.some((prefix) => path.startsWith(prefix))),
])].sort();

const changedProtected = protectedWorld.filter((path) => {
  try {
    return blobAt(BASE, path) !== blobAt("HEAD", path);
  } catch {
    return true;
  }
});
check(
  "Audit spatial/world implementation is byte-identical to production base",
  changedProtected.length === 0,
  `${protectedWorld.length} protected files; ${changedProtected.length} changed`,
);

function fingerprint(revision) {
  const digest = createHash("sha256");
  for (const path of protectedWorld) digest.update(`${path}\0${blobAt(revision, path)}\n`);
  return digest.digest("hex");
}
const baseFingerprint = fingerprint(BASE);
const headFingerprint = fingerprint("HEAD");
check("Audit before/after spatial fingerprint matches", baseFingerprint === headFingerprint, headFingerprint);

const mirror = JSON.parse(readFileSync("artifacts/rubric-production-parity/jsa-production-mirror.json", "utf8"));
check("production-shaped Audit fixture remains 438 objects", mirror.graph?.nodes?.length === 438, String(mirror.graph?.nodes?.length));
check("production-shaped Audit fixture remains 543 relationships", mirror.graph?.edges?.length === 543, String(mirror.graph?.edges?.length));

const diff = git("diff", "--unified=0", BASE, "HEAD", "--", "app", "components", "lib");
const addedLines = diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
const addedColorNamespace = addedLines.filter((line) => /--color-[\w-]+\s*:/.test(line));
check("no new --color-* declarations in modified product files", addedColorNamespace.length === 0, `${addedColorNamespace.length} found`);

let currentFile = "";
const addedLiteralColors = [];
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) currentFile = line.slice(6);
  if (!line.startsWith("+") || line.startsWith("+++")) continue;
  if (!/(#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])|\brgba?\()/i.test(line)) continue;
  if (["app/globals.css", "lib/visual-system/auditEmbeddedTheme.ts"].includes(currentFile)) continue;
  addedLiteralColors.push(`${currentFile}: ${line.slice(1).trim()}`);
}
check(
  "no new literal semantic colors outside the two shared token bridges",
  addedLiteralColors.length === 0,
  `${addedLiteralColors.length} found`,
);

const globalCss = readFileSync("app/globals.css", "utf8");
const embeddedTheme = readFileSync("lib/visual-system/auditEmbeddedTheme.ts", "utf8");
function variables(source) {
  return new Map([...source.matchAll(/--(signal-[\w-]+):\s*([^;]+);/g)].map((match) => [
    match[1],
    match[2].trim().replace(/\s+/g, " "),
  ]));
}
const globalVariables = variables(globalCss);
const embeddedVariables = variables(embeddedTheme);
const mismatchedBridge = [...embeddedVariables.entries()].filter(([name, value]) => globalVariables.get(name) !== value);
check(
  "Audit iframe token bridge exactly matches the shared token layer",
  mismatchedBridge.length === 0,
  `${embeddedVariables.size} bridged roles; ${mismatchedBridge.length} mismatches`,
);

const primitives = readFileSync("components/instrument/SignalPrimitives.tsx", "utf8");
for (const name of ["SignalWidget", "SignalPanel", "SignalStateMark", "SignalBasisMark", "SignalHandoff", "SignalControl", "SignalMeter"]) {
  check(`${name} primitive is exported`, primitives.includes(`export function ${name}`));
}

const shell = [
  readFileSync("components/instrument/InstrumentShell.tsx", "utf8"),
  readFileSync("components/instrument/InstrumentRail.tsx", "utf8"),
  readFileSync("components/instrument/CommandMenu.tsx", "utf8"),
].join("\n");
check("shell uses the shared control/state contract", /signal-(?:control|shell|nav)/.test(shell));
check("selected and focused states remain independent", globalCss.includes("[data-signal-interaction=\"selected\"]") && globalCss.includes(":focus-visible"));
check("disabled state has an independent material channel", globalCss.includes("--signal-disabled-opacity") && globalCss.includes(":disabled"));
check("modified controls preserve 32px minimum hit targets", globalCss.includes("min-height: 32px") && embeddedTheme.includes("signal-widget-fill"));
check("reduced-motion handling is present in both documents", (globalCss.match(/prefers-reduced-motion/g) || []).length >= 1 && readFileSync("app/audit/rubric-phase3/route.ts", "utf8").includes("prefers-reduced-motion"));
check("basis marks encode trust with non-color line patterns", primitives.includes('"6 4"') && primitives.includes('"2 3"'));
check("time marks encode current/stale/superseded with symbols", primitives.includes("TIME_ICON") && primitives.includes("superseded"));

const controlRoom = [
  readFileSync("components/ControlRoomPageClient.tsx", "utf8"),
  readFileSync("components/control-room/Panels.tsx", "utf8"),
  readFileSync("components/control-room/Telemetry.tsx", "utf8"),
].join("\n");
check("Control Room chrome adopts shared controls, states, and panels", ["SignalControl", "SignalStateMark", "SignalPanel"].every(name => controlRoom.includes(name)));
check("Control Room adoption does not change API behavior", git("diff", "--name-only", BASE, "HEAD", "--", "app/api") === "");

const forbiddenDiff = git("diff", "--name-only", BASE, "HEAD", "--", "prisma", "migrations", "lib/truth", "lib/forecast", "lib/reports");
check("no data, schema, forecast, or Reports contract files changed", forbiddenDiff === "", forbiddenDiff || "clean");

console.log(`\nAudit spatial fingerprint: ${headFingerprint}`);
if (failures) process.exit(1);
console.log("PASS Signal Visual System Phase 1 structural proof");
