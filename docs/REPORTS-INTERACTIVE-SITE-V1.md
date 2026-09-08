# Reports → Interactive ChatGPT Site V1

Signal instruments remain the tracks. Reports remains the mix. Audience remains the preset.

One immutable `Report` owns the factual snapshot and its saved `BriefRecipeV1`. `InteractiveBriefBundleV1` is an allowlisted publication projection of that snapshot. It contains no Signal session, API credential, live-query authority, source refresh, or mutation capability. A SHA-256 seal identifies its exact bytes.

`Create interactive site` prepares and validates that bundle, shows included and excluded material, and requires operator confirmation. It then downloads one handoff file, copies the deterministic `@Sites` prompt, and opens ChatGPT Sites. The operator attaches the file and requests a private saved version. Signal records later ChatGPT-side states only when the operator attests to them; `published_shared` additionally requires the confirmed HTTPS Site URL.

Existing publication N never changes when project truth advances. A newer immutable Report produces publication N+1. There is no in-place factual refresh in V1.

See `artifacts/reports-interactive-site-v1/` for the contract, security model, fixtures, proof matrix, screenshots, and release handoff.
