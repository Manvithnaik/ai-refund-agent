import uuid
from datetime import datetime
from pydantic import BaseModel


class OrderOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    order_number: str
    product_name: str
    category: str
    amount: float
    currency: str
    status: str
    is_final_sale: bool
    is_personalized: bool
    is_customer_damaged: bool
    purchased_at: datetime
    delivered_at: datetime | None

    model_config = {"from_attributes": True}
