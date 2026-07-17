import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AuditNewForm from "@/components/AuditNewForm";

export const dynamic = "force-dynamic";

export default async function NewAuditPage() {
  const scopes = await prisma.scope.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="p-10 max-w-3xl">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-accent)] mb-2">
        New audit
      </div>
      <h1 className="font-display text-3xl mb-2">What&apos;s missing?</h1>
      <p className="text-[var(--color-ink-soft)] mb-8">
        Paste a transcript, notes, or a list of developer estimates. KIT will
        compare it against the Linear tickets in scope and previously handled
        findings, and surface what&apos;s missing, undecided, or contradicted.
      </p>
      {scopes.length === 0 ? (
        <div className="text-sm text-[var(--color-ink-soft)] py-12 text-center border border-dashed border-[var(--color-line)] rounded-xl">
          No Scope configured yet.{" "}
          <Link href="/scopes" className="text-[var(--color-accent)] hover:underline">
            Add one
          </Link>{" "}
          to point KIT at a Linear team before running an audit.
        </div>
      ) : (
        <AuditNewForm scopes={scopes} />
      )}
    </div>
  );
}
