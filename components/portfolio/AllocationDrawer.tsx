"use client";

// Per-person allocation detail. Unchanged in substance from the pre-
// Instrument version -- same grid, same handlers, same warnings -- but it
// can no longer live as a light Workbench card underneath the surface,
// because Instrument Mode owns the viewport. It is now a drawer over the
// field, in the Instrument's own language, opened from the state bar.
//
// This is the "deep on demand" rung: the bay's Capacity fader is the fast
// answer ("what if we had more people"), this is the precise one ("who,
// exactly, and how split").

import type { PersonLike, CapacityResolution } from "@/lib/capacity/resolve";

export interface DrawerScope {
  scopeId: string;
  name: string;
  /** How precisely this Scope's team is known. A "team" Scope has no
      roster to edit here -- see the note in the grid below. */
  resolution: CapacityResolution;
  /** The flat number a "team" Scope is currently modelled as. */
  teamEstimate: number;
}

interface AllocationDrawerProps {
  open: boolean;
  onClose: () => void;
  scopes: DrawerScope[];
  people: PersonLike[];
  fractionFor: (personId: string, scopeId: string) => number;
  onSetFraction: (personId: string, scopeId: string, pct: number) => void;
  capacityByScope: Map<string, number>;
  overAllocated: { personId: string; personName: string; totalFraction: number }[];
  unallocated: { name: string; unallocatedFte: number }[];
  onRemovePerson: (personId: string) => void;
  removingId: string | null;
  removeError: string | null;
  /** Open the deliberate "start tracking this Scope by name" flow. */
  onConvertToNamed: (scopeId: string) => void;
}

