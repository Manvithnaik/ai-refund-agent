import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.order import Order


class OrderService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_number(self, order_number: str, customer_id: uuid.UUID | None = None) -> Order | None:
        query = select(Order).where(Order.order_number == order_number.upper().strip())
        if customer_id:
            query = query.where(Order.customer_id == customer_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_id(self, order_id: uuid.UUID) -> Order | None:
        result = await self.db.execute(
            select(Order).where(Order.id == order_id)
        )
        return result.scalar_one_or_none()

    async def get_by_customer(self, customer_id: uuid.UUID) -> list[Order]:
        result = await self.db.execute(
            select(Order)
            .where(Order.customer_id == customer_id)
            .order_by(Order.purchased_at.desc())
        )
        return list(result.scalars().all())
