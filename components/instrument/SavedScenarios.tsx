"use client";

import React, { useEffect, useRef, useState } from "react";
import { useModalFocus } from "@/lib/instrument/useModalFocus";
import { detachArchivedScenario, openSavedScenario, recordScenarioSaved, resetScenarioWorkspace, reviewScenarioAgainstCurrentReality, scenarioIsActive, useScenarioWorkspace } from "@/lib/instrument/useProject";
import { compareSavedScenarioBaseline, encodeSavedScenario, type SavedScenarioDetailEnvelope, type SavedScenarioListEnvelope, type SavedScenarioSummary } from "@/lib/scenario/saved";
import {
  encodePendingScenarioMutation,
  resolvePendingScenarioMutation,
  SCENARIO_PENDING_MUTATION_KEY,
  upsertScenarioMutationResult,
  type PendingScenarioMutation,
} from "@/lib/scenario/workspaceRecovery";

const button = "rounded-md border border-[var(--i-border-strong)] px-3 py-2 text-[12px] hover:brightness-125 disabled:opacity-40";

export default function SavedScenarios() {
  const workspace = useScenarioWorkspace();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SavedScenarioSummary[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [replaceDraft, setReplaceDraft] = useState<SavedScenarioSummary | null>(null);
  const [archiveRow, setArchiveRow] = useState<SavedScenarioSummary | null>(null);
  const attempt = useRef<PendingScenarioMutation | null>(null);
  const modal = useModalFocus(open, () => { if (!busy) setOpen(false); });
  const active = scenarioIsActive(workspace.scenario);
  const stale = workspace.scenarioBaseline && workspace.currentBaseline ? compareSavedScenarioBaseline(workspace.scenarioBaseline, workspace.currentBaseline) : null;
  const needsReview = stale?.state === "stale";

  function retryKey(signature: string): string {
    let storedRaw: string | null = null;
    try { storedRaw = sessionStorage.getItem(SCENARIO_PENDING_MUTATION_KEY); } catch { /* The in-memory key still protects ordinary retries. */ }
    attempt.current = resolvePendingScenarioMutation({ signature, current: attempt.current, storedRaw, createId: () => crypto.randomUUID() });
    try { sessionStorage.setItem(SCENARIO_PENDING_MUTATION_KEY, encodePendingScenarioMutation(attempt.current)); } catch { /* Recovery notice handles unavailable storage. */ }
    return attempt.current.id;
  }
  function mutationSucceeded(detail: SavedScenarioDetailEnvelope["scenario"]) {
    attempt.current = null;
    try { sessionStorage.removeItem(SCENARIO_PENDING_MUTATION_KEY); } catch { /* Already saved on the server. */ }
    setRows(current => upsertScenarioMutationResult(current, detail));
  }
  async function refreshAfterSuccess() {
    try { await list(); } catch { setNotice(current => `${current ?? "Saved successfully."} The library refresh failed; close and reopen it to refresh the list.`); }
  }

  async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: "no-store", ...options });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "The Scenario request could not be completed. Your draft is still here.");
    return body;
  }
  async function list() {
    const body = await request<SavedScenarioListEnvelope>("/api/scenarios?status=all");
    setRows(body.scenarios); if (body.freshnessWarning) setNotice(body.freshnessWarning);
  }
  useEffect(() => {
    if (!open) return;
    setName(workspace.savedScenario?.name ?? ""); setReviewed(false); setError(null); setReplaceDraft(null); setArchiveRow(null);
    let cancelled = false;
    setBusy(true);
    request<SavedScenarioListEnvelope>("/api/scenarios?status=all").then(body => { if (!cancelled) { setRows(body.scenarios); setNotice(body.freshnessWarning); } }).catch(cause => { if (!cancelled) setError(cause.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
    // Opening captures the working name, not each background revalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { setReviewed(false); }, [workspace.currentBaseline?.fingerprint]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The Scenario request failed. Your draft remains unchanged."); }
    finally { setBusy(false); }
  }
  async function save(copy: boolean) {
    await run(async () => {
      if (!workspace.scenarioBaseline || !workspace.currentBaseline || needsReview || workspace.inputVerificationError) throw new Error("Review current Reality before saving this Scenario.");
      const payload = encodeSavedScenario(workspace.scenario);
      const updating = !copy && workspace.savedScenario;
      const body = { name, payload, baseline: workspace.scenarioBaseline, ...(updating ? { expectedRevision: updating.revision } : {}) };
      const signature = JSON.stringify({ id: updating ? updating.id : null, body });
      const response = await request<SavedScenarioDetailEnvelope>(updating ? `/api/scenarios/${encodeURIComponent(updating.id)}` : "/api/scenarios", {
        method: updating ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: retryKey(signature) }),
      });
      recordScenarioSaved(response.scenario, JSON.stringify(payload), workspace.draftGeneration); mutationSucceeded(response.scenario);
      setNotice(`Saved “${response.scenario.name}” · revision ${response.scenario.revision}. Accepted Reality is unchanged.`);
      await refreshAfterSuccess();
    });
  }
  async function loadRow(row: SavedScenarioSummary) {
    await run(async () => {
      const response = await request<SavedScenarioDetailEnvelope>(`/api/scenarios/${encodeURIComponent(row.id)}`);
      openSavedScenario(response.scenario); setReplaceDraft(null); setName(response.scenario.name); setOpen(false);
    });
  }
  async function archive(row: SavedScenarioSummary) {
    await run(async () => {
      const body = { expectedRevision: row.revision, archived: row.status !== "archived", archiveReason: row.status === "archived" ? null : "Archived by operator from Scenario library." };
      const response = await request<SavedScenarioDetailEnvelope>(`/api/scenarios/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: retryKey(JSON.stringify({ id: row.id, body })) }) });
      mutationSucceeded(response.scenario);
      if (response.scenario.status === "archived") detachArchivedScenario(row.id);
      setArchiveRow(null); setNotice(row.status === "archived" ? "Scenario restored to the library." : "Scenario archived. You can restore it here; the working draft was not changed.");
      await refreshAfterSuccess();
    });
  }
  async function acceptCurrentInputs() {
    await run(async () => {
      reviewScenarioAgainstCurrentReality();
      setReviewed(false);
    });
  }

  return <>
    <button type="button" className={button} onClick={() => setOpen(true)} data-attention={needsReview ? "required" : undefined} data-shoot="saved-scenarios-open" style={{ color: "var(--i-violet)" }}>
      {needsReview ? "Review saved Scenario" : workspace.savedScenario ? `${workspace.savedScenario.name}${workspace.scenarioDirty ? " · unsaved" : " · saved"}` : "Saved Scenarios"}
    </button>
    {open && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 p-4">
      <div ref={modal} role="dialog" aria-modal="true" aria-labelledby="scenario-library-title" tabIndex={-1} className="w-full max-w-[760px] max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--i-violet)] bg-[var(--i-panel)] p-5 text-[var(--i-text)] shadow-2xl">
        <div className="flex items-center justify-between gap-4"><h2 id="scenario-library-title" className="text-xl">Saved Scenarios</h2><button className={button} onClick={() => setOpen(false)} disabled={busy} aria-label="Close Saved Scenarios">Close</button></div>
        <p className="mt-2 text-sm text-[var(--i-text-soft)]">Keep a what-if, reopen it later, and compare it with current Reality. Saving never accepts a business decision or changes the actual team.</p>
        <p className="mt-2 text-xs text-[var(--i-text-faint)]">Named saves live in Signal’s shared workspace—not a private executive report. This tab also keeps a reload recovery copy.</p>
        {workspace.recoveryNotice && <p className="mt-3 text-sm">{workspace.recoveryNotice}</p>}
        {workspace.inputVerificationError && <section className="mt-4 rounded-lg border border-[var(--i-amber)] p-4" role="alert">
          <h3 className="font-semibold text-[var(--i-amber)]">Current project inputs are not verified</h3>
          <p className="mt-2 text-sm">{workspace.inputVerificationError}</p>
          <p className="mt-2 text-xs">The draft is retained, but its preview and named save remain held until a successful current-input check.</p>
        </section>}
        {needsReview && <section className="mt-4 rounded-lg border border-[var(--i-amber)] p-4" role="alert">
          <h3 className="font-semibold text-[var(--i-amber)]">The project changed since this Scenario started</h3>
          <ul className="my-3 list-disc pl-5 text-sm">{stale.differences.map((difference, index) => <li key={index}>{difference.kind === "portfolio_inputs_changed" ? "The forecast start day, tickets, evidence, estimates, team, dependencies, or release coverage changed. Revisit those inputs before relying on this what-if." : `${workspace.data?.scopes.find(scope => scope.scopeId === difference.scopeId)?.name ?? difference.scopeId}: ${difference.kind.replaceAll("_", " ")}${difference.kind === "scope_revision_changed" ? ` (${difference.savedRevision} → ${difference.currentRevision})` : ""}.`}</li>)}</ul>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed the current project inputs and want to retry these assumptions against them.</label>
          <button className={`${button} mt-3`} disabled={!reviewed || busy || !!workspace.inputVerificationError} onClick={() => void acceptCurrentInputs()}>Use current Reality for this draft</button>
          <p className="mt-2 text-xs">Individual staffing and estimate checks still apply. This does not overwrite the named saved version.</p>
        </section>}
        {error && <p role="alert" className="mt-3 text-sm text-[var(--i-red)]">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-[var(--i-mint)]">{notice}</p>}
        <section className="my-5 rounded-lg border border-[var(--i-border)] p-4">
          <h3 className="font-semibold">Current what-if</h3>
          {active ? <><label className="mt-3 block text-sm">Scenario name<input value={name} maxLength={120} onChange={event => setName(event.target.value)} className="mt-2 block w-full rounded border border-[var(--i-border-strong)] bg-[var(--i-void)] p-2" placeholder="A name you will recognize on the next call" /></label><div className="mt-3 flex flex-wrap gap-2"><button className={button} disabled={busy || needsReview || !!workspace.inputVerificationError || !name.trim()} onClick={() => void save(false)}>{workspace.savedScenario ? "Update saved version" : "Save Scenario"}</button>{workspace.savedScenario && <button className={button} disabled={busy || needsReview || !!workspace.inputVerificationError || !name.trim()} onClick={() => void save(true)}>Save as a new Scenario</button>}<button className={button} disabled={busy} onClick={() => { setReplaceDraft({ id: "reality", name: "Reality" } as SavedScenarioSummary); }}>Return to Reality</button></div></> : <p className="mt-2 text-sm text-[var(--i-text-soft)]">Try a scope, estimate, Decision, or staffing change first—or open a saved Scenario below.</p>}
        </section>
        {replaceDraft && <section className="mb-4 rounded border border-[var(--i-amber)] p-3"><p className="text-sm">Replace this tab’s current draft with {replaceDraft.name}? Unsaved edits will be lost. Named saved versions remain available.</p><div className="mt-2 flex gap-2"><button className={button} disabled={busy} onClick={() => { if (replaceDraft.id === "reality") { resetScenarioWorkspace(); setReplaceDraft(null); } else void loadRow(replaceDraft); }}>Replace draft</button><button className={button} onClick={() => setReplaceDraft(null)}>Keep editing</button></div></section>}
        <h3 className="font-semibold">Scenario library</h3>
        {!busy && !rows.length && <p className="mt-3 text-sm">No named Scenarios yet.</p>}
        <div className="mt-3 space-y-2">{rows.map(row => <article key={row.id} className="rounded-lg border border-[var(--i-border)] p-3"><div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold">{row.name}</h4><p className="mt-1 text-xs text-[var(--i-text-soft)]">Revision {row.revision} · {row.levers.total} assumptions · {row.status === "archived" ? "archived" : row.freshness.state === "current" ? "inputs match" : row.freshness.state === "stale" ? "inputs changed · review before use" : "current inputs could not be checked"}</p></div><div className="flex flex-wrap gap-2">{row.status === "active" && <button className={button} disabled={busy} onClick={() => { if (active && workspace.scenarioDirty) setReplaceDraft(row); else void loadRow(row); }}>Open</button>}<button className={button} disabled={busy} onClick={() => row.status === "archived" ? void archive(row) : setArchiveRow(row)}>{row.status === "archived" ? "Restore" : "Archive"}</button></div></div>{archiveRow?.id === row.id && <div className="mt-3 text-sm">Archive this named Scenario? It remains recoverable here.<div className="mt-2 flex gap-2"><button className={button} disabled={busy} onClick={() => void archive(row)}>Confirm archive</button><button className={button} disabled={busy} onClick={() => setArchiveRow(null)}>Cancel</button></div></div>}</article>)}</div>
        {busy && <p role="status" className="mt-3 text-sm">Working… Your draft remains available.</p>}
      </div>
    </div>}
  </>;
}
