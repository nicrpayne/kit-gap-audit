import Link from "next/link";
import SignalSurface, { SurfaceEmpty } from "@/components/instrument/SignalSurface";

export const dynamic = "force-dynamic";

// The form itself is untouched: it was written against the light palette,
// and SignalSurface's `.i-legacy` scope resolves those tokens to instrument
// values, so it renders in Signal without a rewrite. See app/globals.css.
export default async function NewAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope } = await searchParams;

  return (
    <SignalSurface
      eyebrow="Audit · evidence"
      title="Add evidence upstream"
      lede="Signal refreshes completed project knowledge; it is not a second source corpus."
      back={{ href: `/audit${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`, label: "Back to Audit" }}
    >
      <SurfaceEmpty>
        File transcripts, notes, estimates, and task lists through the approved KE intake and Wiki Update workflow. After the compiler and Hermes finish, return to Audit and choose <strong>Refresh Audit</strong>. Direct paste remains disabled until Signal has a safe upstream handoff.
        <div className="mt-4"><Link href={`/audit${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`} className="text-[var(--i-signal)] hover:underline">Return to Audit →</Link></div>
      </SurfaceEmpty>
    </SignalSurface>
  );
}
