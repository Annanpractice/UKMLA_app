#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from hashlib import sha1
from pathlib import Path

from biomedical_core import (
    ANATOMY_SOURCE,
    EXPECTED_ANATOMY,
    EXPECTED_PHYSIOLOGY,
    NEURO_LOCALISATION_SOURCE,
    PHYSIOLOGY_SOURCE,
    load_biomedical_records,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "conditions.json"
CURATED_CLINICAL = ROOT / "data_sources" / "curated-clinical.json"
BIOMEDICAL_PROFILES = {"anatomy", "physiology"}
BIOMEDICAL_SOURCES = (ANATOMY_SOURCE, PHYSIOLOGY_SOURCE, NEURO_LOCALISATION_SOURCE)


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def topic_name(value: str) -> str:
    return re.sub(r"\s+heading$", "", clean(value), flags=re.IGNORECASE)


def slug(value: str, limit: int = 42) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", clean(value).lower()).strip("-")
    return (text or "item")[:limit]


def fnv1a_base36(value: str) -> str:
    result = 2166136261
    for char in value:
        result ^= ord(char)
        result = (result * 16777619) & 0xFFFFFFFF
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    chars: list[str] = []
    while result:
        result, remainder = divmod(result, 36)
        chars.append(alphabet[remainder])
    return ("".join(reversed(chars)) or "0").rjust(7, "0")[-7:]


def make_topic_id(name: str) -> str:
    return f"topic-{slug(name)}-{fnv1a_base36(name)}"


def make_condition_id(topic_id: str, name: str) -> str:
    return f"{topic_id}-{slug(name)}-{fnv1a_base36(f'{topic_id}|{name}')}"


def source_digest() -> str:
    digest = sha1()
    for path in BIOMEDICAL_SOURCES:
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def clinical_labels() -> dict[str, str]:
    return {
        "investigations": "Investigations",
        "treatment": "Treatment",
        "escalation": "Escalation",
        "mimics": "Mimics",
        "redFlags": "Red flags",
    }


def apply_curated_clinical(records: list[dict[str, object]]) -> list[dict[str, object]]:
    if not CURATED_CLINICAL.exists():
        return records

    payload = json.loads(CURATED_CLINICAL.read_text(encoding="utf-8"))
    patches = payload.get("conditions", [])
    if not isinstance(patches, list):
        raise SystemExit("curated-clinical.json conditions must be a list")

    index: dict[tuple[str, str], int] = {
        (topic_name(str(record.get("topic", ""))).casefold(), clean(str(record.get("name", ""))).casefold()): position
        for position, record in enumerate(records)
        if record.get("profile") == "clinical"
    }

    required_fields = set(clinical_labels())
    for patch in patches:
        mode = clean(str(patch.get("mode", ""))).lower()
        topic = topic_name(str(patch.get("topic", "")))
        target_name = clean(str(patch.get("name", "")))
        final_name = clean(str(patch.get("newName", ""))) or target_name
        fields = patch.get("fields", {})
        if mode not in {"add", "replace"}:
            raise SystemExit(f"Unsupported curated clinical mode: {mode!r}")
        if not topic or not target_name or not isinstance(fields, dict):
            raise SystemExit("Invalid curated clinical entry")
        if set(fields) != required_fields or any(not clean(str(value)) for value in fields.values()):
            raise SystemExit(f"Curated clinical card {target_name!r} must contain all five clinical fields")

        record: dict[str, object] = {
            "topic": topic,
            "name": final_name,
            "profile": "clinical",
            "fields": {key: clean(str(value)) for key, value in fields.items()},
            "labels": clinical_labels(),
        }
        target_key = (topic.casefold(), target_name.casefold())
        final_key = (topic.casefold(), final_name.casefold())

        if mode == "replace":
            position = index.get(target_key)
            if position is None:
                raise SystemExit(f"Curated replacement target not found: {topic} / {target_name}")
            records[position] = record
            del index[target_key]
            if final_key in index:
                raise SystemExit(f"Curated replacement would duplicate: {topic} / {final_name}")
            index[final_key] = position
        else:
            if final_key in index:
                raise SystemExit(f"Curated addition already exists: {topic} / {final_name}")
            index[final_key] = len(records)
            records.append(record)

    return records


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    records = [
        record for record in payload["conditions"]
        if record.get("profile") not in BIOMEDICAL_PROFILES
    ]

    biomedical = load_biomedical_records(
        topic_id=make_topic_id,
        condition_id=lambda topic, name: make_condition_id(make_topic_id(topic), name),
        clean=clean,
    )
    records.extend(biomedical)
    records = apply_curated_clinical(records)

    for record in records:
        name = topic_name(str(record["topic"]))
        tid = make_topic_id(name)
        record["topic"] = name
        record["topicId"] = tid
        record["id"] = make_condition_id(tid, str(record["name"]))
        record["search"] = clean(" ".join([name, str(record["name"]), *[str(value) for value in record.get("fields", {}).values()]]))

    records.sort(key=lambda record: (str(record["topic"]).casefold(), str(record["name"]).casefold()))
    ids = [record["id"] for record in records]
    if len(ids) != len(set(ids)):
        raise SystemExit("Normalisation produced duplicate condition IDs")

    anatomy_count = sum(record.get("profile") == "anatomy" for record in records)
    physiology_count = sum(record.get("profile") == "physiology" for record in records)
    if anatomy_count != EXPECTED_ANATOMY:
        raise SystemExit(f"Built {anatomy_count} anatomy cards; expected {EXPECTED_ANATOMY}")
    if physiology_count != EXPECTED_PHYSIOLOGY:
        raise SystemExit(f"Built {physiology_count} physiology cards; expected {EXPECTED_PHYSIOLOGY}")
    if len(records) < 838:
        raise SystemExit(f"Biomedical build unexpectedly contains only {len(records)} total cards")

    topics: dict[str, dict[str, object]] = {}
    for record in records:
        current = topics.setdefault(str(record["topicId"]), {
            "id": record["topicId"],
            "name": record["topic"],
            "count": 0,
        })
        current["count"] = int(current["count"]) + 1

    generated_from = list(payload.get("generatedFrom", []))
    for path in BIOMEDICAL_SOURCES:
        relative = str(path.relative_to(ROOT))
        if relative not in generated_from:
            generated_from.append(relative)
    if CURATED_CLINICAL.exists():
        relative = str(CURATED_CLINICAL.relative_to(ROOT))
        if relative not in generated_from:
            generated_from.append(relative)

    payload["schemaVersion"] = "ukmla-v2-data-3-curated-clinical"
    payload["generatedFrom"] = generated_from
    payload["biomedicalSourceDigest"] = source_digest()
    if CURATED_CLINICAL.exists():
        payload["curatedClinicalSourceDigest"] = sha1(CURATED_CLINICAL.read_bytes()).hexdigest()
    payload["conditionCount"] = len(records)
    payload["topicCount"] = len(topics)
    payload["topics"] = sorted(topics.values(), key=lambda item: str(item["name"]).casefold())
    payload["conditions"] = records
    DATA.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(
        f"Normalised {len(records)} records across {len(topics)} topics "
        f"({anatomy_count} anatomy; {physiology_count} physiology)"
    )


if __name__ == "__main__":
    main()
