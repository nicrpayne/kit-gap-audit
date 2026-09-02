# Test matrix

| Area | Test | Result | Evidence |
|---|---|---|---|
| Build | Next production build | PASS | Compiled, type-checked, generated 35/35 static pages |
| Static checks | TypeScript | PASS | `tsc --noEmit` |
| Static checks | Targeted ESLint | PASS | No findings in changed files |
| Search | Existing complete Search proof | PASS | All checks pass; two environment skips |
| Renderer | Audit renderer/spatial/gesture proof | PASS | 125/125 |
| Projection | Canonical population at far zoom | PASS | 427 of 427 projected in browser |
| Spatial truth | Intended-hub ownership | PASS | 98.0% (400/408 eligible members) |
| Spatial balance | Largest first-level territory | PASS | 28.0% (gate ≤35%) |
| Determinism | Two engine settlements | PASS | Worst coordinate drift 0.0 units |
| Rings | Critical Finding on conflict band | PASS | Proof assertion |
| Rings | External trust does not invent distance | PASS | Default external claim maps to unresolved Drift |
| Sources | Artifact provenance horizon | PASS | Artifact radius at outer source horizon |
| Morph | First switched frame retains position | PASS | Largest first-frame jump 0.0 units |
| Camera | Layout switch does not auto-refit | PASS | Browser/source inspection |
| Drag | Node drag owns gesture | PASS | Proof plus three-frame browser capture |
| Drag | Constellations free-drop | PASS | Final point is nearer drop than old seat |
| Drag | Rings return | PASS | Released node returns within 2 world units |
| Focus | Lane wakes semantic members | PASS | Focus model includes lane population; framing remains hub-only |
| Card | Compact selection utility card | PASS | Browser screenshot |
| Card | In-place detailed inspector | PASS | Browser screenshot |
| Card | Copy canonical reference | PASS | Clipboard matched selected canonical ID exactly |
| Card | Hide/restore | PASS | Projected count 427→426→427; graph payload untouched |
| Card | Conditional source opening | PARTIAL | Code only enables safe HTTP(S); fixture has no safe URL |
| Search | Exact semantic title precedes verbatim quote | PASS | Requirement is first, evidence passage second |
| Browser | Clean reload | PASS | No console warnings/errors |
| DB-backed interaction | Existing interaction proof | NOT TESTABLE | Isolated worktree has no `DATABASE_URL` |

## Scope audit

Changed paths are restricted to:

- `components/audit/**`
- `lib/audit/**`
- `scripts/audit-renderer-proof.ts`
- `artifacts/rubric-targeted-fidelity-fix/**`

No deployment was attempted.
