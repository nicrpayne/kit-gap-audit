# Publication readiness

Readiness fails closed when any of these is missing or present:

- immutable report id, project identity, audience, or purpose is missing;
- DecisionBrief/recipe versions are not recognized;
- DecisionBrief fingerprint or 64-character bundle SHA-256 seal is missing;
- a material claim lacks owner, as-of, currentness, temporal role, or grounding;
- secret-like credentials, authorization headers, API keys, tokens, or private keys appear;
- local filesystem paths appear;
- raw HTML, gateway pages, or internal server error payloads appear;
- a source reference contains a URL;
- any live access, query, mutation, credential, silent refresh, or publication authority flag is true.

Warnings do not block an honest publication. They travel with the bundle:

- Forecast unavailable;
- no canonical delivery commitment;
- named staffing not configured;
- owner data stale/unavailable/unreconciled;
- source/grounding caveats already present in the frozen Report.

The review panel displays both warnings and every exclusion before the confirmation control is enabled.
