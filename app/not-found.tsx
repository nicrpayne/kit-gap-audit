import Link from "next/link";

// The last surface that wasn't Signal. Without this file Next renders its
// own built-in 404 — black on white, no chrome — which any stale link
// reaches: a deleted audit, an old bookmark, a mistyped path. It is part
// of normal navigation, so it wears the application's face.
export default function NotFound() {
  return (
    <div className="min-h-screen p-10" style={{ background: "var(--i-void)" }}>
      <div className="mx-auto w-full max-w-[560px] pt-16">
        <div className="i-label mb-3" style={{ color: "var(--i-amber)" }}>
          Not found
        </div>
        <h1 className="font-display mb-3 text-[26px] leading-tight text-[var(--i-text)]">
          There's nothing at this address
        </h1>
        <p className="mb-7 text-[13px] leading-[1.65] text-[var(--i-text-soft)]">
          The page may have been deleted, or the link may be out of date.
        </p>
        <Link href="/control-room" className="i-btn-primary inline-flex px-4 py-2 text-sm">
          Back to the Control Room
        </Link>
      </div>
    </div>
  );
}
