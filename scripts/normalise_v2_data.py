#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "conditions.json"


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


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    records = payload["conditions"]

    for record in records:
        name = topic_name(record["topic"])
        tid = make_topic_id(name)
        record["topic"] = name
        record["topicId"] = tid
        record["id"] = make_condition_id(tid, record["name"])
        record["search"] = clean(" ".join([name, record["name"], *record.get("fields", {}).values()]))

    ids = [record["id"] for record in records]
    if len(ids) != len(set(ids)):
        raise SystemExit("Normalisation produced duplicate condition IDs")

    topics: dict[str, dict[str, object]] = {}
    for record in records:
        current = topics.setdefault(record["topicId"], {
            "id": record["topicId"],
            "name": record["topic"],
            "count": 0,
        })
        current["count"] = int(current["count"]) + 1

    payload["topicCount"] = len(topics)
    payload["topics"] = sorted(topics.values(), key=lambda item: str(item["name"]).casefold())
    DATA.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"Normalised {len(records)} records across {len(topics)} topics")


if __name__ == "__main__":
    main()
