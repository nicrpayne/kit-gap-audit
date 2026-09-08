# Companion architecture

## Choice

The companion is a per-user macOS LaunchAgent that polls Signal over outbound
HTTPS. It exposes no listening port, requires no browser-to-localhost CORS
exception, survives browser and Mac login restarts, and keeps corpus access in
the signed-in user's session. This is simpler and safer for the single-user Mac
environment than inbound HTTP, SSE, or WebSockets.

## Flow

1. Signal creates `ProjectBootstrap`, `BootstrapScanRun`, and
   `BootstrapScanJob` rows in one transaction.
2. The LaunchAgent heartbeats, then attempts an atomic leased claim.
3. Signal returns identity hints, expected schema, revision, idempotency key,
   and an expiring claim token—never a filesystem path.
4. The companion searches KE/Hermes/wiki locally, reports bounded stages,
   validates the package, and uploads it to the job-bound endpoint.
5. Signal independently validates and persists the external intelligence,
   then exposes Bootstrap Review. Activation remains a separate governed act.

Claims have a 90-second lease extended by progress. Expired work can be
reclaimed with a fresh token and incremented attempt count. LaunchAgent logs
rotate at 2 MB with five backups. Pause keeps an honest heartbeat but claims no
work. Uninstall removes the agent, credential, runtime, config, and state while
retaining bounded logs and receipts for recovery.

## Tradeoff

Polling adds a bounded delay (10 seconds in the installed configuration) but
removes inbound attack surface and connection-lifecycle complexity. The chosen
mechanism is deliberately boring, inspectable, and restart-safe.
