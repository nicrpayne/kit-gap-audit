// Phase 3A integration proof. This script performs no database or network writes.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const read = (path: string) => readFileSync(path, "utf8");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

function main() {
  for (const file of ["_core.js", "_flows2.js", "_core.css", "_icons.js"]) {
    const transplanted = `public/audit-rubric-phase1/${file}`;
    const supplied = `lab/rubric-reference/second-brain/public/${file}`;
    check(`Phase 1 ${file} remains byte-identical`, sha(transplanted) === sha(supplied), sha(transplanted));
  }

  const page = read("app/audit/page.tsx");
  const world = read("components/audit/AuditWorld.tsx");
  const host = read("public/audit-rubric-phase2/phase2-host.js");
  const route = read("app/audit/rubric-phase3/route.ts");
  const rubricApi = read("app/api/audit/rubric/route.ts");
  const graphInputs = read("lib/audit/graphInputs.ts");

  check("/audit mounts AuditWorld", page.includes('import AuditWorld from "@/components/audit/AuditWorld"') && page.includes("<AuditWorld"));
  check("/audit no longer mounts the old AuditInstrument", !page.includes("<AuditInstrument") && !page.includes('from "@/components/audit/AuditInstrument"'));
  check("Signal frame remains thin and world receives all remaining space",
    world.includes('h-[46px]') && world.includes('data-shoot="audit-world-viewport"') && world.includes('className="absolute inset-0 h-full w-full border-0"'));
  check("Rubric iframe source is stable across live context changes",
    world.includes("const frameSrc = useMemo") && world.includes('type: "signal-audit-set-context"') && !world.includes("key={scopeId") && !world.includes("key={auditId"));
  check("live context refresh uses Rubric native refreshData without Fit",
    host.includes("refreshPreservingSelection('Updating Audit context')")
      && host.includes("window.BrainCore.S.refreshData(message)")
      && !host.includes("fitToView") && !host.includes("resetView"));
  check("Run Audit uses the existing canonical pipeline",
    world.includes('fetch("/api/audit"') && world.includes('method: "POST"') && world.includes("sendContext(updated.scope.id, \"\")"));
  check("Run Audit copy protects Reality",
    world.includes("New Findings enter review. Reality does not change automatically."));
  check("history/current context is exposed and forwarded to the adapter",
    rubricApi.includes('mode === "context"') && rubricApi.includes('position: index === 0 ? "current" : index === 1 ? "prior" : "earlier"')
      && host.includes("if (audit) p.set('audit', audit)"));
  check("history lens preserves an honest current canonical frame",
    graphInputs.includes("auditSourceId?: string") && graphInputs.includes("Reality, accepted project structure")
      && graphInputs.includes("sourceId: auditSourceId"));
  check("selected popup remains primary and View here uses Rubric viewer",
    host.includes("button.textContent = labels[button.dataset.act]") && host.includes("view: 'View here'")
      && host.includes("window.BrainCore.openViewer(n.id)"));
  check("deeper viewer overlays the world in embedded mode",
    route.includes("body.signal-audit-embedded:has(#brain-viewer.open)") && route.includes("#brain-viewer .v-close"));
  check("Search stays Signal MiniSearch behind Rubric's surface",
    rubricApi.includes("SignalSearchIndex.build(graph).search(query)") && host.includes("url.pathname === '/api/search'"));
  check("Trace stays on canonical paths",
    host.includes("activateTrace(n.id)") && host.includes("S.meta.traceByNode") && host.includes("Canonical provenance path"));
  check("Phase 3A adds no spatial engine",
    !world.includes("forceSimulation") && !world.includes("computeRingTargets") && !world.includes("targetX") && !world.includes("targetY"));

  if (failures > 0) throw new Error(`${failures} Phase 3A proof failure${failures === 1 ? "" : "s"}`);
  console.log("\nSignal Rubric Phase 3A integration proof passed.");
}

main();
