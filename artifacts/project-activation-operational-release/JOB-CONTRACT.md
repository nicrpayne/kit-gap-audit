# Bootstrap companion job contract

All routes below require the scoped bridge bearer credential and accept only
bounded JSON.

| Operation | Route | Contract |
|---|---|---|
| Heartbeat | `POST /api/bridge/heartbeat` | companion id/version/label/state; 4 KB max |
| Claim | `POST /api/bridge/jobs/claim` | companion id + supported `1.1`; `204` when empty |
| Progress/failure | `PATCH /api/bridge/jobs/:id` | claim token, exact revision, allowed stage; 32 KB max |
| Inspect | `GET /api/bridge/jobs/:id` | claim token in `x-claim-token`; used for response-loss reconciliation |
| Deliver | `POST /api/bridge/jobs/:id/package` | claim token, exact revision, package; 5.01 MB wrapper max |

Claim responses contain only job/bootstrap/scan IDs, canonical name, aliases,
optional owner/source hints, expected package version, revision, idempotency
key, claim token, and lease expiry.

Stages are `companion_claimed`, `identity`, `exact_lexical_search`,
`evidence_lineage`, `semantic_unavailable`, `graph_expansion`,
`proposal_compilation`, and `package_upload`, followed by `complete`, `partial`,
`failed`, or `stale`. Signal displays the actual job/companion projection and
does not simulate a local scan when the companion is offline.

Claims use a compare-and-set update, so duplicate pollers produce one winner.
Delivery is bound to job, bootstrap, scan, revision, schema version, producer,
and deterministic package identity. Repeated delivery of the identical package
returns the existing result; a content collision fails closed.
