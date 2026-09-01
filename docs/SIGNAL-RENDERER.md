# The Signal Audit graph engine

Audit's viewport has two painters behind one contract. SVG is what ships;
`?renderer=canvas` mounts a **Rubric-derived Canvas engine** — its painter,
its spatial physics, and both of its layouts — over Signal's data, semantics
and product actions.

```
?renderer=canvas                     the Rubric engine, Rings (default)
?renderer=canvas&layout=constellations   the organic cell view
?renderer=canvas&camera=signal       the old Signal camera as a control
?renderer=svg                        the shipped renderer, untouched
```

---

## 0. Provenance — three passes, and what changed between them

**Pass 1** ran before the Rubric source was available. It built a renderer
boundary, a visual-scene adapter, an accessibility mirror, a hit-test index
and a homemade Canvas painter, then measured it against SVG at identical
coordinates. Its conclusion was negative in the useful direction: a materially
better painter over the same coordinates still read as the same map. The
missing piece was the arrangement, which that pass was explicitly told not to
touch.

**Pass 2** had the reference implementation in the branch at
`lab/rubric-reference/`. It replaced the homemade painter with Rubric's and
added the spatial engine.

Kept from pass 1: the scene adapter, the renderer boundary, the accessibility
mirror, the hit-test index, and the four performance fixes it found.
Replaced: the painter, the glow treatment, the edge treatment, the depth
treatment, the node treatment, and the static structural web.

**Pass 3** stops asking the React component to assemble Rubric mechanics one
at a time. `components/audit/canvas/rubric/engine.ts` is now the viewport
substrate: one Rubric-style stateful chassis owns the field, affine camera,
sprites, backdrop, soft layer, hit index and paint lifecycle. The component is
a host for Signal controls and callbacks. `lib/audit/rubricVisualAdapter.ts`
is the only Signal-to-Rubric boundary; it projects canonical Signal nodes and
relationships into five visual roles without importing Rubric's filesystem or
ARMS meanings.

The local visual oracle at `scripts/rubric-reference-server.mjs` serves the
unmodified reference renderer with the same deterministic Signal fixture. It
is an audit harness only and is never imported by the application.

Licensing, attribution and the full change list required by CC BY 4.0 are in
**[ATTRIBUTION.md](../ATTRIBUTION.md)**.

---

## 0a. What was taken from Rubric, and what was not

| Mechanism | Source | Taken |
| --- | --- | --- |
| Cached orb / glow sprites | `_flows2.js` 32-58 | **yes** — the single highest-value primitive |
| Deterministic edge curvature | `_flows2.js` 17-30 | yes, re-keyed on canonical ids |
| Hex backdrop + vignette, cached | `index.html` 127-152 | yes, recoloured to Signal tokens |
| Group fog under anchors | `index.html` 156-170 | yes |
| Layer order, culling, batching | `_core.js` 932-1069 | yes |
| Gradient focus wake on links | `index.html` 205-235 | yes |
| Pulsing double selection ring | `index.html` 476-484 | yes |
| Bounded Circle/Hex engine | `_core.js` 547-736 | yes |
| Rings target engine, spin, wobble | `_core.js` 339-545 | yes, with Signal's bands |
| Position-retaining polar morph | `_core.js` 341-389 | yes, on an elapsed-time clock |
| Single viewport state/lifecycle | `_core.js` `S`, `start()`, `loop()` | **yes** — adapted as `RubricViewportEngine` |
| Camera | `_core.js` 811-940 | **yes** — default for Canvas; `?camera=signal` remains the control |
| Comet flow on ambient edges | `index.html` 238-269 | **no** — only for an explicit Trace |
| File-byte node sizing | `_core.js` 739-750 | **no** — no meaning in an audit |
| Label placement | `index.html` 486-510 | **no** — replaced; Rubric has no collision |
| Graph search | `scan.js` 374-400 | **no** — Signal keeps MiniSearch |
| Generic relationship springs | `_core.js` 651-656 | **no** — held at zero, as a law |
| Filesystem / ARMS semantics | throughout | **no** |
| `_icons.js` brand data | — | **no** — separate trademark permissions |

