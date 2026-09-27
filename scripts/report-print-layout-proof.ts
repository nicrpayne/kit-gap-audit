import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = "http://127.0.0.1:4317";
const output = resolve("../signal-acceptance-2026-09-25/repair-execution/print-layout-fixtures");
async function main() {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results: unknown[] = [];
  try {
    for (const [name, path] of [["audience-fixture", "/reports/composer/fixture/print"], ["decision-fixture", "/reports/fixture/print"]]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200);
      await page.evaluate(() => document.fonts.ready);
      assert.match(await page.locator("body").innerText(), /JSA/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `${name} has horizontal screen overflow`);
      await page.screenshot({ path: `${output}/${name}-desktop.png`, fullPage: true });
      await page.pdf({ path: `${output}/${name}.pdf`, format: "A4", printBackground: true,
        margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" }, displayHeaderFooter: true,
        headerTemplate: '<div style="font-size:8px;width:100%;text-align:center">SYNTHETIC FIXTURE — layout test only, not a project report</div>',
        footerTemplate: '<div style="font-size:8px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
      assert.deepEqual(pageErrors, []);
      results.push({ name, response: response?.status(), pageErrors, overflow, fixtureOnly: true });
      await page.close();
    }
  } finally { await browser.close(); }
  await writeFile(`${output}/proof.json`, JSON.stringify({ generatedAt: new Date().toISOString(), results, limitation: "Local dev fixture pages only. Not database, production-build, real-data or immutable-pair acceptance. Every PDF page requires visual review." }, null, 2));
  console.log(JSON.stringify(results));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
