# Audit exact-quote navigation: protected-baseline evidence

Status: lead-reviewed bounded exception. This note records the evidence and
does not authorize any broader protected Audit rebaseline.

## Change under review

Commit `3d66316` added one 14-line message branch to
`public/audit-rubric-phase2/phase2-host.js`. No later commit changed that file:
the current blob is still `9a6b3f131863dcc4ea10551742f257955f490588`.
The protected base blob is
`de42e297da8232e2917b47054920d61858436c00`.

The branch receives `signal-audit-select-node` only after the existing bridge
has required both:

- `event.origin === window.location.origin`
- `event.source === window.parent`

It resolves `message.nodeId` with an exact `BrainCore.S.byId.get` lookup. A
match is selected and passed to Rubric's existing `flyToNode`; a miss neither
changes selection nor moves the camera. The host reports applied/missing status
to the same-origin parent.

This completes the intended path:

1. A frozen report/accepted estimate links to
   `/audit?project=<scope>&select=passage:<snapshotId>:<evidenceId>`.
2. `app/audit/page.tsx` passes the exact `select` value to `AuditWorld`.
3. `AuditWorld` waits for the embedded world to report ready, then posts the
   exact node id to its iframe.
4. The protected host selects only that snapshot-qualified graph node.

## Behavioral evidence

Run:

```sh
node scripts/audit-exact-quote-navigation-proof.mjs
```

The proof runs the actual protected host asset in a local intercepted Chromium
iframe with two deliberately confusable passage ids. It verifies:

- the full snapshot-qualified id is selected and flown to;
- the passage with the same evidence suffix in another snapshot is not chosen;
- a missing id fails closed without fuzzy fallback or camera movement;
- the child acknowledges applied and missing outcomes to its parent; and
- a wrong-origin parent event and a same-origin sibling-frame sender are both
  rejected.

This is stronger than a source-string assertion because the browser executes
the current host script and native `postMessage` source/origin behavior. It is
still a focused adapter test: its `BrainCore` graph is a deterministic stub,
not a live database projection.

Corroborating pure proofs pass:

- `npm run proof:scope-knowledge-estimates` verifies the producer emits a
  snapshot-qualified Audit passage link.
- `npx tsx scripts/audit-search-proof.ts` verifies passage ids remain graph
  node ids and exact quotations resolve to their own passages.
- `npx tsx scripts/signal-rubric-phase3b-proof.ts` verifies the surrounding
  Audit bridge hardening and protected Rubric core parity.

The DB-backed `scripts/audit-graph-proof.ts` was not run successfully in the
isolated workspace because `DATABASE_URL` is intentionally absent. No database
acceptance is claimed. The real-source/provider gate also remains open: the
focused browser proof uses a deterministic `BrainCore` graph stub and does not
claim that a live provider package contains a particular passage.

## Protected-manifest decision

The lead reviewed the exact 14-line diff and accepted blob
`9a6b3f131863dcc4ea10551742f257955f490588` as a bounded adapter exception.
`scripts/production-hardening-2-audit-proof.mjs` still derives the protected
world from original base `02afba325ddf30fdd8620822dfa9bb870e2ca949` for the
other 32 files. It names the host's exact old and reviewed blob ids and freezes
the resulting 33-file aggregate fingerprint as
`0f631d8061c73e3689a1aa0cef89462e1444001521f4a71e065747c1933a16e9`.
It hashes working-tree files, not `HEAD`, so an uncommitted mutation cannot
hide behind the reviewed commit. The older fingerprint printed inside the
synthetic Production Hardening truth fixture remains historical fixture data;
the final protected-world step is the live filesystem integrity gate.

Run the destructive-case test only against its disposable repository:

```sh
node scripts/production-hardening-2-audit-integrity-selftest.mjs
```

The self-test reconstructs the original protected base in a temporary Git
repository, applies the reviewed host blob, and then proves that an edit to the
reviewed host, an edit to another protected file, and a newly added protected
path all fail verification. It never mutates the real protected working tree.
