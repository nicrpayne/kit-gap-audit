# The spatial engine lab

Prototypes for how the Signal graph should *move*. Nothing here is imported by
the app, nothing here ships, and nothing here may reinterpret Signal's
semantics — the prototypes are handed the app's own answer and are judged on
what they do with it.

**Build-excluded on purpose.** `lab` is in `tsconfig.json`'s `exclude` and
`eslint.config.mjs`'s `ignores`, and its dependency tree is its own
`lab/package.json` rather than the app's, so a prototype's library (G6, pixi,
react-force-graph) can never reach production's `package.json`.

## Running it

```bash
bash /var/tmp/pgup.sh                                     # the app's database
npx tsx scripts/seed-real-jsa-package.ts                  # the real corpus
npx tsx lab/export-graph.ts                               # lists the Scopes
npx tsx lab/export-graph.ts cmrpatpkv0000ov1ylif2k088     # writes lab/graph.json

cd lab && npm install
node build.mjs                                            # esbuild → *.bundle.js
node serve.mjs &                                           # http://localhost:4400
```

Then open `http://localhost:4400/pb2.html`, or drive it headlessly:

```bash
node determinism.mjs pb2 10        # ten fresh solves, same seed, per-node delta
node b2run.mjs                     # the full B2 battery, all three variants
node bakeoff.mjs p0 pa pb pc       # the four-engine comparison, with video
```

## The fixture

`lab/graph.json` is **not committed**. It is a projection of a real customer
package — statements, passage excerpts, meeting refs — and `lab/export-graph.ts`
rebuilds it from the database on demand. Every field in it comes from a
production module (`buildAuditGraph`, `layoutGraph`, `layoutAggregates`,
`edgeFocusClass`, `structuralWeb`); the script computes nothing of its own, so
a prototype cannot quietly acquire a different opinion about what a
relationship is or which nodes form a group.

For the JSA corpus it is 407 nodes, 480 edges, 19 aggregates, and the edge
accounting `represented 385 + suppressed 74 + membership 21 = 480`.

## What is in here

| file | what it is |
| --- | --- |
| `src/harness.js` | the measuring rig every prototype is judged by — palette, radii, camera, overlap/spacing/occupancy/crossings/sector metrics |
| `src/render.js` | the shared canvas painter, so no prototype wins on styling |
| `src/p0.js` | **Prototype 0** — Signal's current deterministic layout, the control |
| `src/pa.js` | **A** — AntV G6 5, `combo-combined` (force over combos, concentric inside) |
| `src/pb.js` | **B** — anchored d3-force: soft forces, hard sector projection |
| `src/pc.js` | **C** — react-force-graph-2d |
| `src/pb2.js` | **B2** — the perceptual build of B: seeded determinism, group force, variable mass, morph, reheat, three variants |
| `src/pb3.js` | **B3** — local bloom: clearing, banded outward seats, penumbra, bounded return |
| `build.mjs` | esbuild bundle + one HTML page per prototype |
| `serve.mjs` | static server on :4400 |
| `bakeoff.mjs` | the four-engine battery, with video |
| `b2run.mjs` | the B2 measurement battery |
| `b3run.mjs` | the B3 battery — §1 mechanism decomposition through §9 and performance |
| `b3shot.mjs` | §12's acceptance capture: 12 subjects × rest / bloom / settled / exit |
| `b3survey.mjs`, `b3probe.mjs` | what the corpus is shaped like, and one selection in detail |
| `b3census.mjs` | §3's denominator: how many objects have a neighbourhood, and of how many classes |
| `b3pinning.mjs` | the field-hold proof — what is pinned, and whether it moved |
| `determinism.mjs` | ten fresh in-page solves plus a reload, per-node, to 1e-6 |
| `b2shot.mjs`, `shot.mjs`, `smoke.mjs` | screenshot and liveness helpers |

Every prototype exposes the same `window.__lab` interface, and every driver
talks only to that. A prototype that cannot do something says so by not
implementing it, and the row reads `—` rather than being quietly skipped.

## What B2 established

Deterministic to `0.000e+0` across ten in-page runs and a reload (B3 holds the
same figure — the bloom is interaction state and the solve refuses to carry
any of it). Zero node
overlap in both Rings and Constellations. 16.7 ms median frame during pan,
hover, morph and retarget, with no frame over 50 ms, at 407 nodes. **B2-B**
(balanced) was selected: 3.40 ms/tick, 13.1/61.5 morph round-trip, the lowest
background movement on reheat (0.33–0.50).

The gap B2 left open: selection does not visibly create a local world. The
layout is already at equilibrium, so a selected node's neighbourhood has no
slack to expand into and neighbour movement is indistinguishable from
background movement. Closing that is B3's whole job.

Three d3-force facts this cost real time to learn, recorded so they are not
learned twice:

- **`forceCollide.strength()` takes a number, not an accessor.** Every other
  force accepts a function; this one silently produces `NaN` positions while
  `alpha` keeps reporting healthy cooling.
- **`simulation.tick()` does not dispatch the `"tick"` event.** A constraint
  installed as a tick listener never runs during a manual solve.
- **d3-force 3 never calls `Math.random`.** Forces draw from
  `simulation.randomSource()`, a *stateful* LCG that is never reset between
  runs. Seeding `Math.random` does nothing; `sim.randomSource(seeded)` must be
  re-set at the head of every solve or run *n* differs from run *n+1*.

## What B3 established

**The question: can selection physically create a clear local world without
destroying the global map?** Yes — but not by the mechanism the brief and I
both assumed, and the reason is a property of this corpus rather than of the
physics.

