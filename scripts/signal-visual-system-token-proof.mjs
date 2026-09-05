import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
let failures = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const required = [
  "surface-void", "surface-canvas", "surface-panel", "surface-raised", "surface-recessed",
  "border-subtle", "border-strong", "border-selected",
  "text-primary", "text-secondary", "text-tertiary", "text-disabled",
  "reality", "scenario", "attention", "risk", "positive", "source", "evidence", "inactive",
  "reality-reference", "focus-ring", "hover-overlay", "selected-overlay", "disabled-opacity",
  "control-fill", "control-shadow", "recess-shadow", "widget-shadow", "widget-fill",
];

for (const token of required) {
  check(`token --signal-${token} exists`, css.includes(`--signal-${token}:`));
}

const aliases = {
  "--i-void": "--signal-surface-void",
  "--i-bg": "--signal-surface-canvas",
  "--i-panel": "--signal-surface-panel",
  "--i-panel-raised": "--signal-surface-raised",
  "--i-recess": "--signal-surface-recessed",
  "--i-border": "--signal-border-subtle",
  "--i-border-strong": "--signal-border-strong",
  "--i-text": "--signal-text-primary",
  "--i-text-soft": "--signal-text-secondary",
  "--i-text-faint": "--signal-text-tertiary",
  "--i-signal": "--signal-reality",
  "--i-violet": "--signal-scenario",
  "--i-amber": "--signal-attention",
  "--i-red": "--signal-risk",
  "--i-mint": "--signal-positive",
  "--i-source": "--signal-source",
  "--i-silver": "--signal-evidence",
};

for (const [legacy, semantic] of Object.entries(aliases)) {
  check(`${legacy} aliases ${semantic}`, css.includes(`${legacy}: var(${semantic})`));
}
check(
  "legacy --i-reality remains a neutral comparison reference",
  css.includes("--i-reality: var(--signal-reality-reference)")
    && !css.includes("--i-reality: var(--signal-reality)")
);

function rgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex) {
  const channels = rgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + 0.05) / (dark + 0.05);
}

const surfaces = ["#151b20", "#0e1317", "#1c242a", "#070a0c"];
const foregrounds = {
  primary: "#f3f0e7",
  secondary: "#a1abb3",
  tertiary: "#808c95",
  reality: "#51c9db",
  scenario: "#a397fa",
  attention: "#e3b455",
  risk: "#f07162",
  positive: "#53d7aa",
  source: "#63acd0",
  evidence: "#bec9d0",
};

for (const [name, foreground] of Object.entries(foregrounds)) {
  const minimum = Math.min(...surfaces.map((surface) => contrast(foreground, surface)));
  check(`${name} clears the 4.5:1 core-surface floor`, minimum >= 4.5, `${minimum.toFixed(2)}:1 minimum`);
}

if (failures) process.exit(1);
console.log(`\nPASS semantic token foundation (${required.length} required roles, ${Object.keys(aliases).length} aliases)`);
