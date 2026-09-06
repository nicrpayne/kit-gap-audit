# Currentness contract

Temporal role and source currentness are orthogonal:

- `live` means the value came from the current canonical owner read.
- `historical` means the value came from a frozen Report snapshot.
- `current` or `stale` describes source age at the explicit read instant.

The default stale threshold is seven days. A live Forecast carries `asOf`, provider, availability, and currentness. For Linear-backed scopes, `asOf` is the latest matching issue `updatedAt`; an empty result is marked `availability: empty` and does not prove absence of work. A forecast composed through dependencies uses the least-recent contributing source stamp.

Required grammar: `Live owner · Stale · 31d · as of Aug 5, 2026`. Amber expresses currentness, not outcome quality. Historical Report dates are never used as hidden Forecast memory.