---

## 0b. The two layouts

**RINGS** (default) keeps Signal's semantic law exactly: **distance from
Reality is distance from agreement.** A critical Finding sits on the conflict
radius because that is what the radius means. Rubric supplies the arithmetic
around that — sqrt-weighted sector allocation so a 195-seat lane does not
drown a 1-seat one, row capacity, target caching, spin and radial wobble — and
supplies no meaning at all.

**CONSTELLATIONS** is Rubric's bounded cell engine: a radius sized from the
population, lane anchors on a ring, short-range charge, collision, group pull,
a soft boundary, and no relationship springs. It emphasises semantic groups
and local structure; it makes **no radial claim**, so its guide is a single
boundary rather than the disagreement rings.

Both are reached from one control on the field, and the morph between them
retains every position — the field reorganises rather than reloading.

---

## 0c. Ambient motion is governed, not assumed

Rubric's loop never stops. On GPU-composited hardware that costs nothing; on a
software rasteriser a canvas repaint re-rasterises the whole backing store.
Measured in this container (`ANGLE … SwiftShader`): a loop that draws a 4×4
rectangle and waits for the next frame costs **167ms at 2880×1800 and 30ms at
1440×900**, with the painter itself at **1.7ms in both**.

So the field measures its own machine. If ambient frames cost more than ~2.2
display intervals, the Ring spin, the selection pulse and the Trace comets
switch off and the field is *still* rather than *slow*; where they are cheap
they run. A morph is exempt — a layout change that does not animate is a cut,
not a morph.

---

## 1. The Signal → visual adapter

`lib/audit/visualScene.ts`. Pure — no React, no DOM, no canvas, no CSS.

`lib/audit/rubricVisualAdapter.ts` is a second, deliberately thin projection.
It does not decide trust, labels, visibility, actions, selection, or product
state. It gives the Rubric substrate only stable ids, radii, Signal-authored
anchors/bands/order and a visual role: router, hub, aggregate, rim or leaf.
Every visual relationship keeps its canonical id and trust basis, but no
relationship enters the force simulation.

The obvious way to add a second renderer is to write a Canvas component that
re-derives what to draw. That is the wrong way, and the brief says so: *no
forked product behaviour*. The derivation **is** the product. Which nodes are
latent, how loud a woken edge is, which sixty names fit, what a dashed stroke
means — those are Signal semantics, and a second copy of them is a second
product that drifts from the first.

So the scene moved out of the painter:

```ts
AuditVisualNode {
  // canonical Signal fact
  id, label, kind, semanticSubtype, cluster, basis, count, importance,
  layoutRole, x, y, r,
  // this frame's visual answer
  shape, color, hollow, identity, opacity, depth, rank, latentR,
  selected, hovered, matched, swept, labelled, labelInward,
  onScreen, reachable, opened, tabIndex, accessibleName
}

AuditVisualEdge {
  id, from, to, rel, basis, cls, verb, directional,
  d, anchor, tangent, chord, source, target,
  opacity, visible, woken, filament, strokeColor, weight, dash, showVerb, head
}
```

Plus shells, bundles, the calm-state web, the structure rings, the layer
opacities the tier decides, and the label plan.

Three properties it holds, each asserted:

- **It never mutates the graph.** Positions stay in the layout side map;
  the semantic layer stays free of geometry and of visual state.
- **It never touches the coordinates.** No physics, no retargeting, no morph.
- **Foreign semantics cannot enter.** `layoutRole` — `router` / `hub` / `cell`
  / `rim` / `leaf` — is the only renderer-facing role channel, and it is a pure
  function of Signal's own `NodeKind`. Reality and the Scope are routers, a
  lane is a hub, a typed aggregate or source family is a cell, a source
  artifact is rim, everything the project is made of is a leaf. There is no
  path by which a node acquires a role from anywhere else, and a proof asserts
  it.

