"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface ScopeRow {
  id: string;
  name: string;
  teamKey: string;
  projectNames: string[];
  labelFilter: string | null;
  dependsOnScopeIds: string[];
}

interface LinearTeam {
  key: string;
  name: string;
}

interface LinearProject {
  id: string;
  name: string;
}

interface ScopeFormValue {
  name: string;
  teamKey: string;
  projectNames: string[];
  labelFilter: string;
  dependsOnScopeIds: string[];
}

const EMPTY_FORM: ScopeFormValue = { name: "", teamKey: "", projectNames: [], labelFilter: "", dependsOnScopeIds: [] };

const inputClass =
  "rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]";

function useLinearTeams() {
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [teamsLoading, setTeamsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/linear/teams")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't load Linear teams.");
        return res.json();
      })
      .then((body) => setTeams(body.teams))
      .catch((err) => setTeamsError(err instanceof Error ? err.message : "Couldn't load Linear teams."))
      .finally(() => setTeamsLoading(false));
  }, []);

  return { teams, teamsError, teamsLoading };
}

function useLinearProjects(teamKey: string) {
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);

  useEffect(() => {
    if (!teamKey) {
      setProjects([]);
      return;
    }
    setProjectsLoading(true);
    setProjectsError(null);
    fetch(`/api/linear/teams/${encodeURIComponent(teamKey)}/projects`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't load projects.");
        return res.json();
      })
      .then((body) => setProjects(body.projects))
      .catch((err) => setProjectsError(err instanceof Error ? err.message : "Couldn't load projects."))
      .finally(() => setProjectsLoading(false));
  }, [teamKey]);

  return { projects, projectsError, projectsLoading };
}

