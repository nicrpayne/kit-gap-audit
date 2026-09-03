// PHASE 1: serve the actual Rubric application directly from an Audit route.
//
// `_core.js`, `_flows2.js`, `_icons.js`, and `_core.css` remain byte-for-byte
// copies of the supplied CC BY 4.0 reference. This route only gives the
// original index a base URL for its static assets. No Signal graph, spatial
// engine, painter, camera, or action code is mounted here.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const source = await readFile(join(process.cwd(), "public/audit-rubric-phase1/index.html"), "utf8");
  const html = source.replace("<head>", '<head>\n<base href="/audit-rubric-phase1/">');
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
