# The Decisions instrument

## The law this instrument exists to enforce

**A decision is not a gate.**

A *decision* is a choice that matters: "should addresses be stored as
structured fields or as a single string?" A *gate* is a structural claim
about delivery: "the address form cannot be built until that choice is
settled, and settling it could take between three and twenty-five days."

The first is common. The second is rare, and it is the only one the
forecast is allowed to see.

Before this instrument, the two were the same row. `Finding(type =
"decision")` carried `severity`, `blocking` and `status`, and the forecast
gated on the combination — so writing down that a choice existed, and
ticking a box, silently moved every date on the path, with no record of
what was waiting or why. `docs/CONTEXT-MODEL.md` had already drawn this
boundary for machine-derived understanding; this closes the same gap for
human decisions.

## The model

| Model | What it is |
| --- | --- |
| `Decision` | The choice. `open` / `decided` / `dismissed`, plus optional owner, rationale, needed-by, options, chosen option, resolution. |
| `DecisionGate` | Nullable, one per decision. The *claim* that delivery waits. Carries the structured target, why it is serial, the evidence for that, and a three-point estimate. |
| `DecisionEvidence` | Many per decision. A cited excerpt with as much provenance as its source honestly supports. |
| `DecisionCandidate` | A machine suggestion that has **not** been accepted. Never Reality. |

`Decision.gate == null` means zero forecast effect — not "low priority",
not "not yet triaged". It is the ordinary state of a real decision.

## The one authoritative gate path

`lib/forecast/compute.ts` reads gates from exactly one query:

```ts
prisma.decisionGate.findMany({
  where: { targetScopeId: scope.id, serial: true, decision: { status: "open" } },
})
```

Nothing else can produce a gate. `lib/forecast/build.ts` no longer inspects
Finding type, severity or `blocking`, and `openWorkFindings` continues to
exclude decision Findings, so a legacy row cannot contribute twice or at
all. `scripts/decisions-model-proof.ts` proves this by creating exactly the
row the old rule would have gated on and asserting that no date moves.

Legacy Finding rows are never modified or deleted. They are history and the
rollback path.

## Why connecting to delivery is deliberately slow

`POST /api/decisions/[id]/gate` refuses anything that does not answer four
questions:

1. **What waits on this?** — a real Scope. Not free text.
2. **Why can't it proceed?** — prose, but required prose.
3. **What evidence supports that?** — likewise.
4. **How long could resolving it take?** — `low ≤ likely ≤ high`, `low > 0`.

There is no automatic eligibility. Type, severity, owner and any notion of
"blocking" are explicitly *not* inputs. The friction is the product: a gate
is an auditable claim, and someone has to make it.

## Engine limitation: gates are strictly serial

`lib/forecast/simulate.ts` computes a scope's own duration as

```
effort / capacity + Σ (sampled gate durations)
```

Gate time is **added**, in series, every trial. The engine has no model of
decisions resolving concurrently, or of a decision that delays only part of
a scope's work.

Consequences, stated rather than hidden:

- Only a genuinely serial dependency may become a gate. `DecisionGate.serial`
  exists so a future concurrent model can be added without a migration that
  silently reinterprets today's rows; every current row is `true`, and
  compute.ts filters on it.
- Two gates on one scope add up. If two choices would realistically be
  resolved in the same week, modelling both as gates overstates the delay.
  The honest response is one gate, or none.
- A decision that matters but could resolve in parallel stays **open and
  ungated**. It is not less important; the engine simply cannot represent it
  without lying.

`simulate.ts` and `portfolio.ts` were not modified by this work.

## Candidates: where machine suggestions stop

`DerivedClaim` is documented as inert — "never itself a Finding, forecast
input, Linear ticket, or Reality". `lib/decisions/candidates.ts` is the only
reader of those claims, and it writes `DecisionCandidate` rows and nothing
else. It runs at `POST /api/refresh`, immediately after a context package is
persisted, so a refinement call becomes a tray of suggestions with no button
press and no consequence.

Accepting a candidate is idempotent by database constraint:
`Decision.sourceClaimKey` is unique, so a retried accept returns the
decision it already created rather than a second one.

## Scenario

"Assume decided" writes `SuiteScenario.resolvedGateIds` — the set Forecast
and Scope already read. There is no second scenario system. Reality stays
open; the circuit says so; discarding returns to Reality exactly.

The action is offered only for gate-connected decisions. Assuming an ungated
decision resolved would change nothing the engine can see, and a control
that pretends otherwise is worse than no control.

## What the circuit draws, and what it refuses to

The delivery path uses real landmarks only: the selected Scope, its actual
`targetDate` if it has one, its simulated landing, and the Scopes that
genuinely list it in `dependsOnScopeIds`. There is no Release model in this
app, so the circuit does not draw one. When Timeline has a real model, it
can supply richer nodes.

Only gates connect to the path. Open decisions, candidates, decided choices
and dismissals sit in lanes below, touching nothing — the geometry teaches
the law before any label is read.