It returns **token names** (`var(--i-signal)`), never resolved colours —
resolving a token is a fact about the document a painter is mounted in. That is
what lets the whole scene be asserted without a browser.

### Cadence

The corpus-only half — the web, the constellations, the bundles, the degrees —
is memoised separately on `[graph, layout]`, because it depends on neither the
camera nor the selection. The view-dependent half is quantised against the
camera exactly as the SVG's own label plan is: twelve device pixels of pan and
one quantised zoom step. The camera the *painter* uses stays exactly continuous.

Measured on the 427-node corpus: full scene derivation **2.7ms**, corpus cache
**1.0ms** once per graph.

---

## 2. The renderer boundary

`components/audit/renderer/types.ts` states the prop list both painters take,
so neither can grow a prop the other does not honour.
`renderer/AuditGraphRenderer.tsx` picks one. `AuditInstrument` mounts that and
never learns which it got.

- `?renderer=svg` — the default, and what no parameter gives you.
- `?renderer=canvas` — the experiment.

A query parameter rather than a build flag or a stored preference: the value of
the slice is two tabs on the same graph at the same camera, flipped between
without a rebuild. Rollback is a URL, not a deploy. An unrecognised value falls
back to the product rather than erroring.

**The SVG renderer is untouched.** An A/B whose control has been edited is not
an A/B.

### What a painter owns, and what it must not

A painter owns pixels, sprites, the render loop, hit geometry, and the pointer
gestures that move the camera. That is all. Audit state, Graphology, selection,
Search, the inspector, Findings, actions, Reality controls, provenance, source
and evidence panels, keyboard commands, reduced motion, Back/Forward and
routing all stay outside. The practical test: deleting a painter must lose
nothing but pixels — and it does, because the SVG one still runs.

### The camera seam

`CameraAdapter` — `getTransform` / `setTransform` / `animateTo` / `cancel` /
`screenToWorld` / `worldToScreen`. Deliberately narrow: no inertia, no gesture
state, no easing curve, no queue, because those are the camera's own business
and putting them in the interface would bake today's answers into the seam
meant to outlive them. Rubric's affine camera is the Canvas default in this
slice. The adapter keeps Signal's shared camera controls synchronized in both
directions, and `?camera=signal` keeps the old camera available as a reversible
control.

---

## 3. The Canvas painter

`components/audit/CanvasAuditRenderer.tsx` + `components/audit/canvas/`:

| File | What it is |
| --- | --- |
| `paintTokens.ts` | Signal's `--i-*` tokens and `color-mix` resolved to paintable colours, cached per document. No new palette. |
| `sprites.ts` | Cached glow sprites, keyed by colour and quantised radius, bounded and evicted oldest-first. |
| `shapes.ts` | The fourteen glyphs and the arrowhead, transcribed from the SVG's own constants. |
| `painter.ts` | The frame: ground, structure, sweep, web, aggregates, edges, Reality, nodes, words. |
| `hitTest.ts` | The bucketed world-space hit index. |
| `rubric/engine.ts` | The direct Rubric viewport chassis: field, camera, resources, hits and paint lifecycle in one stateful engine. |

Matched evidence for the focused pass is committed under
`artifacts/rubric-engine-audit/`: the starting candidate, the actual local
Rubric reference populated with the same Signal fixture, the adapted Rings and
Constellations candidates, and a layout-morph video.

Z-order is the SVG's, because the reading of the field depends on it.

### The four mechanics

A canvas is not automatically better than SVG at 427 nodes — the SVG renderer
is well inside its comfort zone and says so. What a canvas can do that the DOM
cannot is these:

