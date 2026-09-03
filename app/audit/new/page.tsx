import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AuditNewForm from "@/components/AuditNewForm";
import SignalSurface, { SurfaceEmpty } from "@/components/instrument/SignalSurface";

export const dynamic = "force-dynamic";

// The form itself is untouched: it was written against the light palette,
// and SignalSurface's `.i-legacy` scope resolves those tokens to instrument
// values, so it renders in Signal without a rewrite. See app/globals.css.
export default async function NewAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope } = await searchParams;
  const scopes = await prisma.scope.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  return (
    <SignalSurface
      eyebrow="New audit"
      title="What's missing?"
      lede="Paste a transcript, notes, or a list of developer estimates. Signal compares it against the Linear tickets in scope and everything previously handled, and surfaces what is missing, undecided, or contradicted."
      back={{ href: "/audit", label: "All audits" }}
    >
      {scopes.length === 0 ? (
        <SurfaceEmpty>
          No Scope configured yet.{" "}
          <Link href="/scopes" className="text-[var(--i-signal)] hover:underline">
            Add one
          </Link>{" "}
          to point Signal at a Linear team before running an audit.
        </SurfaceEmpty>
      ) : (
        <AuditNewForm scopes={scopes} initialScopeId={scope} />
      )}
    </SignalSurface>
  );
}
