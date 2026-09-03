// PHASE 2: the literal Phase 1 Rubric document, with only an Audit-local data,
// label, action, Search, and Trace host added around it. The four supplied
// Rubric runtime files are served from the accepted Phase 1 directory and are
// not copied or modified.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const source = await readFile(join(process.cwd(), "public/audit-rubric-phase1/index.html"), "utf8");
  const phaseTwoStyle = `
<style id="signal-phase2-style">
  [data-sec="view"], .p-actions #btn-expand, .p-actions #btn-collapse, .p-actions #btn-rescan, .p-actions #btn-bake,
  .v-open, .v-copy { display: none !important; }
  .p-actions #btn-reset { display: inline-block !important; }
  #signal-audit-nav { position: fixed; z-index: 92; top: 14px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 7px 12px; border: 1px solid rgba(160,175,215,.22); background: rgba(5,6,13,.82); backdrop-filter: blur(12px); color: #dfe4f2; font: 600 11px Outfit,sans-serif; letter-spacing: 1.2px; text-transform: uppercase; }
  #signal-audit-nav a { color: #ff944d; text-decoration: none; }
  #signal-audit-nav .scope { color: #8b93ad; }
  #signal-search-clear { position: absolute; right: 7px; top: 7px; display: none; border: 0; background: transparent; color: #8b93ad; cursor: pointer; font-size: 16px; }
  .p-search { position: relative; }
  #signal-trace-overlay { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 32; pointer-events: none; }
  #brain-card, #brain-viewer, #brain-panel, #brain-hud, .fab, #signal-audit-nav { z-index: 70; }
  .signal-basis { opacity: .72; }
</style>`;
  const html = source
    .replace("<head>", '<head>\n<base href="/audit-rubric-phase1/">')
    .replace("<title>Your Second Brain</title>", "<title>Signal Audit World · Phase 2</title>")
    .replace('<script src="phase1-host.js"></script>', '<script src="/audit-rubric-phase2/phase2-host.js"></script>')
    .replace("</head>", `${phaseTwoStyle}\n</head>`);
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
