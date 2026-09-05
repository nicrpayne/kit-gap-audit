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
  body.signal-audit-embedded {
    --signal-widget: linear-gradient(180deg, rgba(31,39,45,.94), rgba(19,25,29,.94));
    --signal-widget-border: rgba(83,100,111,.52);
    --signal-cyan: #46c3d6;
    --signal-violet: #9d7bea;
    --signal-amber: #f5a623;
  }
  body.signal-audit-embedded #fab-menu,
  body.signal-audit-embedded #fab-legend,
  body.signal-audit-embedded #brain-panel,
  body.signal-audit-embedded #brain-legend,
  body.signal-audit-embedded #brain-card,
  body.signal-audit-embedded #signal-search-widget,
  body.signal-audit-embedded #signal-inspector-overview,
  body.signal-audit-embedded #signal-inspector-reopen {
    background: var(--signal-widget) !important;
    border: 1px solid var(--signal-widget-border) !important;
    border-top-color: rgba(115,133,144,.48) !important;
    border-radius: 10px !important;
    box-shadow: 0 14px 36px rgba(0,0,0,.36), 0 1px 0 rgba(255,255,255,.045) inset !important;
    color: #dfe4f2;
    backdrop-filter: blur(16px);
  }
  body.signal-audit-embedded #fab-menu { top: 12px; left: 12px; right: auto; color: #aeb8c0; padding: 9px 13px; }
  body.signal-audit-embedded #fab-menu:hover,
  body.signal-audit-embedded.menu-open #fab-menu { color: var(--signal-cyan); border-color: rgba(70,195,214,.5) !important; }
  body.signal-audit-embedded #brain-panel { top: 54px; left: 12px; right: auto; width: 310px; max-height: calc(100vh - 66px); margin-top: 0; }
  body.signal-audit-embedded #signal-search-widget { position: fixed; z-index: 72; top: 12px; right: 416px; width: min(286px, calc(100vw - 456px)); min-width: 246px; padding: 10px; transition: right .16s ease, width .16s ease; }
  body.signal-audit-embedded.signal-inspector-closed #signal-search-widget { right: 12px; width: 286px; }
  body.signal-audit-embedded #signal-search-widget #brain-results { top: 38px; }
  body.signal-audit-embedded #fab-legend { bottom: 12px; left: 12px; color: #aeb8c0; padding: 9px 13px; }
  body.signal-audit-embedded.lg-open #fab-legend { color: var(--signal-cyan); border-color: rgba(70,195,214,.5) !important; }
  body.signal-audit-embedded #brain-legend { left: 12px; bottom: 54px; width: min(480px, calc(100vw - 24px)); max-height: 54vh; }
  body.signal-audit-embedded #brain-card,
  body.signal-audit-embedded #signal-inspector-overview {
    position: fixed;
    z-index: 74;
    top: 12px;
    right: 12px;
    bottom: 12px;
    left: auto;
    width: min(392px, calc(100vw - 24px));
    min-width: 340px;
    max-height: none;
    overflow-y: auto;
    padding: 14px;
  }
  body.signal-audit-embedded #brain-card { animation: signal-dock-in .18s ease-out both; }
  body.signal-audit-embedded #brain-card .card-neigh { max-height: none; }
  body.signal-audit-embedded .signal-inspector-label { color: var(--signal-cyan); font: 600 9px/1 Outfit,sans-serif; letter-spacing: .16em; text-transform: uppercase; margin-bottom: 9px; }
  body.signal-audit-embedded .signal-trace-badge { display: inline-block; margin-left: 7px; padding: 3px 6px; border-radius: 4px; color: var(--signal-cyan); background: rgba(70,195,214,.12); box-shadow: 0 0 0 1px rgba(70,195,214,.2), 0 0 22px rgba(70,195,214,.13); }
  body.signal-audit-embedded #signal-inspector-overview h2 { margin-top: 9px; font: 600 18px/1.2 Outfit,sans-serif; }
  body.signal-audit-embedded #signal-overview-close { border: 0; background: transparent; color: #697780; cursor: pointer; font: 400 19px/1 Outfit,sans-serif; }
  body.signal-audit-embedded #signal-overview-close:hover { color: #dfe4f2; }
  body.signal-audit-embedded #signal-inspector-overview p { margin-top: 10px; color: #8b93ad; font: 500 11px/1.55 Outfit,sans-serif; }
  body.signal-audit-embedded #signal-inspector-overview .signal-overview-counts { margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(160,175,215,.16); color: #aeb8c0; font: 500 11px/1.7 Outfit,sans-serif; }
  body.signal-audit-embedded #signal-inspector-reopen { position: fixed; z-index: 74; top: 12px; right: 12px; padding: 10px 12px; cursor: pointer; color: var(--signal-cyan); font: 600 10px/1.2 Outfit,sans-serif; letter-spacing: .12em; text-transform: uppercase; }
  body.signal-audit-embedded[data-signal-trace-active="true"] #brain-card { border-color: rgba(70,195,214,.38) !important; }
  body.signal-audit-embedded:has(#brain-viewer.open) #fab-menu,
  body.signal-audit-embedded:has(#brain-viewer.open) #signal-search-widget { display: none !important; }
  body.signal-audit-embedded #brain-viewer .v-close { margin-right: 32px; }
  @keyframes signal-dock-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
  @media (max-width: 1180px) {
    body.signal-audit-embedded #brain-card,
    body.signal-audit-embedded #signal-inspector-overview { width: 352px; }
    body.signal-audit-embedded #signal-search-widget { right: 376px; width: 258px; min-width: 220px; }
  }
  @media (prefers-reduced-motion: reduce) {
    body.signal-audit-embedded #brain-card { animation: none; }
  }
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
