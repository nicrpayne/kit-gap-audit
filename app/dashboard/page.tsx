import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SignalSurface, { SurfaceAction, SurfacePanel, SurfaceEmpty } from "@/components/instrument/SignalSurface";

export const dynamic = "force-dynamic";

// THE PRE-SIGNAL SUMMARY, KEPT FOR REFERENCE. This was the application's
// front door; the Control Room is now, and `/` goes there. It survives at
// /dashboard because the counts are still correct and things still link to
// them — but it is a secondary destination (lib/shell/mode.ts), out of the
// rail, and it wears the same shell as everything else. There is no route
// in Signal that opens the retired Workbench chrome.
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
    <SignalSurface
      eyebrow="Workbench dashboard"
      title="Clarity, at a glance"
      lede="The pre-Signal summary, kept for reference. The Control Room is the current front door."
      actions={<SurfaceAction href="/audit/new">+ New audit</SurfaceAction>}
    >
      <div className="mb-10 grid grid-cols-3 gap-3">
        <Count
          href="/decisions"
          value={blockingCount}
          label="Blocking decisions open"
          tone={blockingCount > 0 ? "red" : "neutral"}
        />
        <Count href="/decisions" value={nonBlockingCount} label="Non-blocking decisions open" tone="neutral" />
        <Count value={untrackedCount} label="Untracked findings" tone="neutral" />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="i-label">Recent sources</h2>
        {recentSources.length > 0 && (
          <Link href="/audit" className="text-[11px] text-[var(--i-signal)] hover:underline">
            View all →
          </Link>
        )}
      </div>
      {recentSources.length === 0 ? (
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
            {recentSources.map((source) => (
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
                <div className="shrink-0 text-[11px] text-[var(--i-text-faint)]">
                  {source._count.findings} finding{source._count.findings === 1 ? "" : "s"}
                </div>
              </Link>
            ))}
          </div>
        </SurfacePanel>
      )}
    </SignalSurface>
  );
}

/** The number first, the words after — same hierarchy the Control Room's
    summary cards use, so these read as the same family of object. */
function Count({
  href,
  value,
  label,
  tone,
}: {
  href?: string;
  value: number;
  label: string;
  tone: "red" | "neutral";
}) {
  const body = (
    <>
      <div
        className="i-readout mb-1.5 text-[30px] leading-none"
        style={{ color: tone === "red" ? "var(--i-red)" : "var(--i-text)" }}
      >
        {value}
      </div>
      <div className="text-[11px] leading-[1.35] text-[var(--i-text-faint)]">{label}</div>
    </>
  );
  const style = {
    background: tone === "red" ? "var(--i-red-soft)" : "var(--i-panel)",
    border: `1px solid ${tone === "red" ? "var(--i-red)" : "var(--i-border)"}`,
  };
  return href ? (
    <Link href={href} className="rounded-[10px] p-5 transition-colors hover:bg-white/[0.035]" style={style}>
      {body}
    </Link>
  ) : (
    <div className="rounded-[10px] p-5" style={style}>
      {body}
    </div>
  );
}
