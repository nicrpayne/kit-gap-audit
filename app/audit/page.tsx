import InstrumentShell from "@/components/instrument/InstrumentShell";
import AuditInstrument from "@/components/audit/AuditInstrument";

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
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope } = await searchParams;
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
