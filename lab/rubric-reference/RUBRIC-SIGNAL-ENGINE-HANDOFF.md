# RUBRIC → SIGNAL ENGINE IMPLEMENTATION HANDOFF

**Purpose:** implementation-grade handoff for making Signal Audit look and feel like the supplied Rubric Second Brain while preserving Signal's data model, epistemic laws, and product behavior.

**Status:** design and source analysis only. No Signal or Rubric source was modified to produce this document.

**Primary Rubric source:** `/Users/nicholaspayne/Downloads/rubric-second-brain`

**Signal source caveat:** the requested production SHA `77c6645` was not present in the local Git object store during analysis. Signal source comparisons used the newest locally available detached snapshot at `/private/tmp/signal-prod-verify-3053a96` plus the supplied prior-conversation record for the completed MiniSearch branch and B2/B3 experiments. Rubric claims below are independently verified from the local Rubric files.

---

## Reading convention

- **VERIFIED FROM SOURCE** means the statement is directly supported by the cited local Rubric path, function, and line range.
- **VERIFIED FROM SIGNAL SOURCE** means it is directly supported by the locally available Signal snapshot cited.
- **CONTEXT-PROVIDED** means it comes from the supplied prior implementation record, but the named branch/commit was not locally available for reinspection.
- **INFERENCE / RECOMMENDATION** means it is an architectural conclusion or proposed Signal behavior, not behavior already present in Rubric.

Line ranges are approximate and refer to the files exactly as inspected on 2026-08-31.

---

# 1. Executive architecture recommendation

## Boundary

**VERIFIED FROM SIGNAL SOURCE:** Signal's graph is a derived, in-memory projection of Audit truth. Semantic graph, layout, and rendering are intentionally separate. Graphology is the data structure, not canonical storage. Source: `/private/tmp/signal-prod-verify-3053a96/docs/SIGNAL-GRAPH.md`, lines 1-30, especially the three-layer contract at lines 16-30.

**INFERENCE / RECOMMENDATION:** preserve that separation, but replace the current presentation implementation behind it:

```text
Signal owns                         Rubric-derived presentation owns
---------------------------------   --------------------------------------
Canonical product state             Canvas graph viewport
Graphology semantic projection      Resting presentation coordinates
Stable IDs and typed relations      D3 force integration
Reality / Scenario / Forecast law   Circle / Hex boundaries
Epistemic basis                     Rings target geometry
Evidence provenance                 Layout morphing
Human acceptance                    Glow / fog / painter effects
Hermes boundary                     Hover wake / visual focus
Audit actions and panels            Pointer hit testing
Search index and results            Render culling / batching
Camera contract                     B3 local-bloom displacement layer
```

The implementation boundary should be a renderer-specific projection, not a second domain model:

```ts
type AuditVisualNode = {
  id: string;                 // canonical Signal graph ID
  label: string;
  kind: NodeKind;
  cluster: string;            // Signal lane or semantic aggregate
  basis?: "attested" | "inferred" | "external";
  layoutRole: "router" | "hub" | "aggregate" | "leaf" | "rim";
  count?: number;
  importance: number;         // explicit Signal policy, never Rubric file bytes
};

type AuditVisualEdge = {
  id: string;
  source: string;
  target: string;
  rel: string;
  basis: "attested" | "inferred" | "external";
  rule: string;
};
```

**INFERENCE / RECOMMENDATION:** build the new graph viewport as a Canvas presentation adapter fed by Graphology. React continues to own Audit state, panels, search, selection, source drawers, actions, and accessibility. D3 and Canvas must never mutate Signal semantics or canonical product state.

---

# 2. Exact Rubric source inventory relevant to Signal

## Primary graph implementation

| Full local path | Function/module | Approx. lines | What it does | Why it matters for Signal |
|---|---|---:|---|---|
| `/Users/nicholaspayne/Downloads/rubric-second-brain/public/_core.js` | state and `DEFAULT_ST` | 1-38 | Global graph, layout, camera, filter, focus, performance, and UI state | Shows the minimum runtime state the presentation engine needs |
| same | `boot()` | 39-63 | Fetches graph, ingests it, creates DOM/canvas/panels, selects layout, resets camera, starts loop | Reference initialization order; do not copy its data fetch contract |
| same | `ingest()`, `seed()` | 65-97 | Normalizes received nodes and assigns random initial coordinates | Projection pattern is useful; random seeding is not |
| same | `repOf()`, `reaggregate()` | 98-193 | Maps folded contents to visible representatives, aggregates links and creates folder hubs | Useful conceptual pattern for Signal aggregate nodes; not a replacement for typed aggregates |
| same | expansion functions | 195-277 | Lazy folder expansion/collapse and ancestor revelation | Useful interaction pattern for progressive graph disclosure |
| same | `groupKeyOf()`, `anchorsFor()` | 279-309 | Maps nodes into department/folder groups and chooses layout anchors | Direct precedent for a Signal lane/aggregate anchor adapter |
| same | `setLayout()`, `refreshLayout()` | 310-337 | Stops current simulation, retains node objects/positions, rebuilds selected layout | Core layout-switching contract |
| same | Rings subsystem | 339-545 | Deterministic ring geometry, target cache, spin, wobble, collapse, morph | Basis for Signal Rings/Constellations view |
| same | `buildSim()` | 547-736 | D3 Force, Circle, Hex, Deck simulation and custom forces | Basis for resting spatial engine |
| same | `radiusOf()`, `colorOf()`, `pass()` | 739-789 | Type-based size, color, and visibility policy | Must be replaced by Signal semantic policies |
| same | `rebuildFocus()` | 790-809 | Creates focus node/link sets for hover, selection, drag, and Hermes reach | Basis for visual edge wake and dimming |
| same | camera helpers and `initCanvas()` | 811-908 | Affine camera, input listeners, drag, pan, wheel zoom, click behavior | Useful for understanding Rubric feel; Signal camera remains preferred |
| same | `resize()`, `hitTest()` | 909-929 | DPR sizing and O(N) world-space circle hit testing | Directly reusable for current Signal scale |
| same | `loop()` | 932-1069 | Continuous animation, camera tween, Ring placement, agent orbit, compositing, culling, batching, painting | Main Canvas renderer reference |
| same | `drawLabels()` | 1071-1092 | Label eligibility, priority sort, viewport filter, hard budget | Useful eligibility policy; not a collision engine |
| same | tooltip/select functions | 1095-1219 | Tooltip content, selection, neighbor list, actions | Visual behavior reference; Signal owns content semantics |
| same | `apiOpen()`, `openViewer()`, `jumpTo()` | 1222-1286 | Opens files, renders Markdown, follows internal links, navigates graph | Source drawer interaction reference |
| same | panels/settings/theme | 1289-1669 | Search UI, layout controls, legend, filters, color/theme persistence | Laboratory controls and product-control reference |
| same | guide/icon functions | 1677-1775 | Ring/boundary guides and optional app-icon loading | Rings visual language and external-brand dependency |
| `/Users/nicholaspayne/Downloads/rubric-second-brain/public/index.html` | dependency imports | 8-16 | Loads Outfit, Source Serif 4, D3 v7, Marked 11.1.1, and local helpers | Exact browser stack; pin package versions in Signal instead of using globals |
| same | curvature helpers | 48-62 | Stable bow, quadratic control point, point-on-curve | Edge curvature and particle-path reference |
| same | `skin` defaults | 63-125 | Layout personality flags, default controls, themes, fog/glow/flow configuration | Captures the shipped visual personality |
| same | `drawBackdrop()`, `underLayer()` | 127-203 | Hex field, vignette, colored fog, layout guides | Major contributor to visual atmosphere |
| same | `drawLink()` | 205-236 | Curved edge styling, focus gradients, dimming, dashes, widths | Direct edge painter reference |
| same | `midLayer()` | 238-269 | Pooled edge comets with trails | Optional Trace/live-activity primitive |
| same | `drawNode()` | 271-463 | Router, agent, hub, app, routine, skill, folder, and file painters plus glow and idle animation | Main node painter reference; silhouettes require Signal remapping |
| same | `drawSelection()` | 466-484 | Animated selection rings | Low-risk reusable focus feedback |
| same | skin `drawLabels()` | 486-510 | Fixed screen-space label placement and halo | Demonstrates visual style but confirms missing collision handling |
| same | final UI additions | 515-583 | Menu/legend buttons and Circle/Hex controls | Useful product-control inventory |
| `/Users/nicholaspayne/Downloads/rubric-second-brain/public/_flows2.js` | curve helpers | 17-30 | Stable curved-edge geometry and point sampling | Can be reimplemented as typed pure functions |
| same | `orbSprite()`, `glowSprite()` | 32-58 | Per-color offscreen Canvas sprite caching | Important performance tactic for Rubric-like glow |
| same | shape/icon helpers | 60-143 | Canvas paths, pixel sprites, small line-art icons | Reusable mechanics; Rubric-specific art should be replaced or attributed |
| `/Users/nicholaspayne/Downloads/rubric-second-brain/public/_icons.js` | icon path table | 1-46 | Baked third-party/brand SVG path data | Avoid direct reuse until brand rights are checked |
| `/Users/nicholaspayne/Downloads/rubric-second-brain/public/_core.css` | overlay UI | 1-156 | Canvas shell, cards, panels, search, tooltip, viewer, controls | Styling reference only; integrate with Signal's UI system |

