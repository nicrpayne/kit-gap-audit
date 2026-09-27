# Audit Inspector usefulness: protected-baseline evidence

Status: lead-approved bounded adapter/translation exceptions. This note does
not authorize a broad protected Audit rebaseline.

## Reviewed protected files

### `public/audit-rubric-phase2/phase2-host.js`

- Protected-base blob: `de42e297da8232e2917b47054920d61858436c00`
- Approved reviewed blob: `0ec853e1952b22b1ac0bcdb0be69b2595f01fb1d`

The existing exact snapshot-qualified navigation remains intact. The bounded
addition makes the native Rubric search results a labelled listbox, makes each
result keyboard-focusable, supports Arrow/Home/End traversal and Enter/Space
selection through the result's existing click action, and keeps the result list
visible when focus moves from the input into it. Escape uses the existing
restore behavior. No result ranking, search source, graph data, camera, layout,
or selection target is changed.

### `public/audit-rubric-phase3/phase3-host.js`

- Protected-base blob: `d3f3c4951e77cb53b17a2a278d60ec8740131313`
- Approved reviewed blob: `a799e130722132432811041ce2311298f97807ce`

The bounded addition renders an exact passage's already-transported
`sourceRef`, snapshot-qualified canonical id, and stored surrounding context.
Each row is appended with `textContent`; absent or blank values produce no row.
The close button receives the accessible name `Close Inspector`. No graph
node, relationship, trust/currentness classification, camera, layout, or
selection target is created or changed by this host.

## Behavioral evidence

Run:

```sh
npx tsx scripts/audit-inspector-usefulness-proof.ts
```

The proof executes both current protected hosts in headless Chromium with a
minimal deterministic DOM. It verifies:

- ArrowDown moves focus from the search input to an actual result;
- the inherited native blur timeout does not hide a keyboard-focused result;
- Enter invokes that result's existing native click selection;
- exact source reference, snapshot-qualified identity, and stored surrounding
  context appear in the passage Inspector;
- missing surrounding context remains null rather than being reconstructed;
- the close control exposes its accessible name; and
- the canonical adapter still validates without adding relationships or
  spatial fields.

A separate local Next fixture pass exercised the generated Phase 3 route at
1440 x 1000 and confirmed the same ArrowDown/Enter path, visible focus outline,
provenance wrapping, and Inspector selection. It used deterministic fixture
data and performed no database or provider writes.

Corroborating checks:

```sh
npx tsc --noEmit --incremental false
npx eslint lib/audit/provenance.ts lib/audit/intelligence.ts lib/audit/requirements.ts lib/audit/graph.ts app/audit/rubric-phase3/route.ts scripts/audit-inspector-usefulness-proof.ts
npx tsx scripts/signal-rubric-adapter-proof.ts
npx tsx scripts/signal-rubric-phase3-proof.ts
npx tsx scripts/signal-rubric-phase3a-proof.ts
npx tsx scripts/signal-rubric-phase3b-proof.ts
```

The DB-backed graph proof still requires an explicit disposable
`DATABASE_URL`; no database-backed result is claimed by this note.

## Protected-manifest decision

The lead approved exactly the two reviewed blobs above against unchanged
protected base `02afba325ddf30fdd8620822dfa9bb870e2ca949` and unchanged protected
world count 33. With no other protected exceptions, their aggregate
working-tree fingerprint is
`764dcf8c189358753051e7c2679081c03e1db192d7e2877d875c410ac9eb0c94`.
The integrity self-test reconstructs that original base in a disposable Git
repository, applies both exact reviewed hosts, and independently rejects a
mutation of either reviewed host, an ordinary protected file, or an added
protected path.
