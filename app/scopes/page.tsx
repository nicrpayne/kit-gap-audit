import { prisma } from "@/lib/prisma";
import ScopesManager from "@/components/ScopesManager";
import SignalSurface from "@/components/instrument/SignalSurface";

export const dynamic = "force-dynamic";

export default async function ScopesPage() {
  const scopes = await prisma.scope.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <SignalSurface
      eyebrow="Settings"
      title="Scopes"
      lede={
        <>
          A Scope maps a KIT module (JSA, iTrack, Precon, …) to a Linear team, one project, and
          optionally a label, so adding a new module is a data row here — not a redeploy. When a
          module depends on shared work (e.g. JSA and iTrack both need Platform), give Platform its
          own Scope and set it as a dependency below rather than adding its project to both —
          otherwise its tickets get counted twice.
        </>
      }
    >
      <ScopesManager initialScopes={scopes} />
    </SignalSurface>
  );
}
