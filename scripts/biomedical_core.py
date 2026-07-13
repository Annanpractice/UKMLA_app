#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
ANATOMY_SOURCE = ROOT / "data_sources" / "biomedical-anatomy.tsv"
PHYSIOLOGY_SOURCE = ROOT / "data_sources" / "biomedical-physiology.tsv"
ANATOMY_TOPIC = "Clinical Anatomy"
PHYSIOLOGY_TOPIC = "Clinical Physiology"
EXPECTED_ANATOMY = 139
EXPECTED_PHYSIOLOGY = 190


def _rows(path: Path, columns: int) -> list[list[str]]:
    if not path.exists():
        raise SystemExit(f"Missing biomedical source: {path}")
    rows: list[list[str]] = []
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        parts = [part.strip() for part in raw.split("\t")]
        if len(parts) != columns or not all(parts):
            raise SystemExit(f"{path.name}:{number} has {len(parts)} columns; expected {columns}")
        rows.append(parts)
    return rows


def _record(
    *,
    topic: str,
    name: str,
    profile: str,
    fields: dict[str, str],
    labels: dict[str, str],
    topic_id: Callable[[str], str],
    condition_id: Callable[[str, str], str],
    clean: Callable[[str], str],
) -> dict[str, Any]:
    tid = topic_id(topic)
    return {
        "id": condition_id(topic, name),
        "topicId": tid,
        "topic": topic,
        "name": clean(name),
        "profile": profile,
        "fields": {key: clean(value) for key, value in fields.items()},
        "labels": labels,
        "search": clean(" ".join([topic, name, *fields.values()])),
    }


def load_biomedical_records(
    *,
    topic_id: Callable[[str], str],
    condition_id: Callable[[str, str], str],
    clean: Callable[[str], str],
) -> list[dict[str, Any]]:
    anatomy_rows = _rows(ANATOMY_SOURCE, 3)
    physiology_rows = _rows(PHYSIOLOGY_SOURCE, 6)
    if len(anatomy_rows) != EXPECTED_ANATOMY:
        raise SystemExit(f"Anatomy source has {len(anatomy_rows)} rows; expected {EXPECTED_ANATOMY}")
    if len(physiology_rows) != EXPECTED_PHYSIOLOGY:
        raise SystemExit(f"Physiology source has {len(physiology_rows)} rows; expected {EXPECTED_PHYSIOLOGY}")

    records: list[dict[str, Any]] = []
    anatomy_labels = {
        "exactAnswer": "Exact high-yield answer",
        "clinicalPattern": "Clinical association / deficit",
        "localisation": "Localisation logic",
        "discriminator": "Discriminator / trap",
        "examUse": "Applied exam use",
    }
    for name, answer, clinical in anatomy_rows:
        fields = {
            "exactAnswer": answer,
            "clinicalPattern": clinical,
            "localisation": f"Anchor the lesion, relation or landmark at {name}; the required anatomical answer is {answer}.",
            "discriminator": f"The decisive separator is the pattern: {clinical}.",
            "examUse": f"Applied spotter sequence: identify {name}, state {answer}, then predict {clinical}.",
        }
        records.append(_record(
            topic=ANATOMY_TOPIC,
            name=name,
            profile="anatomy",
            fields=fields,
            labels=anatomy_labels,
            topic_id=topic_id,
            condition_id=condition_id,
            clean=clean,
        ))

    physiology_labels = {
        "subsystem": "System / subdomain",
        "mechanism": "Core mechanism",
        "clinicalPattern": "Clinical pattern",
        "discriminator": "Discriminator / trap",
        "examUse": "Applied exam use",
    }
    for name, subsystem, mechanism, clinical, discriminator, exam_use in physiology_rows:
        fields = {
            "subsystem": subsystem,
            "mechanism": mechanism,
            "clinicalPattern": clinical,
            "discriminator": discriminator,
            "examUse": exam_use,
        }
        records.append(_record(
            topic=PHYSIOLOGY_TOPIC,
            name=name,
            profile="physiology",
            fields=fields,
            labels=physiology_labels,
            topic_id=topic_id,
            condition_id=condition_id,
            clean=clean,
        ))

    ids = [record["id"] for record in records]
    if len(ids) != len(set(ids)):
        raise SystemExit("Biomedical source produced duplicate condition IDs")
    return records
