import { prisma } from "@/lib/prisma";
import ScopesManager from "@/components/ScopesManager";

export const dynamic = "force-dynamic";

export default async function ScopesPage() {
  const scopes = await prisma.scope.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="p-10 max-w-3xl">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-accent)] mb-2">
        Settings
      </div>
      <h1 className="font-display text-3xl mb-2">Scopes</h1>
      <p className="text-[var(--color-ink-soft)] mb-8">
        A Scope maps a KIT module (JSA, iTrack, Precon, …) to a Linear team, and
        optionally a project and label, so adding a new module is a data row
        here — not a redeploy.
      </p>
      <ScopesManager initialScopes={scopes} />
    </div>
  );
}
