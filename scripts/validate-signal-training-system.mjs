import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const checks = [];

function requireFile(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) failures.push(`Missing file: ${relative}`);
  else checks.push(relative);
  return absolute;
}

const userGuides = [
  "00-HOW-TO-PLAY-SIGNAL.md", "01-MASTER-CONTROL-ROOM.md", "02-PROJECT-ACTIVATION.md",
  "03-AUDIT.md", "04-SCOPE.md", "05-DECISIONS.md", "06-DEPENDENCIES.md",
  "07-PORTFOLIO-CAPACITY.md", "08-FORECAST.md", "09-TIMELINE.md", "10-REPORTS.md",
  "11-SEARCH-TRACE-INSPECTOR.md", "12-END-TO-END-WORKFLOW.md", "13-TROUBLESHOOTING.md",
  "14-GLOSSARY.md", "15-STATES-AND-WARNINGS.md", "16-WHICH-INSTRUMENT-DO-I-USE.md",
  "17-SAFE-VS-CONSEQUENTIAL-ACTIONS.md", "18-KNOWN-LIMITATIONS.md", "19-ROLE-BASED-VIEWS.md",
  "MAINTAINING-THE-GUIDES.md",
];

for (const file of userGuides) requireFile(`docs/user-guide/${file}`);

const majorGuides = userGuides.slice(1, 12);
const requiredHeadings = [
  "Purpose", "Why it is powerful", "Mental model", "Truth / ownership boundary", "Inputs", "Outputs",
  "Screen tour", "Primary happy path", "Secondary journeys", "Writes / side effects", "What it does not do",
  "Warnings / empty states", "Handoffs", "Common mistakes", "Troubleshooting", "Operator checklist", "Real example",
];
for (const file of majorGuides) {
  const text = fs.readFileSync(path.join(root, "docs/user-guide", file), "utf8").toLowerCase();
  for (const heading of requiredHeadings) {
    const escaped = heading.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`^##\\s+(?:\\d+\\.\\s+)?${escaped}\\s*$`, "m").test(text)) failures.push(`${file}: missing section “${heading}”`);
  }
}

for (const file of [
  "01-CONTROL-ROOM.md", "02-PROJECT-ACTIVATION.md", "03-AUDIT.md", "04-SCOPE.md", "05-DECISIONS.md",
  "06-DEPENDENCIES.md", "07-PORTFOLIO-CAPACITY.md", "08-FORECAST.md", "09-TIMELINE.md", "10-REPORTS.md",
  "11-SEARCH-TRACE-INSPECTOR.md",
]) requireFile(`docs/user-guide/quick-reference/${file}`);

for (const file of [
  "01-UNDERSTAND-SIGNAL.md", "02-OPERATE-A-PROJECT.md", "03-PLAY-THE-PROJECT.md",
  "04-COMMUNICATE.md", "05-START-A-PROJECT.md",
]) requireFile(`docs/training-curriculum/${file}`);

for (const file of ["DEMO-STATE.md", "FULL-TRAINING-SCRIPT.md", "SHOWCASE-SCRIPT.md", "STORYBOARD.md", "SHOT-LIST.md"])
  requireFile(`docs/training-video/${file}`);

for (const file of [
  "README.md", "SOURCE-STATE.md", "SIGNAL-AT-A-GLANCE.md", "WHICH-INSTRUMENT-FLOWCHART.md",
  "HUMAN-ARCHITECTURE.md", "COVERAGE-MATRIX.md", "BUGS-FOUND-DURING-DOCUMENTATION.md", "BUG-SUMMARY.md",
]) requireFile(`artifacts/signal-training-system/${file}`);

const visuals = ["00-signal-at-a-glance", "01-which-instrument", "02-human-architecture", "03-safe-vs-consequential"]
  .concat(Array.from({ length: 13 }, (_, index) => `${index + 10}-${[
    "control-room", "audit-world", "project-activation", "scope", "decisions", "dependencies", "capacity",
    "forecast", "timeline", "reports", "search-trace-inspector", "audit-change-inbox", "report-readiness",
  ][index]}`));
for (const visual of visuals) {
  requireFile(`artifacts/signal-training-system/screenshots/annotated/${visual}.svg`);
  requireFile(`artifacts/signal-training-system/screenshots/annotated/${visual}.png`);
}

for (const file of ["index.html", "README.md"]) requireFile(`artifacts/signal-training-system/handbook/${file}`);

const sourceState = fs.readFileSync(path.join(root, "artifacts/signal-training-system/SOURCE-STATE.md"), "utf8");
for (const marker of ["6c46ce984ffb231f4c33dc8653077cec55c30389", "62ba81d79137a66117412396a20c6792a1e4d57e", "628743a3-fa6c-4053-b063-d024b373995e", "SIG-DOC-002"])
  if (!sourceState.includes(marker)) failures.push(`SOURCE-STATE.md missing authority marker ${marker}`);

const coverage = fs.readFileSync(path.join(root, "artifacts/signal-training-system/COVERAGE-MATRIX.md"), "utf8");
for (const instrument of ["Control Room", "Project Activation", "Audit", "Scope", "Decisions", "Dependencies", "Capacity", "Forecast", "Timeline", "Reports", "Search / Trace / Inspector"])
  if (!coverage.includes(`| ${instrument}`)) failures.push(`Coverage matrix missing ${instrument}`);

const fullScript = fs.readFileSync(path.join(root, "docs/training-video/FULL-TRAINING-SCRIPT.md"), "utf8");
for (const cue of ["**Narration:**", "**Screen:**", "**Cursor:**", "**Zoom/callout:**", "**Transition:**", "**Fallback"])
  if (!fullScript.includes(cue)) failures.push(`Full script missing cue type ${cue}`);

const handbookPath = path.join(root, "artifacts/signal-training-system/handbook/index.html");
const handbook = fs.readFileSync(handbookPath, "utf8");
for (const match of handbook.matchAll(/href="([^"#][^"]*)"/g)) {
  const href = match[1];
  if (/^[a-z]+:/i.test(href)) continue;
  const linked = path.resolve(path.dirname(handbookPath), href);
  if (!fs.existsSync(linked)) failures.push(`Handbook broken link: ${href}`);
}

if (failures.length) {
  console.error(`Signal training-system validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Signal training-system validation passed: ${checks.length} required files and all structural assertions.`);
