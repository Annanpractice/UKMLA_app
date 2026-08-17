#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import secrets
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "data_sources" / "manual-cards.json"
SCHEMA_VERSION = "ukmla-card-import-v1"

PROFILE_FIELDS = {
    "clinical": ["investigations", "treatment", "escalation", "mimics", "redFlags"],
    "pharmacology": ["indication", "prescribe", "checkMonitor", "interactionsAvoid", "toxicityAct"],
    "anatomy": ["exactAnswer", "clinicalPattern", "localisation", "discriminator", "examUse"],
    "physiology": ["subsystem", "mechanism", "clinicalPattern", "discriminator", "examUse"],
    "law": ["recognise", "rule", "act", "record", "avoid"],
}


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def slug(value: str, limit: int = 34) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", clean(value).lower()).strip("-")
    return (text or "card")[:limit]


def new_id(topic: str, name: str) -> str:
    return f"manual-{slug(topic,18)}-{slug(name,28)}-{secrets.token_hex(5)}"


def load_payload(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        payload = {"schemaVersion": SCHEMA_VERSION, "cards": payload}
    if payload.get("schemaVersion") != SCHEMA_VERSION or not isinstance(payload.get("cards"), list):
        raise SystemExit(f"Input must use {SCHEMA_VERSION} with a cards array")
    return payload


def validate_card(raw: dict[str, Any]) -> dict[str, Any]:
    topic = clean(raw.get("topic"))
    name = clean(raw.get("name"))
    profile = clean(raw.get("profile")).lower()
    fields = raw.get("fields")
    if not topic or not name:
        raise ValueError("topic and name are required")
    if profile not in PROFILE_FIELDS:
        raise ValueError(f"unsupported profile: {profile}")
    if not isinstance(fields, dict):
        raise ValueError("fields must be an object")
    expected = PROFILE_FIELDS[profile]
    missing = [key for key in expected if not clean(fields.get(key))]
    extras = [key for key in fields if key not in expected]
    if missing or extras:
        raise ValueError(f"{name}: fields mismatch; missing={missing or 'none'} extras={extras or 'none'}")
    card_id = clean(raw.get("id")) or new_id(topic, name)
    if not re.fullmatch(r"manual-[a-z0-9-]{8,120}", card_id):
        raise ValueError(f"{name}: id must be omitted or use a manual-* immutable ID")
    return {
        "id": card_id,
        "topic": topic,
        "name": name,
        "profile": profile,
        "fields": {key: clean(fields[key]) for key in expected},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate and append UKMLA card-import JSON")
    parser.add_argument("input", type=Path)
    parser.add_argument("--check", action="store_true", help="validate only; do not modify the registry")
    args = parser.parse_args()

    incoming = [validate_card(card) for card in load_payload(args.input)["cards"]]
    if not incoming:
        raise SystemExit("No cards supplied")

    registry = load_payload(REGISTRY) if REGISTRY.exists() else {"schemaVersion": SCHEMA_VERSION, "cards": []}
    existing = [validate_card(card) for card in registry["cards"]]
    ids = {card["id"] for card in existing}
    names = {(card["topic"].casefold(), card["name"].casefold()) for card in existing}

    for card in incoming:
        key = (card["topic"].casefold(), card["name"].casefold())
        if card["id"] in ids:
            raise SystemExit(f"Duplicate immutable card id: {card['id']}")
        if key in names:
            raise SystemExit(f"Duplicate topic/name: {card['topic']} / {card['name']}")
        ids.add(card["id"])
        names.add(key)

    print(f"Validated {len(incoming)} card(s)")
    if args.check:
        print(json.dumps({"schemaVersion": SCHEMA_VERSION, "cards": incoming}, ensure_ascii=False, indent=2))
        return 0

    registry["cards"] = existing + incoming
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Appended to {REGISTRY.relative_to(ROOT)}; total manual cards: {len(registry['cards'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