## Data/server/search support

| Full local path | Function/module | Approx. lines | What it does | Why it matters for Signal |
|---|---|---:|---|---|
| `/Users/nicholaspayne/Downloads/rubric-second-brain/scan.js` | config/classification | 7-79 | Loads workspace config; classifies secrets, access, layers, and departments | Rubric-specific semantics; do not port |
| same | `walk()` | 81-126 | Synchronous recursive filesystem traversal and directory count rollup | Explains node counts; not relevant to Signal storage |
| same | `extractLinks()` | 128-175 | Parses Markdown links with mtime cache and 1 MB limit | Explains Rubric edges; not Signal evidence provenance |
| same | `buildGraph()` | 196-315 | Creates canonical router/hub/file/dir/app/routine/agent nodes and edges | Exact Rubric data shape feeding the renderer |
| same | `runScan()` | 321-345 | Builds graph and updates link cache | Not needed in Signal |
| same | `expandDir()` | 348-371 | One-level lazy directory expansion | Progressive disclosure precedent |
| same | `search()` | 374-400 | Filename/path substring scoring | Search comparison baseline only |
| `/Users/nicholaspayne/Downloads/rubric-second-brain/server.js` | API handler | 73-181 | Graph, expansion, search, file view/open, tweaks, bake endpoints | Explains content UX; do not import the server |
| same | `safeResolve()` | 65-70 | Attempts root-constrained path resolution | Study only; prefix check should not be reused verbatim |
| same | `serveStatic()` / bind | 184-207 | Static server bound to `127.0.0.1:5210` | Confirms local-only architecture |
| `/Users/nicholaspayne/Downloads/rubric-second-brain/brain.js` | `recall()` | 39-160 | Separate keyword/pointer memory recall CLI | Not the graph search; optional routing-tier concept only |
| `/Users/nicholaspayne/Downloads/rubric-second-brain/config/departments.json` | department/layer config | full file | Department anchors, ARMS layer metadata, colors/shapes | Replace with Signal lanes and laws |
| `/Users/nicholaspayne/Downloads/rubric-second-brain/config/workspace.json` | workspace routing | full file | Roots, memory, skills, visibility, recall routing | Do not port |

## Related sibling material

| Path | Relevant content | Decision |
|---|---|---|
| `/Users/nicholaspayne/Downloads/rubric/templates/skill-trees/index.html`, `physics()`, lines 301-354 | Custom O(N²) inverse-square repulsion and hand-built springs | **DO NOT TAKE.** D3 is the better engine already used by Second Brain |
| `/Users/nicholaspayne/Downloads/rubric-agentic-os/vendor/thinking-orbs.js`, lines 1-144+ | Vendored MIT Canvas orb animation by Jakub Antalik | Not part of Second Brain graph; no implementation need |
| `/Users/nicholaspayne/Downloads/rubric-docs/manifest.json`, full file | Small manifest contract for panel name, port, API prefix, selector | Conceptual option for Control Room module registration, not graph mechanics |

---

# 3. Renderer

## Canvas render loop

**VERIFIED FROM SOURCE:** `initCanvas()` obtains a Canvas 2D context and installs pointer, wheel, keyboard, drag, selection, and double-click handlers. `resize()` caps device pixel ratio at 2 and resets the cached background. Sources: `_core.js`, lines 819-916.

**VERIFIED FROM SOURCE:** `loop()` executes continuously through `requestAnimationFrame`, even after a D3 simulation settles. Each frame advances a numeric tick, advances any camera tween, places Rings nodes, orbits agents, rebuilds focus, paints a cached backdrop, applies the world transform, draws under-layer fog/guides, links, mid-layer particles, nodes, selection, and screen-space labels. Source: `_core.js`, `loop()`, lines 932-1069.

**INFERENCE / RECOMMENDATION:** implement a typed `AuditCanvasRenderer` with the same layer ordering, but support dirty-frame rendering when idle. Keep continuous frames only while simulation, tween, hover animation, selection pulse, Ring spin, Trace, or an explicit ambient-motion mode is active.

## Node painters

**VERIFIED FROM SOURCE:** `skin.drawNode()` contains custom painters per Rubric type. Router uses a breathing corona and rotating rays; agents wobble and blink; hubs use cached glow and embedded icons; apps blink and can use hex/crystal/biolume silhouettes; routines orbit, counter-rotate, or breathe; skills twinkle; folders use distinct aggregate forms; files are smaller marks. Source: `public/index.html`, `drawNode()`, lines 271-463.

**INFERENCE / RECOMMENDATION:** retain the painter architecture, not the Rubric type mapping. Create Signal painters keyed by `NodeKind` and epistemic basis. The painter must never infer semantics from radius, color, or position. It receives resolved presentation policy from the Signal visual adapter.

Suggested role mapping:

| Rubric painter role | Signal presentation role |
|---|---|
| router/sun | Reality or active Audit scope center |
| department hub | lane node |
| folder/aggregate | feature, source, evidence aggregate, typed cluster |
| file/leaf | finding, work, decision, dependency, person, passage |
| rim app | source artifact, integration, or external-intelligence producer |

## Glow, orb caching, fog, and compositing

**VERIFIED FROM SOURCE:** `_flows2.js` caches one 48×48 lit orb per color/lightness and one 64×64 glow gradient per color. This avoids constructing radial gradients for every node on every frame. Source: `_flows2.js`, `orbSprite()` and `glowSprite()`, lines 32-58.

**VERIFIED FROM SOURCE:** the Nebula skin paints department fog by drawing enlarged cached glow sprites beneath hubs and agents. Dark mode sometimes uses `globalCompositeOperation = "lighter"`; the code restores `source-over` afterward. Source: `index.html`, `underLayer()`, lines 154-203, and `midLayer()`, lines 238-269.

**VERIFIED FROM SOURCE:** the backdrop is rendered once into `S.bgCache` and reused until resize. It contains a fading hex grid and radial vignette. Source: `index.html`, `drawBackdrop()`, lines 127-152; `_core.js`, `loop()`, lines 963-972.

