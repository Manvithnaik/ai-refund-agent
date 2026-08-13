import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class AgentSession(Base):
    __tablename__ = "agent_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Null until customer is identified by the agent",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        nullable=False,
        comment="active, completed, error",
    )
    outcome: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        comment="approved, denied, no_action, error — refund decision outcome",
    )
    summary: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="Brief summary of what happened in the session"
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    customer: Mapped["Customer | None"] = relationship("Customer", back_populates="sessions")
    logs: Mapped[list["AgentLog"]] = relationship(
        "AgentLog", back_populates="session", order_by="AgentLog.sequence"
    )
    refund_requests: Mapped[list["RefundRequest"]] = relationship(
        "RefundRequest", back_populates="session"
    )
