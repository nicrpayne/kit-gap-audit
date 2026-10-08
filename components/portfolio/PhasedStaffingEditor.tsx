"use client";

import React, { useMemo, useState } from "react";
import { useModalFocus } from "@/lib/instrument/useModalFocus";
import type { ProjectModel } from "@/lib/instrument/useProject";
import { buildCapacityPlanBaseline } from "@/lib/scenario/capacityPlan";
import { createPhasedCapacityPlan, validatePhasedCapacityPlan } from "@/lib/scenario/phasedCapacity";
import { toDateOnly, formatDateOnly } from "@/lib/time/dateContract";

const button = "rounded-md border border-[var(--i-border-strong)] px-3 py-2 text-[12px] disabled:opacity-40 hover:brightness-125";
const input = "mt-1 block w-full rounded border border-[var(--i-border-strong)] bg-[var(--i-void)] p-2";

export default function PhasedStaffingEditor({ project }: { project: ProjectModel }) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fraction, setFraction] = useState("1");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const modal = useModalFocus(open, () => setOpen(false));
  const data = project.data;
  const plan = project.scenario.phasedCapacityPlan;
  const baseline = useMemo(() => data ? buildCapacityPlanBaseline({ people: data.people, allocations: data.allocations, contextSwitchCostPct: data.contextSwitchCostPct, scopeRevisionById: Object.fromEntries(data.scopes.map(scope => [scope.scopeId, scope.realityState.realityRevision])) }) : null, [data]);
  const overlap = !!project.scenario.capacityPlan || Object.keys(project.scenario.capacityOverrideByScope).length > 0 || project.scenario.contextSwitchCostPct !== null;
  const person = data?.people.find(row => row.id === personId);
  const scopeName = (id: string) => data?.scopes.find(scope => scope.scopeId === id)?.name ?? id;
  const stale = baseline && plan ? validatePhasedCapacityPlan(plan, baseline) : null;

  function add() {
    setError(null);
    try {
      if (!baseline || !personId || !from || !to || !date) throw new Error("Choose a person, both projects, and your proposed move date.");
      if (data && date < data.startDate.slice(0, 10)) throw new Error("Choose a move date on or after this forecast starts. This control plans a future handoff, not a historical assignment correction.");
      if (overlap) throw new Error("Clear the immediate staffing experiment first. Dated moves are a separate staffing mode.");
      if (stale && !stale.ok) throw new Error(stale.reason);
      const next = createPhasedCapacityPlan({ baseline, transfers: [...(plan?.transfers ?? []), { id: crypto.randomUUID(), personId, fromScopeId: from, toScopeId: to, fraction: Number(fraction), effectiveDate: toDateOnly(date) }] });
      project.setScenario(previous => ({ ...previous, phasedCapacityPlan: next }));
      setDate("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The dated move could not be added."); }
  }
  function remove(id: string) {
    setError(null);
    try {
      if (!plan) return;
      const transfers = plan.transfers.filter(row => row.id !== id);
      const next = transfers.length ? createPhasedCapacityPlan({ baseline: plan.baselineFingerprint, transfers }) : null;
      project.setScenario(previous => ({ ...previous, phasedCapacityPlan: next }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Another move depends on this one. Clear the whole dated plan to start again."); }
  }
  return <>
    <button className={button} type="button" disabled={!data} onClick={() => { setError(null); setOpen(true); }} data-shoot="dated-staffing-open" style={{ color: "var(--i-violet)" }}>{plan ? `Review ${plan.transfers.length} dated staffing move${plan.transfers.length === 1 ? "" : "s"}` : "Plan a staffing move"}</button>
    {open && data && <div className="fixed inset-0 z-[145] flex items-center justify-center bg-black/65 p-4"><div ref={modal} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dated-staffing-title" className="w-full max-w-[720px] max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--i-violet)] bg-[var(--i-panel)] p-5 text-[var(--i-text)] shadow-2xl">
      <div className="flex items-center justify-between gap-3"><h2 id="dated-staffing-title" className="text-xl">When should someone move?</h2><button className={button} onClick={() => setOpen(false)}>Close</button></div>
      <p className="mt-3 text-sm text-[var(--i-text-soft)]">Try a dated handoff between projects. The person stays on the first project until that date, then the selected share moves to the second. Actual assignments stay unchanged.</p>
      <p className="mt-2 text-sm text-[var(--i-amber)]">This is a date you choose—not “when Offline is done.” Signal does not yet trigger moves from feature completion. Forecasting still uses calendar days.</p>
      {overlap && <p className="mt-3 text-sm text-[var(--i-amber)]">You have an immediate staffing or switch-cost experiment. Clear that experiment before adding dated moves.</p>}
      {stale && !stale.ok && <p role="alert" className="mt-3 text-sm text-[var(--i-amber)]">{stale.reason} Clear the dated plan and recreate it using the updated team.</p>}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <label>Person<select className={input} value={personId} onChange={event => { setPersonId(event.target.value); setFrom(""); }}><option value="">Choose a person</option>{data.people.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name} · {row.fte} total FTE · {row.externalCommitmentFte ?? 0} outside</option>)}</select></label>
        <label>Move date<input className={input} type="date" min={data.startDate.slice(0, 10)} value={date} onChange={event => setDate(event.target.value)} /></label>
        <label>From project<select className={input} value={from} onChange={event => setFrom(event.target.value)}><option value="">Choose current project</option>{data.scopes.map(scope => <option key={scope.scopeId} value={scope.scopeId}>{scope.name}</option>)}</select></label>
        <label>To project<select className={input} value={to} onChange={event => setTo(event.target.value)}><option value="">Choose destination</option>{data.scopes.filter(scope => scope.scopeId !== from).map(scope => <option key={scope.scopeId} value={scope.scopeId}>{scope.name}</option>)}</select></label>
        <label>Share of this person’s total capacity<input className={input} type="number" min="0.01" max="1" step="0.05" value={fraction} onChange={event => setFraction(event.target.value)} /><span className="mt-1 block text-xs text-[var(--i-text-soft)]">1 = full capacity · 0.5 = half{person ? ` · this move is ${(person.fte * Number(fraction || 0)).toFixed(2)} FTE` : ""}. The source project must hold that share; outside commitments cannot be moved.</span></label>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-[var(--i-red)]">{error}</p>}
      <button className={`${button} mt-4`} disabled={overlap || !!(stale && !stale.ok)} onClick={add}>Try dated move in Scenario</button>
      {plan && <section className="mt-5 border-t border-[var(--i-border)] pt-4"><h3 className="font-semibold">Moves in this Scenario</h3><ul className="mt-3 space-y-2">{plan.transfers.map(row => <li key={row.id} className="flex items-start justify-between gap-3 rounded border border-[var(--i-border)] p-3 text-sm"><span>{data.people.find(person => person.id === row.personId)?.name ?? row.personId}: {(row.fraction * 100).toFixed(0)}% from {scopeName(row.fromScopeId)} to {scopeName(row.toScopeId)} on {formatDateOnly(row.effectiveDate, { month: "short", day: "numeric", year: "numeric" })}</span><button className={button} onClick={() => remove(row.id)}>Remove</button></li>)}</ul><button className={`${button} mt-3`} onClick={() => { project.setScenario(previous => ({ ...previous, phasedCapacityPlan: null })); setError(null); }}>Clear dated moves only</button></section>}
      {project.simulationError && plan && <p role="alert" className="mt-4 text-sm text-[var(--i-amber)]">{project.simulationError}</p>}
      <p className="mt-4 text-xs text-[var(--i-text-faint)]">Forecast and report replay use these dates. Capacity faders show today’s allocation, not future staffing. Use Saved Scenarios to keep this plan.</p>
    </div></div>}
  </>;
}
