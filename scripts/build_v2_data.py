#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from hashlib import sha1
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "index.html"
OUTPUT = ROOT / "data" / "conditions.json"


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def slug(value: str, limit: int = 42) -> str:
    text = clean(value).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return (text or "item")[:limit]


def fnv1a_base36(value: str) -> str:
    result = 2166136261
    for ch in value:
        result ^= ord(ch)
        result = (result * 16777619) & 0xFFFFFFFF
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    if result == 0:
        encoded = "0"
    else:
        chars = []
        while result:
            result, remainder = divmod(result, 36)
            chars.append(alphabet[remainder])
        encoded = "".join(reversed(chars))
    return encoded.rjust(7, "0")[-7:]


def topic_id(name: str) -> str:
    return f"topic-{slug(name)}-{fnv1a_base36(name)}"


def condition_id(topic: str, name: str) -> str:
    tid = topic_id(topic)
    return f"{tid}-{slug(name)}-{fnv1a_base36(f'{tid}|{name}')}"


@dataclass
class Card:
    topic: str
    name: str = ""
    fields: dict[str, str] = field(default_factory=dict)
    profile: str = "clinical"


class ConditionsParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.section_depth = 0
        self.current_topic = ""
        self.in_h2 = False
        self.h2_parts: list[str] = []
        self.current_card: Card | None = None
        self.in_summary = False
        self.summary_parts: list[str] = []
        self.in_li = False
        self.li_parts: list[str] = []
        self.in_label = False
        self.label_parts: list[str] = []
        self.cards: list[Card] = []

    @staticmethod
    def attrs_dict(attrs: list[tuple[str, str | None]]) -> dict[str, str]:
        return {key: value or "" for key, value in attrs}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = self.attrs_dict(attrs)
        classes = set(data.get("class", "").split())
        if tag == "section" and "section" in classes:
            self.section_depth += 1
            self.current_topic = ""
        elif self.section_depth and tag == "h2":
            self.in_h2 = True
            self.h2_parts = []
        elif self.section_depth and tag == "details" and "card" in classes:
            self.current_card = Card(topic=self.current_topic, profile=data.get("data-ai-profile") or "clinical")
        elif self.current_card and tag == "summary":
            self.in_summary = True
            self.summary_parts = []
        elif self.current_card and tag == "li":
            self.in_li = True
            self.li_parts = []
            self.label_parts = []
        elif self.in_li and tag == "span" and "label" in classes:
            self.in_label = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "h2" and self.in_h2:
            self.current_topic = clean("".join(self.h2_parts).replace("inferred", ""))
            self.in_h2 = False
        elif tag == "summary" and self.in_summary:
            if self.current_card:
                self.current_card.name = clean("".join(self.summary_parts))
            self.in_summary = False
        elif tag == "span" and self.in_label:
            self.in_label = False
        elif tag == "li" and self.in_li:
            if self.current_card:
                label = clean("".join(self.label_parts)).rstrip(":")
                full = clean("".join(self.li_parts))
                if label and full.lower().startswith(label.lower()):
                    value = clean(full[len(label):].lstrip(": "))
                else:
                    value = full
                if label and value:
                    self.current_card.fields[label] = value
            self.in_li = False
        elif tag == "details" and self.current_card:
            if self.current_card.topic and self.current_card.name and self.current_card.fields:
                self.cards.append(self.current_card)
            self.current_card = None
        elif tag == "section" and self.section_depth:
            self.section_depth -= 1
            if not self.section_depth:
                self.current_topic = ""

    def handle_data(self, data: str) -> None:
        if self.in_h2:
            self.h2_parts.append(data)
        if self.in_summary:
            self.summary_parts.append(data)
        if self.in_li:
            self.li_parts.append(data)
        if self.in_label:
            self.label_parts.append(data)


