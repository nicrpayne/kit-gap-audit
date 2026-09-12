# Signal Documentation Coverage Matrix

## Reading this matrix

- **Production verification** distinguishes direct live service evidence from code/tree review and release-fixture evidence.
- **Fixture-only** is `Yes` for any journey that would write governed Reality or needs deterministic recording data.
- `Live pending` means authenticated visual confirmation is blocked by `SIG-DOC-001`; it is not a claim that the feature is absent.
- The canonical production authority is commit `6c46ce9`, tree `62ba81d79137a66117412396a20c6792a1e4d57e`.

| Instrument | Major control | State | Warning | Write action | Empty state | Documented guide | Annotated visual | Training-script chapter | Verified against production? | Fixture-only? | Unresolved gap? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Release authority | `/api/version` | production/build identity | branch metadata mismatch | None | N/A | `SOURCE-STATE.md` | N/A | Recording preflight | Live endpoint: yes | No | Default-ref mismatch (`SIG-DOC-003`) |
| Shell | instrument rail | selected destination | narrow/collapsed rail | None | N/A | 00, 13 | 10 | What Signal Is | Code + fixture; live pending | No | Authenticated rail pass |
| Shell | project context | selected project/focus | wrong-project risk | None | no project | 00, 13 | 10 | Control Room | Code + fixture; live pending | No | Persistence across Back/Forward |
| Shell | command/search entry | query open/closed | no matching result | None | no result | 11, 13 | 20 | Audit | Code + fixture; live pending | No | Keyboard/hover pass |
| Control Room | project field/view | portfolio or project focus | focus may be implicit | None | no visible projects | 01 | 10 | Master Control Room | Code + fixture; live pending | No | `SIG-DOC-004` |
| Control Room | likely outcome/window | live/historical, current/stale | stale owner | None | unavailable forecast | 01, 15 | 10 | Master Control Room | Code + fixture; live pending | No | Live values |
| Control Room | target/confidence/commitment | target present/absent | likely ≠ target ≠ committed | None here | no target | 01, 15 | 10 | Master Control Room | Code + fixture; live pending | No | Live values |
| Control Room | constraints/open Decisions | open/resolved | unresolved gate | None here | no constraints | 01 | 10 | Master Control Room | Code + fixture; live pending | No | Live values |
| Control Room | source/currentness | current/stale | live owner ≠ fresh | None | no freshness evidence | 01, 15 | 10 | Master Control Room | Code + fixture; live pending | No | Live values |
| Control Room | Add Event door | sheet open/closed | changes forward view | save event | no event history | 01, 09, 17 | 10, 18 | Timeline | Code + fixture; live pending | Yes | Transition capture |
| Project Activation | project identity/create | draft project | duplicate/wrong identity | create bootstrap | blank required fields | 02 | 12 | Project Activation | Code + fixture | Yes | Live visual pending |
| Project Activation | Create & Scan/progress | scanning/complete/failed | companion offline/in progress | start scan | no providers | 02, 15 | 12 | Project Activation | Code + fixture | Yes | Live provider labels |
| Project Activation | provider coverage | available/missing/error | incomplete knowledge | None | no source material | 02 | 12 | Project Activation | Code + fixture | Yes | Live status copy |
| Project Activation | proposal counts/review sections | candidate/deferred/rejected/info | proposal ≠ Reality | set disposition | zero proposals | 02, 15 | 12 | Project Activation | Code + fixture | Yes | Live interaction pass |
| Project Activation | provenance Inspector | source/evidence present | synthesis ≠ independent evidence | None | missing provenance | 02, 11 | 12, 20 | Project Activation | Code + fixture | Yes | Live drilldown |
| Project Activation | Manifest/Activate | ready/blocked/active | consequential Reality write | activate project | nothing accepted | 02, 17 | 12 | Project Activation | Code + fixture | Yes | Transition capture |
| Project Activation | First Audit handoff | audit due/current | activation is not freshness | None | no new intelligence | 02 | 12 | Project Activation | Code + fixture | Yes | Transition capture |
| Audit | project switch | selected project | wrong-project risk | None | no projects | 03 | 11 | Audit | Code + fixture; live pending | No | Back/Forward persistence |
| Audit | freshness/check for updates | current/new/refreshing/offline | current knowledge ≠ accepted Reality | refresh/check | no new intelligence | 03, 15 | 21 | Audit | Code + fixture; live pending | Yes for refresh effects | Live states |
| Audit | Change Inbox | candidate/accepted/deferred/rejected/info | proposal ≠ Reality | disposition proposal | zero changes | 03, 15 | 21 | Audit | Code + fixture | Yes | Transition capture |
| Audit | Accept/edit/defer/reject | pending/complete | owner-specific governed write | accept/edit/defer/reject | N/A | 03, 17 | 21 | Audit | Code + fixture | Yes | Exact live confirmation |
| Audit | Reality center / Model / World | selected object | source/world is not owner truth | None | no objects | 03 | 11 | Audit | Code + fixture; live pending | No | Layout/hover pass |
| Audit | Attention/Open Loops | open/resolved | unresolved work | None here | none open | 03 | 11 | Audit | Code + fixture; live pending | No | Live counts |
| Audit | Source Health | healthy/degraded/missing | healthy source ≠ truth | None | no sources | 03, 15 | 11 | Audit | Code + fixture; live pending | No | Live status copy |
| Audit | Report Readiness | Ready/Not Ready | owner blockers | None here | no blockers | 03, 10, 15 | 22 | Audit / Reports | Code + fixture; live pending | No | Live blocker doors |
| Audit | Search/Trace/layout | query/selection/path/layout | semantic relation ≠ dependency | None | no match/path | 03, 11 | 20 | Audit | Code + fixture; live pending | No | Keyboard/hover/layout pass |
| Scope | capability card | accepted shape | candidate ≠ accepted | owner edit/accept | no capabilities | 04 | 13 | Scope | Code + fixture; live pending | Yes for writes | Live values |
| Scope | execution mapping | mapped/unmapped | NO EXECUTION WORK MAPPED | map work | no mapped work | 04, 15 | 13 | Scope | Code + fixture | Yes | Transition capture |
| Scope | orphan work | NO CAPABILITY YET | work without product shape | assign capability | no orphan work | 04, 15 | 13 | Scope | Code + fixture | Yes | Transition capture |
| Scope | release rail | in/out of release | out-of-release is excluded | change inclusion | no out-of-release work | 04 | 13 | Scope | Code + fixture | Yes | Transition capture |
| Scope | open shape Decision | open/decided | unresolved direction | create/open Decision | none open | 04, 05 | 13, 14 | Scope / Decisions | Code + fixture | Yes | Live handoff |
| Scope | execution coverage/modeled load | full/subset/none | modeled subset ≠ full project | derived only | no load | 04, 08, 15 | 13, 17 | Forecast | Code + fixture | No | Live number confirmation |
| Decisions | create/import candidate | candidate/open | candidate ≠ Reality | create/import | no Decisions | 05 | 14 | Decisions | Code + fixture | Yes | Transition capture |
| Decisions | options/directions/evidence | open/decided/revisited/superseded | evidence does not decide | save/decide/revisit/supersede | no evidence/options | 05, 15 | 14 | Decisions | Code + fixture | Yes | Transition capture |
| Decisions | DecisionGate/target Scope | gated/ungated | only modeled subset may be gated | add/remove gate | no gate | 05, 08 | 14 | Decisions / Forecast | Code + fixture | Yes | Live gate language |
| Decisions | Assume for scenario | assumed/unassumed | scenario is not Reality | scenario-only assumption | no applicable gate | 05, 17 | 14 | Decisions | Code + fixture | Yes | Transition capture |
| Dependencies / Orbit | focus/project landing | selected project | cross-project context | None | no project | 06 | 15 | Dependencies | Code + fixture; live pending | No | Name/status conflict (`SIG-DOC-002`) |
| Dependencies / Orbit | source/target edge | declared/candidate | semantic relation ≠ dependency | accept/create/remove edge | no dependencies | 06, 15 | 15 | Dependencies | Code + fixture | Yes | Transition capture |
| Dependencies / Orbit | gate distinction | gate/dependency/both/neither | gate is not precedence | governed edit | no gate | 05, 06 | 15 | Dependencies | Code + fixture | Yes | Live terminology |
| Capacity | Forecast basis | aggregate/named | aggregate_unreconciled warning | None | no capacity basis | 07, 15 | 16 | Capacity | Code + fixture; live pending | No | Live values |
| Capacity | actual team/roster | aggregate_unreconciled/named_partial/named_exact | person mention ≠ staffing | Set actual team | no roster | 07, 15, 17 | 16 | Capacity | Code + fixture | Yes | Transition capture |
| Capacity | named allocation/split | raw/effective FTE | context-switch effect | commit allocation | zero allocation | 07 | 16 | Capacity | Code + fixture | Yes | Transition capture |
| Capacity | scenario faders | draft/preview | scenario ≠ Reality | preview/discard/commit | no change from baseline | 07, 17 | 16 | Capacity | Code + fixture | Yes | Transition capture |
| Forecast | coverage | forecastable/modeled_subset/unavailable | subset ≠ full project | derived only | unavailable | 08, 15 | 17 | Forecast | Code + fixture; live pending | No | Live state/value |
| Forecast | likely/window/distribution | live/historical, current/stale | live owner ≠ fresh | derived only | no distribution | 08, 15 | 17 | Forecast | Code + fixture; live pending | No | Live values/hover |
| Forecast | target/confidence/commitment | target set/absent | likely ≠ target ≠ committed | canonical target via owner door | no target | 08, 17 | 17 | Forecast | Code + fixture | Yes | Transition capture |
| Forecast | gate assumptions/context | baseline/scenario | assumption is not decision | scenario-only input | no gates | 08 | 17 | Forecast | Code + fixture | Yes | Transition capture |
| Timeline | Today/NOW/Forecast | current/historical | stale forecast | derived only | no forecast marker | 09, 15 | 18 | Timeline | Code + fixture; live pending | No | Live values |
| Timeline | lanes/layers | planned/projected/committed/occurred | status meanings differ | owner edit where allowed | no milestones | 09, 15 | 18 | Timeline | Code + fixture | Yes | Hover/copy pass |
| Timeline | playback/transport | playing/paused/history | historical view ≠ current | None | no history | 09 | 18 | Timeline | Code + fixture; live pending | No | Interaction pass |
| Timeline | Add/edit/delete/undo event | draft/saved/deleted/restored | changes forward truth | save/edit/delete/undo | no events | 09, 17 | 18 | Timeline | Code + fixture | Yes | Transition capture |
| Reports | audience/purpose/mode | configured/incomplete | wrong audience/story | None until create | no recipe | 10 | 19 | Reports | Code + fixture; live pending | Yes for creation | Live labels |
| Reports | module recipe/Inspector/note | selected/reordered/edited | module source/currentness | edit draft recipe | no modules | 10 | 19 | Reports | Code + fixture | Yes | Interaction pass |
| Reports | readiness | Ready/Not Ready | blocked owner truths | None here | no blockers | 10, 15 | 22 | Reports | Code + fixture; live pending | No | Live blocker doors |
| Reports | Create report/history | draft/frozen/history | snapshot becomes immutable | create frozen report | no history | 10, 17 | 19 | Reports | Code + fixture | Yes | Transition capture |
| Reports | copy/print/export | ready/complete | frozen vs live distinction | external copy/print | unavailable export | 10 | 19 | Reports | Code + fixture | Yes | Browser behavior |
| Reports | Create interactive Site | supported/unsupported/user-mediated | no autonomous publishing | prepare/handoff bundle | unavailable handoff | 10, 18 | 19 | Reports | Code + fixture | Yes | Live availability |
| Search / Trace / Inspector | query/match basis | selected/unselected | inferred ≠ declared | None | no matches | 11 | 20 | Audit | Code + fixture; live pending | No | Live ranking/copy |
| Search / Trace / Inspector | provenance chain | complete/partial/missing | synthesis ≠ source evidence | None | no provenance | 11 | 20 | Audit / Activation | Code + fixture; live pending | No | Live drilldown |
| Search / Trace / Inspector | evidence/object selection | selected/pinned/closed | inspected object may not be owner truth | None | no selection | 11 | 20 | Audit | Code + fixture; live pending | No | Keyboard/hover pass |

## Coverage result

- All current instrument families, major read controls, governed write doors, named states, warnings, and empty-state classes have a guide home.
- Every instrument has an annotated teaching visual; Audit and Reports also have state-specific companion visuals.
- All consequential journeys are deliberately fixture-only.
- The remaining cross-cutting gap is authenticated live verification, including hover, Back/Forward, project-context persistence, current labels/values, and fresh production recapture.
