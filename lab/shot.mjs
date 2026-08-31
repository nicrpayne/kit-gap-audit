import { chromium } from "playwright";
const pages = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const pg of pages) {
  const c = await b.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  p.on("pageerror", (e) => console.log(pg, "PAGEERROR", e.message.slice(0, 120)));
  await p.goto(`http://localhost:4400/${pg}.html`, { waitUntil: "networkidle" });
  for (let i = 0; i < 60; i++) { if (await p.evaluate(() => window.__lab?.ready?.() ?? false)) break; await p.waitForTimeout(250); }
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.__lab.fit());
  await p.waitForTimeout(600);
  await p.screenshot({ path: `shots/${pg}-fit.png` });
  console.log("shot", pg);
  await c.close();
}
await b.close();