// Shared field layout for both "Add scope" and an in-place row edit --
// one implementation so the two never drift. `otherScopes` is every
// OTHER Scope eligible as a dependsOnScopeIds target (self excluded by
// the caller).
function ScopeFormFields({
  teams,
  teamsError,
  teamsLoading,
  value,
  onChange,
  otherScopes,
}: {
  teams: LinearTeam[];
  teamsError: string | null;
  teamsLoading: boolean;
  value: ScopeFormValue;
  onChange: (next: ScopeFormValue) => void;
  otherScopes: { id: string; name: string }[];
}) {
  const { projects, projectsError, projectsLoading } = useLinearProjects(value.teamKey);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--color-ink-soft)]">Name</label>
        <input
          required
          className={inputClass}
          placeholder="iTrack"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--color-ink-soft)]">Linear team</label>
        {teamsError ? (
          <>
            <input
              required
              className={inputClass}
              placeholder="SOF"
              value={value.teamKey}
              onChange={(e) => onChange({ ...value, teamKey: e.target.value })}
            />
            <span className="text-[11px] text-[var(--color-danger)]">
              {teamsError} — enter the team key manually.
            </span>
          </>
        ) : (
          <select
            required
            disabled={teamsLoading}
            className={inputClass}
            value={value.teamKey}
            onChange={(e) => onChange({ ...value, teamKey: e.target.value, projectNames: [] })}
          >
            <option value="">{teamsLoading ? "Loading teams…" : "Select a team"}</option>
            {teams.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name} ({t.key})
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-1 col-span-2">
        <label className="text-xs text-[var(--color-ink-soft)]">
          Project (pick ONE — for shared work another module also needs, use &ldquo;Depends
          on&rdquo; below instead of adding a second project here, or its tickets get
          counted twice)
        </label>
        {projectsError ? (
          <>
            <input
              className={inputClass}
              placeholder="KIT JSA"
              value={value.projectNames.join(", ")}
              onChange={(e) =>
                onChange({ ...value, projectNames: e.target.value.split(",").map((p) => p.trim()).filter(Boolean) })
              }
            />
            <span className="text-[11px] text-[var(--color-danger)]">
              {projectsError} — enter the project name manually.
            </span>
          </>
        ) : (
          <div className="flex flex-wrap gap-3 rounded-md border border-[var(--color-line)] bg-white px-3 py-2">
            {!value.teamKey && <span className="text-sm text-[var(--color-ink-soft)]">Select a team first</span>}
            {value.teamKey && projectsLoading && (
              <span className="text-sm text-[var(--color-ink-soft)]">Loading projects…</span>
            )}
            {value.teamKey && !projectsLoading && projects.length === 0 && (
              <span className="text-sm text-[var(--color-ink-soft)]">No projects on this team</span>
            )}
            {projects.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={value.projectNames.includes(p.name)}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      projectNames: e.target.checked
                        ? [...value.projectNames, p.name]
                        : value.projectNames.filter((n) => n !== p.name),
                    })
                  }
                  className="rounded border-[var(--color-line)]"
                />
                {p.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--color-ink-soft)]">Label filter (optional)</label>
        <input
          className={inputClass}
          placeholder="itrack"
          value={value.labelFilter}
          onChange={(e) => onChange({ ...value, labelFilter: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1 col-span-2">
        <label className="text-xs text-[var(--color-ink-soft)]">
          Depends on (this Scope&apos;s forecast can&apos;t finish ahead of these)
        </label>
        {otherScopes.length === 0 ? (
          <span className="text-sm text-[var(--color-ink-soft)]">No other Scopes yet</span>
        ) : (
          <div className="flex flex-wrap gap-3 rounded-md border border-[var(--color-line)] bg-white px-3 py-2">
            {otherScopes.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={value.dependsOnScopeIds.includes(s.id)}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      dependsOnScopeIds: e.target.checked
                        ? [...value.dependsOnScopeIds, s.id]
                        : value.dependsOnScopeIds.filter((id) => id !== s.id),
                    })
                  }
                  className="rounded border-[var(--color-line)]"
                />
                {s.name}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditScopeRow({
  scope,
  teams,
  teamsError,
  teamsLoading,
  otherScopes,
  onSaved,
  onCancel,
}: {
  scope: ScopeRow;
  teams: LinearTeam[];
  teamsError: string | null;
  teamsLoading: boolean;
  otherScopes: { id: string; name: string }[];
  onSaved: (scope: ScopeRow) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<ScopeFormValue>({
    name: scope.name,
    teamKey: scope.teamKey,
    projectNames: scope.projectNames,
    labelFilter: scope.labelFilter ?? "",
    dependsOnScopeIds: scope.dependsOnScopeIds,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/scopes/${scope.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: value.name,
          teamKey: value.teamKey,
          projectNames: value.projectNames,
          labelFilter: value.labelFilter || null,
          dependsOnScopeIds: value.dependsOnScopeIds,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't save that.");
      onSaved(body.scope);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-[var(--color-line)] last:border-0 bg-[var(--color-accent-soft)]/30">
      <td colSpan={6} className="px-4 py-4">
        <ScopeFormFields
          teams={teams}
          teamsError={teamsError}
          teamsLoading={teamsLoading}
          value={value}
          onChange={setValue}
          otherScopes={otherScopes}
        />
        {error && <div className="text-sm text-[var(--color-danger)] mt-3">{error}</div>}
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-[var(--color-accent)] text-white px-3.5 py-1.5 text-xs font-medium hover:bg-[var(--color-accent-dark)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-[var(--color-line)] px-3.5 py-1.5 text-xs font-medium hover:bg-white disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function ScopesManager({ initialScopes }: { initialScopes: ScopeRow[] }) {
  const router = useRouter();
  const [scopes, setScopes] = useState(initialScopes);
  const [form, setForm] = useState<ScopeFormValue>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { teams, teamsError, teamsLoading } = useLinearTeams();

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
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to create scope.");
      let scope: ScopeRow = body.scope;
      if (form.dependsOnScopeIds.length > 0) {
        const patchRes = await fetch(`/api/scopes/${scope.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dependsOnScopeIds: form.dependsOnScopeIds }),
        });
        const patchBody = await patchRes.json().catch(() => ({}));
        if (!patchRes.ok) throw new Error(patchBody.error ?? "Scope created, but couldn't set its dependencies.");
        scope = patchBody.scope;
      }
      setScopes((prev) => [...prev, scope]);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    setDeleteError(null);
    const res = await fetch(`/api/scopes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setDeleteError(body.error ?? "Couldn't remove that scope.");
      return;
    }
    setScopes((prev) => prev.filter((s) => s.id !== id));
    router.refresh();
  }

  function scopeNames(ids: string[]): string {
    if (ids.length === 0) return "—";
    return ids.map((id) => scopes.find((s) => s.id === id)?.name ?? id).join(", ");
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
              <th className="px-4 py-3 font-medium">Depends on</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {scopes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-ink-soft)]">
                  No scopes yet — add one below.
                </td>
              </tr>
            )}
            {scopes.map((scope) =>
              editingId === scope.id ? (
                <EditScopeRow
                  key={scope.id}
                  scope={scope}
                  teams={teams}
                  teamsError={teamsError}
                  teamsLoading={teamsLoading}
                  otherScopes={scopes.filter((s) => s.id !== scope.id)}
                  onSaved={(updated) => {
                    setScopes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                    setEditingId(null);
                    router.refresh();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <tr key={scope.id} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="px-4 py-3 font-medium">{scope.name}</td>
                  <td className="px-4 py-3">{scope.teamKey}</td>
                  <td className="px-4 py-3 text-[var(--color-ink-soft)]">
                    {scope.projectNames.length > 0 ? scope.projectNames.join(", ") : <span className="italic">any</span>}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink-soft)]">
                    {scope.labelFilter || <span className="italic">none</span>}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink-soft)]">{scopeNames(scope.dependsOnScopeIds)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditingId(scope.id)}
                      className="text-[var(--color-accent-dark)] hover:underline text-xs mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(scope.id)}
                      className="text-[var(--color-danger)] hover:underline text-xs"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
        {deleteError && (
          <div className="px-4 py-3 text-xs text-[var(--color-danger)] border-t border-[var(--color-line)]">
            {deleteError}
          </div>
        )}
      </div>

      <form
        onSubmit={onCreate}
        className="border border-[var(--color-line)] rounded-xl bg-[var(--color-card)] p-6 space-y-4"
      >
        <h2 className="font-display text-lg">Add scope</h2>
        <ScopeFormFields
          teams={teams}
          teamsError={teamsError}
          teamsLoading={teamsLoading}
          value={form}
          onChange={setForm}
          otherScopes={scopes.map((s) => ({ id: s.id, name: s.name }))}
        />
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
