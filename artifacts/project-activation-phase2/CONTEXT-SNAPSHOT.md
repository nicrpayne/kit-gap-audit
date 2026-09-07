# ContextSnapshot 01

The first snapshot is created inside the activation transaction and is immutable. Its activation source records the versioned manifest reference and content hash, bootstrap package and scan identities, activation revision and accepted census. Its claims record each accepted and external candidate with disposition and provenance; provider state, aliases, capabilities, work mappings, Decisions, Dependencies, milestones, external intelligence references, evidence references, gaps, failures, and currentness remain reconstructable from the snapshot plus its hash-linked immutable `ProjectActivation.manifest`.

Large raw bodies are not copied. Stable artifact/source references and bounded exact passages are retained. The snapshot hash covers the validated `ProjectContextPackage` bytes; producer/package identity prevents duplicate persistence.
