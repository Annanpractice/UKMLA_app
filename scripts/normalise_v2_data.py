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
    PHYSIOLOGY_SOURCE,
    load_biomedical_records,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "conditions.json"
BIOMEDICAL_PROFILES = {"anatomy", "physiology"}


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
    for path in (ANATOMY_SOURCE, PHYSIOLOGY_SOURCE):
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


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

    for record in records:
        name = topic_name(record["topic"])
        tid = make_topic_id(name)
        record["topic"] = name
        record["topicId"] = tid
        record["id"] = make_condition_id(tid, record["name"])
        record["search"] = clean(" ".join([name, record["name"], *record.get("fields", {}).values()]))

    records.sort(key=lambda record: (record["topic"].casefold(), record["name"].casefold()))
    ids = [record["id"] for record in records]
    if len(ids) != len(set(ids)):
        raise SystemExit("Normalisation produced duplicate condition IDs")

    anatomy_count = sum(record.get("profile") == "anatomy" for record in records)
    physiology_count = sum(record.get("profile") == "physiology" for record in records)
    if anatomy_count != EXPECTED_ANATOMY:
        raise SystemExit(f"Built {anatomy_count} anatomy cards; expected {EXPECTED_ANATOMY}")
    if physiology_count != EXPECTED_PHYSIOLOGY:
        raise SystemExit(f"Built {physiology_count} physiology cards; expected {EXPECTED_PHYSIOLOGY}")
    if len(records) < 813:
        raise SystemExit(f"Biomedical build unexpectedly contains only {len(records)} total cards")

    topics: dict[str, dict[str, object]] = {}
    for record in records:
        current = topics.setdefault(record["topicId"], {
            "id": record["topicId"],
            "name": record["topic"],
            "count": 0,
        })
        current["count"] = int(current["count"]) + 1

    generated_from = list(payload.get("generatedFrom", []))
    for path in (ANATOMY_SOURCE, PHYSIOLOGY_SOURCE):
        relative = str(path.relative_to(ROOT))
        if relative not in generated_from:
            generated_from.append(relative)

    payload["schemaVersion"] = "ukmla-v2-data-2-biomedical"
    payload["generatedFrom"] = generated_from
    payload["biomedicalSourceDigest"] = source_digest()
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
