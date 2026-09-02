# Signal Audit production-parity diagnosis

Date: 2026-09-02
Candidate investigated: `89bab199c5f912ae1b6344b7ca5fdb171ffe112c`

## Rollback

- Production was moved by a non-force revert commit to `db72637423f919362e1556958efb64fa1f16a89f`.
- Its tree is byte-identical to the requested rollback target
  `3053a964014080a40c5a658f1c667e6618ace0b8` (`8ecf9688d6c4f76e3cd50ca59b1934e3dbc4feca`).
- Railway deployment `6213970009` reported success at `2026-09-02T02:04:54Z`.
- The authenticated production Audit loaded read-only: 438 nodes, 50 opened,
  44 calm relationships.
- The rollback target predates both `app/api/version/route.ts` and the visible
  build marker. Consequently `/api/version` returned 401 and no marker was
  present. The rollback is verified by the exact remote tree and Railway's
  deployment record, not by checks that do not exist in that historical tree.
- Experimental remained at `89bab199c5f912ae1b6344b7ca5fdb171ffe112c`
  throughout rollback and diagnosis.

## Exact discrepancy

The acceptance fixture did not represent production's topology at the zoom
tier and disclosure state used by the smoke test.

| Input | Local acceptance fixture | Production JSA |
|---|---:|---:|
| Canonical nodes | 427 | 438 |
| Relationships | 439 | 543 |
| Core/opened identities | 27 | 50 |
| Evidence passages | 194 | 164 |
| External-intelligence objects | 192 | 161 |
| Source artifacts | 8 | 48 |
| Source memberships | 194 across 6 sources | 164 across 47 sources |
| Far-tier canonical projection | 55 | 191 |
| Aggregate regions | 8 | 21 |
| Live Rubric population (canonical + regions) | 63 | 212 |
| Parent groups in the live field | 14 | 29 |
| Browser own-hub result before fix | 97.2% | 59.6% |

The headline corpus sizes hid the material difference. The fixture concentrated
passages into two very large invented sources. Production distributed fewer
passages across 47 sources, placing 48 source-artifact hubs and 21 aggregate
regions into the far-tier field. The prior Rubric field bounded the four
first-level territories but did not bound Audit’s second-level source and
subtype cells. Collision could therefore leave a member across a neighboring
hub’s bisector, especially in Evidence.

Settlement compounded the topology mismatch. The pre-fix morph wrote its
paint interpolation back into the live D3 coordinates, and the local cell pull
ran once per browser frame. On the exact production graph, otherwise identical
120 Hz, 60 Hz, 30 Hz and jittered schedules ended at 52.1%, 82.2%, 76.7% and
91.8%. The production smoke result was therefore neither an early sample that
would eventually converge nor random noise; the old field could pass through
90% and then leave it, with the final state depending on frame cadence.

## Environment and state

Production and the reproduction both used a 1280×720 browser viewport, device
pixel ratio 2, an 812×628.75 graph field, loaded fonts and the far zoom tier.
The field physics derives its bound from projected population, not CSS pixels.
Panel size and camera affect framing, not semantic coordinates.

The matched initial state was Rings, 50 core identities open, no expanded or
revealed clusters, no Search, Trace, selection or history restoration. The
population discrepancy therefore came from graph topology/core census rather
than stale UI state.

All explicit Signal seeds are canonical-id hashes. Repeated fixed-input runs
were byte-identical; there was no uncontrolled random source. The timing defect
was deterministic under one cadence and different across cadences.

## Root-cause fix

The Rubric field now owns a second-level local ownership boundary:

- a member is constrained near its parent hub's nearest-hub bisector;
- the constraint runs once per fixed physics tick, never once per browser frame;
- Rings→Constellations interpolation is paint-only and can no longer mutate the
  D3 solution;
- the painted morph still begins at the live Rings positions;
- Graphology, canonical ids, Audit semantics, Search, labels, Rings and the
  camera are unchanged.

The public repository also gains a redacted, topology-exact mirror. It retains
the production census, relations, membership, kinds, lanes, disagreement
states, source grouping and external subtype/currentness, while replacing all
canonical ids and free text. The raw read-only captures are gitignored.

## Acceptance

Exact local production response:

- direct Constellations settled: 146/146 = **100.0%** nearest own hub;
- Rings→Constellations settled: 142/146 = **97.3%**;
- largest territory: **28.0%**;
- ten runs: **97.2602739726% each**, one coordinate digest;
- 120/60/30 Hz plus jitter: **97.2602739726% each**, exact same coordinate digest;
- real-browser clean Fit: **97.9%**, 191 canonical + 21 aggregate regions;
- real-browser Trace-preserving morph: **99.3%**, zero off-screen endpoints;
- paint time on the real Mac/browser: 400 samples, p50 0.5 ms, p95 1.2 ms,
  max 1.6 ms.

Redacted topology mirror:

- settled morph: 138/146 = **94.5%**;
- largest territory: **28.0%**;
- ten runs: **94.5205479452% each**, one coordinate digest;
- all four cadence schedules: **94.5205479452%** and one exact digest.

Interaction/regression smoke on the exact response:

- Search `notifictions`: 50 → 59 opened; Escape restores exactly 50;
- selected Risk remained on-screen;
- external-intelligence Trace kept every endpoint on-screen;
- Trace-preserving layout morph passed;
- SVG fallback rendered 438 nodes / 50 opened / 44 relationships;
- renderer proof 124/124; Search proof all passed (2 environment skips);
- TypeScript and focused ESLint passed;
- optimized production build passed with pre-existing unrelated warnings.

## Evidence

- `exact-production-baseline.json` — pre-fix timing/cadence reproduction
- `exact-production-proof.json` — post-fix exact-response proof
- `local-fixture-comparison.json` — prior fixture input breakdown
- `jsa-production-mirror.json` — public-safe topology mirror
- `redacted-mirror-proof.json` — durable mirror acceptance
- `production-viewport.json` — production environment capture
- `browser-performance.json` — Mac/browser paint summary
- `browser-rings-fit.png` — public-safe topology-mirror Rings Fit
- `browser-constellations-fit.png` — public-safe topology-mirror Constellations Fit
- `browser-constellations-trace.png` — public-safe topology-mirror Trace morph

No production data or Reality was mutated. No second production promotion was
performed.
