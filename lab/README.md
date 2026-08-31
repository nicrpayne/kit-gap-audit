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
| `build.mjs` | esbuild bundle + one HTML page per prototype |
| `serve.mjs` | static server on :4400 |
| `bakeoff.mjs` | the four-engine battery, with video |
| `b2run.mjs` | the B2 measurement battery |
| `determinism.mjs` | ten fresh in-page solves plus a reload, per-node, to 1e-6 |
| `b2shot.mjs`, `shot.mjs`, `smoke.mjs` | screenshot and liveness helpers |

Every prototype exposes the same `window.__lab` interface, and every driver
talks only to that. A prototype that cannot do something says so by not
implementing it, and the row reads `—` rather than being quietly skipped.

## What B2 established

Deterministic to `0.000e+0` across ten in-page runs and a reload. Zero node
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
