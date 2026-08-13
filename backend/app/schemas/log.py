import uuid
from datetime import datetime
from pydantic import BaseModel


class AgentLogOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    sequence: int
    event_type: str
    tool_name: str | None
    tool_input: dict | None
    tool_output: dict | None
    message: str | None
    error_message: str | None
    retry_count: int
    duration_ms: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