**INFERENCE / RECOMMENDATION:** these three mechanisms—sprite caching, subdued group fog, and layered compositing—should be copied conceptually in Slice 1. They contribute more to Rubric's visual identity than its camera does.

## Culling and batching

**VERIFIED FROM SOURCE:** links are rejected when both endpoints lie beyond the expanded viewport. In dense mode, non-focused links are accumulated into one `Path2D` per relation kind; spokes are omitted below zoom 0.9. Source: `_core.js`, `loop()`, lines 979-1017.

**VERIFIED FROM SOURCE:** nodes outside the viewport are skipped. In dense mode, small files/directories below roughly 4.2 screen pixels are grouped by color/state and painted in batches; selected and hovered nodes bypass the batch. Source: `_core.js`, `loop()`, lines 1020-1051.

**INFERENCE / RECOMMENDATION:** port viewport culling immediately. Defer dense `Path2D` and node batching until real Signal measurements justify it. The available Signal snapshot reports 72 nodes/93 edges for expanded JSA and 180/180 combined; source: `/private/tmp/signal-prod-verify-3053a96/docs/SIGNAL-GRAPH.md`, lines 32-71.

## Hit testing and hover/focus

**VERIFIED FROM SOURCE:** `hitTest()` converts screen to world coordinates and linearly scans visible nodes for the nearest hit inside `radius + 6/cameraScale`. It is O(N), has no quadtree, and skips filtered/offstage nodes. Source: `_core.js`, lines 918-929.

**VERIFIED FROM SOURCE:** `rebuildFocus()` chooses drag, hover, or selected node; builds a direct-neighbor node set and matching edge-index set; Hermes agents receive a special configured reach set. The sets drive dimming and edge emphasis but do not modify physics. Source: `_core.js`, lines 790-809.

**INFERENCE / RECOMMENDATION:** O(N) hit testing is adequate for current Audit scale. Port focus-set behavior, but obtain neighbors from Graphology and Signal edge policies. Do not reproduce Hermes special reach as a renderer exception; model permissible reach in Signal's semantic projection.

---

# 4. Layout

## Shared layout lifecycle

**VERIFIED FROM SOURCE:** `setLayout()` stops the old D3 simulation but retains the same node objects and their current `x/y/vx/vy` fields. It clears fixed positions in `buildSim()` and initializes either Rings or a new D3 simulation. Source: `_core.js`, `setLayout()`, lines 310-325; `buildSim()`, lines 548-556.

**VERIFIED FROM SOURCE:** initial positions are assigned with `Math.random()` by `seed()`, and newly expanded children receive random offsets. Source: `_core.js`, `seed()`, lines 93-96; `insertChildren()`, lines 223-234.

**INFERENCE / RECOMMENDATION:** preserve current-position retention but replace all random seeding with a stable ID-derived PRNG. Signal must reload deterministically and layout transitions must begin from the coordinates actually on screen.

## Force

**VERIFIED FROM SOURCE:** `buildSim("force")` constructs a `d3.forceSimulation` over visible non-agent nodes. The central router is fixed at `(0,0)`. Agents are excluded and orbit separately. Source: `_core.js`, lines 548-560.

**VERIFIED FROM SOURCE:** base D3 configuration:

```text
forceLink distance by edge type:
  route 165, spoke 42, wire 70, sync 250, xlink 170, other 120
  all multiplied by st.dist0()

forceLink base strength:
  spoke .42, route .55, wire .25, sync .02, other .03

forceManyBody strength by node type:
  router -720, hub -420, dir -70, app/routine -60, file -26
  all multiplied by st.rep0()

many-body distanceMax:
  dense 320, normal 560

many-body theta:
  dense 1.2, normal .9

alphaDecay:
  dense .05, normal .022

velocityDecay:
  Force .46
  bounded orbit personality .38
  bounded drift personality .52

collision in non-dense mode:
  radiusOf(node) + 2.4, strength .6

dense mode:
  no collision, alphaMin .02
```

Source: `_core.js`, `buildSim()`, lines 587-599.

**VERIFIED FROM SOURCE:** context Force adds radial targets: skills around 150, routines 440, apps 560, and department hubs on configurable radial distances. Source: `_core.js`, lines 693-706.

**INFERENCE / RECOMMENDATION:** use these only as starting calibration. Signal has fewer, more semantically differentiated nodes and different radii. The force family is reusable; Rubric's constants are not product laws.

## Circle and Hex

**VERIFIED FROM SOURCE:** Circle and Hex share the same D3 simulation. A bounded radius is calculated as:

```text
max(300, (dense ? 16 : 30) * sqrt(nodeCount / PI))
  * (0.55 + boundSize * 0.9)
```

Hex uses an angle-dependent maximum radius based on its apothem. Source: `_core.js`, lines 574-579 and 605-612.

**VERIFIED FROM SOURCE:** bounded layouts optionally scatter certain layer nodes using the golden angle; apps are placed around the silhouette rim; `forceX/forceY` pull scattered or user-positioned nodes toward stored targets. Source: `_core.js`, lines 613-641.

**VERIFIED FROM SOURCE:** with `tightClusters`, Rubric replaces global charge with a shorter-range charge and stronger local collision. The charge range is `60 + g_reach * 180`; collision is `radius + 0.6 + g_pad * 3.6` at strength `.7`. Source: `_core.js`, lines 642-650.

**VERIFIED FROM SOURCE:** the final skin ships with `clusterLayers: true`, `tightClusters: true`, `hubOrbit: true`, and `freeDrop: true`. Source: `public/index.html`, skin configuration, lines 63-75.

**VERIFIED FROM SOURCE:** apps/dust can be excluded from link springs. Remaining bounded-layout link strengths are multiplied by `gL = g_link * 2`; the shipped default has `g_link: 0`, so relationship springs are effectively disabled in the default bounded presentation. Sources: `_core.js`, lines 651-656; `index.html`, lines 76-90.

**VERIFIED FROM SOURCE:** a custom soft-boundary force adds velocity toward the interior only when a node exceeds the circular or hexagonal limit. Source: `_core.js`, lines 657-664.

**VERIFIED FROM SOURCE:** when `hubOrbit` is on, all visible hub icons are seeded and pulled onto a radius-105 ring around the router with radial strength `.85`. Source: `_core.js`, lines 667-678.

**VERIFIED FROM SOURCE:** a custom department/group pull later in `buildSim()` applies velocity toward the node's resolved group hub, with configurable strength and distance behavior. Source: `_core.js`, approximately lines 711-732.

**INFERENCE / RECOMMENDATION:** Circle/Hex is the correct foundation for Signal's default organic cell view. The mechanism that makes Rubric groups coherent is the combination of bounded space, group hubs, short-range charge, collision, group pull, and nearly absent relationship springs—not automatic graph clustering.

For Signal:

1. Use existing Signal lane positions as soft anchor centers.
2. Assign each node to one semantic anchor through the visual adapter.
3. Keep structural relationship springs at zero initially.
4. Use short-range charge/collision to form local cells.
5. Allow only explicitly declared structural-parent forces inside an aggregate, if testing proves they help.
6. Never let a cross-lane evidence relation move either endpoint to the other lane.

## Rings

**VERIFIED FROM SOURCE:** Rings is not a D3 simulation. It computes deterministic angular/radial targets and writes node positions each frame. Source: `_core.js`, Rings subsystem, lines 339-545.

**VERIFIED FROM SOURCE:** `ringsGeom()` derives Skills base radius, measures how many 15-unit slots are needed across one or more skill rings, then positions memory and other bands beyond them. Ring gap is `20 + gap * 30`; base angular span is `0.30 + span * 0.36`. Source: `_core.js`, lines 394-403.

