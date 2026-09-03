# Feature parity

Summary: **44 PASS / 5 PARTIAL / 0 FAIL / 1 EXTERNAL PREREQUISITE BLOCKED**. Weighted score across the 49 exercised items is `(44 + 0.5×5) / 49 = 94.9%`.

## Project and workflow

| Capability | Result | Evidence |
|---|---|---|
| Project selector | PASS | Platform → JSA switched the adapter input and retained the Audit frame. |
| Correct project graph | PASS | JSA loaded its seeded 49 canonical objects before review; project changes changed the graph. |
| Multiple-project switching | PASS | Platform and JSA exercised in the same mounted route. |
| Current Audit | PASS | Current Audit selector resolved the seeded Notes source. |
| Prior Audit | PASS | A disposable prior Source fixture produced a real Prior Audit option and 62-node lens. |
| History | PASS | JSA History listed the correct source, counts, status and detail route. |
| Return from History | PASS | Returned to `/audit?scope=jsa` with JSA selected and Audit World mounted. |
| Same-world context transition | PASS | iframe `timeOrigin`, camera and route stayed identical across current/prior switching. |
| Project Overview / stats | PARTIAL | Floating overlay and current/prior counts survive; richer canonical category/source metrics are not present. |
| Real model-backed Run Audit | EXTERNAL PREREQUISITE BLOCKED | UI and `/api/audit` boundary work, but the server reports `ANTHROPIC_API_KEY is not set`. |

## Discovery and navigation

| Capability | Result | Evidence |
|---|---|---|
| MiniSearch surface | PASS | Rubric menu uses Signal Search without permanent width loss. |
| Exact identity | PASS | JSA Notifications Discussion selected the exact transcript ID. |
| Typo tolerance | PASS | `notifictions` returned only notification material. |
| Exact quote | PASS | Exact notification quote returned its passage first. |
| Canonical/SOF identity | PASS | `SOF-487` returned exactly `work:SOF-487`. |
| Search clear restoration | PASS | Camera, layout and selection restored byte-for-byte. |
| Search fly-to | PASS | Search promoted and flew to the exact canonical object. |
| Connection navigation | PASS | Passage connection row navigated to the exact transcript with Rubric fly-to. |

## Veracity and intelligence

| Capability | Result | Evidence |
|---|---|---|
| Findings | PASS | Status, blocking, type and handling fields survive projection. |
| Evidence/provenance | PASS | 164 passage → source attachments reconcile. |
| Trace | PASS | Canonical allowlisted paths only; Attention aliases now share their canonical path. |
| Trust/basis | PASS | 199 attested, 286 external and 58 inferred edges remain distinct. |
| External vs accepted | PASS | External intelligence remains external; no visualization write to Reality. |
| Current/superseded | PASS | 155 current and 6 superseded external objects remain distinct. |
| Source artifacts/transcripts | PASS | 18 documents + 30 transcripts represented beneath typed providers. |
| External intelligence | PASS | All 161 objects preserve subtype and currentness. |

## Review and actions

| Capability | Result | Evidence |
|---|---|---|
| Finding View here | PASS | Opens the governed parent overlay from the Rubric popup. |
| Evidence in review | PASS | Quote, source, grounding and provenance displayed. |
| Governed write | PASS | Open Decision created one Decision and resolved its source Finding in disposable PostgreSQL. |
| Overlay camera preservation | PASS | Camera was exactly unchanged before, during and after five open/close cycles. |
| Canonical selection after write | PASS | Selection moved from Attention transport ID to the same canonical Finding’s new transport ID. |
| Copy reference | PASS | Host maps to canonical reference/ID; native filesystem copy is suppressed. |
| Resolver-gated Open source | PASS | No fixture node had a verified resolver, so Open source was absent everywhere tested. |
| Hide from view | PARTIAL | Presentation-only and reload-recoverable; the native restore control is hidden with advanced Rubric tuning. |

## World and interaction

| Capability | Result | Evidence |
|---|---|---|
| Source-system anchors | PASS | Six large, unique Rubric app anchors. |
| Central Reality | PASS | Reality occupies the native router role. |
| Project Model | PASS | Six accepted model objects in the native Skills role. |
| Project World | PASS | 431 canonical objects retain dense Memory-like mass. |
| Attention | PASS | 60 presentation echoes supplement, never replace, canonical objects. |
| Drag | PASS | Node hit preserved camera and elastically returned toward its Rubric seat. |
| Blank-space pan | PASS | Gesture moved camera exactly +100 / −50 px. |
| Cursor zoom / Fit | PASS | 0.48 → 1.216 → 0.211 → 0.48 with exact Fit restoration. |
| Force | PASS | Dense topology remains readable and uses only canonical edges plus structural spokes. |
| Circle | PARTIAL | All 513 visual nodes remain present; category and source labels collide heavily at Fit. |
| Hex | PARTIAL | All nodes remain present; central labels collide heavily at Fit. |
| Rings | PASS | Preserves the accepted Rubric silhouette, source horizon and dense Project World. |
| Morph | PASS | Layout switches preserve camera and selection; direct pan/zoom interrupts remain effective. |
| Popup | PARTIAL | Mechanics/actions pass; source counts are rendered twice and very long titles wrap awkwardly. |
| Focus/selection | PASS | Selection survives layout switching and canonical refresh. |
| Camera/world occupancy | PASS | Full remaining viewport; overlays never invoke Fit or resize the world. |

