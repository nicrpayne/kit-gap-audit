// PHASE 3: keep the accepted Rubric document and skin, then serve the one
// guarded core extension required by Signal's Reality-distance law. Phase 2's
// adapter/action/Search/Trace host remains the semantic boundary.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { SIGNAL_AUDIT_EMBEDDED_THEME } from "@/lib/visual-system/auditEmbeddedTheme";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const source = await readFile(join(process.cwd(), "public/audit-rubric-phase1/index.html"), "utf8");
  const embedded = req.nextUrl.searchParams.get("embedded") === "1";
  const phaseThreeStyle = `
<style id="signal-phase3-style">
  ${SIGNAL_AUDIT_EMBEDDED_THEME}
  [data-sec="view"], .p-actions #btn-expand, .p-actions #btn-collapse, .p-actions #btn-rescan, .p-actions #btn-bake,
  .v-open, .v-copy { display: none !important; }
  .p-actions #btn-reset { display: inline-block !important; }
  #signal-audit-nav { position: fixed; z-index: 92; top: 14px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 7px 12px; border: 1px solid var(--signal-border-strong); background: var(--signal-widget-fill); backdrop-filter: blur(10px); color: var(--signal-text-primary); font: 600 11px Outfit,sans-serif; letter-spacing: 1.2px; text-transform: uppercase; }
  #signal-audit-nav a { color: var(--signal-source); text-decoration: none; }
  #signal-audit-nav .scope { color: var(--signal-text-tertiary); }
  #signal-audit-nav button { min-height: 32px; border: 1px solid var(--signal-border-strong); background: var(--signal-surface-raised); color: var(--signal-text-primary); padding: 3px 7px; cursor: pointer; font: inherit; letter-spacing: inherit; text-transform: inherit; }
  #signal-search-clear { position: absolute; right: 4px; top: 3px; display: none; min-width: 32px; min-height: 32px; border: 0; background: transparent; color: var(--signal-text-tertiary); cursor: pointer; font-size: 16px; }
  .p-search { position: relative; }
  #signal-trace-overlay { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 32; pointer-events: none; }
  #brain-card, #brain-viewer, #brain-panel, #brain-hud, .fab, #signal-audit-nav { z-index: 70; }
  .signal-basis { opacity: .72; }
  .signal-phase3-line { margin-top: 8px; color: var(--signal-text-secondary); font: 500 10px/1.45 Outfit,sans-serif; }
  .signal-phase3-line strong { color: var(--signal-text-primary); font-weight: 600; }
  .signal-layout-question { margin-top: 6px; color: var(--signal-text-secondary); font: 500 10px/1.35 Outfit,sans-serif; }
  .signal-material-key { margin-top: 12px; border-top: 1px solid var(--signal-border-subtle); padding-top: 10px; color: var(--signal-text-secondary); font: 500 10px/1.65 Outfit,sans-serif; }
  .signal-material-key b { color: var(--signal-text-primary); }
  .signal-swatch { display: inline-block; width: 13px; height: 7px; margin-right: 6px; border-radius: 8px; vertical-align: middle; }
  body.signal-audit-embedded #signal-audit-nav,
  body.signal-audit-embedded #brain-hud { display: none !important; }
  body.signal-audit-embedded {
    --bg: var(--signal-surface-canvas) !important;
    --panel: var(--signal-widget-fill) !important;
    --ink: var(--signal-text-primary) !important;
    --muted: var(--signal-text-secondary) !important;
    --faint: var(--signal-text-tertiary) !important;
    --border: var(--signal-border-subtle) !important;
    --accent: var(--signal-reality) !important;
    --input-bg: var(--signal-surface-recessed) !important;
    --hover: var(--signal-hover-overlay) !important;
    --seg-on-bg: var(--signal-selected-overlay) !important;
    --seg-on-ink: var(--signal-text-primary) !important;
  }
  body.signal-audit-embedded #fab-menu,
  body.signal-audit-embedded #fab-legend,
  body.signal-audit-embedded #brain-panel,
  body.signal-audit-embedded #brain-legend,
  body.signal-audit-embedded #brain-card,
  body.signal-audit-embedded #signal-search-widget,
  body.signal-audit-embedded #signal-inspector-overview,
  body.signal-audit-embedded #signal-inspector-reopen {
    background: var(--signal-widget-fill) !important;
    border: 1px solid var(--signal-border-strong) !important;
    border-radius: 8px !important;
    box-shadow: var(--signal-widget-shadow) !important;
    color: var(--signal-text-primary);
    backdrop-filter: blur(10px);
  }
  body.signal-audit-embedded #fab-menu { top: 12px; left: 12px; right: auto; min-height: 32px; color: var(--signal-text-secondary); padding: 9px 13px; }
  body.signal-audit-embedded #fab-menu:hover,
  body.signal-audit-embedded.menu-open #fab-menu { color: var(--signal-reality); border-color: var(--signal-border-selected) !important; box-shadow: inset 0 0 0 1px var(--signal-border-selected), 0 0 0 3px var(--signal-selected-overlay) !important; }
  body.signal-audit-embedded #brain-panel { top: 54px; left: 12px; right: auto; width: 310px; max-height: calc(100vh - 66px); margin-top: 0; }
  body.signal-audit-embedded #signal-search-widget { position: fixed; z-index: 72; top: 12px; right: 416px; width: min(286px, calc(100vw - 456px)); min-width: 246px; padding: 10px; transition: right .16s ease, width .16s ease; }
  body.signal-audit-embedded.signal-inspector-closed #signal-search-widget { right: 12px; width: 286px; }
  body.signal-audit-embedded #signal-search-widget #brain-results { top: 38px; }
  body.signal-audit-embedded #fab-legend { bottom: 12px; left: 12px; min-height: 32px; color: var(--signal-text-secondary); padding: 9px 13px; }
  body.signal-audit-embedded.lg-open #fab-legend { color: var(--signal-reality); border-color: var(--signal-border-selected) !important; box-shadow: inset 0 0 0 1px var(--signal-border-selected), 0 0 0 3px var(--signal-selected-overlay) !important; }
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
  body.signal-audit-embedded .signal-inspector-label { color: var(--signal-reality); font: 600 10px/1 Outfit,sans-serif; letter-spacing: .16em; text-transform: uppercase; margin-bottom: 9px; }
  body.signal-audit-embedded .signal-trace-badge { display: inline-block; margin-left: 7px; padding: 3px 6px; border-radius: 4px; color: var(--signal-reality); background: var(--signal-reality-soft); box-shadow: 0 0 0 1px var(--signal-reality); }
  body.signal-audit-embedded #signal-inspector-overview h2 { margin-top: 9px; font: 600 18px/1.2 Outfit,sans-serif; }
  body.signal-audit-embedded #signal-overview-close { min-width: 32px; min-height: 32px; border: 0; background: transparent; color: var(--signal-text-tertiary); cursor: pointer; font: 400 19px/1 Outfit,sans-serif; }
  body.signal-audit-embedded #signal-overview-close:hover { color: var(--signal-text-primary); }
  body.signal-audit-embedded #signal-inspector-overview p { margin-top: 10px; color: var(--signal-text-secondary); font: 500 11px/1.55 Outfit,sans-serif; }
  body.signal-audit-embedded #signal-inspector-overview .signal-overview-counts { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--signal-border-subtle); color: var(--signal-text-secondary); font: 500 11px/1.7 Outfit,sans-serif; }
  body.signal-audit-embedded #signal-inspector-reopen { position: fixed; z-index: 74; top: 12px; right: 12px; min-height: 32px; padding: 10px 12px; cursor: pointer; color: var(--signal-reality); font: 600 10px/1.2 Outfit,sans-serif; letter-spacing: .12em; text-transform: uppercase; }
  body.signal-audit-embedded[data-signal-trace-active="true"] #brain-card { border-color: var(--signal-reality) !important; }
  body.signal-audit-embedded #brain-search,
  body.signal-audit-embedded .seg button,
  body.signal-audit-embedded .act,
  body.signal-audit-embedded .nrow { min-height: 32px; }
  body.signal-audit-embedded .res { min-height: 32px; }
  body.signal-audit-embedded .seg button.on { border-color: var(--signal-border-selected); box-shadow: inset 0 0 0 1px var(--signal-border-selected); }
  body.signal-audit-embedded :focus-visible { outline: 2px solid var(--signal-focus-ring) !important; outline-offset: 2px; }
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
    body.signal-audit-embedded #signal-search-widget,
    body.signal-audit-embedded .fab,
    body.signal-audit-embedded .act,
    body.signal-audit-embedded .seg button { transition-duration: .001ms !important; }
  }
  @media (forced-colors: active) {
    body.signal-audit-embedded #fab-menu,
    body.signal-audit-embedded #fab-legend,
    body.signal-audit-embedded #brain-panel,
    body.signal-audit-embedded #brain-legend,
    body.signal-audit-embedded #brain-card,
    body.signal-audit-embedded #signal-search-widget,
    body.signal-audit-embedded #signal-inspector-overview { border-color: CanvasText !important; }
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