**VERIFIED FROM SOURCE:** context-view department sector weights are `sqrt(max(4, pool.length))`. Nodes are sorted by descending file size. Row capacity is derived from angular span, radius, and approximately 15 units per seat. Skills use full-circle rings; routines and apps occupy further rings. Source: `_core.js`, `computeRingTargets()`, lines 445-504.

**VERIFIED FROM SOURCE:** Ring targets are cached by layout epoch and layout dial values. Per-frame placement applies only rotation, wobble, collapse interpolation, drag return, and layout transition. Source: `_core.js`, lines 406-443.

**VERIFIED FROM SOURCE:** Ring rotation advances by `spin * .0014` per frame. Each node also receives radial wobble `sin(tick * .008 + radius + angle * 7) * 1.5`. Source: `_core.js`, lines 416-441 and `placeRingNode()`, lines 538-545.

**VERIFIED FROM SOURCE:** Rings uses no collision or packing engine. Seat capacity is arithmetic; labels may still overlap. Source: absence of force/collision in `_core.js`, lines 339-545, contrasted with D3 collision at lines 587-599.

**INFERENCE / RECOMMENDATION:** adapt the target generator, cache, spin, and morph. Replace Rubric's ARMS bands and byte-size order with explicit Signal radial semantics and stable IDs. A candidate Signal mapping for A/B testing:

- center: Reality and current scope;
- inner field: accepted/core model and lane hubs;
- middle sectors: findings, decisions, dependencies, features, work;
- evidence band: passages and source aggregates;
- outer/rim band: source artifacts and external-intelligence producers.

This mapping is a recommendation, not behavior verified in Rubric.

## Layout morphing

**VERIFIED FROM SOURCE:** entering Rings stores every visible node's current coordinates in `_trX/_trY`. `ringBlend()` interpolates from those coordinates to the target. Source: `_core.js`, `initRings()`, lines 341-350; `ringBlend()`, lines 363-389.

**VERIFIED FROM SOURCE:** transition duration is frame-based: `26 + (1 - transSpd) * 110`. Orbit style uses smoothstep and gives apps/routines an additional 5.5-radian lap; drift style uses a deterministic ID-length stagger and a mild overshoot-like easing factor. Source: `_core.js`, `transK()` and `ringBlend()`, lines 353-389.

**INFERENCE / RECOMMENDATION:** port the current-position snapshot contract, but drive transition progress from elapsed milliseconds and honor `prefers-reduced-motion`. Reuse Signal's camera timing conventions rather than Rubric's frame counts.

---

# 5. Motion and physics

## Continuous simulation and idle behavior

**VERIFIED FROM SOURCE:** normal D3 simulations cool with `alphaDecay(.022)`; dense simulations keep `alphaMin(.02)`, meaning dense worlds remain physically active. Source: `_core.js`, lines 588-599.

**VERIFIED FROM SOURCE:** the Canvas loop never stops. Rings continue spinning/wobbling, agents continue orbiting, and visual pulses continue after positional layout settles. Source: `_core.js`, `loop()`, lines 932-1069.

**VERIFIED FROM SOURCE:** node painters include sinusoidal router corona, agent wobble/blink, app status blink, routine rotation/orbits/breathing, skill twinkle, and pulsing selection rings. Source: `index.html`, `drawNode()`, lines 271-463; `drawSelection()`, lines 466-484.

**INFERENCE / RECOMMENDATION:** Rubric's alive feel is the sum of low-amplitude painter animation, fog, focus contrast, and layout motion. Do not keep a force simulation hot merely to create life. Signal should use painter animation for ambient life and physics only when settling, dragging, morphing, or blooming.

## Collision and grouping

**VERIFIED FROM SOURCE:** normal Force collision uses `radius + 2.4` and strength `.6`; tight bounded collision uses smaller configurable padding and strength `.7`; dense mode disables collision. Source: `_core.js`, lines 587-599 and 642-650.

**INFERENCE / RECOMMENDATION:** use collision in all current Signal scopes because the graph is small. Collision radius must include only node geometry, not labels. Labels are a separate screen-space problem.

## Dragging and reheating

**VERIFIED FROM SOURCE:** force-node drag sets `fx/fy`, raises `alphaTarget(.28)`, and restarts the simulation. During drag, world coordinates are updated directly. On release, bounded `freeDrop` nodes adopt `_userHome`, are released from fixed coordinates, and the simulation is reheated; other layouts release and refresh. Source: `_core.js`, Canvas pointer handlers, approximately lines 832-899.

**VERIFIED FROM SOURCE:** Rings drag uses an explicit `_pin`; release creates `_sprF` and returns the node to its ring target over 36 frames with ease-out cubic. Agents use the same return mechanism for their orbit. Sources: `_core.js`, lines 832-899; `ringBlend()`, lines 366-373; agent orbit, lines 944-959.

**INFERENCE / RECOMMENDATION:** preserve reheat-on-drag and direct hand control. Decide through A/B testing whether a released Signal node changes only its presentation home for the session or always returns to its semantic anchor. It must never mutate Graphology semantics or canonical product state.

## Link springs

**VERIFIED FROM SOURCE:** the `Link springs` control rebuilds Circle/Hex and scales D3 link strength. Shipped `g_link: 0` means link springs are off in the default bounded view. Source: `index.html`, defaults around lines 76-90 and control wiring around lines 558-575; `_core.js`, lines 651-656.

**INFERENCE / RECOMMENDATION:** Signal should also default relationship springs to zero. If an explicitly structural relation is later allowed to act as a spring, that must be a named presentation rule, not a generic consequence of graph connectivity.

## B3 local bloom

**CONTEXT-PROVIDED:** Signal's isolated B3 experiment found that an outward local-clearance force, rather than pulling connected nodes inward, could open a selected local world while keeping the global map fixed, support rapid retargeting, and return toward stable seats. The B3 source commit was not locally available in this audit.

**VERIFIED FROM SOURCE:** Rubric selection itself does not reheat or restructure the layout. `select()` sets selection/card/action state; `rebuildFocus()` alters visual focus sets. Physics changes occur during drag/layout changes, not ordinary click. Source: `_core.js`, `rebuildFocus()`, lines 790-809; `select()`, lines 1138-1219.

**INFERENCE / RECOMMENDATION:** B3 bloom must be an explicit Signal layer added on top of the Rubric-derived resting engine. It is not something Claude should expect to find or turn on in Rubric.

---

# 6. Camera

## Rubric implementation

**VERIFIED FROM SOURCE:** Rubric camera state is an affine `{k, x, y}` transform. `w2s()` and `s2w()` convert coordinates. `flyCam()` snapshots the current camera and a target with a frame duration. `resetCam()` fits a nominal 1500-unit world. `flyToNode()` centers a node and raises zoom to at least 1.6. Source: `_core.js`, lines 811-816.

**VERIFIED FROM SOURCE:** wheel zoom uses `exp(-deltaY * .0014)`, clamps scale to `.1-8`, preserves the world point beneath the cursor, and cancels an in-flight camera tween. Pointer drag pans by direct screen deltas. Source: `_core.js`, `initCanvas()`, approximately lines 819-908.

**VERIFIED FROM SOURCE:** fly motion advances one integer frame at a time and uses ease-out cubic independently on `x`, `y`, and `k`. It has no spring, momentum, inertia, overshoot, or geometric scale interpolation. Source: `_core.js`, `loop()`, lines 932-940.

