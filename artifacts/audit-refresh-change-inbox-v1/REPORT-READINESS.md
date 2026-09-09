# Report Readiness

Audit exposes the same project-level safety decision before the operator enters Reports.

Machine-readable blockers are:

- `execution_truth`: execution mapping is unavailable or not configured;
- `test_gate`: an open synthetic/test DecisionGate still exists;
- `scope_unreconciled`: meaningful Scope proposals remain pending;
- `capacity_unreconciled`: no confirmed active named allocation exists;
- `source_health`: source/configuration proposals remain open;
- `forecast_stale`: derived Forecast state is missing, errored, or behind the current Reality revision.

The widget renders `REPORT NOT READY · n blockers` or `REPORT READY`. Each blocker links to the applicable owner or setup surface. `Open Reports` is shown only when all checks pass.

Readiness is derived; accepting Reality does not manually flip it. Tests prove the blocker count changes when the underlying blocker is cleared.
