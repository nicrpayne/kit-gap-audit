# Forecast readiness

Activation does not require Linear or executable work. `Scope.executionState` is explicitly `configured`, `not_configured`, `unavailable`, or `stale`; activation defaults to `not_configured`.

If execution is not configured, the Forecast API returns HTTP 409 with code `FORECAST_UNAVAILABLE` and reason `Missing executable work mapping`. The instrument shows that state and does not call Linear or Monte Carlo. The protected simulation engine was not changed.
