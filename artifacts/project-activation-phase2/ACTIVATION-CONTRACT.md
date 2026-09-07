# Activation contract

Input: bootstrap ID, exact expected review revision, acknowledged blocker IDs/provider gaps, and optional execution configuration.

Preconditions are checked before writes: package exists, revision matches, hard blockers are acknowledged, active project identity is collision-free, accepted milestones have valid dates, accepted sources have identities, and accepted dependencies resolve existing upstream Scopes.

One serializable transaction creates every canonical row, ContextSnapshot 01, first Audit/Findings, ProjectActivation, and activation review event. Any validation or database failure rolls the transaction back. The bootstrap remains review history.

Output: the activation, Scope, frozen snapshot, complete first Audit identity/findings, reuse flag, and canonical links into Audit, Scope, and Reports.
