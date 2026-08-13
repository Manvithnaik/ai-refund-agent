from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.customer import Customer


class CustomerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_by_email(self, email: str) -> Customer | None:
        result = await self.db.execute(
            select(Customer).where(Customer.email == email.lower().strip())
        )
        return result.scalar_one_or_none()

    async def find_by_name(self, name: str) -> Customer | None:
        """Case-insensitive partial name match."""
        result = await self.db.execute(
            select(Customer).where(Customer.name.ilike(f"%{name.strip()}%"))
        )
        customers = result.scalars().all()
        # Return exact match if possible, otherwise first partial
        for c in customers:
            if c.name.lower() == name.lower().strip():
                return c
        return customers[0] if customers else None

    async def find_by_identifier(
        self, identifier: str, identifier_type: str
    ) -> Customer | None:
        """Route to email or name lookup based on identifier_type."""
        if identifier_type == "email":
            return await self.find_by_email(identifier)
        elif identifier_type == "name":
            return await self.find_by_name(identifier)
        return None

    async def get_by_id(self, customer_id) -> Customer | None:
        result = await self.db.execute(
            select(Customer).where(Customer.id == customer_id)
        )
        return result.scalar_one_or_none()
