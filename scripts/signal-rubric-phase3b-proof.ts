// Phase 3B bridge-hardening proof. This is read-only and performs no writes.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

let failures = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
};
const read = (path: string) => readFileSync(path, "utf8");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

for (const file of ["_core.js", "_flows2.js", "_core.css", "_icons.js"]) {
  check(`protected ${file} remains byte-identical`,
    sha(`public/audit-rubric-phase1/${file}`) === sha(`lab/rubric-reference/second-brain/public/${file}`));
}

const host = read("public/audit-rubric-phase2/phase2-host.js");
const phase3Host = read("public/audit-rubric-phase3/phase3-host.js");
const adapter = read("lib/audit/signalRubricAdapter.ts");
const world = read("components/audit/AuditWorld.tsx");
const overlay = read("components/audit/AuditFindingOverlay.tsx");
const retiredInstrument = read("components/audit/AuditInstrument.tsx");

check("source cards use explicit idempotence markers",
  host.includes("actions.dataset.signalPatched === 'true'")
    && host.includes("actions.dataset.signalPatched = 'true'")
    && !host.includes("['Open on device', 'Copy path', 'Remove', 'Edit']"));
check("source counts state linked-object semantics",
  adapter.includes("linkedObjects") && adapter.includes("worldLabel: `${provider} · ${sourceCounts.linkedObjects} linked`")
    && phase3Host.includes("counted(n.sourceCounts.linkedObjects, 'linked object')"));
check("Finding View here crosses only the Audit-local bridge",
  host.includes("signal-audit-open-finding") && world.includes("setFindingReviewId(message.canonicalId)"));
check("Finding overlay reuses existing governed UI and action rules",
  overlay.includes('import FindingInspector from "./FindingInspector"')
    && overlay.includes('import AuditReviewConsole')
    && overlay.includes("dispatchFindingAction(action.id, finding.id, text)"));
check("old and new Audit surfaces share one Finding action dispatcher",
  retiredInstrument.includes("dispatchFindingAction(action.id, selectedFinding.id, text)")
    && overlay.includes("dispatchFindingAction(action.id, finding.id, text)"));
check("detail close cannot replace or reframe the Rubric world",
  world.includes("onClose={() => setFindingReviewId(null)}")
    && !overlay.includes("frameRef") && !overlay.includes("fitToView") && !overlay.includes("resetView"));
check("canonical refresh preserves selection across presentation-role changes",
  host.includes("const selectedId = window.BrainCore.S.sel")
    && host.includes("const selectedCanonicalId = window.BrainCore.S.sel")
    && host.includes("n.canonicalId === selectedCanonicalId")
    && host.includes("window.BrainCore.S.byId.get(selectedId)")
    && !host.includes("fitToView") && !host.includes("resetView"));
check("starting Search clears a stale Trace before navigation",
  host.includes("if (!input.value.trim()) return;")
    && host.includes("trace = null;\n      remember();"));
check("presentation echoes inherit only their canonical Trace path",
  adapter.includes("if (!node.presentationOnly || !node.canonicalId) continue;")
    && adapter.includes("traceByNode[node.id] = traceByNode[canonicalTransportId]"));

if (failures) throw new Error(`${failures} Phase 3B proof failure${failures === 1 ? "" : "s"}`);
console.log("\nSignal Rubric Phase 3B bridge-hardening proof passed.");
