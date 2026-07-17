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
      <Link href="/" className="text-xs text-[var(--color-accent)] hover:underline">
        ← Dashboard
      </Link>
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-accent)] mt-4 mb-2">
        {source.scope?.name ?? "No scope"} · {source.kind}
      </div>
      <h1 className="font-display text-3xl mb-2">{source.title}</h1>
      <p className="text-[var(--color-ink-soft)] mb-8">
        {findings.length} finding{findings.length === 1 ? "" : "s"} from this source.
      </p>

      <AuditFindings initialFindings={findings} />
    </div>
  );
}
