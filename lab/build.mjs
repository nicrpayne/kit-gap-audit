import { build } from "esbuild";
import { readFileSync, writeFileSync } from "fs";
const pages = [
  ["p0", "0 · CURRENT SIGNAL (control)"],
  ["pb", "B · ANCHORED D3-FORCE"],
  ["pa", "A · ANTV G6 HYBRID"],
  ["pc", "C · REACT-FORCE-GRAPH-2D"],
  ["pb2", "B2 · ANCHORED FORCE"],
  ["pb3", "B3 · LOCAL BLOOM"],
];
const shell = readFileSync("shell.html", "utf8");
for (const [id, name] of pages) {
  try {
    await build({ entryPoints: [`src/${id}.js`], bundle: true, outfile: `${id}.bundle.js`, format: "esm", target: "es2022", logLevel: "error", loader: { ".js": "js" } });
    writeFileSync(`${id}.html`, shell.replace("__TITLE__", name).replace("__NAME__", name).replace("__BUNDLE__", `${id}.bundle.js`));
    console.log("built", id);
  } catch (e) {
    console.log("skip ", id, "—", String(e.message ?? e).split("\n")[0].slice(0, 90));
  }
}
