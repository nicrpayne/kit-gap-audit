"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ScopeRow {
  id: string;
  name: string;
  teamKey: string;
  projectName: string | null;
  labelFilter: string | null;
}

const inputClass =
  "rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]";

export default function ScopesManager({ initialScopes }: { initialScopes: ScopeRow[] }) {
  const router = useRouter();
  const [scopes, setScopes] = useState(initialScopes);
  const [form, setForm] = useState({ name: "", teamKey: "", projectName: "", labelFilter: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/scopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create scope.");
      }
      const { scope } = await res.json();
      setScopes((prev) => [...prev, scope]);
      setForm({ name: "", teamKey: "", projectName: "", labelFilter: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    setScopes((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/scopes/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--color-ink-soft)] border-b border-[var(--color-line)]">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Team key</th>
              <th className="px-4 py-3 font-medium">Project filter</th>
              <th className="px-4 py-3 font-medium">Label filter</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {scopes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-ink-soft)]">
                  No scopes yet — add one below.
                </td>
              </tr>
            )}
            {scopes.map((scope) => (
              <tr key={scope.id} className="border-b border-[var(--color-line)] last:border-0">
                <td className="px-4 py-3 font-medium">{scope.name}</td>
                <td className="px-4 py-3">{scope.teamKey}</td>
                <td className="px-4 py-3 text-[var(--color-ink-soft)]">
                  {scope.projectName || <span className="italic">any</span>}
                </td>
                <td className="px-4 py-3 text-[var(--color-ink-soft)]">
                  {scope.labelFilter || <span className="italic">none</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(scope.id)}
                    className="text-[var(--color-danger)] hover:underline text-xs"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={onCreate}
        className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] p-6 space-y-4"
      >
        <h2 className="font-display text-lg">Add scope</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-ink-soft)]">Name</label>
            <input
              required
              className={inputClass}
              placeholder="iTrack"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-ink-soft)]">Linear team key</label>
            <input
              required
              className={inputClass}
              placeholder="SOF"
              value={form.teamKey}
              onChange={(e) => setForm((f) => ({ ...f, teamKey: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-ink-soft)]">Project name (optional)</label>
            <input
              className={inputClass}
              placeholder="KIT Safety (JSA and iTrack)"
              value={form.projectName}
              onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-ink-soft)]">Label filter (optional)</label>
            <input
              className={inputClass}
              placeholder="itrack"
              value={form.labelFilter}
              onChange={(e) => setForm((f) => ({ ...f, labelFilter: e.target.value }))}
            />
          </div>
        </div>
        {error && <div className="text-sm text-[var(--color-danger)]">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-[var(--color-accent)] text-white px-4 py-2 text-sm font-medium hover:bg-[var(--color-accent-dark)] disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add scope"}
        </button>
      </form>
    </div>
  );
}
