import { chromium } from "playwright";
import { mkdirSync } from "fs";
const out = process.argv[2] ?? "/tmp/fc";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { const s=document.createElement("style"); s.textContent="nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded",()=>document.head.appendChild(s)); });
const p = await ctx.newPage();
p.on("pageerror", e => console.log("PAGEERROR:", e.message));
p.on("console", m => { if (m.type()==="error") console.log("CONSOLE:", m.text().slice(0,150)); });
const shot = async n => { await p.screenshot({ path: `${out}/${n}.png` }); console.log("shot", n); };
const wait = ms => p.waitForTimeout(ms);

await p.goto("http://localhost:3000/forecast", { waitUntil: "networkidle" });
await wait(4500);

// JSA: allocations 2.93, no gate -> Reality, calm
await p.locator('[data-shoot="scope-jsa"]').click(); await wait(2600);
await shot("1-reality");

// Platform = inferred 10, has a gate -> gate-constrained
await p.locator('[data-shoot="scope-platform"]').click(); await wait(2600);
await shot("2-gate-constrained");

await p.locator('[data-shoot="toggle-macros"]').click(); await wait(700);
await shot("3-macros-open");

// resolve the gate -> wall releases
const gate = p.locator('[data-shoot="macro-gate"]').first();
if (await gate.count()) { await gate.click(); await wait(2800); await shot("4-gate-resolved"); }

// Design = 0.35 FTE, huge spread -> wide/unresolved, no target
await p.locator('[data-shoot="scope-design"]').click(); await wait(2800);
await shot("5-wide-uncertain-no-target");

// iTrack = explicit 5, tight -> narrow/high confidence
await p.locator('[data-shoot="scope-itrack"]').click(); await wait(2800);
await shot("6-narrow-confident");

// target scrub: drag target earlier -> miss tail grows, object does not move
const scrub = p.locator('[data-shoot="target-scrub"]');
if (await scrub.count()) {
  await scrub.focus();
  for (let i=0;i<40;i++){ await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(25); }
  await wait(1500); await shot("7-target-miss");
}
await p.locator('[data-shoot="central-date"]').click(); await wait(1000);
await shot("8-forecast-detail");
await b.close();
