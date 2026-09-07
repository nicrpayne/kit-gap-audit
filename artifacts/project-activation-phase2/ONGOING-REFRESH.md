# Ongoing refresh

After activation, a producer reads `GET /api/projects/bootstrap-identity?scopeId=…` to obtain the canonical name and aliases, recompiles knowledge, and posts a new package to the original bootstrap package endpoint.

Signal freezes each new content-addressed package as an external ContextSnapshot and creates a refresh Audit for provider gaps, contradictions, and dependency candidates. The refresh transaction reports `canonicalWrites: 0`. New intelligence cannot silently update Scope, Capability, Decision, ScopeDependency, milestone, execution, staffing, or Forecast state; a later human-governed acceptance flow is required.