**BATCHING.** Strokes that share a colour, a width and a dash are one `Path2D`
and one stroke. The calm-state web's 119 paths — measured in the SVG as the
single most expensive thing the field draws at close zoom, 50.1ms median during
a drag at 450%, and the reason that layer is dropped entirely at the evidence
tier — become about ten draw calls. Edge geometry is world space and does not
move with the camera, so every path is built once and reused across every frame
of every pan. Measured at rest: **121 draw calls** for the whole field.

**SPRITES.** A real radial falloff, rasterised once and blitted. The SVG
approximates a selection glow with three concentric strokes and says why: a
per-element filter is a rasterisation surface it cannot afford on the one
element that has to stay sharpest. A canvas can have the smooth version and pay
once. 25 sprites held for the whole field.

**ONE BLUR.** Optical depth costs the SVG one filter surface per softened
element — profiled there at 44% of a Trace's frame budget, most of it for nodes
outside the viewport. Here the softened content goes into a single offscreen
layer, blurred once on composite. Cached against what its pixels actually
depend on, and rendered at half resolution because the layer's whole purpose is
to be unreadable.

**CULLING.** What is off screen is not painted and costs no clip either. At the
close-zoom state the harness ends on: **89 nodes painted, 337 culled**.

### Signal provides the meaning

No Rubric colour semantics cross, because there are none available — but the
rule would hold anyway. The painter resolves Signal's own tokens and mixes them
the way the stylesheet does. Type colours, trust strokes, the attested /
inferred / external rules, Trace semantics and selected state are all Signal's.

### Edge guardrails, held

- `attested` → solid.
- `inferred` → a wide dash (4/4).
- `external` → a finer, distinct broken stitch (2.2/2.6), the same grammar the
  shard glyph and the Hermes boundary ring use.
- **Focus never rewrites a trust dash.** Asserted directly: select an endpoint
  and compare every edge's dash before and after — zero change.
- **Nothing travels.** No marching dash, no flow, no direction a relation did
  not earn. A moving line reads as live data and Signal may not imply a fact it
  does not hold.
- An active Trace gets the luminous provenance underlay, because that route is
  a real claim about how something is known — and provenance stays quieter than
  the meaning it supports, so nine citations do not read as nine statements.

---

## 4. Hit testing

`components/audit/canvas/hitTest.ts`. A canvas has no elements, so nothing
answers a click for it — the one thing the DOM gives the SVG for free.

1. **The target is the painter's footprint, not the model radius.** A hovered
   node is drawn 15% larger and a selected one 35% larger; a hit radius left at
   `r` would give a selected node a visible rim that is not clickable, which is
   exactly the "selected object becomes unclickable beneath its own glow"
   failure the brief names. The index stores the same `grown` the painter
   computes, and a proof asserts a click at 99% of the grown radius still lands.
2. **An 11px floor.** A 3.2-unit checkpoint is not a click target otherwise.
   The floor is in screen pixels, so it does not shrink with the camera.
3. **Nearest centre wins, normalised by each target's own radius.** Not "last
   painted". A small mark inside a large shell wins on its own terms, which is
   what keeps a member selectable inside its constellation and a source hub
   selectable among its passages.
4. **Bucketed.** A uniform world-space grid, so a pointer move touches the
   handful of candidates in neighbouring cells rather than all 427.
5. **Rebuilt on geometry, never on the camera.** The index is in world space; a
   pan cannot move a target.

Aggregates are in the index too — a shell is the click target for its group at
the tiers where the group is one shape.

Measured on the dense corpus, all 427 targets seated:

| | median | p95 |
| --- | --- | --- |
| Canvas index | **< 0.1µs** (below timer resolution) | 100µs |
| DOM `elementFromPoint` | 200µs | 400µs |

Plus, asserted in the proof: every formed node selectable at its own centre
(426/426), no A→B→A oscillation walking a pointer across the densest
constellation in 121 samples, latent marks correctly not clickable, superseded
history correctly still clickable.

---

## 5. Accessibility

The SVG renderer's own header argues against canvases: it keeps *"every node a
real focusable element with an accessible name — which a WebGL canvas
cannot"*. That is the strongest objection to this slice, so it is answered
rather than deferred.

