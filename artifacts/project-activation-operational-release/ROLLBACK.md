# Rollback

## Signal

The forward rollback branch is prepared from the final release candidate. Its
committed tree must
equal starting production tree `bce38dde332fa1d049363fe502c5921326556311^{tree}`
byte-for-byte before it is accepted. Deployment is a normal forward push—never
a force push. Additive database tables may remain; the starting application
does not depend on them.

If a P0/P1 appears, fast-forward the watched production branch to the prepared
rollback commit, wait for Railway, and verify `/api/version` plus the normal
read-only instrument smoke.

## Bridge

Current release: annotated local tag `v0.3.0` at
`3b8db08ed86596c5cf1c72d820f03ded59555f4b`.
Prior release commit: `d227238a2cb95d4c2ccbae6b8e61f6e20e167543`.

```sh
cd /Users/nicholaspayne/AI-Agents/kit-gap-bridge
./bin/kit-gap uninstall-companion
git switch --detach d227238a2cb95d4c2ccbae6b8e61f6e20e167543
./bin/kit-gap bootstrap --help
```

The prior bridge is CLI-only, so rollback intentionally removes automatic job
polling. To restore the daemon, switch to `v0.3.0`, load the one-time install
environment, run `install-companion`, and then `companion restart`.
