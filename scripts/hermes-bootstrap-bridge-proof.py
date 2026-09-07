#!/usr/bin/env python3
"""Deterministic contract proof for the pre-Scope Hermes bootstrap adapter."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from pathlib import Path


sys.dont_write_bytecode = True
SCRIPT = Path(__file__).with_name("hermes-bootstrap-bridge.py")
SPEC = importlib.util.spec_from_file_location("hermes_bootstrap_bridge", SCRIPT)
assert SPEC and SPEC.loader
bridge = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = bridge
SPEC.loader.exec_module(bridge)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="signal-hermes-bootstrap-") as raw_root:
        root = Path(raw_root)
        manifest = "2026-09-07_harbor-relay"
        state = {
            "compiled_at": "2026-09-07T12:00:00.000Z",
            "canonical_inputs": {"manifests_included": [manifest]},
            "objects_by_id": {
                "opp-harbor": {"is_head": True}, "dep-harbor": {"is_head": True},
                "obs-keyword": {"is_head": True}, "dec-neighbor": {"is_head": True},
            }, "id_collisions": [],
        }
        write_json(root / "intelligence/current-state/current-state.json", state)
        objects = {
            "batch_metadata": {"batch_id": manifest},
            "opportunities": [{"id": "opp-harbor", "scope": ["harbor-relay"], "why_now": "Harbor Relay should expose a safe handoff dashboard.", "expected_value": "Faster handoffs", "status": "open", "evidence": [{"id": "ev-1", "source_file": "Harbor-Relay-Sync.txt"}], "related_objects": [{"relation": "supports", "target_id": "dec-neighbor"}]}],
            "dependencies": [{"id": "dep-harbor", "scope": ["harbor-relay"], "dependent": "Handoff dashboard", "dependency": "Relay identity service", "blocking": True, "evidence": [{"id": "ev-2", "source_file": "Harbor-Relay-Sync.txt"}]}],
            "observations": [{"id": "obs-keyword", "scope": ["harbor-relay"], "statement": "People casually said this depends on a prettier color.", "evidence": [{"id": "ev-3", "source_file": "Harbor-Relay-Sync.txt"}]}],
            "decisions": [{"id": "dec-neighbor", "scope": ["adjacent"], "statement": "Use explicit relay handoff states.", "decision": "Use explicit relay handoff states.", "evidence": [{"id": "ev-4", "source_file": "Harbor-Relay-Sync.txt"}]}],
        }
        write_json(root / f"intelligence/objects/{manifest}.json", objects)
        evidence_path = root / "intelligence/evidence/Harbor-Relay-Sync.jsonl"
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text("\n".join(json.dumps({"id": f"ev-{index}", "source_file": "Harbor-Relay-Sync.txt", "exact_quote": quote, "quote_hash": f"hash-{index}", "char_start": index * 20, "char_end": index * 20 + len(quote), "offset_unit": "unicode_code_points", "meeting_date": "2026-09-07"}) for index, quote in enumerate(["Harbor Relay handoff dashboard.", "Relay identity service blocks the dashboard.", "Someone used the word depends casually.", "Use explicit relay handoff states."], 1)) + "\n", encoding="utf-8")
        (root / "sources").mkdir(parents=True, exist_ok=True)
        (root / "sources/Harbor-Relay-Sync.txt").write_text("Harbor Relay handoff dashboard.", encoding="utf-8")
        (root / "wiki/projects").mkdir(parents=True, exist_ok=True)
        (root / "wiki/projects/harbor-relay.md").write_text("# Harbor Relay\nDerivative overview from Harbor-Relay-Sync.txt.", encoding="utf-8")

        first = bridge.compile_package(root, "bootstrap-harbor", "Harbor Relay", ["HR"], "Morgan", ["handoff"])
        second = bridge.compile_package(root, "bootstrap-harbor", "Harbor Relay", ["HR"], "Morgan", ["handoff"])
        bridge.validate_local(first)
        assert first["packageId"] == second["packageId"], "same estate must compile to the same package identity"
        assert first["requestedIdentity"]["canonicalName"] == "Harbor Relay"
        assert not any("scopeId" in first for _ in [0]), "bootstrap bridge must not require a Signal Scope"
        assert any(head["intelligenceId"] == "hermes:dec-neighbor" for head in first["intelligenceHeads"]), "typed graph expansion must preserve a current neighbor"
        dependency_proposals = [item for item in first["proposals"] if item["kind"] == "dependency"]
        assert len(dependency_proposals) == 1
        assert dependency_proposals[0]["intelligenceRefs"] == ["hermes:dep-harbor"]
        assert not any(item["kind"] == "dependency" and item["intelligenceRefs"] == ["hermes:obs-keyword"] for item in first["proposals"]), "semantic wording must not become dependency Reality"
        assert any(item["kind"] == "capability" and item["basis"] == "inferred" for item in first["proposals"])
        wiki = next(item for item in first["artifacts"] if item["provider"] == "ke-wiki")
        wiki_evidence = next(item for item in first["evidence"] if item["artifactId"] == wiki["artifactId"])
        assert wiki_evidence["independence"] == "derivative"
        assert all(key not in json.dumps(first) for key in ['"geometry"', '"laneGeometry"', '"coordinates"'])
        assert next(item for item in first["discovery"]["strategies"] if item["id"] == "semantic")["state"] == "unavailable"
        print(json.dumps({
            "contract": first["version"], "packageId": first["packageId"], "preScope": True,
            "heads": len(first["intelligenceHeads"]), "relations": len(first["relations"]),
            "proposals": len(first["proposals"]), "typedDependencies": len(dependency_proposals),
            "wikiIndependence": wiki_evidence["independence"], "semantic": "unavailable", "geometry": "absent",
        }, indent=2))


if __name__ == "__main__":
    main()