Every node the SVG would make focusable is a real `<button>` here, in the same
keyboard order, carrying the same accessible name, exposing the same
`aria-pressed`, inside the same `role="application"` with the same label. They
are visually hidden by the clip-rect idiom — never `display:none`, which would
remove them from the accessibility tree and the tab order and *be* the
regression this exists to prevent.

Measured head to head at the close-zoom state:

| | SVG | Canvas |
| --- | --- | --- |
| focusable nodes | 338 | **339** |
| with an accessible name | 338 / 338 | 339 / 339 |
| `role="application"` + label | yes, identical string | yes, identical string |
| `aria-pressed` exposed | yes | yes |
| keyboard focus → Enter selects | yes | yes |

**Canvas is one ahead, and the extra one is Reality.** The SVG draws Reality
separately as the hero and excludes it from the node layer entirely, so it
carries no `data-opened`, no tabindex and no accessible name — it is not
keyboard-reachable in the shipped renderer. The Canvas mirror has no such
special case. The parity check asserts the two renderers disclose an *identical
set of object ids* apart from that one, so if anything else ever appears in the
gap it fails.

Reduced motion: the main surface has no continuous animation at all, and the
pulse overlay does not run when the system asks for less motion.

---

## 6. Performance

**Read the environment caveat first.** This container has no GPU — WebGL
reports `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)),
SwiftShader driver)`. Everything is software-rasterised, which is *worst case
for a canvas*: touching any pixel re-composites the whole backing store, with
no GPU to do it. The SVG renderer benefits correspondingly, because the browser
only re-rasterises the DOM regions that changed. Read these numbers as a floor
for Canvas, not as what Nic's machine will show.

Production build (`next build` / `next start`), 1440×900 at DPR 2, 427 nodes /
439 relationships, frame deltas sampled from `requestAnimationFrame` — the same
measurement for both painters, because the canvas's own paint timer has no SVG
equivalent and comparing a measurement to nothing is not a comparison.

| gesture | renderer | median | p95 | worst | >50ms | long tasks |
| --- | --- | --- | --- | --- | --- | --- |
| hover sweep | svg | 16.7 | 66.7 | **233.4** | 8 | 5 |
| hover sweep | canvas | 16.7 | **50.0** | **66.7** | 5 | 6 |
| rapid zoom | svg | 16.7 | 16.8 | 33.3 | 0 | 0 |
| rapid zoom | canvas | 16.7 | 16.8 | 33.3 | 0 | 0 |
| rapid pan | svg | 16.7 | 16.7 | **16.8** | 0 | 0 |
| rapid pan | canvas | 16.7 | 16.7 | **50.0** | 0 | 1 |
| Trace | svg | 16.7 | 83.4 | 100.0 | 5 | 5 |
| Trace | canvas | 16.7 | 83.4 | 100.0 | 7 | 7 |

Selection latency: SVG 125.5ms, Canvas 122.7ms.

| | SVG | Canvas |
| --- | --- | --- |
| DOM elements in the viewport | **2682** | **367** |
| JS heap | 39.6MB | 35.7MB |
| draw calls / frame | n/a | 121 |
| nodes painted / culled | n/a | 89 / 337 |
| painter's own frame time | n/a | **1.2ms** median |

Frame times are quantised to the 16.7ms display interval, so the budget is
stated in **frames**: a p95 of 50.0 against 33.3 is one frame, not "50% worse".
Across three runs of an unchanged build the hover p95 moved between 50.0 and
66.6 for *both* painters; anything inside one frame is this measurement's noise
floor.

### What the measurement found

None of it was the painting — the painter runs at 1.2ms. Four costs around it,
all fixed, all in the commit `Four things the measurement found`:

1. **The pulse re-composited the whole canvas at 60Hz** (66.7ms median frames
   during a Trace). Moved to a small overlay sized to the corona; ~0.2% of the
   field re-composites per frame.
