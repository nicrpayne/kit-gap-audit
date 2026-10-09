import PDFDocument from "pdfkit";
import { create as createFont } from "fontkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RecipientSnapshot } from "./recipientSnapshot";

// Fixed packaged assets only. Source content cannot supply a URL or file path.
// Explicit Next output tracing includes these assets. Do not require/import
// binary font files: webpack would try to parse them as JavaScript modules.
const fontRoot = join(process.cwd(), "node_modules", "dejavu-fonts-ttf");
const regularPath = join(fontRoot, "ttf", "DejaVuSans.ttf");
const regular = readFileSync(regularPath);
const bold = readFileSync(join(fontRoot, "ttf", "DejaVuSans-Bold.ttf"));
const license = readFileSync(join(fontRoot, "LICENSE"), "utf8");
const glyphs = createFont(regular);
const boldGlyphs = createFont(bold);
export class ReportPdfError extends Error {}
const date = (v: string | null) => !v ? "Not recorded" : !Number.isFinite(Date.parse(v)) ? v : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(v));
const num = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(2);
const range = (r: { low: number; likely: number; high: number }) => `${num(r.low)} / ${num(r.likely)} / ${num(r.high)}`;

/** Native PDF, not browser automation or an HTML screenshot. Consumes only the
 * exact saved reader allowlist. No live project reads, external assets, script,
 * owner links, form fields or simulation arrays are added. */
