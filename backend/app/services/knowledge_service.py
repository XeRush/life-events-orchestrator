"""Read-only knowledge base (the RAG source for the agent): entity requirements, document lists, sourced fees,
process information and the 120-day rule. Documents are Markdown files with a small front-matter block; they are
cached in Redis. Fees exist only if a document lists them with a source - the agent cannot quote anything else."""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

KB_DIR = Path(__file__).resolve().parents[1] / "knowledge"
FEE_STOPWORDS = {"the", "how", "much", "what", "fee", "fees", "cost", "costs", "price", "pay", "for", "does", "and", "with", "are",
                 "after", "this", "that", "charge", "charges", "amount", "aed", "dirham", "dirhams"}
CACHE_KEY = "kb:documents:v1"


@dataclass
class Fee:
    label: str
    amount: str
    source: str


@dataclass
class KnowledgeDoc:
    id: str
    title: str
    entity: str
    source: str
    body: str
    fees: list[Fee] = field(default_factory=list)


def _parse(path: Path) -> KnowledgeDoc:
    text = path.read_text(encoding="utf-8")
    match = re.match(r"---\n(.*?)\n---\n(.*)", text, re.S)
    meta_raw, body = (match.group(1), match.group(2)) if match else ("", text)
    meta = {}
    for line in meta_raw.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    fees = []
    if meta.get("fees"):
        for chunk in meta["fees"].split(";;"):
            parts = [p.strip() for p in chunk.split("|")]
            if len(parts) == 3:
                fees.append(Fee(*parts))
    return KnowledgeDoc(id=meta.get("id", path.stem), title=meta.get("title", path.stem), entity=meta.get("entity", ""),
                        source=meta.get("source", ""), body=body.strip(), fees=fees)


@lru_cache
def load_documents() -> tuple[KnowledgeDoc, ...]:
    return tuple(_parse(p) for p in sorted(KB_DIR.glob("*.md")))


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 2}


def sourced_amounts() -> set[str]:
    """Every AED figure that appears in a sourced fee. Anything else the agent says about money is unsourced."""
    out: set[str] = set()
    for doc in load_documents():
        for fee in doc.fees:
            out.update(re.findall(r"\d+", fee.amount))
    return out


class KnowledgeService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def documents(self) -> list[dict[str, Any]]:
        cached = await self.c.infra.cache.get(CACHE_KEY)
        if cached:
            return cached
        docs = [asdict(d) for d in load_documents()]
        await self.c.infra.cache.set(CACHE_KEY, docs, ttl=3600)
        return docs

    async def get(self, doc_id: str) -> dict[str, Any] | None:
        return next((d for d in await self.documents() if d["id"] == doc_id), None)

    async def search(self, query: str, limit: int = 3) -> list[dict[str, Any]]:
        q = _tokens(query)
        scored = []
        for d in await self.documents():
            score = len(q & _tokens(d["title"])) * 3 + len(q & _tokens(d["body"])) + len(q & _tokens(d["entity"])) * 2
            if score:
                scored.append((score, d))
        return [d for _, d in sorted(scored, key=lambda x: -x[0])[:limit]]

    async def fee_for(self, query: str) -> dict[str, Any] | None:
        """A fee only if the question names what the fee is for (e.g. 'MOFA attestation'). 'Visa fee' finds nothing,
        because no visa fee is in the sources - the agent then says so instead of quoting a neighbouring figure."""
        q = _tokens(query) - FEE_STOPWORDS
        best = None
        for d in await self.documents():
            for fee in d["fees"]:
                score = len(q & (_tokens(fee["label"]) - FEE_STOPWORDS))
                if score and (best is None or score > best[0]):
                    best = (score, fee)
        return best[1] if best else None
