from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class RefundPolicy(Base):
    __tablename__ = "refund_policy"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, default=1, comment="Always 1 — single policy row"
    )
    version: Mapped[str] = mapped_column(String(20), nullable=False, default="v1.0")
    rules: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        comment="Structured policy rules object",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
