"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ScopeOption {
  id: string;
  name: string;
}

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "transcript", label: "Meeting transcript" },
  { value: "notes", label: "Notes" },
  { value: "estimates", label: "Developer estimates" },
];

export default function AuditNewForm({ scopes }: { scopes: ScopeOption[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("transcript");
  const [scopeId, setScopeId] = useState(scopes[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    if (!title) setTitle(file.name.replace(/\.(txt|md)$/i, ""));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scopeId) {
      setError("Add a Scope first (see Scopes settings in the sidebar).");
      return;
    }
    if (!content.trim()) {
      setError("Paste or upload some context first.");
      return;
    }

    setRunning(true);
    setError(null);
    setStatus("Reading Linear tickets and running the audit — this can take up to a minute…");

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, kind, title, scopeId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Audit failed.");
      }
      const { source } = await res.json();
      router.push(`/audit/${source.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--color-ink-soft)]">Scope</label>
          <select
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            className="rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
          >
            {scopes.length === 0 && <option value="">No scopes — add one first</option>}
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--color-ink-soft)]">Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--color-ink-soft)]">Title (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="May 16 delivery call"
          className="rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[var(--color-ink-soft)]">Content</label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-[var(--color-accent)] hover:underline"
          >
            Upload .txt / .md
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            onChange={onFileChange}
            className="hidden"
          />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={16}
          placeholder="Paste a transcript, notes, or a list of developer estimates…"
          className="rounded-md border border-[var(--color-line)] bg-white px-3 py-3 text-sm font-mono leading-relaxed"
        />
      </div>

      {error && <div className="text-sm text-[var(--color-danger)]">{error}</div>}
      {status && !error && <div className="text-sm text-[var(--color-ink-soft)]">{status}</div>}

      <button
        type="submit"
        disabled={running}
        className="rounded-md bg-[var(--color-accent)] text-white px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-accent-dark)] disabled:opacity-50"
      >
        {running ? "Running audit…" : "Run audit"}
      </button>
    </form>
  );
}