**VERIFIED FROM SOURCE:** a new fly snapshots the camera's current reached position, so it can retarget. Wheel/pan cancels the current flight. Ordinary selection does not automatically fly; double-click and explicit Fly actions do. Sources: `_core.js`, lines 811-908 and `select()`, lines 1138-1219.

## Signal comparison

**VERIFIED FROM SIGNAL SOURCE:** Signal's available camera implementation uses 320 ms elapsed-time easing, ease-out cubic, geometric zoom interpolation, live interruption/retargeting, scale quantization for node rendering, and `prefers-reduced-motion`. Source: `/private/tmp/signal-prod-verify-3053a96/components/audit/cameraMotion.ts`, lines 15-113.

**INFERENCE / RECOMMENDATION:** Rubric's camera should not be the default replacement. Preserve Signal's camera and bind its transform to the Canvas renderer.

**A/B CANDIDATE:** only compare the following feel variables, not whole camera implementations:

1. Rubric zoom sensitivity and bounds versus Signal's.
2. Whether Rubric's longer apparent fly duration better matches the video.
3. Whether node focus should ever trigger camera motion automatically.
4. Whether cluster expansion should retain Signal's existing 1.35 fly behavior.

---

# 7. Search

## Rubric graph search

**VERIFIED FROM SOURCE:** `scan.search()` lowercases a trimmed query and assigns fixed scores: filename exact 100, prefix 80, contains 60, path contains 30; directories receive a similar 95/75/55 scale; file score is reduced by path depth up to 20. Results are sorted and sliced to 40 by default. Source: `scan.js`, lines 374-400.

**VERIFIED FROM SOURCE:** there is no fuzzy matching, typo tolerance, Unicode normalization, vector/semantic search, content index, evidence extraction, or field-weight configuration in this function. This is established by the complete implementation at `scan.js`, lines 374-400.

**VERIFIED FROM SOURCE:** the client debounces roughly 180 ms, calls `/api/search`, renders at most 14 suggestions, and on activation calls `jumpTo()`, which expands ancestor folders, refreshes layout, selects the result, and later flies to it. Source: `_core.js`, search wiring around lines 1489-1514; `jumpTo()`, lines 1280-1286.

## Separate `brain.js` recall

**VERIFIED FROM SOURCE:** `brain.js recall()` tokenizes words, removes a stop-word list, scores exact/prefix pointer matches, filename matches, and configured routing hints, reads top candidate files, extracts a relevant section, and may follow one pointer hop. It is a CLI memory tool and is not the graph search endpoint. Source: `brain.js`, `words()` and `recall()`, lines 24-160.

## Signal decision

**CONTEXT-PROVIDED:** Signal's completed Level-1 MiniSearch branch provides weighted fields, normalization, typo tolerance, canonical IDs, evidence quotes, lens-state restoration, and fast local queries. The branch commits named in the prior record were not present locally for source reinspection.

**INFERENCE / RECOMMENDATION:** keep MiniSearch. Do not port Rubric graph search. The only adoptable idea is an optional exact routing/alias boost before normal MiniSearch ranking for curated identifiers. Rubric's `jumpTo()` interaction—reveal hidden ancestors, select, then frame—is worth adapting to Signal search results.

---

# 8. Labels

## Exact Rubric behavior

**VERIFIED FROM SOURCE:** `drawLabels()` builds candidates only for visible/passing nodes. It forces hover/selection and large router/agent/hub labels, applies minimum zoom for apps/routines, honors the file-label kill switch, admits focus neighbors under limited conditions, and otherwise requires a projected-radius threshold. Source: `_core.js`, lines 1071-1088.

**VERIFIED FROM SOURCE:** candidates are sorted with big nodes first, then by radius, and truncated to `30 + labels * 40`. Source: `_core.js`, lines 1089-1092.

**VERIFIED FROM SOURCE:** the Nebula skin places each label at a fixed offset beneath the node, with uppercase/bolder treatment for major nodes and an outline/halo for contrast. Source: `index.html`, skin `drawLabels()`, lines 486-510.

**VERIFIED FROM SOURCE:** there is no label-label collision detection, occupancy grid, quadtree, anchor search, leader line, or edge-label logic in the complete label path above.

## Signal requirement

**INFERENCE / RECOMMENDATION:** Rubric does not solve labels. Signal needs a deterministic cartographic label stage after the final layout is chosen:

1. Mandatory: selected, hovered, search result, active Trace, active source.
2. Next: Reality, scope, lane hubs, expanded aggregates.
3. Then: explicit semantic priority, never degree or file size.
4. Try a stable finite anchor set per node.
5. Reserve screen-space rectangles in priority order.
6. Drop lower-priority collisions.
7. Persist winning anchors until a material zoom/layout change to prevent jitter.
8. Keep labels screen-sized and recompute only at quantized zoom/layout epochs.

Whether to implement this small deterministic allocator or adopt a maintained cartographic-label dependency is an empirical/maintenance decision. Rubric supplies no library to reuse.

---

# 9. Node size and numbered bubbles

**VERIFIED FROM SOURCE:** `radiusOf()` uses fixed radii for router, agents, hubs, apps, and routines. Directories use `min(20, 5 + sqrt(files) * .34)`. Files use a logarithmic function of byte size. Source: `_core.js`, `radiusOf()`, lines 739-750.

**VERIFIED FROM SOURCE:** directory painters render `n.files` inside a folder/aggregate when its projected screen radius is sufficiently large. Source: `index.html`, directory painter, approximately lines 401-437.

**VERIFIED FROM SOURCE:** Rubric does not compute PageRank, degree centrality, betweenness, semantic importance, or document popularity for node size. The graph builder supplies file byte sizes and rolled-up descendant counts; sources: `scan.js`, `walk()`, lines 81-126; `buildGraph()`, lines 196-315; `_core.js`, `radiusOf()`, lines 739-750.

**INFERENCE / RECOMMENDATION:** never port file-byte sizing into Signal. Size should remain an explicit, documented Signal presentation policy by node kind/state. Numbered aggregate bubbles may show truthful counts such as children, findings, passages, or sources, but the number must be labeled in tooltip/accessibility text and must not imply importance or confidence.

---

# 10. Edges

## Ambient mesh and focus wake

**VERIFIED FROM SOURCE:** `rebuildFocus()` identifies direct focus edges; `drawLink()` drops unrelated edge alpha to `.07` when a focus exists. Focus edges receive a linear gradient from source color to target color and a stronger screen-compensated width. Sources: `_core.js`, lines 790-809; `index.html`, lines 205-235.

**VERIFIED FROM SOURCE:** ambient edge styles depend on Rubric edge kind. `sync` is dashed with an animated dash offset; route, wire, spoke, cross-link, and normal link receive different alpha/width/color policies. Aggregate weight affects width for sync/xlink/link. Source: `index.html`, `drawLink()`, lines 205-235.

## Curvature

**VERIFIED FROM SOURCE:** edge bow is deterministic by link index. `bowOf()` chooses sign and magnitude; `linkCtrl()` offsets the midpoint perpendicular to the chord; edges are quadratic Béziers. Source: `_flows2.js`, lines 17-30, and duplicated skin helpers in `index.html`, lines 48-62.

**VERIFIED FROM SOURCE:** this is curvature, not edge bundling. There are no shared bundle paths, hierarchical routing, arrowheads, or edge labels in the renderer.

## Edge animation

**VERIFIED FROM SOURCE:** `midLayer()` maintains a fixed pool of 52 possible particles. Enabled particles advance along quadratic edge points and draw four-segment fading trails. Focus suppresses most unrelated particles. Source: `index.html`, lines 238-269.

**VERIFIED FROM SOURCE:** the final skin defaults `flow` to zero, so comet flow is normally disabled. Source: `index.html`, skin defaults around lines 76-90.