2. **The depth layer was rebuilt every frame at full resolution** (24.5ms/frame
   during a softened pan). Cached against what its pixels depend on, then
   dropped to half resolution — 7.8ms.
3. **The hit index was rebuilt on pan** (66.7ms stall) for output that was
   identical every time. Now keyed on geometry.
4. **339 accessibility buttons reconciled every twelve pixels of pan.** Now
   keyed on their own content.

And one fidelity gap found by looking rather than measuring: unrelated *labels*
were not softened, so the canvas drew a correctly-dimmed field with perfectly
sharp names over it. `ctx.filter` around them is a disaster — a 2D context
applies a filter per draw call, and twenty labels took a Trace to **550ms**
frames. They now ride the depth layer's existing single blur.

### The one place SVG is cleanly better

**Sustained drag.** SVG's pan is pristine — worst frame 16.8ms, run after run,
not a single dropped frame. Canvas keeps an occasional one-to-three-frame stall.
Medians and p95 are identical; it is a tail, and it is almost certainly GC from
the per-camera-step scene re-derivation. It is named here rather than tuned
away, and it is the first thing to look at on real hardware.

Reported, not budgeted: worst-frame is one sample per run, and treating it as
pass/fail would mean tuning a threshold until it went green, which is the
opposite of measuring.

---

## 7. Parity — the claim that matters most

Both painters consume the same scene, so this should be true by construction.
It is asserted anyway, by comparing the **set of disclosed object ids** rather
than counts:

- at rest — identical
- selecting a Risk (144 objects) — identical
- selecting a Decision (143) — identical
- selecting a source artifact (338) — identical
- Trace (145) — identical
- dense evidence at close zoom (338) — identical
- search → take resolves to the same canonical id in both, three times
- the zoom ladder walks the same tiers
- the `role="application"` label is character-for-character the same string

The only difference in the whole matrix is Reality, in Canvas's favour, per §5.

---

## 8. Screenshots and recordings

`scripts/audit-renderer-shoot.mjs` writes matched pairs — `svg-*.png` and
`canvas-*.png` — across the brief's matrix: Fit, hover, selected Risk, selected
Decision, selected source, Trace, dense Evidence, all four semantic-zoom tiers,
after a rapid pan, and keyboard selection. Plus a matched `.webm` recording of
one continuous scripted gesture (sweep → select → zoom in → pan → zoom out) in
each renderer.

```
npx tsx scripts/audit-renderer-fixture.ts /tmp/signal-renderer-graph.json
node scripts/audit-renderer-shoot.mjs /tmp/renderer-shots
```

They are not committed — they are large, they regenerate in one command, and
the repo does not carry screenshots.

### What the pairs show

Judged against the SVG control, coordinates identical:

- **Glow and depth: Canvas is better, visibly.** The selection corona is a
  smooth falloff instead of three countable concentric strokes. It reads as
  light coming off the mark rather than as three rings drawn around it.
- **Edge life: equal.** Same curves, same trust dashes, same verbs, same
  provenance underlay. The Trace route is indistinguishable.
- **Visual hierarchy: equal, after the label fix.** Before it, Canvas was
  clearly worse — sharp names on a dimmed field.
- **Node legibility: equal.** The glyphs are transcriptions.
- **Background: marginally better.** A slight radial lift toward the centre
  gives the field a ground the SVG does not have.
- **Hover quality: better on the tail.** Same median, but the SVG's worst hover
  frame is 233ms against Canvas's 67ms, and that is the difference between a
  sweep that catches and one that does not.
- **Connectedness / fun: unchanged.** This is the honest one. The field looks
  like the same field. It is cleaner and the selection is prettier, but nobody
  would call it a different instrument.

---

## 9. What the fixture is