export async function renderReportPdf(snapshot: RecipientSnapshot): Promise<Buffer> {
  const json = JSON.stringify(snapshot);
  if (Buffer.byteLength(json) > 2_000_000 || !snapshot.reports.length || snapshot.reports.length > 2) throw new ReportPdfError("This report is too large for direct PDF export. Use the saved print view instead.");
  // Never silently replace an original quote character with a missing-glyph box.
  const check = (v: unknown): void => {
    if (typeof v === "string") for (const c of v) {
      if (/\s/u.test(c)) continue;
      if (!("hasGlyphForCodePoint" in glyphs) || !("hasGlyphForCodePoint" in boldGlyphs) || !glyphs.hasGlyphForCodePoint(c.codePointAt(0)!) || !boldGlyphs.hasGlyphForCodePoint(c.codePointAt(0)!)) throw new ReportPdfError("This report contains a character not supported by the PDF font. Use the saved print view to preserve the original text.");
    }
    else if (Array.isArray(v)) v.forEach(check);
    else if (v && typeof v === "object") Object.values(v).forEach(check);
  };
  check(snapshot);
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 64, bottom: 58, left: 48, right: 48 }, bufferPages: true, font: regularPath,
    info: { Title: "Signal - saved leadership report", Author: "Signal", Subject: `Private frozen report. Font license:\n${license}` } });
  doc.registerFont("Regular", regular); doc.registerFont("Bold", bold);
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => { doc.on("data", c => chunks.push(c)); doc.on("error", reject); doc.on("end", () => resolve(Buffer.concat(chunks))); });
  let pageCount = 1, currentMode = "PRIVATE SAVED SNAPSHOT";
  const pageModes = [currentMode];
  doc.on("pageAdded", () => { pageModes.push(currentMode); if (++pageCount > 200) throw new ReportPdfError("This report exceeds the direct PDF page limit. Use the saved print view instead."); });
  const ink = "#17243A", muted = "#4C5D73", accent = "#226CC2";
  const ensure = (height: number) => { if (doc.y + height > 734) doc.addPage(); };
  const text = (value: string, small = false) => { doc.font("Regular").fontSize(small ? 8.5 : 10).fillColor(small ? muted : ink).text(value, 48, doc.y, { width: 516, lineGap: 3, paragraphGap: 4 }); doc.moveDown(0.5); };
  const heading = (value: string, major = false) => { ensure(70); doc.moveDown(0.5); doc.font("Bold").fontSize(major ? 22 : 14).fillColor(major ? ink : accent).text(value, 48, doc.y, { width: 516, lineGap: 2 }); doc.moveDown(0.5); };
  const item = (title: string, body: string) => { ensure(45); doc.font("Bold").fontSize(10).fillColor(ink).text(title, 48, doc.y, { width: 516 }); doc.moveDown(0.3); text(body); };
  const quote = (value: string) => { ensure(44); text("Original quote:", true); text(value); };
  try {
    heading("Signal / Leadership brief", true);
    text("Private, frozen report. No live project access. A downloaded copy cannot be revoked; keep it private and share only with approved recipients.");
    text("Planning targets, modeled outcomes and commitments are different. Percentages describe simulated runs conditional on the captured inputs, not a calibrated real-world probability.", true);
    if (snapshot.reports.length === 2) {
      heading("Reality vs. what-if");
      text("The Scenario is hypothetical. It has not changed accepted Reality.");
      for (const r of snapshot.reports) item(r.mode.toUpperCase(), `P50 ${date(r.outcome.likely)} | P10-P90 ${date(r.outcome.earliest)} to ${date(r.outcome.latest)} | planning target ${date(r.target)} | ${r.targetFrequency === null ? "target frequency unavailable" : `${r.targetFrequency}% of simulated runs at target`}`);
    }
    for (const [index, r] of snapshot.reports.entries()) {
      currentMode = r.mode === "scenario" ? "SCENARIO (WHAT-IF) / PRIVATE" : "REALITY / PRIVATE";
      if (index) doc.addPage();
      else pageModes[pageModes.length - 1] = currentMode;
      heading(`${r.project} / ${r.mode === "scenario" ? "Scenario (what-if)" : "Reality"}`, true);
      text(`Captured ${date(r.generatedAt)}. Report ${r.reportId}.`, true);
      heading("1. Delivery outlook");
      item("P50 modeled outcome", `${date(r.outcome.likely)}. P10-P90: ${date(r.outcome.earliest)} to ${date(r.outcome.latest)}.`);
      item("Planning target and commitment", `${date(r.target)}. ${r.commitment.label} Commitment status: ${r.commitment.status}; commitment date: ${date(r.commitment.date)}.`);
      text(`Commitment source: ${r.commitment.source.owner}; as of ${date(r.commitment.source.asOf)}.`, true);
      text(`Simulated runs at target: ${r.targetFrequency === null ? "unavailable" : `${r.targetFrequency}%`}. ${r.reason}`);
      if (r.movement) text(`Compared with the report's saved baseline: ${r.movement.days === 0 ? "no date change" : `${Math.abs(r.movement.days)} days ${r.movement.days < 0 ? "earlier" : "later"}`}.`);
      r.assumptions.forEach(a => item(a.label, a.detail));
      if (!r.assumptions.length) text("No assumptions captured in this historical report.");
      heading("2. Scope and remaining work");
      text(`${r.scope.tickets} tracked tickets. Remaining effort: ${range(r.scope.effort)} days (low / likely / high). Effort days are not elapsed delivery time; capacity, concurrency and dependencies affect the forecast.`);
      if (r.scope.estimateQuality) text(`${r.scope.estimateQuality.placeholderEffortSharePct}% of captured effort came from placeholder estimates.`);
      r.evidence?.capabilities.forEach(c => text(`${c.name}: ${c.excluded ? "removed in this Scenario" : "accepted at report generation"}.`));
      if (!r.estimates.length) text("No separate capability estimate receipts captured; the saved ticket rollup remains the basis.");
      r.estimates.forEach(e => {
        item(e.name, `${e.authority}. ${e.basis}. ${e.usedInSimulation === false ? "Evidence only; ticket rollup used." : e.usedInSimulation === true ? "Used in the captured simulation." : "Historical estimate; explicit usage flag not recorded."}`);
        text(`Range: ${e.range ? `${range(e.range)} developer-days` : "not captured"}. Source date: ${date(e.sourceDate)}. Raw assertion: ${e.rawAssertion}`);
        text(`Covered tickets: ${e.coveredItemIds.join(", ") || "none recorded"}. Additional tickets retained separately: ${e.additionalItemIds.join(", ") || "none recorded"}.`);
        if (e.quote) quote(e.quote); else text("Operator judgment; no transcript quote asserted.");
        if (e.interpretation) text(e.interpretation);
        if (e.review) text(`${e.review} Reviewer: ${e.reviewer ?? "not recorded"}. Reviewed: ${date(e.reviewedAt)}.`);
        text(`Captured snapshot: ${e.snapshot || "not recorded"}.`, true);
      });
      heading("3. People and capacity");
      text(`${num(r.capacity.forecastFte)} effective FTE used in the forecast. Named capacity: ${r.capacity.availability}.`);
      r.capacity.people.forEach(p => text(`${p.name}: ${num(p.effectiveFte)} effective FTE at the captured baseline.`));
      if (r.capacityPhases.length) {
        text(`Saved forecast start: ${date(r.forecastStart)}. Phased moves are explicit planning assumptions, not confirmed moves.`);
        r.capacityPhases.forEach(p => text(`From ${r.forecastStart && Number.isFinite(Date.parse(r.forecastStart)) ? date(new Date(Date.parse(r.forecastStart) + p.startDay * 86400_000).toISOString()) : "start date not captured"} (day ${p.startDay}): ${num(p.teamCapacity)} FTE.`));
      }
      heading("4. Choices, dependencies and asks");
      if (!r.asks.length) text("No operator-confirmed leadership asks captured.");
      r.asks.forEach(a => item(a.label, `${a.owner ?? "Owner not recorded"}. Needed ${date(a.neededBy)}.`));
      r.decisions.forEach(d => item(d.title, `${d.status}; ${d.owner ?? "owner not recorded"}; needed ${date(d.neededBy)}. ${d.gated ? `Modeled delay: ${range(d.delay)} days.` : "No modeled delay attached."}`));
      if (!r.decisions.length) text("No decision records captured.");
      r.dependencies.forEach(d => item(d.name, `P50 ${date(d.likelyDate)}; ${d.currentness} at generation. Own work may proceed concurrently; completion cannot precede the dependency's completion.`));
      if (!r.dependencies.length) text("No declared dependency finish floors captured.");
      heading("5. Timeline snapshot");
      text("Accepted plans and landmarks at generation. They do not themselves schedule resources or change the forecast.");
      if (!r.schedule) text("Full schedule was not captured in this historical report.");
      else if (!r.schedule.length) text("No accepted schedule landmarks recorded.");
      else {
        const times = r.schedule.flatMap(e => [Date.parse(e.date), Date.parse(e.endDate ?? e.date)]).filter(Number.isFinite);
        const min = Math.min(...times), max = Math.max(...times), span = Math.max(86400_000, max - min);
        if (times.length) text(`Shared timeline scale: ${date(new Date(min).toISOString())} to ${date(new Date(max).toISOString())}. Bars show dated spans; dots show landmarks.`, true);
        r.schedule.forEach(e => {
          ensure(95); item(e.title, `${date(e.date)}${e.endDate ? ` to ${date(e.endDate)}` : ""}. ${e.state}; ${e.meaning}.`);
          const start = Date.parse(e.date), end = Date.parse(e.endDate ?? e.date);
          if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
            ensure(25); const y = doc.y + 5;
            doc.save().strokeColor("#DDE6F0").lineWidth(5).moveTo(50, y).lineTo(560, y).stroke();
            const x = 50 + (start - min) / span * 510, width = (end - start) / span * 510;
            if (width > 0) doc.strokeColor(accent).moveTo(x, y).lineTo(x + width, y).stroke();
            else doc.fillColor(accent).circle(x, y, 3).fill();
            doc.restore(); doc.y += 18;
          }
          text(`Schedule source: ${e.source}`, true);
          e.evidence.forEach(q => { quote(q.quote); text(`Source: ${q.source}. Passage: ${q.passage}.`, true); });
          if (!e.evidence.length) text("No exact passage captured for this landmark.", true);
        });
      }
      heading("6. Evidence you can inspect");
      text("Original passages captured at acceptance. They are not automatically proof of today's status or of an operator-entered numerical estimate.");
      if (!r.evidence) text("Scope evidence was not captured in this older report and has not been backfilled.");
      r.evidence?.capabilities.forEach(c => {
        item(c.name, c.excluded ? "Removed in Scenario; historical evidence only." : "Accepted at report generation.");
        if (!c.references.length) text("No evidence references recorded.");
        c.references.forEach(q => {
          if (q.quote === null) { text("Reference only; no verified captured quote."); return; }
          quote(q.quote);
          text(`Source: ${q.source}. Source date: ${q.sourceDate ?? "not recorded"}. Accepted: ${q.acceptedAt}.`, true);
          text(`Snapshot: ${q.snapshot}. Evidence: ${q.evidenceId}. Locator: ${JSON.stringify(q.locator)}`, true);
        });
      });
      heading("7. Limits and source freshness");
      r.caveats.forEach(c => item(c.code, c.message));
      [...new Set(r.sourceWarnings)].forEach(w => text(w));
      r.sources.forEach(s => text(`${s.owner}: ${s.currentness} at generation; source as of ${date(s.asOf)}. ${s.note ?? ""}`));
      text(`Saved report: ${r.reportId}\nFingerprint: ${r.fingerprint}`, true);
    }
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.font("Regular").fontSize(8).fillColor(muted).text(`SIGNAL / ${pageModes[i]}`, 48, 30, { lineBreak: false });
      doc.moveTo(48, 46).lineTo(564, 46).strokeColor("#DDE6F0").lineWidth(0.5).stroke();
      doc.text(`Page ${i + 1} of ${pages.count} | Frozen facts, not a live report`, 48, 754, { lineBreak: false });
    }
    doc.end();
  } catch (error) { doc.destroy(error instanceof Error ? error : new Error("PDF generation failed")); }
  return result;
}
