import uuid
from datetime import datetime
from pydantic import BaseModel


class EligibilityResult(BaseModel):
    eligible: bool
    reason: str
    policy_rules_applied: list[str]
    order_id: uuid.UUID | None = None


class RefundRequestOut(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    customer_id: uuid.UUID
    session_id: uuid.UUID | None
    status: str
    denial_reason: str | None
    refund_amount: float | None
    policy_snapshot: dict | None
    requested_at: datetime
    resolved_at: datetime | None

    model_config = {"from_attributes": True}
