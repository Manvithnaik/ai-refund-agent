import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class AgentLog(Base):
    __tablename__ = "agent_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sequence: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="Ordering within a session (1-indexed)"
    )
    event_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment=(
            "request_received | customer_identified | order_lookup | policy_check | "
            "tool_call | tool_result | tool_error | retry_attempt | "
            "refund_approved | refund_denied | agent_response | llm_error | session_ended"
        ),
    )
    tool_name: Mapped[str | None] = mapped_column(
        String(100), nullable=True, comment="Populated for tool_call/tool_result/tool_error events"
    )
    tool_input: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    tool_output: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    message: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="Human-readable description of this event"
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duration_ms: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="How long this step took in milliseconds"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # Relationships
    session: Mapped["AgentSession"] = relationship("AgentSession", back_populates="logs")
