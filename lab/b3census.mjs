// §3's DENOMINATOR.
//
// "Semantic, temporal and provenance in distinguishable angular bands" is only
// a design if the corpus produces multi-class neighbourhoods. This counts them,
// with and without contextual `related_to`, over every object — so the answer
// is a property of the package rather than of whichever node was demoed.
//
// For the JSA corpus the answer is stark: of 407 objects, 224 have a
// neighbourhood within a bloom's reach and NOT ONE of them contains more than
// one relationship class. The banding is correct, deterministic, and invisible.
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport:{width:1400,height:900} })).newPage();
p.on("pageerror", (e)=>console.log("PAGEERROR", e.message.slice(0,200)));
await p.goto("http://localhost:4400/pb3.html", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
for (const ctxOn of [false, true]) {
  const c = await p.evaluate((on) => { window.__lab.contextual(on); return window.__lab.bandCensus(); }, ctxOn);
  console.log(`\ncontextual ${ctxOn ? "INCLUDED" : "excluded (default)"} — of ${c.total} objects, ${c.withSeats} have a neighbourhood within reach`);
  console.log(`  bands per bloom: ${JSON.stringify(c.byBandCount)}`);
  console.log(`  class combinations: ${JSON.stringify(c.classCombos)}`);
  console.log(`  multi-class blooms: ${c.multi.length}`);
  for (const m of c.multi.slice(0, 8)) console.log(`    ${m.kind.padEnd(11)} ${m.bands.map(x=>x.cls+":"+x.n).join(" + ")}`);
}
await b.close();
