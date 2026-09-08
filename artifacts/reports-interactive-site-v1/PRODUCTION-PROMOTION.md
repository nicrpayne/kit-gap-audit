# Production promotion and first real Site

No production promotion or external Site creation was performed in this tranche.

## Promote Signal after Nic review

1. Review the complete diff from production `5e4da9aa4522c5c2e06d1dfdee93f37e23c3f9f5` to the candidate branch and verify the candidate SHA/tree reported in the release handoff.
2. Create a temporary Railway deployment from the candidate branch with production-shaped environment variables and an isolated PostgreSQL database.
3. Confirm Railway applies `20260908190000_reports_interactive_site_v1` through the existing `npx prisma migrate deploy && npm run start` command.
4. Run authenticated smoke checks for `/api/version`, Reports history, immutable Report generation, print/Markdown/plain renderers, bundle review, and the publication lifecycle through `previewed`. Do not use a real Site URL.
5. Promote the reviewed candidate SHA to the configured production branch/service. Do not alter the Site access policy as part of the Signal deploy.
6. Verify live `/api/version` resolves to that exact SHA and re-run an authenticated Reports smoke against an existing Project.
7. Roll back by redeploying `5e4da9aa…` if the smoke fails. The publication table migration is additive, so the prior application does not depend on or mutate its rows.

## First real Signal → ChatGPT Site

1. In an active Project, open Reports and save a Delivery Leadership / Weekly Update immutable brief.
2. Inspect likely, target, commitment, changes, asks, currentness, and source-owner annotations.
3. Choose `Create interactive site`; review the frozen bundle, warnings, full JSON, and exclusions.
4. Check the confirmation box and choose `Confirm & open ChatGPT Sites`.
5. Attach the downloaded handoff JSON, paste the copied instructions, and ask Sites for a private saved version.
6. Reconcile every material value to the Signal bundle and record `Draft generated`, then `Previewed` in Signal.
7. Stop for explicit publication approval. In ChatGPT Sites, deploy the reviewed version and set the narrowest intended access.
8. Paste the confirmed HTTPS Site URL into Signal and record `Published / shared`.
