"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddProjectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [owner, setOwner] = useState("");
  const [sources, setSources] = useState("");
  const [search, setSearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  async function create(searchExistingKnowledge: boolean) {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/project-bootstraps", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          canonicalName: name, aliases: aliases.split(/[,\n]/), ownerHint: owner,
          sourceHints: sources.split(/[,\n]/), searchExistingKnowledge,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409 && body.bootstrapId) {
          router.push(`/projects/bootstrap/${body.bootstrapId}`);
          onClose();
          return;
        }
        throw new Error(body.error ?? "Could not create project bootstrap");
      }
      const bootstrapId = body.bootstrap.id as string;
      const scan = await fetch(`/api/project-bootstraps/${bootstrapId}/scans`, { method: "POST" });
      if (!scan.ok) {
        const detail = await scan.json().catch(() => ({}));
        throw new Error(detail.error ?? "Project identity was saved, but the scan could not start");
      }
      onClose();
      router.push(`/projects/bootstrap/${bootstrapId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create project bootstrap");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" role="presentation" data-shoot="add-project-sheet">
      <button aria-label="Close Add Project" className="absolute inset-0 bg-black/65" onClick={onClose} />
      <section
        role="dialog" aria-modal="true" aria-labelledby="add-project-title"
        className="signal-widget relative flex h-full w-[420px] max-w-[94vw] flex-col border-l p-5 shadow-2xl"
        style={{ background: "var(--i-panel)", borderColor: "var(--i-border-strong)" }}
      >
        <header className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--i-border)" }}>
          <div>
            <div className="i-label mb-1" style={{ color: "var(--i-signal)" }}>Pre-Reality identity</div>
            <h2 id="add-project-title" className="text-[18px] font-semibold text-[var(--i-text)]">Add project</h2>
          </div>
          <button className="signal-control h-8 w-8 rounded text-[16px]" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto py-5">
          <Field label="Canonical project name" required>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Harbor Relay" data-shoot="add-project-name" className="bootstrap-input" />
          </Field>
          <Field label="Aliases / acronyms" hint="Comma or line separated">
            <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="HR, Relay" className="bootstrap-input" />
          </Field>
          <Field label="Owner hint" hint="Optional · mention only, never staffing">
            <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Name or team" className="bootstrap-input" />
          </Field>
          <Field label="Source hints" hint="Optional refs, titles, or locations">
            <textarea value={sources} onChange={(e) => setSources(e.target.value)} placeholder="Wiki project page&#10;Planning transcript" className="bootstrap-input min-h-[76px] resize-y" />
          </Field>
          <label className="signal-control flex cursor-pointer items-center justify-between rounded-lg px-3 py-3">
            <span>
              <span className="block text-[12px] font-medium text-[var(--i-text)]">Search existing knowledge</span>
              <span className="mt-0.5 block text-[10px] text-[var(--i-text-faint)]">Local KE / Hermes · evidence-preserving companion scan</span>
            </span>
            <input type="checkbox" checked={search} onChange={(e) => setSearch(e.target.checked)} className="h-4 w-4 accent-[var(--i-signal)]" />
          </label>
          <div className="rounded-md border px-3 py-2 text-[10.5px] leading-[1.5]" style={{ borderColor: "var(--i-amber)", color: "var(--i-text-soft)", background: "var(--i-amber-soft)" }}>
            Creating this identity does not create Scope, Forecast work, staffing, decisions, dependencies, milestones, or Reality.
          </div>
          {error && <p role="alert" className="text-[11px] text-[var(--i-red)]">{error}</p>}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--i-border)" }}>
          <button disabled={busy || !name.trim()} onClick={() => create(false)} className="px-2 py-2 text-[11px] text-[var(--i-text-soft)] disabled:opacity-40">
            Start blank
          </button>
          <button disabled={busy || !name.trim()} onClick={() => create(search)} data-shoot="create-and-scan" className="signal-control rounded-md px-4 py-2.5 text-[11px] font-semibold text-[var(--i-text)] disabled:opacity-40">
            {busy ? "CREATING…" : search ? "CREATE & SCAN" : "CREATE BLANK"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block">
    <span className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-[var(--i-text-soft)]">
      <span>{label}{required ? " *" : ""}</span>{hint && <span className="normal-case tracking-normal text-[var(--i-text-faint)]">{hint}</span>}
    </span>
    {children}
  </label>;
}