The real bridge-produced JSA package is deliberately not committed — it carries
real transcript excerpts and named individuals — and is absent here. The corpus
is `scripts/lib/jsa-shaped-fixture.ts` scaled to **427 nodes / 439
relationships**, which is the ~438-node census `SIGNAL-GRAPH.md` names as the
rendering baseline. Same shapes as the real package, invented content.

It is served through Playwright's network layer, so **the product is untouched
by the harness**: no fixture branch in the route, no env var that could reach a
deployment.

---

## 10. Proofs

```
npx tsx scripts/audit-renderer-proof.ts     # 87 checks, headless
node scripts/audit-renderer-shoot.mjs OUT   # browser: parity, a11y, perf
```

The headless proof covers projection-not-mutation, the closed role vocabulary,
the edge guardrails, label authority at every tier, scene completeness, hit
testing across dense populations, token resolution, the renderer switch, the
screen↔world round trip, and the derivation's own budget.

---

## 11. Signal's camera, documented

Not replaced this slice. `components/audit/cameraMotion.ts` is already pure and
already proof-backed, and it is better than a first reading suggests.

| | Signal |
| --- | --- |
| transform | `{x, y, k}` — world centre plus scale, applied as an SVG `viewBox` or a canvas transform. Not a matrix. |
| pan | Pointer delta over `k`, measured against the camera captured at pointer-down, so a burst of moves between commits still lands under the cursor. |
| wheel / pinch | `k * exp(-deltaY * 0.0016)`, clamped to [0.34, 4.5]. One mouse notch is 17%; trackpad noise under 2.3%. |
| zoom focal point | Zooms about the pointer — the thing under the cursor stays under it. |
| inertia | **None, deliberately.** |
| easing | `easeOutCubic` only, 320ms. Position interpolates linearly; **scale interpolates geometrically**, because zoom is multiplicative and a linear ramp on `k` rushes the last half of the perceived travel. |
| overshoot | None. "A camera that bounces is a camera that lies about where it stopped." |
| interruption | The hand outranks the animation, always. Every direct write cancels the tween; every new fly-to retargets from where the camera actually reached. No queue, no lock. |
| programmatic focus | `frameFocus` — a stated law: don't move if the neighbourhood is already legible; smallest pan if only neighbours are out; re-centre if the anchor itself is off screen. Zoom is capped at ×2 per move and 1.8 absolute on the law's own authority. It also reserves the top-right for the floating search panel. |
| layout-transition coordination | Nothing to coordinate — the layout is static. This is the seam a physics slice would have to open. |

Two things stand out as unusually good and worth protecting through any
swap: **geometric scale interpolation**, and **the framing law's default answer
being "do not move"**. Most cameras will happily throw away the view you built.

### Recommendation

**KEEP SIGNAL CAMERA FOR NOW** — and this is not yet a comparison, because
Rubric's camera could not be read (§0).

The honest position: Signal's camera has no *known* deficiency. Its gestures
are correct, its motion contract is proved, and its framing law encodes product
semantics a generic camera would not have. The case for swapping it would have
to be a specific mechanic it lacks — sub-pixel wheel accumulation, pinch,
momentum with a proper cancel — and identifying that needs the source.

So: **Rubric camera remains an open question, not a candidate.** Promoting it
to "Candidate Camera B" would be inventing a finding. Do the study in §0 first;
if it turns up a specific mechanic, that is the A/B slice.

---

## 12. Where this leaves the renderer question

Canvas is materially better at **hit testing** (2000× faster, and correct at
the painter's true footprint), materially better at **DOM cost** (2682 → 367
elements), better on the **hover tail**, and modestly better at **glow and
depth**. It is equal on medians everywhere, equal on edge and node fidelity,
and slightly worse on one tail — sustained drag — in a GPU-less environment.

It is **not** a different instrument. The field looks like the same field,
because it *is* the same field at the same coordinates. That is the slice's
actual answer, and it points at layout rather than at the painter.

See the session summary for the recommendation. The short version: Canvas is
worth keeping as the foundation, and the next slice should be spatial.
