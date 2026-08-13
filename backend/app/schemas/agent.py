import uuid
from typing import Literal
from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    session_id: uuid.UUID | None = None


class ChatResponse(BaseModel):
    session_id: uuid.UUID
    message: str
    is_complete: bool = False
    # Structured decision — backend is the authoritative source of truth.
    # Frontend must use this field; never parse the LLM message text.
    decision: Literal["approved", "denied", "no_action", "error"] = "no_action"
    reason: str | None = None        # e.g. "already_refunded", "eligible"
    refund_id: str | None = None     # set when decision == "approved"
    refund_amount: float | None = None  # set when decision == "approved"


class LogEntry(BaseModel):
    event_type: str
    tool_name: str | None = None
    tool_input: dict | None = None
    tool_output: dict | None = None
    message: str | None = None
    error_message: str | None = None
    retry_count: int = 0
    duration_ms: int | None = None
