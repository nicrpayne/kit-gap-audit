import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [blockingCount, nonBlockingCount, untrackedCount, recentSources] = await Promise.all([
    prisma.finding.count({ where: { type: "decision", status: "open", blocking: true } }),
    prisma.finding.count({ where: { type: "decision", status: "open", blocking: false } }),
    prisma.finding.count({ where: { status: "open" } }),
    prisma.source.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { scope: { select: { name: true } }, _count: { select: { findings: true } } },
    }),
  ]);

  return (
    <div className="p-10 max-w-4xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-accent)] mb-2">
            Dashboard
          </div>
          <h1 className="font-display text-3xl">Clarity, at a glance</h1>
        </div>
        <Link
          href="/audit/new"
          className="rounded-md bg-[var(--color-accent)] text-white px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-accent-dark)]"
        >
          + New audit
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10">
        <Link
          href="/decisions"
          className={`rounded-xl border p-5 hover:shadow-sm transition-shadow ${
            blockingCount > 0
              ? "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]"
              : "border-[var(--color-line)] bg-[var(--color-card)]"
          }`}
        >
          <div
            className={`text-3xl font-display mb-1 ${
              blockingCount > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"
            }`}
          >
            {blockingCount}
          </div>
          <div className="text-xs text-[var(--color-ink-soft)]">Blocking decisions open</div>
        </Link>

        <Link
          href="/decisions"
          className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 hover:shadow-sm transition-shadow"
        >
          <div className="text-3xl font-display mb-1">{nonBlockingCount}</div>
          <div className="text-xs text-[var(--color-ink-soft)]">Non-blocking decisions open</div>
        </Link>

        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <div className="text-3xl font-display mb-1">{untrackedCount}</div>
          <div className="text-xs text-[var(--color-ink-soft)]">Untracked findings</div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
            Recent sources
          </h2>
          {recentSources.length > 0 && (
            <Link href="/audit" className="text-xs text-[var(--color-accent)] hover:underline">
              View all →
            </Link>
          )}
        </div>
        {recentSources.length === 0 ? (
          <div className="text-sm text-[var(--color-ink-soft)] py-12 text-center border border-dashed border-[var(--color-line)] rounded-xl">
            No audits yet.{" "}
            <Link href="/audit/new" className="text-[var(--color-accent)] hover:underline">
              Run your first one
            </Link>
            .
          </div>
        ) : (
          <div className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] divide-y divide-[var(--color-line)]">
            {recentSources.map((source) => (
              <Link
                key={source.id}
                href={`/audit/${source.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-black/[0.02] transition-colors"
              >
                <div>
                  <div className="font-medium text-sm">{source.title}</div>
                  <div className="text-xs text-[var(--color-ink-soft)]">
                    {source.scope?.name ?? "No scope"} · {source.kind} ·{" "}
                    {source.createdAt.toISOString().slice(0, 10)}
                  </div>
                </div>
                <div className="text-xs text-[var(--color-ink-soft)]">
                  {source._count.findings} finding{source._count.findings === 1 ? "" : "s"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
