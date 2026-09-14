# Cross-device state contract

| State | Classification | Owner / lifetime | Cross-device law |
|---|---|---|---|
| Scope configuration, target, source mapping, dependency ids | A — canonical server Reality | PostgreSQL `Scope`, server APIs | Visible after ordinary navigation/reload; now invalidates derived reads on PATCH. |
| Accepted/outside/future Capability and definition | A — canonical server Reality | PostgreSQL `Capability` | Explicit save; revision-checked; visible on every device. |
| Capability ↔ execution mapping | A — canonical server Reality | `CapabilityWorkLink` | Link/unlink is governed and duplicate-safe. |
| Capability edit provenance | A — canonical server Reality | append-only `CapabilityEvent` | Visible in Capability History. |
| Decisions/gates | A — canonical server Reality | Decision owner routes | Existing server owner contract retained. |
| Timeline milestones/targets | A — canonical server Reality | Timeline owner routes | Existing server owner contract retained. |
| Named people/allocations | A — canonical server Reality | Person/Allocation/Reconciliation owners | Existing guarded roster and conservation contract retained. |
| Scenario capability drafts, bypasses, estimate audition | B — scenario-only client state | module store in current browser realm | Never appears as Reality elsewhere; commit must traverse governed owner APIs. |
| Control Room lens/workspace preference | C — local-only persisted state | versioned localStorage key | Personal view only; never described as canonical Reality. |
| Project payload in memory | D/E — client cache of a derived read | project store | Deduplicated while in flight, then revalidated on Reality mutation, focus, visibility, navigation and every 15 seconds. |
| Forecast/coverage/load/Timeline/Control Room/Reports readiness | E — derived read | canonical owners + `ProjectDerivedState` receipt | Owner writes increment Reality revision, invalidate all consumers, and recompute without manual synchronization. |
| Linear issue read | F — source-provider read | Linear GraphQL, 2-minute server TTL | Execution truth, never product shape; API responses are not browser-cacheable. |
| Project selection / selected object / explicit Scenario key | navigation context | URL query | Survives compatible navigation and Back/Forward; cross-project selections are cleared. |
| Component selection, open drawer, drag hover, pending preview | ephemeral UI | React component state | No canonical meaning and no persistence. |

Two isolated Playwright browser contexts—not two pages sharing storage—exercised the contract. A committed create/edit/link/move from A became visible in B; an uncommitted Scenario draft did not; the same draft became visible in B only after commit.

Conflict law: every governed Capability mutation carries the revision the operator read. If another device has already changed that row, the stale operation returns HTTP 409. Retrying the same logical operation uses the same idempotency key and returns the original result rather than creating a duplicate.
