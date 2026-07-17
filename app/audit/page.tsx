import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AuditIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const [sources, total] = await Promise.all([
    prisma.source.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        scope: { select: { name: true } },
        _count: { select: { findings: true } },
        findings: { select: { status: true } },
      },
    }),
    prisma.source.count(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-10 max-w-4xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-accent)] mb-2">
            Audit
          </div>
          <h1 className="font-display text-3xl">Every audit you&apos;ve run</h1>
        </div>
        <Link
          href="/audit/new"
          className="rounded-md bg-[var(--color-accent)] text-white px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-accent-dark)]"
        >
          + New audit
        </Link>
      </div>

      {sources.length === 0 ? (
        <div className="text-sm text-[var(--color-ink-soft)] py-12 text-center border border-dashed border-[var(--color-line)] rounded-xl">
          No audits yet.{" "}
          <Link href="/audit/new" className="text-[var(--color-accent)] hover:underline">
            Run your first one
          </Link>
          .
        </div>
      ) : (
        <div className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] divide-y divide-[var(--color-line)]">
          {sources.map((source) => {
            const openCount = source.findings.filter((f) => f.status === "open").length;
            return (
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
                <div className="text-xs text-[var(--color-ink-soft)] text-right">
                  <div>
                    {source._count.findings} finding{source._count.findings === 1 ? "" : "s"}
                  </div>
                  {openCount > 0 && (
                    <div className="text-[var(--color-accent)]">{openCount} open</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm">
          <Link
            href={`/audit?page=${page - 1}`}
            aria-disabled={page <= 1}
            className={`px-3 py-1.5 rounded-md border border-[var(--color-line)] ${
              page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-black/5"
            }`}
          >
            ← Newer
          </Link>
          <span className="text-[var(--color-ink-soft)]">
            Page {page} of {totalPages}
          </span>
          <Link
            href={`/audit?page=${page + 1}`}
            aria-disabled={page >= totalPages}
            className={`px-3 py-1.5 rounded-md border border-[var(--color-line)] ${
              page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-black/5"
            }`}
          >
            Older →
          </Link>
        </div>
      )}
    </div>
  );
}
