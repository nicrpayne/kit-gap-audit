// PHASE 3: keep the accepted Rubric document and skin, then serve the one
// guarded core extension required by Signal's Reality-distance law. Phase 2's
// adapter/action/Search/Trace host remains the semantic boundary.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const source = await readFile(join(process.cwd(), "public/audit-rubric-phase1/index.html"), "utf8");
  const embedded = req.nextUrl.searchParams.get("embedded") === "1";
  const phaseThreeStyle = `
<style id="signal-phase3-style">
  [data-sec="view"], .p-actions #btn-expand, .p-actions #btn-collapse, .p-actions #btn-rescan, .p-actions #btn-bake,
  .v-open, .v-copy { display: none !important; }
  .p-actions #btn-reset { display: inline-block !important; }
  #signal-audit-nav { position: fixed; z-index: 92; top: 14px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 7px 12px; border: 1px solid rgba(160,175,215,.22); background: rgba(5,6,13,.82); backdrop-filter: blur(12px); color: #dfe4f2; font: 600 11px Outfit,sans-serif; letter-spacing: 1.2px; text-transform: uppercase; }
  #signal-audit-nav a { color: #ff944d; text-decoration: none; }
  #signal-audit-nav .scope { color: #8b93ad; }
  #signal-audit-nav button { border: 1px solid rgba(160,175,215,.28); background: transparent; color: #dfe4f2; padding: 3px 7px; cursor: pointer; font: inherit; letter-spacing: inherit; text-transform: inherit; }
  #signal-search-clear { position: absolute; right: 7px; top: 7px; display: none; border: 0; background: transparent; color: #8b93ad; cursor: pointer; font-size: 16px; }
  .p-search { position: relative; }
  #signal-trace-overlay { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 32; pointer-events: none; }
  #brain-card, #brain-viewer, #brain-panel, #brain-hud, .fab, #signal-audit-nav { z-index: 70; }
  .signal-basis { opacity: .72; }
  .signal-phase3-line { margin-top: 8px; color: #8b93ad; font: 500 10px/1.45 Outfit,sans-serif; }
  .signal-phase3-line strong { color: #dfe4f2; font-weight: 600; }
  .signal-layout-question { margin-top: 6px; color: #8b93ad; font: 500 10px/1.35 Outfit,sans-serif; }
  .signal-material-key { margin-top: 12px; border-top: 1px solid rgba(160,175,215,.16); padding-top: 10px; color: #8b93ad; font: 500 10px/1.65 Outfit,sans-serif; }
  .signal-material-key b { color: #dfe4f2; }
  .signal-swatch { display: inline-block; width: 13px; height: 7px; margin-right: 6px; border-radius: 8px; vertical-align: middle; }
  body.signal-audit-embedded #signal-audit-nav,
  body.signal-audit-embedded #brain-hud { display: none !important; }
  body.signal-audit-embedded #fab-menu { top: 12px; right: 12px; }
  body.signal-audit-embedded #fab-legend { bottom: 12px; left: 12px; }
  body.signal-audit-embedded:has(#brain-viewer.open) #fab-menu { display: none !important; }
  body.signal-audit-embedded #brain-viewer .v-close { margin-right: 32px; }
</style>`;
  const html = source
    .replace("<head>", '<head>\n<base href="/audit-rubric-phase1/">')
    .replace("<title>Your Second Brain</title>", "<title>Signal Audit World · Phase 3</title>")
    .replace('<script src="phase1-host.js"></script>', '<script src="/audit-rubric-phase2/phase2-host.js"></script>\n<script src="/audit-rubric-phase3/phase3-host.js"></script>')
    .replace('<script src="_core.js"></script>', '<script src="/audit/rubric-phase3/core"></script>')
    .replace("<body>", embedded ? '<body class="signal-audit-embedded">' : "<body>")
    .replace("</head>", `${phaseThreeStyle}\n</head>`);
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
