import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auditRunHistory } from "@/lib/audit/history";
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
  searchParams: Promise<{ page?: string; runPage?: string; scope?: string }>;
}) {
  const { page: pageParam, runPage: runPageParam, scope } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const runPage = Math.max(1, parseInt(runPageParam ?? "1", 10) || 1);
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
  const history = await auditRunHistory(scope, runPage, PAGE_SIZE);

  return (
    <SignalSurface
      eyebrow="Audit · history"
      title="Audit run and source history"
      lede="Knowledge refresh audits and older source audits are retained separately below. Run dates record when Signal processed the evidence, not when the underlying conversation happened."
      actions={<SurfaceAction href={`/audit${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`}>← Audit World</SurfaceAction>}
    >
      <h2 className="mb-3 text-lg">Knowledge and source audit runs</h2>
      {history.runs.length === 0 ? <SurfaceEmpty>No retained audit runs for this project.</SurfaceEmpty> : (
        <SurfacePanel>
          {history.runs.map((run) => (
            <article key={run.id} data-audit-run={run.id} className="border-b border-[var(--i-border)] px-5 py-4 text-[12px]">
              <h3 className="font-medium">{run.contextSnapshot?.scope.name ?? "Source audit"} · {run.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC</h3>
              <p className="mt-1 text-[var(--i-text-soft)]">{run.issueCount} execution items read · {run.findingCount} findings recorded · {run._count.changeProposals} change proposals</p>
              <details className="mt-2 text-[var(--i-text-faint)]">
                <summary className="cursor-pointer">Captured run provenance</summary>
                <p className="mt-2 break-all">Run: {run.id}</p>
                {run.contextSnapshotId && <p className="break-all">Snapshot: {run.contextSnapshotId} · Package: {run.contextSnapshot?.packageId}</p>}
                <p>Processor: {run.model}</p>
                {run.sourceId && <Link className="underline" href={`/audit/${encodeURIComponent(run.sourceId)}`}>Open retained source</Link>}
                <p className="mt-2">This is a retained run receipt. Audit World shows current evidence and review state, not a replay of this run.</p>
              </details>
            </article>
          ))}
        </SurfacePanel>
      )}
      {history.totalPages > 1 && <nav aria-label="Audit run pages" className="my-4 flex justify-between text-[12px]">
        {runPage > 1 ? <Link href={`/audit/history?runPage=${runPage - 1}&page=${page}${scope ? `&scope=${encodeURIComponent(scope)}` : ""}`}>← Newer runs</Link> : <span />}
        <span>Run page {runPage} of {history.totalPages}</span>
        {runPage < history.totalPages ? <Link href={`/audit/history?runPage=${runPage + 1}&page=${page}${scope ? `&scope=${encodeURIComponent(scope)}` : ""}`}>Older runs →</Link> : <span />}
      </nav>}
      <h2 className="mb-3 mt-8 text-lg">Legacy source audits</h2>
      {sources.length === 0 ? (
        <SurfaceEmpty>
          No legacy source audits.{" "}
          <Link href="/audit/new" className="text-[var(--i-signal)] hover:underline">
            Open the approved evidence workflow
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
            href={`/audit/history?page=${page - 1}&runPage=${runPage}${scope ? `&scope=${encodeURIComponent(scope)}` : ""}`}
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
            href={`/audit/history?page=${page + 1}&runPage=${runPage}${scope ? `&scope=${encodeURIComponent(scope)}` : ""}`}
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
