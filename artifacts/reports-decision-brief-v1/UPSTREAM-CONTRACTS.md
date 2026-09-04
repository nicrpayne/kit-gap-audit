# Reports upstream contracts

Reports is downstream communication. The table is the durable owner → field → staleness/provenance contract for DecisionBriefV1.

| Brief field | Canonical owner/read | Temporal role | Currentness/provenance semantics | Missing behavior |
|---|---|---|---|---|
| Project id/name/target | `Scope` row | live | Read at brief generation; source id is Scope id | Fail generation if Scope does not exist |
| Headline window/confidence | `computeForecast(scope)` | live | Same returned result and one generation as-of; no Reports math | Fail generation if current Forecast cannot resolve |
| Headline movement | prior immutable `Report` typed columns | historical | Explicit comparison to report id/as-of only | `null`; “no prior saved brief,” no trend claim |
| Key reason | precedence over canonical Forecast gate delay, saved-report movement, Audit delta, then executable item count | live with owner stamp | Sentence is Reports wording over stored owner facts | Never invent cause beyond available facts |
| Audit delta | latest two scoped `AuditRun` identities plus Findings attached to each run’s Source/ContextSnapshot | live comparison | Finding identity uses type + normalized title for cross-run comparison; run ids/as-of retained. If both runs share provenance, exact membership is unavailable and no change is inferred. | Explicit missing/unavailable Audit comparison |
| Delivery delta | `computeChangesSince` over canonical Linear issue reads | live | Completed timestamps compared with prior Report as-of | Empty supported delta, not fabricated “none shipped” history |
| Decisions | first-class `Decision` rows | live | Open status only for current call section; candidates and legacy Finding categories excluded | Empty “no first-class open Decisions” |
| Decision gate | `Decision.gate` joined to `DecisionGate.targetScope` | live | `targetScopeId`, display target, serial flag, evidence, provenance and exact low/likely/high | Ungated Decision remains visible with zero delay |
| Dependencies | `Scope.dependsOnScopeIds` resolved to Scope identities | live | Only declared edges are shown | Missing live dependency Forecast is `UNAVAILABLE` |
| Executable Scope | Forecast’s canonical Linear input boundary | live | Parent container excluded only when a counted fetched descendant proves representation; manual/Hermes capability claims are not accepted Scope | No invented accepted capability |
| Capacity | `capacityForecastContract` over Person → Allocation → raw/effective FTE → Forecast input | live | Named claims require `named_exact && reconciles`; contributor raw/effective values come from canonical capacity calculation | Legacy inferred/explicit and failed reconciliation are explicit unavailable states; contributors withheld |
| Scenario options | existing `ForecastResult.scenarios` | live/scenario | Reports copies owner-provided outcomes; it creates no simulation semantics | Empty unavailable row |
| Timeline milestone/conflicts | `TimelineEvent` rows | live | Stored `temporalState` is authoritative; overdue is a reporting comparison with generatedAt | Missing next milestone is explicit |
| Timeline current forecast | same live Forecast result as headline | live | Label is exactly `Current Forecast`; no fallback | Generation fails rather than substituting history |
| Historical forecast | immutable Report | historical | Must say `Report snapshot · as of …` | Never labeled current/live |
| Context snapshot | immutable `ContextSnapshot` and evaluated completeness summary | historical evidence for the live brief | snapshot/package ids and createdAt retained; active missing sources become stale/currentness warnings | Explicit missing snapshot/provider lanes |
| Evidence | Finding `evidenceRefs`, Source id, ContextSnapshot id | live with evidence provenance | `passage` only with evidence ids; otherwise `source_only` or `none`; currentness is stored | Weak-grounding warning travels with Audit delta |
| Momentum | immutable Report cadence via existing Momentum helpers | historical interpretation | Report-to-report/current-to-last-report interpretation only; not delivery velocity | No report history means no trend claim |

## Currentness notes

Signal has no authoritative universal time-to-live for every provider. Reports therefore does not invent one. A ContextSnapshot evaluated `partial`, an explicitly missing active source, or a failed current provider read produces stale/missing warnings. Snapshot age is shown through `asOf`; age alone is not silently promoted to a stale verdict.

V1 generates Reality briefs and presents existing Forecast-owned scenarios as options. Although the immutable schema reserves `mode` and `scenarioSnapshot`, the API refuses Scenario brief generation until a canonical server-owned scenario read can provide the complete window and provenance; caller-supplied scenario JSON cannot relabel live Reality.

## Cross-instrument reconciliation law

At generation, every material date, number, state and identity in the brief equals the owner input. The deterministic proof asserts headline/date/confidence equality, gate range/target equality, Capacity equality, Audit delta identity, Finding zero-effect, Timeline role, immutable history, renderer payload identity, and the Platform 44d → 41d executable-leaf result.
