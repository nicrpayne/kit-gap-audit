#!/usr/bin/env python3
"""Compile a pre-Scope Hermes/KE slice into Signal's bootstrap contract.

This adapter is deliberately read-only with respect to KE and pre-Scope: it
selects by requested project identity, not by an already-existing Signal Scope.
It never emits layout/forecast data and only emits dependency proposals from
typed Hermes dependency objects.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


TYPE_KEYS = {
    "decisions": "decision",
    "observations": "observation",
    "commitments": "commitment",
    "risks": "risk",
    "dependencies": "dependency",
    "unknowns": "unknown",
    "availability_observations": "availability_observation",
    "climate_evidence": "climate_evidence",
    "opportunities": "opportunity",
}
RELATION_ALIASES = {"derived_from_source": "derived_from"}
INVERSE_RELATIONS = {"superseded_by": "supersedes", "resolved_by": "resolves"}
ALLOWED_RELATIONS = {"supports", "contradicts", "supersedes", "resolves", "reopens", "depends_on", "related_to"}
RELATION_CLASS = {
    "supersedes": "temporal", "resolves": "temporal", "reopens": "temporal",
    "depends_on": "semantic", "supports": "semantic", "contradicts": "semantic",
    "related_to": "contextual",
}
TEXT_FIELDS = {
    "decision": ("statement", "decision"),
    "risk": ("statement", "description"),
    "unknown": ("statement", "question"),
    "commitment": ("statement", "action"),
    "climate_evidence": ("statement", "summary"),
    "opportunity": ("statement", "why_now", "opportunity_kind"),
    "observation": ("statement", "significance"),
}
MAX_HEADS = 200
MAX_EVIDENCE = 500
MAX_WIKI = 20


@dataclass(frozen=True)
class ObjectRecord:
    key: str
    canonical_id: str
    batch_id: str
    kind: str
    raw: dict[str, Any]
    is_head: bool


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def digest(prefix: str, value: Any, size: int = 20) -> str:
    return f"{prefix}{hashlib.sha256(canonical_json(value).encode()).hexdigest()[:size]}"


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object at {path}")
    return value


def normalized(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.casefold()))


def contains_term(text: str, term: str) -> bool:
    haystack, needle = normalized(text), normalized(term)
    return bool(needle and re.search(rf"(?:^| ){re.escape(needle)}(?: |$)", haystack))


def identity_score(raw: dict[str, Any], terms: list[str], source_hints: list[str]) -> tuple[int, list[str]]:
    scopes = " ".join(str(item) for item in raw.get("scope", []) if isinstance(item, str))
    body = canonical_json({key: value for key, value in raw.items() if key not in {"evidence", "related_objects"}})
    sources = " ".join(
        str(link.get("source_file", "")) for link in raw.get("evidence", []) if isinstance(link, dict)
    )
    reasons: list[str] = []
    score = 0
    for index, term in enumerate(terms):
        if contains_term(scopes, term):
            score += 12 if index == 0 else 9
            reasons.append(f"identity term {term!r} matched structured scope")
        elif contains_term(body, term):
            score += 8 if index == 0 else 5
            reasons.append(f"identity term {term!r} matched canonical object content")
    for hint in source_hints:
        if contains_term(sources, hint) or contains_term(body, hint):
            score += 4
            reasons.append(f"source hint {hint!r} matched")
    return score, reasons


def statement_for(record: ObjectRecord) -> str:
    for key in TEXT_FIELDS.get(record.kind, ("statement",)):
        value = record.raw.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:4000]
    if record.kind == "dependency":
        dependent, dependency = record.raw.get("dependent"), record.raw.get("dependency")
        if isinstance(dependent, str) and isinstance(dependency, str):
            return f"{dependent.strip()} depends on {dependency.strip()}"[:4000]
    if record.kind == "availability_observation":
        who = record.raw.get("person_or_team") or record.raw.get("person")
        state = record.raw.get("availability_state") or record.raw.get("availability_type")
        if isinstance(who, str):
            return f"{who.strip()} — {str(state or 'availability observed').strip()}"[:4000]
    return f"[{record.kind} {record.canonical_id} has no textual statement]"


def load_objects(ke_root: Path, state: dict[str, Any]) -> dict[str, ObjectRecord]:
    included = state.get("canonical_inputs", {}).get("manifests_included", [])
    if not isinstance(included, list) or not included:
        raise ValueError("current-state has no allowlisted manifests")
    contributions: dict[str, list[tuple[str, str, dict[str, Any]]]] = {}
    for manifest in included:
        path = ke_root / "intelligence" / "objects" / f"{manifest}.json"
        if not path.is_file():
            continue
        batch = read_json(path)
        batch_id = str(batch.get("batch_metadata", {}).get("batch_id") or manifest)
        for plural, singular in TYPE_KEYS.items():
            for raw in batch.get(plural, []) or []:
                if isinstance(raw, dict) and raw.get("id"):
                    contributions.setdefault(str(raw["id"]), []).append((batch_id, singular, raw))
    by_state = state.get("objects_by_id", {})
    records: dict[str, ObjectRecord] = {}
    for canonical_id, copies in contributions.items():
        collided = len({batch for batch, _, _ in copies}) > 1
        for batch_id, kind, raw in copies:
            key = f"{canonical_id}#{batch_id}" if collided else canonical_id
            head = by_state.get(key)
            if isinstance(head, dict):
                records[key] = ObjectRecord(key, canonical_id, batch_id, kind, raw, bool(head.get("is_head")))
    return records


def resolve_target(target: str, source: ObjectRecord, records: dict[str, ObjectRecord]) -> str | None:
    if target in records:
        return target
    qualified = f"{target}#{source.batch_id}"
    return qualified if qualified in records else None


def relations_for(records: dict[str, ObjectRecord]) -> list[dict[str, str]]:
    output: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for key, record in sorted(records.items()):
        for link in record.raw.get("related_objects", []) or []:
            if isinstance(link, str):
                declared, relation, target = "bare-string", "related_to", link
            elif isinstance(link, dict):
                declared = str(link.get("relation") or "related_to")
                relation = RELATION_ALIASES.get(declared, declared)
                target = link.get("target_id")
            else:
                continue
            if not isinstance(target, str):
                continue
            target_key = resolve_target(target, record, records)
            if target_key is None:
                continue
            if relation in INVERSE_RELATIONS:
                source_key, target_key, relation = target_key, key, INVERSE_RELATIONS[relation]
            else:
                source_key = key
            if relation not in ALLOWED_RELATIONS:
                relation = "related_to"
            signature = (source_key, relation, target_key)
            if signature not in seen:
                seen.add(signature)
                output.append({"source": source_key, "target": target_key, "relation": relation, "declaredBy": key, "declaredAs": declared})
    return output


def load_passages(ke_root: Path, wanted: set[str]) -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    if not wanted:
        return found
    for path in sorted((ke_root / "intelligence" / "evidence").rglob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(item, dict) and item.get("id") in wanted:
                found[str(item["id"])] = item
        if len(found) == len(wanted):
            break
    return found


def passage_artifact_id(source_file: str) -> str:
    return digest("artifact-source-", source_file)


def lineage_for_source(source_file: str) -> str:
    return digest("lineage-source-", source_file)


def source_artifact(source_file: str, observed_at: str) -> dict[str, Any]:
    clean = source_file.removeprefix("sources/")
    return {
        "artifactId": passage_artifact_id(clean), "provider": "ke-transcripts", "artifactType": "raw_source",
        "title": Path(clean).name, "canonicalRef": f"ke://sources/{clean}", "observedAt": observed_at,
        "availability": "available", "retrievalReasons": [{"kind": "exact_identity", "detail": "Cited by a matching current intelligence object"}],
        "relevanceBand": "included", "lineageRootIds": [lineage_for_source(clean)], "derivativeOfArtifactIds": [],
    }


def excerpt_around(text: str, terms: Iterable[str], maximum: int = 1000) -> str:
    lowered = text.casefold()
    positions = [lowered.find(term.casefold()) for term in terms if term and lowered.find(term.casefold()) >= 0]
    center = min(positions) if positions else 0
    start = max(0, center - maximum // 3)
    end = min(len(text), start + maximum)
    return text[start:end].strip()


def proposal_for(head: dict[str, Any], evidence: list[dict[str, Any]]) -> dict[str, Any] | None:
    kind = head["type"]
    fields = head["fields"]
    proposal_kind: str | None = None
    payload: dict[str, Any] = {}
    basis = "direct"
    why = "Typed current Hermes intelligence object. Human review is required before activation."
    if kind == "decision":
        proposal_kind, payload = "decision", {"question": head["statement"], "rationale": fields.get("rationale")}
    elif kind == "dependency":
        proposal_kind = "dependency"
        payload = {"fromEntity": fields.get("dependent"), "toEntity": fields.get("dependency"), "blocking": fields.get("blocking")}
    elif kind == "risk":
        proposal_kind, payload = "risk", {"description": head["statement"], "owner": fields.get("owner")}
    elif kind == "unknown":
        proposal_kind, payload = "unknown", {"question": head["statement"], "owner": fields.get("owner")}
    elif kind == "opportunity":
        proposal_kind, basis = "capability", "inferred"
        payload = {"name": head["statement"], "description": fields.get("expected_value") or head["statement"]}
        why = "A typed Hermes opportunity suggests product shape; it remains a reviewable inference, not canonical capability Reality."
    elif kind == "commitment" and isinstance(fields.get("due_date"), str):
        proposal_kind, payload = "milestone", {"date": fields["due_date"], "note": head["statement"], "semanticState": "planned"}
    elif kind == "availability_observation":
        who = fields.get("person_or_team") or fields.get("person")
        if isinstance(who, str) and who.strip():
            proposal_kind, payload = "person", {"name": who.strip(), "contextOnly": True}
    if proposal_kind is None:
        return None
    evidence_refs = list(head["evidenceRefs"])
    roots = {root for item in evidence if item["evidenceId"] in evidence_refs for root in item["lineageRootIds"] if item["independence"] == "independent"}
    seed = {"kind": proposal_kind, "head": head["intelligenceId"], "payload": payload}
    fingerprint = digest("sha256:", seed, 64)
    return {
        "proposalId": digest("proposal-", seed), "candidateKey": f"hermes:{proposal_kind}:{head['intelligenceId']}",
        "fingerprint": fingerprint, "kind": proposal_kind, "title": head["statement"][:180], "statement": head["statement"],
        "whyProposed": why, "matchBasis": "structured_current_head", "basis": basis,
        "evidenceRefs": evidence_refs, "intelligenceRefs": [head["intelligenceId"]], "relevance": "high",
        "currentness": "current", "retrieval": {"strategy": "structured_current_head", "scoreBand": "strong"},
        "ambiguityMarkers": [], "grounding": {"directEvidenceCount": len(evidence_refs), "independentLineageRootCount": len(roots), "derivativeOnly": bool(evidence_refs) and not roots, "unresolvedContradiction": bool(head["contradictedBy"])},
        "payload": {key: value for key, value in payload.items() if value is not None},
    }


def compile_package(ke_root: Path, bootstrap_id: str, canonical_name: str, aliases: list[str], owner_hint: str | None, source_hints: list[str]) -> dict[str, Any]:
    state_path = ke_root / "intelligence" / "current-state" / "current-state.json"
    state = read_json(state_path)
    records = load_objects(ke_root, state)
    all_relations = relations_for(records)
    terms = [canonical_name, *aliases]
    scored: dict[str, tuple[int, list[str]]] = {}
    for key, record in records.items():
        if record.is_head:
            score, reasons = identity_score(record.raw, terms, source_hints)
            if score > 0:
                scored[key] = (score, reasons)
    selected_keys = set(key for key, _ in sorted(scored.items(), key=lambda item: (-item[1][0], item[0]))[:MAX_HEADS])
    # Preserve one graph hop, but only when the neighbor is itself a current head.
    for relation in all_relations:
        if relation["source"] in selected_keys and records[relation["target"]].is_head:
            selected_keys.add(relation["target"])
        if relation["target"] in selected_keys and records[relation["source"]].is_head:
            selected_keys.add(relation["source"])
    selected_keys = set(sorted(selected_keys)[:MAX_HEADS])
    generated_at = str(state.get("compiled_at") or "1970-01-01T00:00:00.000Z")
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", generated_at):
        generated_at += "T00:00:00.000Z"

    wanted = {
        str(link["id"])
        for key in selected_keys
        for link in records[key].raw.get("evidence", []) or []
        if isinstance(link, dict) and link.get("id")
    }
    passages = load_passages(ke_root, wanted)
    artifacts_by_id: dict[str, dict[str, Any]] = {
        "artifact-ke-current-state": {
            "artifactId": "artifact-ke-current-state", "provider": "ke-current-state", "artifactType": "compiler_state",
            "title": "Hermes current intelligence state", "canonicalRef": "ke://intelligence/current-state/current-state.json",
            "observedAt": generated_at, "availability": "available", "retrievalReasons": [{"kind": "current_head", "detail": "Currency authority for matched objects"}],
            "relevanceBand": "included", "lineageRootIds": ["lineage-ke-current-state"], "derivativeOfArtifactIds": [],
        }
    }
    evidence: list[dict[str, Any]] = []
    for passage_id in sorted(passages)[:MAX_EVIDENCE]:
        passage = passages[passage_id]
        source_file = str(passage.get("source_file") or "unknown-source")
        artifact = source_artifact(source_file, generated_at)
        artifacts_by_id[artifact["artifactId"]] = artifact
        quote = str(passage.get("exact_quote") or "").strip()
        evidence.append({
            "evidenceId": f"hermes-ev:{passage_id}", "passageHash": str(passage.get("quote_hash") or digest("sha256:", quote, 64)),
            "artifactId": artifact["artifactId"], "exactQuote": quote[:4000],
            "locator": {key: passage[key] for key in ("source_file", "char_start", "char_end", "offset_unit", "segment_id", "timestamp", "primary_anchor") if key in passage and passage[key] is not None},
            "speaker": passage.get("speaker") or None, "occurredAt": passage.get("meeting_date") or None,
            "independence": "independent", "lineageRootIds": artifact["lineageRootIds"],
        })
    evidence_ids = {item["evidenceId"] for item in evidence}

    heads: list[dict[str, Any]] = []
    for key in sorted(selected_keys):
        record = records[key]
        raw = record.raw
        fields = {field: raw[field] for field in (
            "rationale", "owner", "dependent", "dependency", "blocking", "relationship_type", "dependency_type",
            "consequence_if_unresolved", "due_date", "committed_date", "expected_value", "person", "person_or_team",
            "availability_state", "question", "description",
        ) if field in raw and raw[field] not in (None, "", [], {})}
        refs = [f"hermes-ev:{link['id']}" for link in raw.get("evidence", []) or [] if isinstance(link, dict) and f"hermes-ev:{link.get('id')}" in evidence_ids]
        heads.append({
            "intelligenceId": f"hermes:{key}", "type": record.kind, "statement": statement_for(record), "isCurrent": True,
            "status": raw.get("status") if isinstance(raw.get("status"), str) else None,
            "observedDate": raw.get("observed_date") if isinstance(raw.get("observed_date"), str) else None,
            "fields": fields, "evidenceRefs": refs, "supersedes": [], "contradictedBy": [],
            "provenance": {"canonicalId": record.canonical_id, "batchId": record.batch_id, "currentStateKey": key, "trust": "external_intelligence", "matchReasons": scored.get(key, (0, ["one-hop typed graph expansion"]))[1]},
        })
    head_by_id = {head["intelligenceId"]: head for head in heads}
    relations: list[dict[str, Any]] = []
    for relation in all_relations:
        source_id, target_id = f"hermes:{relation['source']}", f"hermes:{relation['target']}"
        source_in, target_in = source_id in head_by_id, target_id in head_by_id
        if not (source_in or target_in):
            continue
        rel = relation["relation"]
        relations.append({
            "sourceId": source_id, "relation": rel, "targetId": target_id,
            "relationClass": RELATION_CLASS[rel], "sourceInPackage": source_in, "targetInPackage": target_in,
            "provenance": {"declaredBy": f"hermes:{relation['declaredBy']}", "declaredAs": relation["declaredAs"], "trust": "external_intelligence"},
        })
        if source_in and rel == "supersedes":
            head_by_id[source_id]["supersedes"].append(target_id)
        if target_in and rel == "contradicts":
            head_by_id[target_id]["contradictedBy"].append(source_id)

    # Matched wiki excerpts are derivative context and never independent corroboration.
    wiki_dir = ke_root / "wiki" / "projects"
    wiki_matches = []
    if wiki_dir.is_dir():
        for path in sorted(wiki_dir.glob("*.md")):
            text = path.read_text(encoding="utf-8")
            if any(contains_term(f"{path.stem} {text}", term) for term in terms):
                wiki_matches.append((path, text))
    for path, content in wiki_matches[:MAX_WIKI]:
        ref = path.relative_to(ke_root).as_posix()
        artifact_id = digest("artifact-wiki-", ref)
        referenced = [artifact["artifactId"] for artifact in artifacts_by_id.values() if artifact["artifactType"] == "raw_source" and Path(artifact["canonicalRef"]).name in content]
        roots = sorted({root for aid in referenced for root in artifacts_by_id[aid]["lineageRootIds"]}) or [digest("lineage-wiki-", ref)]
        artifacts_by_id[artifact_id] = {
            "artifactId": artifact_id, "provider": "ke-wiki", "artifactType": "derivative_summary", "title": path.name,
            "canonicalRef": f"ke://{ref}", "observedAt": generated_at, "availability": "available",
            "retrievalReasons": [{"kind": "derivative", "detail": "Project identity matched a derivative Hermes wiki page"}],
            "relevanceBand": "included", "lineageRootIds": roots, "derivativeOfArtifactIds": referenced,
        }
        excerpt = excerpt_around(content, terms)
        evidence.append({
            "evidenceId": digest("hermes-wiki-ev:", {"ref": ref, "excerpt": excerpt}), "passageHash": digest("sha256:", excerpt, 64),
            "artifactId": artifact_id, "exactQuote": excerpt[:4000], "locator": {"path": ref}, "independence": "derivative", "lineageRootIds": roots,
        })

    proposals = [item for item in (proposal_for(head, evidence) for head in heads) if item is not None]
    for artifact in sorted(artifacts_by_id.values(), key=lambda item: item["artifactId"]):
        if artifact["artifactType"] not in {"raw_source", "derivative_summary"}:
            continue
        item_evidence = [item["evidenceId"] for item in evidence if item["artifactId"] == artifact["artifactId"]]
        seed = {"kind": "source", "artifact": artifact["artifactId"]}
        independent = artifact["artifactType"] == "raw_source"
        proposals.append({
            "proposalId": digest("proposal-", seed), "candidateKey": f"hermes:source:{artifact['artifactId']}", "fingerprint": digest("sha256:", seed, 64),
            "kind": "source", "title": artifact["title"], "statement": f"Register {artifact['canonicalRef']} as project evidence.",
            "whyProposed": "Matched evidence source; derivative sources remain explicitly supplemental.", "matchBasis": "evidence_lineage", "basis": "direct",
            "evidenceRefs": item_evidence, "intelligenceRefs": [], "relevance": "high" if independent else "medium", "currentness": "current",
            "retrieval": {"strategy": "exact_identity", "scoreBand": "strong"}, "ambiguityMarkers": [],
            "grounding": {"directEvidenceCount": len(item_evidence), "independentLineageRootCount": len(artifact["lineageRootIds"]) if independent else 0, "derivativeOnly": not independent, "unresolvedContradiction": False},
            "payload": {"canonicalRef": artifact["canonicalRef"], "sourceType": artifact["provider"], "provider": artifact["provider"], "derivative": not independent},
        })

    collisions = []
    for collision in state.get("id_collisions", []) or []:
        text = canonical_json(collision)
        if any(contains_term(text, term) for term in terms):
            collisions.append(text[:500])
    ambiguities = [{"id": digest("ambiguity-", value), "kind": "identity_collision", "severity": "blocking", "summary": value, "refs": []} for value in collisions]
    provider_counts = {
        "ke-current-state": 1,
        "ke-evidence": len(passages),
        "ke-transcripts": sum(1 for item in artifacts_by_id.values() if item["provider"] == "ke-transcripts"),
        "ke-wiki": len(wiki_matches),
        "hermes-config": 1 if (Path.home() / ".hermes").exists() else 0,
    }
    coverage = [{
        "provider": provider, "label": provider.replace("-", " ").title(), "state": "available" if count else "unavailable",
        "artifacts": count, "observedAt": generated_at, "detail": "Read from the verified local Hermes/KE estate." if count else "No matching or configured artifact was available.",
    } for provider, count in provider_counts.items()]
    gaps = []
    if not heads:
        gaps.append({"id": "gap-no-current-heads", "category": "identity", "summary": "No current intelligence heads matched", "detail": "Review aliases and source hints; no fuzzy semantic fallback was used."})
    if not passages:
        gaps.append({"id": "gap-no-linked-evidence", "category": "evidence", "summary": "No linked evidence passages matched", "detail": "Activation may proceed only with explicit acknowledgement and operator review."})
    package: dict[str, Any] = {
        "version": "1.1", "packageId": "pending", "producer": "hermes", "compilerVersion": "hermes-bootstrap-bridge-1.1",
        "generatedAt": generated_at, "bootstrapId": bootstrap_id,
        "requestedIdentity": {"canonicalName": canonical_name, "aliases": aliases, "ownerHint": owner_hint, "sourceHints": source_hints},
        "identity": {"detectedCanonicalName": canonical_name, "aliases": aliases, "collisions": collisions, "relatedEntities": []},
        "discovery": {"strategies": [
            {"id": "exact_identity", "state": "complete", "detail": "Canonical name and aliases searched across structured object fields and project wiki."},
            {"id": "lexical", "state": "complete", "detail": "Normalized bounded token matching; no generative reinterpretation."},
            {"id": "structured_current_head", "state": "complete", "detail": "Currency taken only from current-state objects_by_id[].is_head."},
            {"id": "graph_expansion", "state": "complete", "detail": "One hop of typed canonical relations retained."},
            {"id": "semantic", "state": "unavailable", "detail": "No semantic index is configured; absence is explicit and no keyword dependency inference is performed."},
        ], "partial": any(item["state"] != "available" for item in coverage)},
        "artifacts": sorted(artifacts_by_id.values(), key=lambda item: item["artifactId"]), "evidence": evidence,
        "intelligenceHeads": heads, "relations": relations, "proposals": proposals, "coverage": coverage,
        "ambiguities": ambiguities, "gaps": gaps,
        "warnings": ["External intelligence is not Signal Reality; every canonical promotion requires explicit human acceptance.", "Derivative wiki evidence never counts as independent corroboration."],
    }
    package["packageId"] = digest("hermes-bootstrap-", {key: value for key, value in package.items() if key != "packageId"}, 32)
    return package


def validate_local(package: dict[str, Any]) -> None:
    required_arrays = ("artifacts", "evidence", "intelligenceHeads", "relations", "proposals", "coverage", "ambiguities", "gaps", "warnings")
    if package.get("version") != "1.1" or package.get("producer") != "hermes":
        raise ValueError("invalid contract identity")
    if any(not isinstance(package.get(key), list) for key in required_arrays):
        raise ValueError("invalid bootstrap package array shape")
    forbidden = {"x", "y", "xy", "position", "positions", "coordinates", "geometry", "layout", "laneGeometry"}
    def walk(value: Any, path: str = "package") -> None:
        if isinstance(value, list):
            for index, item in enumerate(value):
                walk(item, f"{path}[{index}]")
        elif isinstance(value, dict):
            for key, item in value.items():
                if key in forbidden:
                    raise ValueError(f"presentation geometry is forbidden at {path}.{key}")
                walk(item, f"{path}.{key}")
    walk(package)
    artifact_ids = {item["artifactId"] for item in package["artifacts"]}
    evidence_ids = {item["evidenceId"] for item in package["evidence"]}
    head_ids = {item["intelligenceId"] for item in package["intelligenceHeads"]}
    if len(artifact_ids) != len(package["artifacts"]) or len(evidence_ids) != len(package["evidence"]):
        raise ValueError("duplicate artifact or evidence identity")
    for item in package["evidence"]:
        if item["artifactId"] not in artifact_ids:
            raise ValueError("dangling evidence artifact")
    for item in package["proposals"]:
        if not set(item["evidenceRefs"]).issubset(evidence_ids) or not set(item["intelligenceRefs"]).issubset(head_ids):
            raise ValueError("dangling proposal provenance")
    for item in package["proposals"]:
        if item["kind"] == "dependency":
            source = next(head for head in package["intelligenceHeads"] if head["intelligenceId"] in item["intelligenceRefs"])
            if source["type"] != "dependency":
                raise ValueError("dependency proposal did not originate from a typed dependency")


def push_package(package: dict[str, Any], signal_url: str, token_env: str) -> dict[str, Any]:
    token = os.environ.get(token_env)
    if not token:
        raise ValueError(f"{token_env} is not set")
    endpoint = f"{signal_url.rstrip('/')}/api/project-bootstraps/{package['bootstrapId']}/packages"
    request = urllib.request.Request(endpoint, data=canonical_json(package).encode(), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Signal rejected package ({error.code}): {error.read().decode(errors='replace')[:1000]}") from error


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bootstrap-id", required=True)
    parser.add_argument("--canonical-name", required=True)
    parser.add_argument("--alias", action="append", default=[])
    parser.add_argument("--owner-hint")
    parser.add_argument("--source-hint", action="append", default=[])
    parser.add_argument("--ke-root", type=Path, default=Path.home() / "AI-Agents" / "knowledge" / "ke")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--signal-url", help="Optional Signal base URL; omitting this performs no network write")
    parser.add_argument("--token-env", default="SIGNAL_APP_PASSWORD", help="Environment variable containing the Signal bearer token")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    package = compile_package(args.ke_root.resolve(), args.bootstrap_id, args.canonical_name, args.alias, args.owner_hint, args.source_hint)
    validate_local(package)
    body = json.dumps(package, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.write_text(body, encoding="utf-8")
    else:
        sys.stdout.write(body)
    if args.signal_url:
        response = push_package(package, args.signal_url, args.token_env)
        sys.stderr.write(json.dumps({"pushed": True, "response": response}, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
