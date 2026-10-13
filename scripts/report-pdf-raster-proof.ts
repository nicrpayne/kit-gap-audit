import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

type Box = { left: number; top: number; right: number; bottom: number };

function naturalPageOrder(a: string, b: string) {
  const page = (name: string) => Number(name.match(/-(\d+)\.png$/)?.[1] ?? 0);
  return page(a) - page(b);
}

async function darkPixelCount(path: string, box: Box) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 612, `${path} must rasterize at 72 DPI to preserve point coordinates`);
  assert.equal(info.height, 792, `${path} must rasterize at 72 DPI to preserve point coordinates`);
  let count = 0;
  for (let y = box.top; y < box.bottom; y++) {
    for (let x = box.left; x < box.right; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (Math.min(data[offset], data[offset + 1], data[offset + 2]) < 190) count++;
    }
  }
  return count;
}

async function proveChrome(pdfPath: string) {
  const scratch = mkdtempSync(join(tmpdir(), "signal-pdf-raster-"));
  try {
    const rendered = spawnSync("pdftoppm", ["-png", "-r", "72", pdfPath, join(scratch, "page")], {
      encoding: "utf8",
    });
    assert.equal(rendered.status, 0, rendered.stderr || `pdftoppm failed for ${pdfPath}`);
    const pages = readdirSync(scratch).filter((name) => name.endsWith(".png")).sort(naturalPageOrder);
    assert(pages.length > 1, `${pdfPath} must exercise continuation-page chrome`);

    for (const [index, name] of pages.entries()) {
      const path = join(scratch, name);
      // At 72 DPI, PDF points map one-to-one to pixels. These tight regions
      // cover the leftmost word in each repeated line: SIGNAL and Page.
      const headerPrefix = await darkPixelCount(path, { left: 47, top: 29, right: 79, bottom: 42 });
      const footerPrefix = await darkPixelCount(path, { left: 47, top: 753, right: 69, bottom: 766 });
      const bodyInk = await darkPixelCount(path, { left: 47, top: 58, right: 565, bottom: 734 });
      assert(headerPrefix > 25, `${basename(pdfPath)} page ${index + 1} is missing the left edge of its header`);
      assert(footerPrefix > 20, `${basename(pdfPath)} page ${index + 1} is missing the Page prefix in its footer`);
      assert(bodyInk > 100, `${basename(pdfPath)} page ${index + 1} is an unintended blank continuation page`);
    }
    return pages.length;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function main() {
  const output = resolve(process.env.REPORT_PDF_OUTPUT ?? "../outputs/native-pdf-2026-10-08/output/pdf");
  const args = process.argv.slice(2);
  const paths = (args.length ? args : [
    join(output, "fictional-leadership-pair.pdf"),
    join(output, "fictional-long-source-proof.pdf"),
  ]).map((path) => resolve(path));
  for (const path of paths) {
    const pages = await proveChrome(path);
    console.log(`PASS ${basename(path)}: full left header/footer chrome and nonblank body on all ${pages} Poppler-rendered pages`);
  }
  console.log("PASS raster evidence distinguishes PDF geometry from downstream image-preview clipping");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
