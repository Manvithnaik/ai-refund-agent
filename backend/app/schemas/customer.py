import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr


class CustomerCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    metadata_: dict | None = None


class CustomerOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
