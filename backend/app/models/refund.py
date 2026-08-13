import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Numeric, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class RefundRequest(Base):
    __tablename__ = "refund_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        comment="pending, approved, denied",
    )
    denial_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    refund_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    policy_snapshot: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Snapshot of policy rules applied at time of decision",
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    order: Mapped["Order"] = relationship("Order", back_populates="refund_requests")
    customer: Mapped["Customer"] = relationship("Customer", back_populates="refund_requests")
    session: Mapped["AgentSession"] = relationship("AgentSession", back_populates="refund_requests")
