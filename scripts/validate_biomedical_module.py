#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANATOMY = ROOT / "data_sources" / "biomedical-anatomy.tsv"
PHYSIOLOGY = ROOT / "data_sources" / "biomedical-physiology.tsv"
DATA = ROOT / "data" / "conditions.json"
APP = ROOT / "v2" / "app.html"

EXPECTED_ANATOMY = 139
EXPECTED_PHYSIOLOGY = 190
EXPECTED_TOTAL = 813
EXPECTED_TOPICS = 25

ANATOMY_SENTINELS = {
    "Surgical neck humerus",
    "Tarsal tunnel contents",
    "Cavernous sinus contents",
    "Epidural needle layers",
    "Dural sac",
    "Parotid duct",
    "Ulnar nerve lesion",
}

PHYSIOLOGY_SENTINELS = {
    "TACS/TACI syndrome",
    "PACS/PACI syndrome",
    "LACS/LACI syndrome",
    "POCS/POCI syndrome",
    "RCA versus circumflex in inferior STEMI",
    "Posterior myocardial infarction",
    "Right ventricular infarction",
    "Wellens pattern",
    "De Winter pattern",
    "AV-node blood supply",
    "Oxygen-induced hypercapnia in COPD",
    "Winter’s formula",
}


def read_tsv(path: Path, columns: int) -> list[list[str]]:
    rows: list[list[str]] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = [part.strip() for part in line.split("\t")]
        if len(parts) != columns:
            raise SystemExit(f"{path.name}:{number}: {len(parts)} columns; expected {columns}")
        if any(not part for part in parts):
            raise SystemExit(f"{path.name}:{number}: blank required field")
        rows.append(parts)
    return rows


def assert_unique_names(rows: list[list[str]], label: str) -> None:
    names = [row[0].casefold() for row in rows]
    if len(names) != len(set(names)):
        duplicates = sorted({name for name in names if names.count(name) > 1})
        raise SystemExit(f"Duplicate {label} names: {duplicates}")


def require_sentinels(rows: list[list[str]], required: set[str], label: str) -> None:
    names = {row[0] for row in rows}
    missing = sorted(required - names)
    if missing:
        raise SystemExit(f"Missing required {label} concepts: {missing}")


def validate_app_order() -> None:
    html = APP.read_text(encoding="utf-8")
    required = [
        "biomedical.css",
        "ai-schema.js",
        "biomedical-ai.js",
        "ai-engine.js",
        "biomedical.js",
    ]
    for item in required:
        if item not in html:
            raise SystemExit(f"v2/app.html does not load {item}")
    if not (
        html.index("ai-schema.js")
        < html.index("biomedical-ai.js")
        < html.index("ai-engine.js")
    ):
        raise SystemExit("Biomedical AI profile layer is loaded in the wrong order")


def validate_generated_data() -> dict[str, object]:
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_v2_data.py")], check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "normalise_v2_data.py")], check=True)
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    conditions = payload["conditions"]
    anatomy = [item for item in conditions if item.get("profile") == "anatomy"]
    physiology = [item for item in conditions if item.get("profile") == "physiology"]

    if payload.get("conditionCount") != EXPECTED_TOTAL:
        raise SystemExit(f"Generated total is {payload.get('conditionCount')}; expected {EXPECTED_TOTAL}")
    if payload.get("topicCount") != EXPECTED_TOPICS:
        raise SystemExit(f"Generated topic count is {payload.get('topicCount')}; expected {EXPECTED_TOPICS}")
    if len(anatomy) != EXPECTED_ANATOMY:
        raise SystemExit(f"Generated anatomy count is {len(anatomy)}; expected {EXPECTED_ANATOMY}")
    if len(physiology) != EXPECTED_PHYSIOLOGY:
        raise SystemExit(f"Generated physiology count is {len(physiology)}; expected {EXPECTED_PHYSIOLOGY}")

    topic_counts = {topic["name"]: topic["count"] for topic in payload["topics"]}
    if topic_counts.get("Clinical Anatomy") != EXPECTED_ANATOMY:
        raise SystemExit("Clinical Anatomy topic count is incorrect")
    if topic_counts.get("Clinical Physiology") != EXPECTED_PHYSIOLOGY:
        raise SystemExit("Clinical Physiology topic count is incorrect")

    ids = [item["id"] for item in conditions]
    if len(ids) != len(set(ids)):
        raise SystemExit("Generated dataset contains duplicate IDs")
    for item in anatomy + physiology:
        if len(item.get("fields", {})) != 5:
            raise SystemExit(f"{item['name']} does not have exactly five fields")
        if len(item.get("labels", {})) != 5:
            raise SystemExit(f"{item['name']} does not have exactly five labels")
        if not item.get("search"):
            raise SystemExit(f"{item['name']} has no search text")

    generated_anatomy_names = {item["name"] for item in anatomy}
    generated_physiology_names = {item["name"] for item in physiology}
    if not ANATOMY_SENTINELS <= generated_anatomy_names:
        raise SystemExit("One or more anatomy sentinels were lost during build")
    if not PHYSIOLOGY_SENTINELS <= generated_physiology_names:
        raise SystemExit("One or more physiology sentinels were lost during build")

    return {
        "totalCards": len(conditions),
        "topics": payload["topicCount"],
        "anatomyCards": len(anatomy),
        "physiologyCards": len(physiology),
        "biomedicalCards": len(anatomy) + len(physiology),
        "schemaVersion": payload.get("schemaVersion"),
        "biomedicalSourceDigest": payload.get("biomedicalSourceDigest"),
    }


def main() -> None:
    anatomy_rows = read_tsv(ANATOMY, 3)
    physiology_rows = read_tsv(PHYSIOLOGY, 6)
    if len(anatomy_rows) != EXPECTED_ANATOMY:
        raise SystemExit(f"Anatomy source has {len(anatomy_rows)} rows; expected {EXPECTED_ANATOMY}")
    if len(physiology_rows) != EXPECTED_PHYSIOLOGY:
        raise SystemExit(f"Physiology source has {len(physiology_rows)} rows; expected {EXPECTED_PHYSIOLOGY}")
    assert_unique_names(anatomy_rows, "anatomy")
    assert_unique_names(physiology_rows, "physiology")
    require_sentinels(anatomy_rows, ANATOMY_SENTINELS, "anatomy")
    require_sentinels(physiology_rows, PHYSIOLOGY_SENTINELS, "physiology")
    validate_app_order()
    result = validate_generated_data()
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