## Signal adaptation risks

**INFERENCE / RECOMMENDATION:** retain Signal's `rel`, `basis`, and `rule` semantics. The locally available Signal documentation requires every edge to carry explainable provenance and forbids unsupported confidence/weight fields. Source: `/private/tmp/signal-prod-verify-3053a96/docs/SIGNAL-GRAPH.md`, lines 73-96 and 141-173.

Specific safeguards:

- Do not use animated flow on stored relationships; it can imply live activity or causality.
- Allow beads/pulses only for active Trace, an actual live operation, or a clearly labeled temporal event.
- Preserve attested/inferred/external differentiation under hover and selection.
- A focused edge may brighten but must not change epistemic basis.
- Edge weight must not silently represent confidence.
- Cross-lane edges must not become spatial springs by default.

---

# 11. Source and file opening

**VERIFIED FROM SOURCE:** selecting a Rubric node builds a card with metadata, neighbors, and actions. A second click on a file can open its viewer. Source: `_core.js`, `select()`, lines 1138-1219.

**VERIFIED FROM SOURCE:** `openViewer()` requests `/api/file`, inserts rendered Markdown through Marked for `.md`, and intercepts internal relative links so they call `jumpTo()`. External links open separately. Source: `_core.js`, lines 1232-1268.

**VERIFIED FROM SOURCE:** `/api/file` returns text only for a configured extension set and rejects files above 500 KB; `/api/open` invokes a platform command, with a Windows `cmd` path in the inspected implementation. Source: `server.js`, lines 119-137.

**INFERENCE / RECOMMENDATION:** reuse the interaction pattern, not the server or path handling:

- first click: select and inspect;
- explicit Open or second click: open source drawer;
- source drawer: render Signal passage/source metadata and provenance;
- internal citations: navigate back to canonical graph IDs;
- external artifact links: use Signal's existing safe connector/link behavior;
- preserve a return-to-graph affordance and prior camera state.

Do not copy Rubric's raw Markdown insertion without sanitization, its Windows command execution, or its filesystem path assumptions.

---

# 12. Licensing and ownership

This section is an engineering inventory, not legal advice.

## Inspected local licensing files

No `NOTICE`, `COPYING`, or separate third-party notice file was found in the inspected Rubric directories. The following relevant files were found:

| Local path | Observed metadata | Engineering interpretation |
|---|---|---|
| `/Users/nicholaspayne/Downloads/rubric-second-brain/LICENSE`, lines 1-24 | CC BY 4.0; copyright 2026 Jay E / RoboNuggets; attribution/link/change notice | Direct reuse is permitted by the supplied notice if attribution and other CC BY obligations are satisfied |
| `/Users/nicholaspayne/Downloads/rubric/LICENSE`, full file | CC BY 4.0; RoboNuggets | Governs the scaffold material unless a more specific third-party notice applies |
| `/Users/nicholaspayne/Downloads/rubric-agentic-os/LICENSE`, full file | Full CC BY 4.0 legal text | Agentic OS material is not automatically MIT merely because a vendor file is MIT |
| `/Users/nicholaspayne/Downloads/rubric-docs/LICENSE` | CC BY 4.0 | Conflicts with package manifest's MIT declaration |
| `/Users/nicholaspayne/Downloads/rubric-generations/LICENSE` | CC BY 4.0 | Conflicts with package manifest's MIT declaration |
| `/Users/nicholaspayne/Downloads/rubric-links/LICENSE` | CC BY 4.0 | Conflicts with package manifest's MIT declaration |
| `/Users/nicholaspayne/Downloads/rubric-sprint/LICENSE` | CC BY 4.0 | Conflicts with package manifest's MIT declaration |
| `/Users/nicholaspayne/Downloads/rubric-docs/package.json`, line 7 | `"license": "MIT"` | Ambiguous against repository LICENSE; do not assume MIT governs source |
| `/Users/nicholaspayne/Downloads/rubric-generations/package.json`, line 13 | `"license": "MIT"` | Same ambiguity |
| `/Users/nicholaspayne/Downloads/rubric-links/package.json`, line 13 | `"license": "MIT"` | Same ambiguity |
| `/Users/nicholaspayne/Downloads/rubric-sprint/package.json`, line 11 | `"license": "MIT"` | Same ambiguity |
| `/Users/nicholaspayne/Downloads/rubric-agentic-os/vendor/thinking-orbs.js`, lines 1-4 | `thinking-orbs v0.1.1 - MIT`, copyright Jakub Antalik, upstream URL; says painters were lifted unchanged | Treat as separately licensed third-party code and preserve the upstream MIT notice if used |
| `/Users/nicholaspayne/Downloads/rubric/templates/flows/package.json` and `package-lock.json` | `dotenv` and `ws`; package says `SEE LICENSE`; lock identifies dependency license metadata | Unrelated to Second Brain renderer; no reason to import |

## Browser dependencies referenced by Second Brain

**VERIFIED FROM SOURCE:** `public/index.html`, lines 8-16, loads:

- D3 from `cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js`;
- Marked 11.1.1;
- Google Fonts Outfit and Source Serif 4;
- local icon/flow/core scripts.

**VERIFIED FROM SOURCE:** `_core.js`, approximately lines 1741-1759, optionally loads Simple Icons v13 assets when a local path is unavailable.

The Second Brain folder does not bundle dependency license notices or a package manifest pinning D3's minor/patch version.

## Reuse classification

### May be reused directly, with compliance work

**VERIFIED FROM SOURCE / LICENSE:** Rubric Second Brain source is presented under CC BY 4.0 in `/Users/nicholaspayne/Downloads/rubric-second-brain/LICENSE`. Directly copied or adapted code should carry appropriate Jay E / RoboNuggets attribution, a CC BY 4.0 link, and a change notice. Confirm the desired attribution placement before merging production code.

**RECOMMENDATION:** install and import a pinned upstream `d3-force` package under its upstream license rather than copying D3 or retaining the CDN global.

### Prefer study and clean reimplementation

- Canvas layer ordering and renderer architecture.
- Bounded Circle/Hex force recipe.
- Ring target/cache/morph concepts.
- Focus-set and edge-wake policy.
- Glow/orb sprite caching.
- Culling/batching patterns.

**RECOMMENDATION:** these are straightforward to express in typed Signal-owned modules and avoid importing Rubric's globals, ARMS semantics, filesystem assumptions, and UI coupling. If implementation follows Rubric source closely enough to be an adaptation, retain attribution even if rewritten.

### Do not directly reuse without separate review

- `_icons.js` and brand icon paths: individual trademarks/brand rights may apply even if an icon catalog is broadly permissive.
- Google Font files or CSS outside their proper upstream terms.
- `thinking-orbs.js` without preserving and verifying the upstream MIT license notice.
- Any sibling source whose `package.json` says MIT while its folder LICENSE says CC BY 4.0, until ownership clarifies the discrepancy.
- Rubric-specific pixel character sprites or recognizable artwork if Signal does not need them.

### Uncertain

- Whether every locally supplied Rubric file is original to the named licensor or contains other adapted material not marked at file level.
- Which exact D3 v7 minor/patch was served when the reference was recorded.
- Individual brand-icon permissions and trademark restrictions.
- Whether the short human-readable CC summaries in several folders were intended to supersede their package-manifest MIT fields.

---

# 13. KEEP / ADAPT / REPLACE / DO NOT TAKE

