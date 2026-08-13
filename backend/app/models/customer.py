import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column(
        "metadata", JSON, nullable=True, comment="loyalty tier, notes, etc."
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="customer")
    sessions: Mapped[list["AgentSession"]] = relationship("AgentSession", back_populates="customer")
    refund_requests: Mapped[list["RefundRequest"]] = relationship("RefundRequest", back_populates="customer")