export default function AllocationDrawer({
  open,
  onClose,
  scopes,
  people,
  fractionFor,
  onSetFraction,
  capacityByScope,
  overAllocated,
  unallocated,
  onRemovePerson,
  removingId,
  removeError,
  onConvertToNamed,
}: AllocationDrawerProps) {
  if (!open) return null;
  const overIds = new Set(overAllocated.map((o) => o.personId));
  const teamScopes = scopes.filter((s) => s.resolution !== "named");

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      style={{ background: "rgba(6,8,10,0.6)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Per-person allocation"
        onClick={(e) => e.stopPropagation()}
        className="h-full w-[720px] max-w-[94vw] overflow-y-auto"
        style={{ background: "var(--i-bg)", borderLeft: "1px solid var(--i-border-strong)" }}
      >
        <div
          className="sticky top-0 flex items-center justify-between px-5 py-3.5"
          style={{ background: "var(--i-panel)", borderBottom: "1px solid var(--i-border)" }}
        >
          <div>
            <div className="i-label">Capacity pool</div>
            <div className="mt-1 text-[13px] text-[var(--i-text)]">Who is on what</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-7 w-7 rounded flex items-center justify-center text-[var(--i-text-faint)] hover:text-[var(--i-text)]"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          {people.length === 0 ? (
            <div className="text-[12px] text-[var(--i-text-faint)] py-8 text-center">
              No people are tracked yet. Scopes without named people fall back to an aggregate capacity number —
              see &ldquo;Reality capacity&rdquo; in the Inspector.
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr>
                  <th className="text-left font-medium py-1.5 pr-3 text-[var(--i-text-soft)]">Person</th>
                  {scopes.map((s) => (
                    <th key={s.scopeId} className="text-left font-medium py-1.5 px-2 whitespace-nowrap text-[var(--i-text-soft)]">
                      {s.name}
                      <div className="mt-0.5 text-[9.5px] font-normal uppercase tracking-[0.1em] text-[var(--i-text-faint)]">
                        {s.resolution === "named" ? "by name" : `${s.teamEstimate.toFixed(1)} FTE team`}
                      </div>
                    </th>
                  ))}
                  <th className="text-left font-medium py-1.5 px-2 text-[var(--i-text-soft)]">Total</th>
                  <th className="py-1.5 px-2" />
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const total = scopes.reduce((sum, s) => sum + fractionFor(person.id, s.scopeId), 0);
                  const over = overIds.has(person.id);
                  return (
                    <tr key={person.id} style={{ borderTop: "1px solid var(--i-border)" }}>
                      <td className="py-2 pr-3 whitespace-nowrap text-[var(--i-text)]">
                        {person.name}
                        <span className="text-[var(--i-text-faint)]"> · {person.fte} FTE</span>
                      </td>
                      {scopes.map((s) => {
                        // A team-estimate Scope has no roster to edit. It
                        // used to render a live slider here that moved the
                        // forecast and then persisted nothing on Commit --
                        // the control said "you can put someone here" and
                        // the model had no way to record it. Naming people
                        // is a change of resolution, not an allocation, so
                        // it belongs to the deliberate flow below.
                        if (s.resolution !== "named") {
                          return (
                            <td key={s.scopeId} className="py-2 px-2">
                              <span
                                className="text-[var(--i-text-faint)] tabular-nums"
                                title={`${s.name} is modelled as ${s.teamEstimate.toFixed(1)} FTE, not as a roster — nobody is named here.`}
                              >
                                —
                              </span>
                            </td>
                          );
                        }
                        const pct = Math.round(fractionFor(person.id, s.scopeId) * 100);
                        return (
                          <td key={s.scopeId} className="py-2 px-2">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={pct}
                                aria-label={`${person.name} on ${s.name}`}
                                onChange={(e) => onSetFraction(person.id, s.scopeId, parseInt(e.target.value, 10))}
                                className="w-16 accent-[var(--i-violet)]"
                              />
                              <span className="w-8 text-right tabular-nums text-[var(--i-text-soft)]">{pct}%</span>
                            </div>
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 font-medium tabular-nums" style={{ color: over ? "var(--i-red)" : "var(--i-text)" }}>
                        {Math.round(total * 100)}%
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button
                          onClick={() => onRemovePerson(person.id)}
                          disabled={removingId === person.id}
                          className="text-[var(--i-red)] hover:underline whitespace-nowrap disabled:opacity-50"
                        >
                          {removingId === person.id ? "Removing…" : "Remove"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--i-border-strong)" }}>
                  <td className="py-2 pr-3 font-medium text-[var(--i-text-soft)]">Effective capacity</td>
                  {scopes.map((s) => (
                    <td key={s.scopeId} className="py-2 px-2 font-medium tabular-nums text-[var(--i-text)]">
                      {(capacityByScope.get(s.scopeId) ?? 0).toFixed(2)}
                    </td>
                  ))}
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          )}

          {teamScopes.length > 0 && (
            <div className="mt-4 space-y-2">
              {teamScopes.map((s) => (
                <div
                  key={s.scopeId}
                  className="rounded-md px-3.5 py-3 flex items-start justify-between gap-4"
                  style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
                >
                  <p className="text-[11px] leading-relaxed text-[var(--i-text-soft)]">
                    <strong className="text-[var(--i-text)]">{s.name}</strong> is modelled as{" "}
                    <strong className="text-[var(--i-text)]">{s.teamEstimate.toFixed(1)} FTE</strong>. People are not
                    assigned individually, so there is nobody here to move. Assigning people doesn&rsquo;t add capacity
                    — it switches {s.name} from a team estimate to a named roster, and that roster becomes its capacity.
                  </p>
                  <button
                    onClick={() => onConvertToNamed(s.scopeId)}
                    data-shoot={`assign-people-${s.scopeId}`}
                    className="shrink-0 rounded-md px-2.5 py-1.5 text-[10.5px] text-[var(--i-text-soft)] hover:text-[var(--i-text)] whitespace-nowrap"
                    style={{ border: "1px solid var(--i-border-strong)" }}
                  >
                    Assign people
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-[10.5px] text-[var(--i-text-faint)] leading-relaxed">
            Capacity scales linearly here (2× the people, half the time) — real teams rarely hit that in practice, so
            treat these as an optimistic floor, not a promise.
          </p>

          {overAllocated.length > 0 && (
            <div className="mt-3 text-[11px] text-[var(--i-red)]">
              Over-allocated: {overAllocated.map((o) => `${o.personName} at ${Math.round(o.totalFraction * 100)}%`).join(", ")} —
              fix before previewing further.
            </div>
          )}
          {unallocated.length > 0 && (
            <div className="mt-2 text-[11px] text-[var(--i-text-faint)]">
              Unallocated: {unallocated.map((u) => `${u.name} (${u.unallocatedFte.toFixed(2)} FTE free)`).join(", ")}
            </div>
          )}
          {removeError && <div className="mt-2 text-[11px] text-[var(--i-red)]">{removeError}</div>}
        </div>
      </div>
    </div>
  );
}
