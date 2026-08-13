import asyncio
import logging
from app.database import engine, Base
import app.models  # Ensure all models are registered

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def init_db():
    logger.info("Connecting to Neon PostgreSQL and creating database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("✅ All tables created successfully in Neon PostgreSQL!")


if __name__ == "__main__":
    asyncio.run(init_db())
