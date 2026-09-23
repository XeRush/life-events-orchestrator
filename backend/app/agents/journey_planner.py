"""Journey planning: graph layering, life-event detection and date extraction from utterances."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta


def topological_layers(dependencies: dict[str, list[str]]) -> dict[str, int]:
    """Layer index per node (longest path from a root). Nodes in the same layer can run in parallel."""
    layers: dict[str, int] = {}
    visiting: set[str] = set()

    def visit(key: str) -> int:
        if key in layers:
            return layers[key]
        if key in visiting:
            raise ValueError(f"Cycle detected at {key}")
        visiting.add(key)
        layers[key] = 1 + max((visit(d) for d in dependencies.get(key, [])), default=-1)
        visiting.discard(key)
        return layers[key]

    for key in dependencies:
        visit(key)
    return layers


def parallel_groups(dependencies: dict[str, list[str]]) -> list[list[str]]:
    layers = topological_layers(dependencies)
    grouped: dict[int, list[str]] = {}
    for key, layer in layers.items():
        grouped.setdefault(layer, []).append(key)
    return [sorted(grouped[i]) for i in sorted(grouped)]


@dataclass
class DetectedEvent:
    event_type: str
    confidence: float
    participants: list[dict[str, str]]
    event_date: date | None


_KEYWORDS: dict[str, list[str]] = {
    "BIRTH": ["born", "birth", "baby", "newborn", "gave birth", "ولدت", "مولود", "ابنتي", "ابني", "طفل"],
    "MARRIAGE": ["married", "marriage", "wedding", "getting married", "زواج", "تزوجت"],
    "MOVE": ["moved", "moving", "new address", "relocat", "انتقلت"],
    "BUSINESS_START": ["start a business", "starting a business", "new business", "open a company", "مشروع"],
}
_RELATIONS = {"daughter": "girl", "son": "boy", "baby": "child", "child": "child", "ابنتي": "girl", "ابني": "boy"}


def extract_date(text: str, today: date) -> date | None:
    lowered = text.lower()
    if "yesterday" in lowered or "أمس" in lowered:
        return today - timedelta(days=1)
    if "today" in lowered or "this morning" in lowered or "اليوم" in lowered:
        return today
    match = re.search(r"(\d+|one|two|three|four|five|six|seven)\s+days?\s+ago", lowered)
    if match:
        words = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7}
        raw = match.group(1)
        return today - timedelta(days=int(raw) if raw.isdigit() else words[raw])
    if "last night" in lowered:
        return today - timedelta(days=1)
    return None


def detect_life_event(text: str, today: date) -> DetectedEvent | None:
    lowered = text.lower()
    best: tuple[str, int] | None = None
    for event_type, words in _KEYWORDS.items():
        hits = sum(1 for w in words if w in lowered)
        if hits and (best is None or hits > best[1]):
            best = (event_type, hits)
    if not best:
        return None
    participants = [{"role": "parent", "name": "Resident"}]
    if best[0] == "BIRTH":
        child = next((rel for rel in _RELATIONS if rel in lowered), None)
        participants.append({"role": "child", "relationship": child or "child", "name": "Newborn"})
    return DetectedEvent(best[0], min(1.0, 0.5 + 0.25 * best[1]), participants, extract_date(text, today))
