# Project Relevance

Before a refresh proposal enters the visible inbox, it is classified against the selected project and known Scope identities.

- `project_local`: explicitly attributed to the selected project, or no conflicting project identity is present.
- `cross_scope_relevant`: another project is named and the proposal carries causal/prerequisite semantics such as `depends on`, `blocked by`, or `requires`.
- `neighboring_project_context`: another project is mentioned as context but is not asserted as selected-project Reality.
- `irrelevant_bleed`: the proposal is explicitly attributed only to another known project and has no causal relationship to the selected project.

`irrelevant_bleed` remains in the durable audit ledger as information-only but is suppressed from the selected project’s operable inbox. Neighboring context is labeled and information-only rather than silently promoted. A true Platform dependency is retained when causal language and endpoints make it relevant. Exact duplicate proposal semantics inside one package are collapsed before routing.

Fixtures cover:

- a JSA concern leaking into iTrack → `irrelevant_bleed`;
- a KIT Construct mention inside iTrack context → `neighboring_project_context`;
- a Platform prerequisite for iTrack → `cross_scope_relevant`.
