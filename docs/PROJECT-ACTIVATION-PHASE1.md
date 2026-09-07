# Project Activation Phase 1 implementation

Phase 1 implements pre-Reality identity, Signal-held knowledge scan, immutable bootstrap packages, and governed candidate review. Its canonical artifact index is [`artifacts/project-activation-phase1/README.md`](../artifacts/project-activation-phase1/README.md).

The implementation narrows one design assumption based on verified current contracts: Signal cannot initiate a generic Hermes/wiki scan. The present bridge resolves an existing Scope and pushes a scoped `ProjectContextPackage`; it has no pre-Scope bootstrap mode. Phase 1 therefore searches knowledge already persisted in Signal and exposes an authenticated inbound `ProjectBootstrapPackage 1.0` endpoint for future bridge work. Provider status states this limitation directly.

No Scope or ContextSnapshot is created before activation. Phase 1 contains no activation handler.

