import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AuditFindings from "@/components/AuditFindings";
import SignalSurface from "@/components/instrument/SignalSurface";

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
    <SignalSurface
      eyebrow={`${source.scope?.name ?? "No scope"} · ${source.kind}`}
      title={source.title}
      lede={`${findings.length} finding${findings.length === 1 ? "" : "s"} from this source.`}
      back={{ href: "/audit", label: "All audits" }}
    >
      {/* The source text is CUT INTO the panel rather than sitting on it:
          it is the evidence, not a control, and the instrument's affordance
          split says a readout is recessed. */}
      <details
        className="group mb-8 overflow-hidden rounded-[10px]"
        style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
      >
        <summary className="cursor-pointer select-none px-5 py-3 text-[12px] text-[var(--i-text-soft)] transition-colors hover:text-[var(--i-text)]">
          View original source ({source.kind}, added {source.createdAt.toISOString().slice(0, 10)})
        </summary>
        <div
          className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap px-5 pb-5 pt-4 font-mono text-[12px] leading-relaxed text-[var(--i-text-soft)]"
          style={{ background: "var(--i-recess)", borderTop: "1px solid var(--i-border)" }}
        >
          {source.content}
        </div>
      </details>

      <AuditFindings initialFindings={findings} />
    </SignalSurface>
  );
}
