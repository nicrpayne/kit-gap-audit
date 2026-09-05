# Branch topology

## Remote verification

`origin` was fetched before integration. Direct `git ls-remote` verification resolved:

- `refs/heads/codex/integrate-truth-audit-inspector-v1` → `1184928ee7f22c6ac137cdda29783c41357660dc`
- `refs/heads/codex/reports-decision-brief-v1` → `ba506f70ea7c02aef6d9fa7365bc47bd380ffc38`
- `refs/heads/codex/reports-composer-audience-v1` → `32908fbca8b74e718bde3ec7544014720a97ec9f`
- `refs/heads/claude/product-timeline-audit-a72dmg` → `95407ec18fc2b4e6d8e8fe3892975606dd0607fd`
- `refs/heads/claude/signal-visual-system-v1` → `f66660a782ed658d3cb275ff0ad9c9d18529d9fa`
- `refs/heads/claude/signal-reality-glyph-v1` → `bbce71787bdae5626ca26714672921e97fdc48ff`

The exact Truth Hardening commit exists locally and is an ancestor of accepted remote branches, but `refs/heads/codex/truth-contract-hardening-1` is not currently advertised by `origin`. No attempt was made to recreate or push that source branch because this task authorizes pushing only the merge-train branch.

## Proven ancestry

- `95407ec` is an ancestor of `5967865`.
- `5967865` is an ancestor of `1184928`.
- `ba506f7` is an ancestor of `32908fb`.
- The common ancestor of Audit integration and Reports Composer is `5967865`.
- Neither `f66660a` (Visual System) nor `bbce717` (Reality Glyph) is an ancestor of the merge-train candidate.

## Merge graph

```text
95407ec production reference
└── 5967865 Truth Contract Hardening 1
    ├── 1184928 integrated Audit UX ───────────┐
    └── ba506f7 Reports V1                    │
        └── 32908fb Reports Composer ─────────┤
                                              └── 70285c1 clean two-parent merge
```

The merge used `git merge --no-ff 32908fbca8b74e718bde3ec7544014720a97ec9f` from a clean worktree based at `1184928ee7f22c6ac137cdda29783c41357660dc`.
