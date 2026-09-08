# Security boundary

- The companion makes outbound HTTPS requests only and opens no local or
  internet-facing port.
- One-time installation derives an HMAC-SHA256 bridge token from the existing
  approved `APP_PASSWORD`; the broader password is not retained by the
  companion. The derived token is accepted only below `/api/bridge/*`.
- The derived credential is stored in macOS Keychain under service
  `com.nicrpayne.kit-gap-bridge.transport`. It is absent from Git, config,
  packages, receipts, and logs.
- Non-secret config is mode `0600`. LaunchAgent and runtime live below the
  user's Library directory.
- Signal and the bridge independently validate package schema `1.1`, a 5 MB
  package bound, identifiers, provenance, current heads, typed dependencies,
  and the absence of geometry.
- Signal recursively rejects credential-shaped fields. Both validators reject
  local absolute paths while preserving stable `ke://` and source locators.
- Malformed JSON, unsupported versions, expired claims, stale revisions,
  cross-bootstrap packages, oversized bodies, duplicate IDs with changed
  content, and secret-bearing payloads fail closed.
- Bootstrap packages remain external intelligence proposals. Only explicit
  dispositions plus atomic activation create canonical Signal Reality.
