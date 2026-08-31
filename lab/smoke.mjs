import { chromium } from "playwright";
const page = process.argv[2] ?? "pb";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
await p.goto(`http://localhost:4400/${page}.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const has = await p.evaluate(() => !!window.__lab);
console.log("__lab present:", has);
if (has) {
  for (let i = 0; i < 40; i++) {
    if (await p.evaluate(() => window.__lab.ready())) break;
    await p.waitForTimeout(250);
  }
  await p.evaluate(() => window.__lab.fit());
  await p.waitForTimeout(500);
  console.log(JSON.stringify(await p.evaluate(() => ({
    name: window.__lab.name, settleMs: Math.round(window.__lab.settleMs() ?? -1), alpha: +window.__lab.alpha().toFixed(4),
    nodes: window.__lab.nodes().length, m: window.__lab.metrics(),
  })), null, 1));
}
await p.screenshot({ path: `${process.env.OUT ?? "/tmp"}/${page}-smoke.png` });
await b.close();