| Capability | Rubric implementation | Signal action | Reason |
|---|---|---|---|
| Semantic data model | Filesystem/config graph from `scan.js`, lines 196-315 | **KEEP Signal** | Rubric semantics do not represent Audit truth |
| Graphology projection | Not used | **KEEP Signal** | Stable typed IDs/relations and provenance remain authoritative |
| Canvas painter | `_core.js` 932-1069; `index.html` 127-510 | **ADAPT** | Fastest route to the Rubric visual character |
| Glow/orb cache | `_flows2.js` 32-58 | **ADAPT** | High-value, low-risk rendering primitive |
| Fog/backdrop | `index.html` 127-203 | **ADAPT** | Major atmosphere contribution; recolor to Signal |
| Circle/Hex engine | `_core.js` 605-692 and 711-732 | **ADAPT / REPLACE current resting arrangement** | Produces organic bounded cells around semantic anchors |
| Generic relationship springs | `_core.js` 587-591, 651-656 | **DO NOT TAKE as default** | Cross-semantic links should not choose seats |
| Force engine | `_core.js` 547-736 | **ADAPT** | Use D3 integration but Signal-defined forces/anchors |
| Rings target engine | `_core.js` 339-545 | **ADAPT** | Strong alternate view and morph mechanism |
| Random seeding | `_core.js` 93-96, 223-234 | **REPLACE** | Signal requires deterministic reloads |
| Current-position retention | `_core.js` 310-389 | **ADAPT** | Makes layout switching continuous |
| B3 local bloom | Absent from Rubric click path | **KEEP/INTEGRATE Signal B3** | Required selected-neighborhood behavior |
| Camera | `_core.js` 811-940 | **KEEP Signal; A/B parameters only** | Signal camera is time-based, interruptible, geometric, reduced-motion aware |
| Search | `scan.js` 374-400 | **REPLACE with completed MiniSearch branch** | Rubric search is filename/path substring only |
| Search reveal/fly UX | `_core.js` 1280-1286, 1489-1514 | **ADAPT** | Results should reveal hidden ancestors and frame selected object |
| Label eligibility/budget | `_core.js` 1071-1092 | **ADAPT policy ideas** | Focus/zoom/type gating is useful |
| Label placement | `index.html` 486-510 | **REPLACE** | No collision or stable alternative anchors |
| File-byte sizing | `_core.js` 739-750 | **DO NOT TAKE** | Has no valid Audit meaning |
| Aggregate counts | `index.html` 401-437 | **ADAPT** | Use explicitly named Signal counts only |
| Edge curvature | `_flows2.js` 17-30 | **ADAPT or retain Signal curve** | Both systems already use deterministic quadratic curves |
| Hover edge wake | `_core.js` 790-809; `index.html` 205-235 | **ADAPT** | Strong contributor to perceived responsiveness |
| Ambient comets | `index.html` 238-269 | **DO NOT TAKE ambiently** | Motion could falsely imply live activity/causality |
| Trace particles | same | **ADAPT for active Trace only** | Semantically defensible when activity is explicit |
| File viewer server | `server.js` 119-137 | **DO NOT TAKE** | Filesystem/Windows assumptions and weaker safety model |
| Graph-linked drawer UX | `_core.js` 1138-1286 | **ADAPT** | Useful interaction pattern for Signal sources/passages |
| Skill-tree custom physics | `rubric/templates/skill-trees/index.html` 301-354 | **DO NOT TAKE** | O(N²), superseded by D3 |
| Thinking Orbs vendor | `rubric-agentic-os/vendor/thinking-orbs.js` | **DO NOT TAKE** | Not part of graph and adds provenance work |

---

# 14. Concrete implementation slices

## Slice 1 — Canvas painter using existing Signal coordinates

### Goal

Prove the Rubric visual language without changing layout, selection semantics, search, or graph construction.

### Implement

1. Create a Graphology-to-visual-node/edge adapter.
2. Create a React-owned Canvas component using Signal's current `layoutGraph()` coordinates.
3. Port/reimplement the layer order from `_core.js`, `loop()`, lines 932-1069.
4. Reimplement cached glow/orb sprites from `_flows2.js`, lines 32-58.
5. Reimplement backdrop/fog from `index.html`, lines 127-203.
6. Reimplement Signal-specific node painters using `index.html`, lines 271-463 as the mechanical reference.
7. Implement edge wake/dimming from `_core.js`, lines 790-809 and `index.html`, lines 205-235.
8. Bind Signal's existing camera transform to the Canvas world.
9. Preserve or create an accessible DOM mirror for nodes/actions because Canvas itself supplies no semantic accessibility tree.

### Do not change

- Graphology graph construction.
- Search.
- Existing coordinates.
- Selection/action behavior.
- Source drawer.
- Signal camera contract.

### Acceptance evidence

- Pixel/recording comparison at rest, hover, selection, zoom, and pan.
- Same selected canonical ID and Audit panel before/after renderer switch.
- No Graphology attributes mutated by render.
- Reduced-motion behavior remains intact.

## Slice 2 — Rubric/D3 resting spatial engine plus Signal semantic anchors

### Goal

Replace rails/bands with Rubric-like coherent cells without changing semantic ownership.

### Implement

1. Add a presentation-only `LayoutEngine` interface returning positions/velocities.
2. Add an exactly pinned `d3-force` dependency.
3. Seed positions deterministically from canonical IDs.
4. Use current Signal lane positions as soft group anchors.
5. Reimplement Circle/Hex boundary, short-range charge, collision, hub orbit, group pull, and current-position retention from `_core.js`, lines 547-736.
6. Default generic relationship spring strength to zero, following the shipped bounded Rubric configuration in `index.html`, lines 63-90 and `_core.js`, lines 651-656.
7. Stop/restart/reheat only the presentation simulation.
8. Keep semantic topology and layout state separate.

### Initial tuning hypotheses

Start proportionally from Rubric, not necessarily numerically identical:

- normal `alphaDecay`: `.022`;
- velocity decay candidate: `.38` versus `.52` A/B;
- collision strength: `.7`;
- charge distance: scaled equivalent of `60 + dial * 180`;
- hub orbit: proportional equivalent of radius 105;
- link springs: zero;
- collision always enabled at current Audit scale.

### Acceptance evidence

- Stable deterministic reload.
- Each node remains assigned to its Signal semantic anchor.
- Background/global anchor displacement is measured.
- Cross-lane edges do not teleport members.
- Cells remain readable at real JSA density.
- Interaction holds target frame budget.

## Slice 3 — B3 local bloom

### Goal

Make selection physically open a readable local world while the global semantic map remains fixed.

### Implement

1. Recover/port the verified B3 outward-clearance mechanism from the isolated lab.
2. Apply bloom as a temporary presentation force around the selected node/local population.
3. Do not use connected-edge attraction as the bloom mechanism.
4. Pin/strongly retain global semantic anchors.
5. Retarget from current positions on rapid selection changes.
6. On deselect, ease members to deterministic presentation homes without releasing the entire field.
7. Force selected/neighbor labels and wake edges while bloomed.

### Rubric contribution

- focus-set visuals: `_core.js`, lines 790-809;
- drag/reheat lifecycle: `_core.js`, approximately 832-899;
- painter response: `index.html`, lines 205-484.

Rubric does not supply the bloom force itself.

### Acceptance evidence

- Local clearance increase.
- Background displacement near zero.
- Rapid retarget never queues or stops responding.
- Identity return error versus baseline drift.
- Camera does not move unless explicitly required.
- Reduced-motion alternative uses visual focus without spatial bloom.

## Slice 4 — Rings / Constellations layout morph

### Goal

Offer a Rubric-derived overview layout without importing ARMS semantics.

### Implement

