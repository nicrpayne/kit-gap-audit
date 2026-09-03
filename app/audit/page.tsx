import InstrumentShell from "@/components/instrument/InstrumentShell";
import AuditWorld from "@/components/audit/AuditWorld";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// THE RUBRIC WORLD IS THE AUDIT COMPONENT.
//
// Signal keeps its instrument rail and Audit context bar; AuditWorld owns all
// remaining space. The former graph/inspector implementation stays available
// in source for comparison but is no longer mounted at Audit's real route.
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; rubric?: string; fixture?: string }>;
}) {
  const { scope, rubric, fixture } = await searchParams;
  // Phase 1 is intentionally a literal Rubric transplant, not another
  // renderer option inside AuditInstrument. Serve it as its own full-page
  // Audit subroute so no Signal shell, canvas, or iframe can alter Rubric's
  // viewport. The normal Audit route remains exactly as it was.
  if (rubric === "phase1") redirect("/audit/rubric-phase1");
  if (rubric === "phase2") {
    const params = new URLSearchParams();
    if (scope) params.set("scope", scope);
    if (fixture) params.set("fixture", fixture);
    redirect(`/audit/rubric-phase2${params.size > 0 ? `?${params}` : ""}`);
  }
  if (rubric === "phase3") {
    const params = new URLSearchParams();
    if (scope) params.set("scope", scope);
    if (fixture) params.set("fixture", fixture);
    redirect(`/audit/rubric-phase3${params.size > 0 ? `?${params}` : ""}`);
  }
  return (
    <InstrumentShell
      // AuditWorld owns the one thin context bar. A concrete hidden node is
      // used instead of an empty fragment so the client-shell boundary never
      // coalesces it back to InstrumentShell's default identity strip.
      stateBar={<div className="hidden" />}
    >
      <AuditWorld initialScopeId={scope} fixture={fixture} />
    </InstrumentShell>
  );
}
