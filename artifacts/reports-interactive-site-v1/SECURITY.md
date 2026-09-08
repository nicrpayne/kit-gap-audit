# Security and privacy result

The Site bundle is publication content, not a credential or Signal session.

Positive controls:

- explicit allowlist projection from the immutable brief;
- canonical SHA-256 seal and unique database constraint;
- no full internal brief, internal source IDs, context IDs, raw evidence IDs, raw excerpts, or working paths;
- no live URLs in publication references;
- negative capability flags for queries, writes, refresh, credentials, and publish authority;
- explicit disclosure review and operator confirmation;
- ordered, non-skippable publication lifecycle;
- HTTPS requirement before a published/shared claim.

Negative tests reject OpenAI-style keys/authorization text, local macOS paths, private-key headers, raw HTML, gateway text, and server error payloads. Browser proof observed zero console/page errors. No Site was deployed or shared in the release proof.
