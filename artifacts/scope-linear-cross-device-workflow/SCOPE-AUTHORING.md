# Scope authoring

The unified Scope Composer now has one explicit `+ ADD CAPABILITY` path with two outcomes:

- **Save Reality** creates a canonical accepted Capability through the owner API.
- **Preview Scenario** creates a local draft with an explicit Scenario treatment and no server mutation.

Reality create/edit captures name, description/outcome, status, note/evidence and raw work identity. With no evidence, provenance is labeled exactly `Operator assertion · no evidence yet`. Edits carry the last-read revision; stale edits fail rather than silently overwriting another session.

The detail inspector provides:

- edit canonical Reality;
- linked work and source URL;
- state and estimate source;
- unlink through a consequence preview;
- governed owner history and separate Linear completion history.

Accepted manual capabilities are independent owner rows. Audit refresh and later Hermes packages can supply support or contradiction, but cannot delete or replace them implicitly.

A Scenario draft can be discarded or explicitly committed. Commit runs the same canonical owner rule as direct Reality authoring, rather than copying client memory into a second hidden model.
