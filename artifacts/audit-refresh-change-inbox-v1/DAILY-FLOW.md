# Daily Flow

## Normal operator path

1. Claude Code updates the KE wiki and structured intelligence.
2. Hermes ingests the completed compiler output.
3. Nic later opens the active project in Signal Audit.
4. Audit performs a cheap freshness read. It shows `Current`, `New intelligence available`, `Hermes ingestion in progress`, `Refreshing`, or `Companion offline`.
5. When newer completed knowledge exists, Nic clicks `Refresh Audit` from the status control.
6. The companion claims the existing active-project refresh job, delivers one complete package, and Signal freezes a new immutable ContextSnapshot.
7. Signal runs the established refresh Audit and computes governed deltas without canonical writes.
8. Nic opens `Changes since last Audit`, reviews only meaningful proposals, and accepts, edits, defers, rejects, or records information-only.
9. Acceptance routes through Scope, Decisions, Dependencies, Timeline, Findings, or the applicable setup/capacity handoff.
10. Forecast and the other derived consumers are invalidated automatically; Forecast is immediately recomputed when execution truth supports it.

## Event-driven versus user-triggered

Event-driven:

- the knowledge compiler notifies Hermes;
- Hermes ingestion state and completed watermark can be announced in companion heartbeat;
- a claimed Signal refresh job progresses through the existing outbound companion bridge;
- package delivery freezes a ContextSnapshot, runs refresh Audit, and syncs proposals;
- accepted Reality invalidates downstream projections automatically.

User-triggered:

- opening Audit performs the cheap freshness check;
- `Refresh Audit` requests a package only when the completed external watermark is newer or the prior package is outside the freshness guard;
- dispositions and all canonical owner changes remain explicit operator actions;
- confirmation sheets collect missing owner-required fields rather than guessing.

There is no background canonical-write process.
