import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.SCREENSHOT_DIR ?? "artifacts/reports-interactive-site-v1/screenshots";
const scopeId = process.env.DEMO_SCOPE_ID;
if (!scopeId) throw new Error("DEMO_SCOPE_ID is required");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await context.addCookies([{ name: "kit_session", value: createHash("sha256").update("kit-gap-audit::proof").digest("hex"), domain: "localhost", path: "/" }]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

async function shot(path, name, selector) {
  const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(`${path} returned ${response?.status()}`);
  if (selector) await page.locator(selector).waitFor();
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

await shot("/reports/site-preview/healthy", "healthy-delivery-leadership", "[data-bundle-hash]");
await shot("/reports/site-preview/executive", "executive-compressed", "[data-bundle-hash]");
await shot("/reports/site-preview/incomplete", "incomplete-new-project", 'h1:text-is("Forecast unavailable")');
await shot("/reports/site-preview/stale", "stale-live-owner", 'strong:text-is("Stale owner data.")');
await shot("/reports/site-preview/scenario", "historical-scenario", "[data-bundle-hash]");

await page.route("**/api/forecast?**", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ likelyDate: "2026-11-01T00:00:00.000Z", confidenceAtTarget: 78, forecastSource: { asOf: "2026-09-04T15:00:00.000Z" } }),
}));
await page.goto(`${base}/reports?project=${encodeURIComponent(scopeId)}`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Create interactive site" }).click();
await page.getByRole("dialog", { name: "Create interactive site" }).waitFor();
await page.getByText("Ready to hand off.").waitFor();
await page.screenshot({ path: `${out}/composer-publication-review.png`, fullPage: true });
const modalText = await page.getByRole("dialog", { name: "Create interactive site" }).innerText();
for (const expected of ["Bundle ready", "Exactly what will be shared", "Excluded / private material", "No canonical commitment"]) {
  if (!modalText.includes(expected)) throw new Error(`Composer review missing: ${expected}`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
console.log(JSON.stringify({ screenshots: 6, browserErrors: 0, composerReview: "bundle_ready", externalPublish: "not attempted" }));
await browser.close();
