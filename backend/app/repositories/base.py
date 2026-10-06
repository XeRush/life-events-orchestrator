"""Generic data-access helpers. Repositories own queries; services own decisions."""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base


class Repository[M: Base]:
    model: type[M]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, id_: uuid.UUID) -> M | None:
        return await self.session.get(self.model, id_)

    def add(self, obj: M) -> M:
        self.session.add(obj)
        return obj

    async def flush(self) -> None:
        await self.session.flush()

    async def scalars(self, query: Select[Any]) -> Sequence[M]:
        return (await self.session.scalars(query)).all()

    async def first(self, query: Select[Any]) -> M | None:
        return await self.session.scalar(query.limit(1))

    async def count(self, query: Select[Any]) -> int:
        return int(await self.session.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0)

    async def page(self, query: Select[Any], *, limit: int = 50, offset: int = 0) -> tuple[Sequence[M], int]:
        total = await self.count(query)
        items = (await self.session.scalars(query.limit(limit).offset(offset))).all()
        return items, total
