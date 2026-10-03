from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKey, enum_type
from app.models.enums import OrganizationKind


class Organization(UUIDPrimaryKey, TimestampMixin, Base):
    """A service centre (e.g. an Amer centre) whose officers handle cases, or the platform operator."""

    __tablename__ = "organizations"

    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[OrganizationKind] = mapped_column(enum_type(OrganizationKind), default=OrganizationKind.SERVICE_CENTRE)
    emirate: Mapped[str] = mapped_column(String(20), default="DUBAI")
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
