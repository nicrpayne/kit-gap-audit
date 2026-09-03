import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SignalSurface, { SurfaceAction, SurfacePanel, SurfaceEmpty } from "@/components/instrument/SignalSurface";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// THE AUDIT RUN HISTORY, moved here when /audit became the instrument.
//
// Same query, same pagination, same per-source links — only the route and
// the framing changed. This is still genuinely a READING surface (a list of
// past runs, with nothing to play), so it keeps SignalSurface's centred
// measure while the Truth Map owns the viewport at /audit.
export default async function AuditHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; scope?: string }>;
}) {
  const { page: pageParam, scope } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const where = scope ? { scopeId: scope } : undefined;

  const [sources, total] = await Promise.all([
    prisma.source.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        scope: { select: { name: true } },
        _count: { select: { findings: true } },
        findings: { select: { status: true } },
      },
    }),
    prisma.source.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <SignalSurface
      eyebrow="Audit · history"
      title="Every audit you've run"
      lede="Each one compared a source — a transcript, a note, a list of estimates — against the work already tracked, and kept what was missing."
      actions={<SurfaceAction href={`/audit${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`}>← Audit World</SurfaceAction>}
    >
      {sources.length === 0 ? (
        <SurfaceEmpty>
          No audits yet.{" "}
          <Link href="/audit/new" className="text-[var(--i-signal)] hover:underline">
            Run your first one
          </Link>
          .
        </SurfaceEmpty>
      ) : (
        <SurfacePanel>
          <div className="divide-y" style={{ borderColor: "var(--i-border)" }}>
            {sources.map((source) => {
              const openCount = source.findings.filter((f) => f.status === "open").length;
              return (
                <Link
                  key={source.id}
                  href={`/audit/${source.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.035]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-[var(--i-text)]">{source.title}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--i-text-faint)]">
                      {source.scope?.name ?? "No scope"} · {source.kind} ·{" "}
                      {source.createdAt.toISOString().slice(0, 10)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-[var(--i-text-faint)]">
                    <div className="i-readout text-[13px] text-[var(--i-text-soft)]">
                      {source._count.findings}
                    </div>
                    <div>finding{source._count.findings === 1 ? "" : "s"}</div>
                    {openCount > 0 && (
                      <div className="mt-1 font-medium text-[var(--i-amber)]">{openCount} open</div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </SurfacePanel>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-[12px]">
          <Link
            href={`/audit/history?page=${page - 1}${scope ? `&scope=${encodeURIComponent(scope)}` : ""}`}
            aria-disabled={page <= 1}
            className={`i-control px-3 py-1.5 text-[var(--i-text-soft)] transition-colors hover:text-[var(--i-text)] ${
              page <= 1 ? "pointer-events-none opacity-35" : ""
            }`}
          >
            ← Newer
          </Link>
          <span className="text-[var(--i-text-faint)]">
            Page {page} of {totalPages}
          </span>
          <Link
            href={`/audit/history?page=${page + 1}${scope ? `&scope=${encodeURIComponent(scope)}` : ""}`}
            aria-disabled={page >= totalPages}
            className={`i-control px-3 py-1.5 text-[var(--i-text-soft)] transition-colors hover:text-[var(--i-text)] ${
              page >= totalPages ? "pointer-events-none opacity-35" : ""
            }`}
          >
            Older →
          </Link>
        </div>
      )}
    </SignalSurface>
  );
}
