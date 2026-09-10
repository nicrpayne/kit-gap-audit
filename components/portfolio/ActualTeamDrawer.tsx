"use client";

import { useEffect, useMemo, useState } from "react";
import { mutateReality } from "@/lib/instrument/reality";
import { rosterReadings, validateRosterDraft, type RosterPersonDraft } from "@/lib/capacity/reconciliation";
import { switchFactorFor } from "@/lib/capacity/resolve";

interface TeamScope {
  scopeId: string;
  name: string;
  forecastFte: number;
  explicitTeamCapacity: number | null;
  capacitySource: "allocations" | "explicit" | "inferred";
  reconciliationStatus: string;
}

interface TeamPerson {
  id: string;
  name: string;
  fte: number;
  active: boolean;
  synthetic?: boolean;
}

interface TeamAllocation { personId: string; scopeId: string; fraction: number }

export default function ActualTeamDrawer({
  open,
  onClose,
  onSaved,
  scopes,
  people,
  allocations,
  contextSwitchCostPct,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  scopes: TeamScope[];
  people: TeamPerson[];
  allocations: TeamAllocation[];
  contextSwitchCostPct: number;
}) {
  const initial = useMemo<RosterPersonDraft[]>(() => people
    .filter((person) => person.active && !person.synthetic)
    .map((person) => ({
      id: person.id,
      name: person.name,
      fte: person.fte,
      allocations: scopes.map((scope) => ({
        scopeId: scope.scopeId,
        fte: (allocations.find((item) => item.personId === person.id && item.scopeId === scope.scopeId)?.fraction ?? 0) * person.fte,
      })),
    })), [allocations, people, scopes]);
  const [draft, setDraft] = useState<RosterPersonDraft[]>(initial);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [complete, setComplete] = useState(false);
  const [differencesConfirmed, setDifferencesConfirmed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(initial); setRemovedIds([]); setComplete(false); setDifferencesConfirmed(false); setReviewing(false); setError(null);
  }, [initial, open]);

  const readings = useMemo(() => rosterReadings(draft, scopes.map((scope) => scope.scopeId), contextSwitchCostPct), [contextSwitchCostPct, draft, scopes]);
  const issues = useMemo(() => validateRosterDraft(draft, new Set(scopes.map((scope) => scope.scopeId))), [draft, scopes]);
  const differences = scopes.filter((scope) => {
    const raw = readings.byScope.get(scope.scopeId)?.raw ?? 0;
    return raw > 1e-6 && Math.abs(raw - scope.forecastFte) > 1e-6;
  });

  if (!open) return null;

  function updatePerson(index: number, patch: Partial<RosterPersonDraft>) {
    setDraft((current) => current.map((person, row) => row === index ? { ...person, ...patch } : person));
    setReviewing(false);
  }

  function updateAllocation(personIndex: number, scopeId: string, fte: number) {
    const person = draft[personIndex];
    updatePerson(personIndex, {
      allocations: person.allocations.map((item) => item.scopeId === scopeId ? { ...item, fte: Math.max(0, fte) } : item),
    });
  }

  function removePerson(index: number) {
    const person = draft[index];
    const active = person.allocations.reduce((sum, item) => sum + item.fte, 0);
    const message = active > 1e-6
      ? `${person.name} currently carries ${active.toFixed(2)} FTE. Removing them also removes those allocations. Continue?`
      : `Remove ${person.name} from the tracked roster?`;
    if (!window.confirm(message)) return;
    if (person.id) setRemovedIds((current) => [...new Set([...current, person.id!])]);
    setDraft((current) => current.filter((_, row) => row !== index));
    setReviewing(false);
  }

  async function save() {
    if (!complete || issues.length || (differences.length && !differencesConfirmed)) return;
    setSaving(true); setError(null);
    try {
      const response = await mutateReality("/api/capacity/roster", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people: draft,
          legacyBases: scopes.map((scope) => ({ scopeId: scope.scopeId, forecastFte: scope.forecastFte, source: scope.capacitySource })),
          contextSwitchCostPct,
          confirmComplete: true,
          confirmDifferences: differencesConfirmed,
          removePersonIds: removedIds,
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The roster could not be reconciled.");
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The roster could not be reconciled.");
    } finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/65" onClick={onClose} role="presentation">
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Set actual team"
      data-shoot="actual-team-roster"
      onClick={(event) => event.stopPropagation()}
      className="flex h-full w-[1040px] max-w-[97vw] flex-col"
      style={{ background: "var(--i-bg)", borderLeft: "1px solid var(--i-border-strong)" }}
    >
      <header className="flex items-start gap-4 border-b border-[var(--i-border)] bg-[var(--i-panel)] px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="i-label text-[var(--i-signal)]">SET ACTUAL TEAM</div>
          <h2 className="mt-1 text-[17px] font-medium text-[var(--i-text)]">Reconcile the complete named roster</h2>
          <p className="mt-1 text-[10.5px] text-[var(--i-text-soft)]">Approximate capacity allocation, not ticket assignment. 0.5 FTE means roughly half-time.</p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[9.5px] uppercase tracking-wide" style={{ background: complete ? "var(--i-signal-soft)" : "var(--i-amber-soft)", color: complete ? "var(--i-signal)" : "var(--i-amber)" }}>
          {complete ? "ready to reconcile" : "named partial · draft only"}
        </span>
        <button onClick={onClose} aria-label="Close actual team" className="text-[19px] text-[var(--i-text-faint)]">×</button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2" data-shoot="capacity-current-basis">
          {scopes.map((scope) => <div key={scope.scopeId} className="rounded-md border border-[var(--i-border)] bg-[var(--i-recess)] p-3">
            <div className="i-label text-[8.5px]">{scope.name} · current basis</div>
            <div className="mt-2 flex justify-between text-[10.5px]"><span className="text-[var(--i-text-soft)]">Forecast</span><strong className="i-readout text-[var(--i-text)]">{scope.forecastFte.toFixed(2)} FTE</strong></div>
            <div className="mt-1 flex justify-between text-[9.5px]"><span className="text-[var(--i-text-faint)]">Scope aggregate</span><span className="text-[var(--i-text-soft)]">{scope.explicitTeamCapacity == null ? "not set" : `${scope.explicitTeamCapacity.toFixed(2)} FTE`}</span></div>
            <div className="mt-1 text-[9.5px] text-[var(--i-amber)]">{scope.reconciliationStatus.replaceAll("_", " ")}</div>
          </div>)}
        </div>

        <div className="mt-4 overflow-x-auto rounded-md border border-[var(--i-border)]">
          <table className="w-full min-w-[900px] text-[10.5px]">
            <thead className="bg-[var(--i-panel)] text-left text-[9px] uppercase tracking-wide text-[var(--i-text-faint)]">
              <tr><th className="px-3 py-2">Person</th><th className="px-2 py-2">Available</th>{scopes.map((scope) => <th key={scope.scopeId} className="px-2 py-2">{scope.name}</th>)}<th className="px-2 py-2">Allocated / free</th><th className="px-2 py-2">Switch effect</th><th /></tr>
            </thead>
            <tbody>
              {draft.map((person, index) => {
                const total = person.allocations.reduce((sum, item) => sum + item.fte, 0);
                const scopeCount = person.allocations.filter((item) => item.fte > 1e-6).length;
                const factor = switchFactorFor(contextSwitchCostPct, scopeCount);
                return <tr key={person.id ?? `new-${index}`} className="border-t border-[var(--i-border)]">
                  <td className="px-3 py-2"><input aria-label={`Person ${index + 1} name`} value={person.name} placeholder="Name" onChange={(event) => updatePerson(index, { name: event.target.value })} className="signal-meter w-36 rounded px-2 py-1.5 text-[11px]" /></td>
                  <td className="px-2 py-2"><input aria-label={`${person.name || `Person ${index + 1}`} available FTE`} type="number" min="0.1" max="1" step="0.1" value={person.fte} onChange={(event) => updatePerson(index, { fte: Number(event.target.value) })} className="signal-meter w-16 rounded px-2 py-1.5 tabular-nums" /></td>
                  {scopes.map((scope) => {
                    const value = person.allocations.find((item) => item.scopeId === scope.scopeId)?.fte ?? 0;
                    return <td key={scope.scopeId} className="px-2 py-2"><div className="flex items-center gap-1"><input aria-label={`${person.name || `Person ${index + 1}`} ${scope.name} allocation`} type="range" min="0" max={Math.max(0.1, person.fte)} step="0.05" value={Math.min(value, person.fte)} onChange={(event) => updateAllocation(index, scope.scopeId, Number(event.target.value))} className="w-14 accent-[var(--i-violet)]" /><input type="number" min="0" max={person.fte} step="0.05" value={value} onChange={(event) => updateAllocation(index, scope.scopeId, Number(event.target.value))} className="signal-meter w-14 rounded px-1.5 py-1 tabular-nums" /></div></td>;
                  })}
                  <td className="px-2 py-2 tabular-nums"><div className={total > person.fte + 1e-6 ? "text-[var(--i-red)]" : "text-[var(--i-text)]"}>{total.toFixed(2)} / {Math.max(0, person.fte - total).toFixed(2)}</div></td>
                  <td className="px-2 py-2"><div className="text-[var(--i-text-soft)]">{scopeCount} project{scopeCount === 1 ? "" : "s"}</div><div className="text-[9px] text-[var(--i-text-faint)]">{Math.round(factor * 100)}% effective</div></td>
                  <td className="px-2 py-2"><button onClick={() => removePerson(index)} className="text-[var(--i-red)]">Remove</button></td>
                </tr>;
              })}
            </tbody>
            <tfoot className="border-t-2 border-[var(--i-border-strong)] bg-[var(--i-recess)]">
              <tr><td className="px-3 py-2 font-medium text-[var(--i-text-soft)]">Proposed named team</td><td className="px-2 py-2 i-readout">{readings.workforceFte.toFixed(2)}</td>{scopes.map((scope) => { const value = readings.byScope.get(scope.scopeId); return <td key={scope.scopeId} className="px-2 py-2"><div className="i-readout text-[var(--i-text)]">{value?.raw.toFixed(2)} raw</div><div className="text-[9px] text-[var(--i-text-faint)]">{value?.effective.toFixed(2)} effective</div></td>; })}<td className="px-2 py-2 text-[var(--i-text-soft)]">{readings.freeFte.toFixed(2)} free</td><td /><td /></tr>
            </tfoot>
          </table>
        </div>
        <button onClick={() => setDraft((current) => [...current, { name: "", fte: 1, allocations: scopes.map((scope) => ({ scopeId: scope.scopeId, fte: 0 })) }])} className="mt-3 rounded border border-[var(--i-border-strong)] px-3 py-1.5 text-[10.5px] text-[var(--i-text-soft)]">+ Add person</button>

        {issues.length > 0 && <div className="mt-3 rounded border border-[var(--i-red)]/35 bg-[var(--i-red)]/10 px-3 py-2 text-[10.5px] text-[var(--i-red)]">{issues.map((issue) => <div key={`${issue.code}-${issue.message}`}>{issue.message}</div>)}</div>}

        {reviewing && <section className="mt-4 rounded-md border border-[var(--i-signal)]/35 bg-[var(--i-panel)] p-4" data-shoot="roster-reconciliation-summary">
          <div className="i-label text-[var(--i-signal)]">RECONCILIATION SUMMARY</div>
          <h3 className="mt-1 text-[14px] text-[var(--i-text)]">Replace legacy aggregate bases with the complete named roster</h3>
          <div className="mt-3 space-y-1.5">{scopes.map((scope) => { const named = readings.byScope.get(scope.scopeId) ?? { raw: 0, effective: 0 }; const diff = named.raw - scope.forecastFte; return <div key={scope.scopeId} className="grid grid-cols-[1fr_100px_100px_90px] gap-2 text-[10.5px]"><strong className="text-[var(--i-text)]">{scope.name}</strong><span className="text-[var(--i-text-soft)]">legacy {scope.forecastFte.toFixed(2)}</span><span className="text-[var(--i-text-soft)]">named {named.raw.toFixed(2)}</span><span style={{ color: Math.abs(diff) > 1e-6 ? "var(--i-amber)" : "var(--i-signal)" }}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)}</span></div>; })}</div>
          {differences.length > 0 && <label className="mt-3 flex items-start gap-2 text-[10.5px] text-[var(--i-text-soft)]"><input type="checkbox" checked={differencesConfirmed} onChange={(event) => setDifferencesConfirmed(event.target.checked)} />I confirm the named totals intentionally differ from the legacy basis.</label>}
          <label className="mt-3 flex items-start gap-2 text-[10.5px] text-[var(--i-text-soft)]"><input type="checkbox" checked={complete} onChange={(event) => setComplete(event.target.checked)} />This is the complete roster for the tracked team. Make named allocations authoritative wherever a project has assigned capacity.</label>
          <p className="mt-2 text-[9.5px] text-[var(--i-text-faint)]">Legacy aggregate values and provenance stay in history. No ticket assignments are created.</p>
        </section>}
        {error && <div className="mt-3 text-[10.5px] text-[var(--i-red)]">{error}</div>}
      </div>

      <footer className="flex items-center justify-between border-t border-[var(--i-border)] bg-[var(--i-panel)] px-5 py-3">
        <span className="text-[9.5px] text-[var(--i-text-faint)]">Raw allocation is conserved; context-switch cost only changes effective FTE.</span>
        <div className="flex gap-2"><button onClick={onClose} className="rounded border border-[var(--i-border-strong)] px-3 py-1.5 text-[10.5px] text-[var(--i-text-soft)]">Cancel</button>{!reviewing ? <button disabled={issues.length > 0 || draft.length === 0} onClick={() => setReviewing(true)} className="rounded bg-[var(--i-text)] px-3 py-1.5 text-[10.5px] font-medium text-[var(--i-void)] disabled:opacity-30">Review reconciliation</button> : <button disabled={saving || !complete || issues.length > 0 || (differences.length > 0 && !differencesConfirmed)} onClick={() => void save()} className="rounded bg-[var(--i-signal)] px-3 py-1.5 text-[10.5px] font-medium text-[var(--i-void)] disabled:opacity-30">{saving ? "Reconciling…" : "Confirm complete roster"}</button>}</div>
      </footer>
    </section>
  </div>;
}
