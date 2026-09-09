# Freshness Contract

Audit freshness is a read-only state machine over active-project identity, companion heartbeat, ingestion state, refresh-job state, latest complete package, latest ContextSnapshot, and optional completed-knowledge watermark.

| State | Meaning | Refresh allowed |
| --- | --- | --- |
| `current` | Latest complete package and frozen snapshot agree | No expensive scan inside the 15-minute guard |
| `new_available` | A complete package is ahead of the snapshot, or companion watermark is ahead of the package | Yes |
| `ingesting` | Hermes reports `running`/`ingesting` | No; wait for one coherent completed state |
| `refreshing` | A package job is already queued/claimed/running | No duplicate job; UI polls the durable status |
| `offline` | Companion heartbeat is outside the online window | No |
| `unavailable` | Project lacks an activation/companion identity | No |

Priority prevents split-brain reads: unavailable/offline and explicit ingestion take precedence over package comparison. A running refresh returns its existing job identity. A recent current package returns `current` without creating a scan.

The heartbeat extension is backward compatible. Existing companions can omit `knowledge`. Updated companions may send:

```json
{
  "knowledge": {
    "state": "current",
    "watermark": "2026-09-09T14:57:00.000Z",
    "detail": "Latest completed Hermes ingestion"
  }
}
```

The watermark means “completed and safe to compile,” never “ingestion has started.” No manifest path, execution ID, or package ID is exposed to the operator.
