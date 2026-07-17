import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AuditFindings from "@/components/AuditFindings";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const { sourceId } = await params;

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: {
      scope: true,
      findings: true,
    },
  });

  if (!source) notFound();

  const findings = [...source.findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.createdAt.getTime() - b.createdAt.getTime()
  );

  return (
    <div className="p-10 max-w-3xl">
      <Link href="/audit" className="text-xs text-[var(--color-accent)] hover:underline">
        ← All audits
      </Link>
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-accent)] mt-4 mb-2">
        {source.scope?.name ?? "No scope"} · {source.kind}
      </div>
      <h1 className="font-display text-3xl mb-2">{source.title}</h1>
      <p className="text-[var(--color-ink-soft)] mb-6">
        {findings.length} finding{findings.length === 1 ? "" : "s"} from this source.
      </p>

      <details className="mb-8 border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] group">
        <summary className="px-5 py-3 text-sm cursor-pointer select-none text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
          View original source ({source.kind}, added{" "}
          {source.createdAt.toISOString().slice(0, 10)})
        </summary>
        <div className="px-5 pb-5 pt-1 text-sm whitespace-pre-wrap font-mono leading-relaxed text-[var(--color-ink)] border-t border-[var(--color-line)] max-h-[32rem] overflow-y-auto">
          {source.content}
        </div>
      </details>

      <AuditFindings initialFindings={findings} />
    </div>
  );
}
