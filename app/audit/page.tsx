import InstrumentShell from "@/components/instrument/InstrumentShell";
import AuditInstrument from "@/components/audit/AuditInstrument";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// AUDIT IS AN INSTRUMENT NOW.
//
// It used to render through SignalSurface as a reading surface — a list of
// past runs in a centred measure — on the reasoning that "there is nothing
// here to play". That stopped being true: the Project Truth Map is a control
// surface you select on, focus, solo and preview against, which is exactly
// what the design north star means by an instrument. It owns the viewport,
// carries its own state bar, and its rail can be hidden with ⌘\ like every
// other instrument's.
//
// The audit-run list it replaced is not gone — /audit/history keeps it, and
// the header links to it. A per-source drill-down at /audit/<sourceId> is
// untouched.
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; rubric?: string }>;
}) {
  const { scope, rubric } = await searchParams;
  // Phase 1 is intentionally a literal Rubric transplant, not another
  // renderer option inside AuditInstrument. Serve it as its own full-page
  // Audit subroute so no Signal shell, canvas, or iframe can alter Rubric's
  // viewport. The normal Audit route remains exactly as it was.
  if (rubric === "phase1") redirect("/audit/rubric-phase1");
  return (
    <InstrumentShell
      stateBar={
        // The instrument draws its own header (scope, current-vs-prior, Run
        // audit), so the shell's default identity strip would be a second,
        // quieter copy of the same thing.
        <></>
      }
    >
      <AuditInstrument initialScopeId={scope} />
    </InstrumentShell>
  );
}