def load_js_array(path: Path, variable: str) -> list[dict[str, Any]]:
    js = r"""
const fs = require('fs');
const vm = require('vm');
const path = process.argv[1];
const variable = process.argv[2];
const src = fs.readFileSync(path, 'utf8');
const marker = 'const ' + variable + '=';
const start = src.indexOf(marker);
if (start < 0) throw new Error('Missing ' + variable);
let i = src.indexOf('[', start);
let depth = 0, quote = '', escape = false, end = -1;
for (; i < src.length; i++) {
  const ch = src[i];
  if (quote) {
    if (escape) escape = false;
    else if (ch === '\\') escape = true;
    else if (ch === quote) quote = '';
    continue;
  }
  if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
  if (ch === '[') depth++;
  if (ch === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end < 0) throw new Error('Unclosed array ' + variable);
const value = vm.runInNewContext(src.slice(src.indexOf('[', start), end));
process.stdout.write(JSON.stringify(value));
"""
    completed = subprocess.run(
        ["node", "-e", js, str(path), variable],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def normalise_clinical_fields(fields: dict[str, str]) -> tuple[dict[str, str], dict[str, str]]:
    aliases = {
        "Ix": "investigations",
        "Tx": "treatment",
        "Escalate": "escalation",
        "Mimics": "mimics",
        "Red flags": "redFlags",
    }
    result = {aliases[key]: value for key, value in fields.items() if key in aliases and value}
    labels = {
        "investigations": "Investigations",
        "treatment": "Treatment",
        "escalation": "Escalation",
        "mimics": "Mimics",
        "redFlags": "Red flags",
    }
    return result, labels


def law_record(item: dict[str, str]) -> dict[str, Any]:
    topic = "Ward law, ethics and professional practice"
    name = clean(item["t"])
    fields = {
        "recognise": clean(item["r"]),
        "rule": clean(item["l"]),
        "act": clean(item["a"]),
        "record": clean(item["e"]),
        "avoid": clean(item["v"]),
    }
    return {
        "id": condition_id(topic, name),
        "topicId": topic_id(topic),
        "topic": topic,
        "name": name,
        "profile": "law",
        "fields": fields,
        "labels": {
            "recognise": "Recognise",
            "rule": "Legal / professional rule",
            "act": "Act",
            "record": "Record / escalate",
            "avoid": "Avoid",
        },
        "search": clean(" ".join([topic, name, *fields.values()])),
    }


def main() -> int:
    if not SOURCE.exists():
        raise SystemExit(f"Missing {SOURCE}")
    parser = ConditionsParser()
    parser.feed(SOURCE.read_text(encoding="utf-8"))

    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for card in parser.cards:
        fields, labels = normalise_clinical_fields(card.fields)
        if len(fields) < 3:
            continue
        cid = condition_id(card.topic, card.name)
        if cid in seen:
            continue
        seen.add(cid)
        records.append({
            "id": cid,
            "topicId": topic_id(card.topic),
            "topic": card.topic,
            "name": card.name,
            "profile": "clinical",
            "fields": fields,
            "labels": labels,
            "search": clean(" ".join([card.topic, card.name, *fields.values()])),
        })

    for path, variable in [
        (ROOT / "ward-law-topic.js", "scenarios"),
        (ROOT / "ward-law-extra-scenarios.js", "extras"),
    ]:
        if path.exists():
            for item in load_js_array(path, variable):
                record = law_record(item)
                if record["id"] not in seen:
                    seen.add(record["id"])
                    records.append(record)

    records.sort(key=lambda item: (item["topic"].casefold(), item["name"].casefold()))
    topics: dict[str, dict[str, Any]] = {}
    for record in records:
        current = topics.setdefault(record["topicId"], {
            "id": record["topicId"],
            "name": record["topic"],
            "count": 0,
        })
        current["count"] += 1

    payload = {
        "schemaVersion": "ukmla-v2-data-1",
        "generatedFrom": ["index.html", "ward-law-topic.js", "ward-law-extra-scenarios.js"],
        "sourceDigest": sha1(SOURCE.read_bytes()).hexdigest(),
        "conditionCount": len(records),
        "topicCount": len(topics),
        "topics": sorted(topics.values(), key=lambda item: item["name"].casefold()),
        "conditions": records,
    }
    if len(records) < 480:
        raise SystemExit(f"Refusing to build: only {len(records)} conditions were extracted")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Extracted {len(records)} conditions across {len(topics)} topics -> {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
