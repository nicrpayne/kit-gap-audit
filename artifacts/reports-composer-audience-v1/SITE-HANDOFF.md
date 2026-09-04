# ChatGPT Sites handoff

## Recommendation

Use Sites as an optional rendering/polish destination for a frozen `InteractiveBriefBundleV1`, not as a live Reports runtime. The safe V1 flow is:

1. Generate and save the immutable Signal brief.
2. Copy bundle JSON and the generated `@Sites` handoff prompt.
3. Create a private Site preview.
4. Review disclosure, references, responsive behavior, and caveats.
5. Save a version. Do not deploy until a human explicitly approves publication and access.

This matches the official Sites workflow: creation can begin from a prompt or compatible local project, while saving a version and deploying are distinct actions and deployments are production URLs. Keep review access private. Source: https://learn.chatgpt.com/docs/sites

## Generated prompt constraints

- immutable `briefSnapshot` is truth;
- no live fetches or invented facts;
- likely, target, and commitment remain distinct;
- only recipe modules and permitted references render;
- caveats remain visible;
- private review and version save only;
- no deploy/publish without explicit approval;
- no storage, credentials, analytics, forms, or authentication.

No Site was created or deployed in this tranche.
