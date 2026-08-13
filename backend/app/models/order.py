import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Numeric, Boolean, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="electronics, clothing, food, digital, personalized, accessories",
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="delivered, shipped, processing, cancelled",
    )
    is_final_sale: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_personalized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_customer_damaged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="orders")
    refund_requests: Mapped[list["RefundRequest"]] = relationship(
        "RefundRequest", back_populates="order"
    )
