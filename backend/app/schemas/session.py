import uuid
from datetime import datetime
from pydantic import BaseModel


class AgentSessionOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID | None
    status: str
    summary: str | None
    started_at: datetime
    ended_at: datetime | None

    model_config = {"from_attributes": True}


class AgentSessionWithLogs(AgentSessionOut):
    logs: list["AgentLogOut"] = []