### The corpus finding that reframed the tranche

A node's *relationships* are almost never its *spatial neighbours*. Signal's
anchored layout seats a passage in the evidence sector and the Risk that cites
it in the Hermes sector, six hundred units away, deliberately. Measured across
all 407 objects:

- **median participants in a bloom: 1.** 183 objects have none; only 12 have
  four or more.
- **median crowd: 26 objects within 60 world units**, 59–84 within a bloom's
  reach. Only 6 objects of 407 have nothing near them.

So the first build — which seated every neighbour on a ring around the
selection — opened beautifully and was wrong: it teleported citations out of
the sector the map says they live in. A local world built by destroying the
global one is the exact failure this was meant to avoid. The law that
replaced it: **a bloom pushes outward from the anchor, never inward**, and it
has a reach. Related-and-far nodes are lit and left exactly where they are.

### Three mechanisms, decomposed

The first §1 table compared "A vs B vs A+B" while a third mechanism ran
silently in all three arms and got no credit. Five arms, one mechanism each,
measuring clearance around the selection in world units:

| | Risk (sparse) | Observation | Transcript, 26 passages | Source, 8 |
| --- | --- | --- | --- | --- |
| `off` — B2's behaviour | −0.1 | +0.1 | +0.5 | +0.3 |
| `clear` — the crowd steps back | **+15.9** | +38.6 | +87.4 | **+42.9** |
| `a` — collision-radius inflation | +15.8 | +35.7 | +86.9 | +23.6 |
| `b` — banded outward seats | +15.7 | +38.5 | +89.1 | +42.2 |
| `ab` — both | +15.6 | **+41.0** | **+94.0** | +44.6 |

- **`off` confirms B2's gap exactly**: clearance changes by ±0.5 units. Nothing
  happens.
- **Clearing does the clearance work.** It is the mechanism that matters, and
  it applies to essentially every object.
- **Seats do the arrangement work.** On the dense transcript they move the
  local world 116 units versus clearing's 10 — same clearance, completely
  different picture.
- **Inflation contributes nothing measurable and sometimes fights.** On the
  source it *cost* 19 units of clearance. In `ab` its strength is halved and
  its only remaining job is guaranteeing no overlap survives.
- **The field moves 0.000 units, mean and max,** for every bloom, at every
  strength. Not "small" — pinned.

### The rest, in one place

| | |
| --- | --- |
| §2 strength (dense subject) | clearance +80.5 / +95.6 / +111.9 for calm / balanced / expressive |
| §3 relationship-role bands | implemented, deterministic — and **never observable**: 0 of 407 objects produce a multi-class neighbourhood (1 of 407 with `related_to` included) |
| §4/§5 group and source bloom | Risk 17: 33 → 74. Observation 59: 64 → 128. Dev Standup 26: 31 → 107. Lucas Sync 8: 7 → 53. Field 0.00 throughout |
| §6 camera | **exactly one move** on every subject, sized to the bloom it is about to become; whole local world on screen (27/27, 8/8, 6/6); a hand cancels the tween outright |
| §7 focus transfer | Risk → Passage → Source → Decision at 180 / 400 / 900 ms gaps: **0 of 318, 341, 390 samples came to a stop.** 16.7 ms frames, none over 50 ms |
| §8 exit and return | converges — cycle-to-cycle 1.27 → 0.73 → 0.79 → 0.67 → 0.97 — and plateaus at ~2.0 mean / ~25 max against a do-nothing control of 0.40 / 2.28 |
| §9 rings vs constellations | both bloom identically in clearance (108 vs 102) but **constellations is far more labellable** (min 25.6 px vs 4.2 px): the rings sector invariant squeezes the arrangement |
| §10 label readiness | at BALANCED, blooms up to 17 members clear 12 px at p10; 26+ do not. At EXPRESSIVE **every** bloom in the corpus clears it, including the 58-member cell (p10 17.0 px) |
| performance | 16.7 ms median through open, hold, transfer, exit and pan-while-bloomed. **Zero frames over 50 ms.** 3.58 ms/tick, 1.1 ms/draw, 407 nodes |

### Four bugs worth recording

- **A gathering force is not an outward force.** Building the wrong one first
  is what surfaced the corpus finding above, so it was not wasted — but the
  brief said "outward" and I read "arrange around".
- **The homing spring was two springs wearing one name.** While a bloom is
  open it must be slack or it fights the clearing it exists to bound; while
  closing it must be *alpha-independent*, because the exit happens when the
  simulation is coldest and an alpha-scaled spring is weakest exactly when it
  has the furthest to pull. Conflating them cost a 60-unit return error.
- **`select(null)` released the entire pinned field one line after pinning
  it** — a B2 line that was correct when nothing had moved. The 220 nodes that
  held *exactly* still through the whole bloom (mean 0.000, max 0.000) came
  out of the exit 3.75 units adrift. Deferring the release to the home timer
  fixed it: 0.136 mean.
- **The packing law had no cap.** At 59 members it produced a single ring of
  radius 228 — wider than the Risk, Commitment and Unknown cells combined, and
  overlapping all three. A bloom that swallows its neighbours has become the
  world. Capped at 124 with overflow wrapping into rows.

### What is still open

- **§11, the reference comparison, was not done.** No screen recording of the
  reference has ever been attached in this lab's sessions, and judging motion
  from stills is how the last two rounds produced "it feels smoother", which is
  not a finding.
- The bands of §3 cannot be validated against this corpus. They are correct by
  construction and untested by data.
