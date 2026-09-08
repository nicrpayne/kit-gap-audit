# Current ChatGPT Work / Sites capability — 2026-09-08

## Proven supported path

OpenAI’s current Sites documentation says Sites is a public beta for eligible paid ChatGPT plans. In ChatGPT, a user starts the flow by describing a website or mentioning `@Sites`. Sites can create hosted websites/web apps, retain them independently of the creating Work task, and manage access. The documented lifecycle deliberately separates **save a version** from **deploy a version**; every deployment URL is production. New Sites begin limited to the owner and workspace admins until access changes.

Sources:

- https://learn.chatgpt.com/docs/sites
- https://learn.chatgpt.com/use-cases/build-and-deploy-internal-apps

The first-party Codex/ChatGPT environment also exposes governed Sites connector operations for creating a project, saving versions, deploying, and setting access. Those are task-scoped product tools; they are not a public HTTP contract that the Signal server can authenticate to or invoke on a user’s behalf.

## Not documented / not assumed

Official OpenAI documentation does not document a third-party Sites publish API, OAuth scope, webhook, import endpoint, or Signal-compatible service credential. This is an inference from the published product and API documentation, not a claim that no private internal endpoint exists. Signal therefore does not call or emulate undocumented endpoints.

There is no supported way for Signal to verify “draft generated” or “previewed” from the ChatGPT product. Those states are operator attestations. A final Site URL can be stored, but V1 does not scrape it or infer access state.

## V1 mechanism

Signal automates:

1. immutable-snapshot selection;
2. allowlisted bundle generation and SHA-256 sealing;
3. publication-readiness validation;
4. included/excluded disclosure review;
5. one-file handoff download and deterministic prompt copy;
6. opening `https://chatgpt.com/sites`;
7. publication-record creation and ordered state tracking.

The user completes in ChatGPT Sites:

1. attach the handoff file and paste the copied prompt;
2. create and inspect a private draft;
3. save a reviewable version;
4. explicitly deploy and choose access only after approval;
5. return the confirmed HTTPS URL to Signal if it was published/shared.