1. Create Signal band/sector policy explicitly from product semantics.
2. Port target caching and square-root sector allocation from `_core.js`, lines 394-504.
3. Sort by stable semantic policy, not byte size.
4. Snapshot live positions and morph to targets using the contract at `_core.js`, lines 341-389.
5. Use elapsed time and reduced-motion support.
6. Add optional spin and low-amplitude wobble from `_core.js`, lines 416-545.
7. Preserve canonical identity and selection during layout switches.

### Naming recommendation

Call this **Constellations** in Signal unless product testing confirms that **Rings** communicates the intended epistemic structure. The name is a product recommendation, not a Rubric fact.

### Acceptance evidence

- Layout switch begins from current on-screen positions.
- No node identity swaps.
- Stable final targets across reloads.
- All bands have an explicit Signal meaning.
- Selection and search survive morph.
- Labels remain readable through and after transition.

## Slice 5 — Labels and production controls

### Goal

Finish dense readability and expose only useful product controls.

### Implement

1. Screen-space priority/collision engine described in Section 8.
2. Mandatory labels for selection, hover, search, Trace, and active source.
3. Stable anchors across small camera changes.
4. Production layout switcher: Cell / Constellations, with Force/Hex laboratory variants behind development controls if needed.
5. Reduced-motion control tied to system preference and an optional explicit product override.
6. Search result reveal/focus integration.
7. Persist only presentation preferences; never semantic state.
8. Keep physics tuning controls out of normal production UI.

### Acceptance evidence

- Zero overlap among mandatory labels.
- Quantified overlap/drop rate for optional labels.
- No label jitter under slow pan/zoom.
- Keyboard navigation and accessible names/actions.
- Production defaults reproduce the approved motion reference without exposing laboratory dials.

---

# 15. Protected Signal laws

Claude must treat these as non-negotiable constraints, not implementation preferences.

1. **Signal remains the product.** Audit is an instrument using the Signal Graph; the renderer is not a new product or truth source. Signal source: `docs/SIGNAL-GRAPH.md`, lines 1-14.
2. **The graph is derived and disposable.** It may never mutate Reality or canonical database records. Same source, lines 8-14.
3. **Semantics, layout, and rendering remain separate.** No geometry fields in the canonical semantic graph. Same source, lines 16-30.
4. **Stable canonical IDs survive every layout and renderer.** Passage/source namespaces must not collapse. Same source, lines 103-139.
5. **Every edge remains explainable.** Preserve `rel`, `basis`, and `rule`; never let a painter create a semantic edge. Same source, lines 141-173.
6. **Epistemic basis is categorical, not numeric.** `attested`, `inferred`, and `external` must remain distinguishable; do not invent confidence/weight. Same source, lines 73-96.
7. **Reality / Scenario / Forecast law remains authoritative.** Presentation motion may not make a scenario or external claim appear accepted into Reality.
8. **Evidence provenance remains visible.** Findings, passages, sources, and external intelligence retain their source chain.
9. **Human acceptance remains a product-state transition.** Physics, selection, or visual proximity may not imply acceptance.
10. **Hermes remains outside the internal-truth boundary until corroborated/accepted according to Signal law.** External claims must not visually collapse into attested evidence.
11. **Absent data remains absent.** The renderer must not synthesize people, requirements, relations, or counts to make a layout look complete. Signal source: `docs/SIGNAL-GRAPH.md`, lines 32-59.
12. **Relationship does not automatically mean spatial neighborhood.** Cross-lane relations light edges; they do not automatically pull endpoints together.
13. **The hand outranks animation.** Pan, zoom, drag, new selection, and new search focus immediately interrupt or retarget presentation motion. Signal source: `components/audit/cameraMotion.ts`, lines 15-27.
14. **Reduced motion is honored.** Bloom, spin, orbit, and layout morph need a reduced-motion path. Signal source: `components/audit/cameraMotion.ts`, lines 108-113.
15. **Search does not permanently pollute view state.** A search lens may reveal results, but clearing it restores the prior expansion/filter state. This is CONTEXT-PROVIDED behavior from the completed MiniSearch branch and should be verified when that branch is recovered.

---

# 16. Open questions requiring empirical A/B tests

These cannot be answered from source inspection alone.

## Renderer and visual style

1. **Canvas versus SVG/hybrid:** does the Rubric painter produce materially better perceived depth than an SVG recreation while retaining accessibility and crisp text?
2. **Fog strength:** at what level do cells cohere without obscuring epistemic edges?
3. **Backdrop:** does Rubric's hex field belong in Audit, or should Signal use a quieter field with the same vignette/compositing technique?
4. **Ambient motion:** which of breathing, wobble, orbit, and twinkle contributes positively versus looking decorative or untrustworthy?

## Resting physics

5. **Circle versus Hex:** which silhouette better supports Audit scanning and matches the reference?
6. **Velocity decay `.38` versus `.52`:** swishy/orbital versus controlled/drifty settling.
7. **Anchor stiffness:** how much local organic movement is possible before lane identity becomes ambiguous?
8. **Idle alpha:** should the simulation fully settle, or retain a tiny alpha? Compare physics drift against painter-only life.
9. **Structural springs:** do any explicitly structural parent-child relations benefit from a weak spring, or should all relationships remain visual-only?
10. **Free drop:** should drag create a session-only home, snap back, or be disabled in production?

## Selection and bloom

11. **Bloom strength:** B3 Balanced versus Expressive on real JSA data.
12. **Bloom population:** geometric locality, semantic aggregate membership, visible direct neighbors, or a hybrid.
13. **Camera coupling:** no automatic move, frame only if offscreen, or gentle focus move on explicit double-click.
14. **Return:** exact seat return versus relaxed cell home, measured against normal resting drift.
15. **Rapid retarget:** how much velocity should be retained versus damped when a new selection arrives?

## Rings / Constellations

16. **Band semantics:** which Signal entities belong at each radius without implying confidence or temporal truth?
17. **Rotation:** continuous spin, stop while reading, or user-controlled only?
18. **Sector allocation:** square-root population weighting versus fixed lane widths for long-term spatial learnability.
19. **Morph personality:** direct drift versus Rubric's orbit sweep.

## Labels

20. **Priority policy:** explicit kind hierarchy versus product-task context.
21. **Anchor stability:** how much hysteresis prevents jitter without allowing stale overlaps?
22. **Maximum label density:** what is readable at each zoom on actual JSA, not fixtures?

## Edges

23. **Ambient mesh alpha:** enough to communicate structure without becoming a cat's cradle.
24. **Focus wake:** direct edges only versus guarded evidence traversal for Audit-specific modes.
25. **Trace particles:** whether direction and timing can be shown without implying unsupported causality.

## Camera

26. **Signal 320 ms flight versus the apparent Rubric/reference timing.** Keep Signal mechanics but compare duration/easing parameters.
27. **Zoom sensitivity and bounds.** Rubric uses exponential `.0014` and `.1-8`; Signal uses product-limited bounds. Test feel without losing semantic detail constraints.

## Performance and accessibility

28. **Continuous Canvas loop versus dirty frames.** Measure CPU/GPU, battery, and perceived life.
29. **Hit testing threshold:** whether O(N) remains sufficient as source/passages expand.
30. **Accessibility mirror:** keyboard and screen-reader model for Canvas nodes, groups, and actions.

---

# Implementation north star

The shortest correct implementation statement is:

> Feed Signal's existing Graphology projection through a thin visual adapter into a Rubric-derived Canvas painter and D3 bounded-cell layout. Preserve Signal's semantic anchors, camera, search, provenance, and product state. Add B3 outward local bloom as an explicit Signal behavior. Adapt Rubric Rings as a deterministic Constellations view. Build a new collision-aware label stage. Treat all motion and edge animation as presentation whose meaning is constrained by Signal's epistemic laws.

Rubric supplies the visual chassis. Signal remains the brain, the law, and the product.
