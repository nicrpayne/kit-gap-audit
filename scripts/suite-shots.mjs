import { chromium } from "playwright";
import { mkdirSync } from "fs";
const out = process.argv[2] ?? "/tmp/suite";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal,#__next-build-watcher{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0,160)); });
for (const [route, name] of [["/overview","1-overview"],["/forecast","2-forecast"],["/scope","3-scope"],["/timeline","4-timeline"],["/audit","5-intelligence"],["/decisions","6-decisions"],["/reports","7-reports"],["/portfolio","8-portfolio"]]) {
  await p.goto("http://localhost:3000" + route, { waitUntil: "networkidle" });
  await p.waitForTimeout(4200);
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log("shot", name);
}
await b.close();
