import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { POST } from "../app/api/parse-spreadsheet/route";

const require = createRequire(import.meta.url);

async function main() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Delivery");
  sheet.addRow(["Feature", "Remaining", "Note"]);
  sheet.addRow(["Offline", 2, { richText: [{ text: "Ready " }, { text: "for review" }] }]);
  sheet.addRow(["Maps", { formula: "1+2", result: 3 }, { text: "Source", hyperlink: "https://example.com/source" }]);
  sheet.addRow([new Date("2026-10-07T00:00:00Z"), { error: "#DIV/0!" }]);
  sheet.mergeCells("A5:C5"); sheet.getCell("A5").value = "One merged heading";
  // Extended data bars exercise ExcelJS's sole uuid call (v4, CommonJS).
  sheet.addConditionalFormatting({ ref: "B2:B3", rules: [{ type: "dataBar", priority: 1,
    cfvo: [{ type: "min" }, { type: "max" }], gradient: false }] });
  const second = workbook.addWorksheet("Other"); second.addRow(["Preserved", true]);
  const bytes = await workbook.xlsx.writeBuffer();
  const form = new FormData(); form.set("file", new File([new Uint8Array(bytes)], "fixture.xlsx"));
  const response = await POST(new NextRequest("http://localhost/api/parse-spreadsheet", { method: "POST", body: form }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.sheets, [
    { name: "Delivery", text: "Feature | Remaining | Note\nOffline | 2 | Ready for review\nMaps | 3 | Source\n2026-10-07 | \nOne merged heading |  | " },
    { name: "Other", text: "Preserved | true" },
  ]);
  for (const malformed of [new FormData(), (() => { const f = new FormData(); f.set("file", new File(["not xlsx"], "bad.xlsx")); return f; })()]) {
    assert.equal((await POST(new NextRequest("http://localhost/api/parse-spreadsheet", { method: "POST", body: malformed }))).status, 400);
  }
  const { deepmerge } = require("deepmerge-ts");
  assert.deepEqual(deepmerge({ datasource: { url: "fixture" }, migrations: { path: "one" } }, { migrations: { seed: "two" } }),
    { datasource: { url: "fixture" }, migrations: { path: "one", seed: "two" } });
  const a: Record<string, unknown> = {}; a.self = a;
  const b: Record<string, unknown> = {}; b.self = b;
  const merged = deepmerge(a, b); assert.equal(merged.self, merged);
  const { loadConfigFromFile } = require("@prisma/config");
  const config = await loadConfigFromFile({ configRoot: process.cwd() });
  assert(!config.error, "Prisma's actual configuration loader works with patched merge dependency");
  const postcss = require("postcss");
  const nested = require("postcss-nested");
  const autoprefixer = require("autoprefixer");
  const css = await postcss([nested(), autoprefixer({ overrideBrowserslist: ["Safari 15"] })])
    .process(".card { & > .label:hover { user-select: none; } }", { from: undefined });
  assert.match(css.css, /\.card > \.label:hover/);
  assert.match(css.css, /-webkit-user-select/);
  const parser = require("postcss-selector-parser");
  assert.equal(parser().processSync(".card:is(.open, .done) > button[data-action]"), ".card:is(.open, .done) > button[data-action]");
  const sharp = require("sharp");
  const image = await sharp({ create: { width: 16, height: 12, channels: 4, background: "#40c8d8" } }).png().toBuffer();
  const resized = await sharp(image).resize(8).webp().toBuffer();
  const meta = await sharp(resized).metadata(); assert.equal(meta.width, 8); assert.equal(meta.height, 6);
  const { nanoid } = require("nanoid"); assert.equal(nanoid().length, 21);
  console.log("PASS dependency compatibility: spreadsheet route + CF uuid + malformed uploads; Prisma config + cyclic merge; nested CSS + selectors; native image conversion; IDs");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
