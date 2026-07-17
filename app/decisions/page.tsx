import { prisma } from "@/lib/prisma";
import DecisionQueue from "@/components/DecisionQueue";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const decisions = await prisma.finding.findMany({
    where: { type: "decision", status: "open" },
    include: { source: { select: { id: true, title: true } } },
    orderBy: [{ blocking: "desc" }, { createdAt: "asc" }],
  });

  const rows = decisions.map((d) => ({
    id: d.id,
    title: d.title,
    quote: d.quote,
    owner: d.owner,
    blocks: d.blocks,
    blocking: d.blocking,
    createdAt: d.createdAt.toISOString(),
    sourceId: d.source.id,
    sourceTitle: d.source.title,
  }));

  return (
    <div className="p-10 max-w-3xl">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-accent)] mb-2">
        Decision Queue
      </div>
      <h1 className="font-display text-3xl mb-2">Open decisions</h1>
      <p className="text-[var(--color-ink-soft)] mb-8">
        Every open decision across all sources — who owns the call, and what
        it&apos;s blocking.
      </p>
      <DecisionQueue initialDecisions={rows} />
    </div>
  );
}
