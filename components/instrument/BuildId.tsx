"use client";

// THE BUILD MARKER — the quietest thing in the product, and the one that
// makes every screenshot self-identifying.
//
// -- WHY IT IS IN THE RAIL ---------------------------------------------
//
// A screenshot of a graph tells you what the graph looked like. It does not
// tell you which commit drew it, and twice now that gap has cost a whole UX
// audit. The rail is the only chrome present on every instrument, so a mark
// at the bottom of it is in every capture anyone will ever take without
// anybody having to remember to include it.
//
// -- WHY IT FETCHES ----------------------------------------------------
//
// The rail is a client component, so it cannot read the deploy's environment
// directly, and baking the SHA in at build time would make it a claim about
// the build machine rather than about the running container. One cached GET
// to `/api/version` — 130 bytes, unauthenticated, no-store — is the honest
// version and the cheap one.
//
// -- AND WHY IT IS THIS SMALL ------------------------------------------
//
// It is 9px, faint, tabular, and below the last destination. It is not a
// developer banner: nobody is meant to look at it while working, only to
// find it in a screenshot afterwards, or to click it once when a deployment
// is in question. Clicking expands the full SHA, branch, message and
// deployment id in place; nothing navigates and nothing overlays.

import { useEffect, useState } from "react";

interface Build {
  commit: string;
  shortCommit: string;
  branch: string;
  commitMessage: string;
  deploymentId: string;
  environment: string;
}

export default function BuildId() {
  const [build, setBuild] = useState<Build | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    // A build marker must never be the reason a page fails. Anything that
    // goes wrong here leaves the mark absent, which is exactly as much as an
    // unknown build deserves to claim.
    fetch("/api/version", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: Build | null) => {
        if (alive && b?.shortCommit) setBuild(b);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!build) return null;

  return (
    <div className="w-full px-1 pt-3" data-shoot="build-id" data-commit={build.commit}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${build.branch} · ${build.commitMessage}`}
        aria-label={`Build ${build.shortCommit} on ${build.branch}`}
        aria-expanded={open}
        data-shoot="build-id-toggle"
        className="i-readout w-full text-center text-[9px] leading-none tracking-[0.06em] transition-colors hover:text-[var(--i-text-soft)]"
        style={{ color: "var(--i-text-faint)", opacity: 0.72 }}
      >
        {build.shortCommit}
      </button>
      {open && (
        <div
          data-shoot="build-id-detail"
          className="mt-2 space-y-1 rounded-md border px-1.5 py-1.5 text-left"
          style={{ borderColor: "var(--i-border)", background: "var(--i-panel-raised)" }}
        >
          <Line label="commit" value={build.commit} mono />
          <Line label="branch" value={build.branch} />
          <Line label="env" value={build.environment} />
          <Line label="deploy" value={build.deploymentId} mono />
          <p className="pt-0.5 text-[8.5px] leading-[1.35]" style={{ color: "var(--i-text-soft)" }}>
            {build.commitMessage}
          </p>
        </div>
      )}
    </div>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-[1px]">
      <span className="text-[7.5px] uppercase tracking-[0.12em]" style={{ color: "var(--i-text-faint)" }}>
        {label}
      </span>
      <span
        className={`break-all text-[8.5px] leading-[1.25] ${mono ? "i-readout" : ""}`}
        style={{ color: "var(--i-text)" }}
      >
        {value}
      </span>
    </div>
  );
}
