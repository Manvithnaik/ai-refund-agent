import asyncio
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete
from app.database import AsyncSessionLocal
from app.models.customer import Customer
from app.models.order import Order
from app.models.policy import RefundPolicy
from app.models.refund import RefundRequest
from app.models.session import AgentSession
from app.models.log import AgentLog

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Standard anchor date (now)
NOW = datetime.now(timezone.utc)

CUSTOMERS_DATA = [
    {
        "email": "aarav@example.com",
        "name": "Aarav Sharma",
        "phone": "+91-98765-01001",
        "metadata_": {"tier": "VIP", "notes": "Frequent buyer"},
        "order": {
            "order_number": "ORD-1001",
            "product_name": "Pro Wireless Noise-Cancelling Headphones",
            "category": "electronics",
            "amount": 14999.00,
            "status": "delivered",
            "is_final_sale": False,
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=14),
            "delivered_at": NOW - timedelta(days=10),  # 10 days ago (within 30 days -> APPROVED)
        },
    },
    {
        "email": "ananya@example.com",
        "name": "Ananya Verma",
        "phone": "+91-98765-01002",
        "metadata_": {"tier": "Standard"},
        "order": {
            "order_number": "ORD-1002",
            "product_name": "Mechanical RGB Gaming Keyboard",
            "category": "electronics",
            "amount": 4999.00,
            "status": "delivered",
            "is_final_sale": False,
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=50),
            "delivered_at": NOW - timedelta(days=45),  # 45 days ago (> 30 days -> DENIED: EXPIRED)
        },
    },
    {
        "email": "rajesh@example.com",
        "name": "Rajesh Patel",
        "phone": "+91-98765-01003",
        "metadata_": {"tier": "Standard"},
        "order": {
            "order_number": "ORD-1003",
            "product_name": "Clearance Designer Silk Kurta",
            "category": "clothing",
            "amount": 2499.00,
            "status": "delivered",
            "is_final_sale": True,  # Final Sale -> DENIED: FINAL SALE
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=12),
            "delivered_at": NOW - timedelta(days=8),
        },
    },
    {
        "email": "priya@example.com",
        "name": "Priya Nair",
        "phone": "+91-98765-01004",
        "metadata_": {"tier": "Standard"},
        "order": {
            "order_number": "ORD-1004",
            "product_name": "Custom Engraved Monogram Leather Wallet",
            "category": "accessories",
            "amount": 1899.00,
            "status": "delivered",
            "is_final_sale": False,
            "is_personalized": True,  # Personalized -> DENIED: PERSONALIZED
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=10),
            "delivered_at": NOW - timedelta(days=7),
        },
    },
    {
        "email": "rohan@example.com",
        "name": "Rohan Gupta",
        "phone": "+91-98765-01005",
        "metadata_": {"tier": "Gold"},
        "order": {
            "order_number": "ORD-1005",
            "product_name": "Waterproof All-Weather Jacket",
            "category": "clothing",
            "amount": 3499.00,
            "status": "delivered",
            "is_final_sale": False,
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=15),
            "delivered_at": NOW - timedelta(days=12),
            "already_refunded": True,  # Already Refunded -> DENIED: DUPLICATE
        },
    },
    {
        "email": "meera@example.com",
        "name": "Meera Joshi",
        "phone": "+91-98765-01006",
        "metadata_": {"tier": "Standard"},
        "order": {
            "order_number": "ORD-1006",
            "product_name": "Python Data Science Video Course Pass",
            "category": "digital",  # Digital Category -> DENIED: RESTRICTED CATEGORY
            "amount": 1299.00,
            "status": "delivered",
            "is_final_sale": False,
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=5),
            "delivered_at": NOW - timedelta(days=5),
        },
    },
    {
        "email": "vikram@example.com",
        "name": "Vikram Malhotra",
        "phone": "+91-98765-01007",
        "metadata_": {"tier": "Standard"},
        "order": {
            "order_number": "ORD-1007",
            "product_name": "Ultralight Pro Trail Running Shoes",
            "category": "clothing",
            "amount": 6999.00,
            "status": "shipped",  # Not Delivered Yet -> DENIED: STATUS SHIPPED
            "is_final_sale": False,
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=3),
            "delivered_at": None,
        },
    },
    {
        "email": "sneha@example.com",
        "name": "Sneha Kulkarni",
        "phone": "+91-98765-01008",
        "metadata_": {"tier": "VIP"},
        "order": {
            "order_number": "ORD-1008",
            "product_name": "4K Ultra HD IPS Monitor 27-inch",
            "category": "electronics",
            "amount": 28999.00,
            "status": "delivered",
            "is_final_sale": False,
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=20),
            "delivered_at": NOW - timedelta(days=16),  # 16 days ago -> APPROVED
        },
    },
    {
        "email": "devansh@example.com",
        "name": "Devansh Mehta",
        "phone": "+91-98765-01009",
        "metadata_": {"tier": "Standard"},
        "order": {
            "order_number": "ORD-1009",
            "product_name": "Gourmet Festive Sweets & Dry Fruits Basket",
            "category": "food",  # Food Category -> DENIED: RESTRICTED CATEGORY
            "amount": 1999.00,
            "status": "delivered",
            "is_final_sale": False,
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=6),
            "delivered_at": NOW - timedelta(days=4),
        },
    },
    {
        "email": "kavya@example.com",
        "name": "Kavya Reddy",
        "phone": "+91-98765-01010",
        "metadata_": {"tier": "Standard"},
        "order": {
            "order_number": "ORD-1010",
            "product_name": "Pure Merino Wool Handcrafted Shawl",
            "category": "clothing",
            "amount": 3299.00,
            "status": "delivered",
            "is_final_sale": False,
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=25),
            "delivered_at": NOW - timedelta(days=20),  # 20 days ago -> APPROVED
        },
    },
    {
        "email": "siddharth@example.com",
        "name": "Siddharth Rao",
        "phone": "+91-98765-01011",
        "metadata_": {"tier": "Standard"},
        "order": {
            "order_number": "ORD-1011",
            "product_name": "Compact Mirrorless 4K Vlog Camera",
            "category": "electronics",
            "amount": 45999.00,
            "status": "delivered",
            "is_final_sale": False,
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=35),
            "delivered_at": NOW - timedelta(days=31),  # 31 days ago (Just expired -> DENIED)
        },
    },
    {
        "email": "pooja@example.com",
        "name": "Pooja Kapoor",
        "phone": "+91-98765-01012",
        "metadata_": {"tier": "Silver"},
        "order": {
            "order_number": "ORD-1012",
            "product_name": "Active Noise Cancelling TWS Earbuds",
            "category": "electronics",
            "amount": 8999.00,
            "status": "delivered",
            "is_final_sale": False,
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=30),
            "delivered_at": NOW - timedelta(days=28),  # 28 days ago (Just inside window -> APPROVED)
        },
    },
    {
        "email": "ishaan@example.com",
        "name": "Ishaan Bhat",
        "phone": "+91-98765-01013",
        "metadata_": {"tier": "Standard"},
        "order": {
            "order_number": "ORD-1013",
            "product_name": "Refurbished AMOLED Smart Watch (Clearance)",
            "category": "electronics",
            "amount": 9999.00,
            "status": "delivered",
            "is_final_sale": True,  # Final Sale -> DENIED
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=10),
            "delivered_at": NOW - timedelta(days=7),
        },
    },
    {
        "email": "simran@example.com",
        "name": "Simran Gill",
        "phone": "+91-98765-01014",
        "metadata_": {"tier": "VIP"},
        "order": {
            "order_number": "ORD-1014",
            "product_name": "Ergonomic Mesh High-Back Office Chair",
            "category": "furniture",
            "amount": 18499.00,
            "status": "delivered",
            "is_final_sale": False,
            "is_personalized": False,
            "is_customer_damaged": False,
            "purchased_at": NOW - timedelta(days=15),
            "delivered_at": NOW - timedelta(days=11),  # 11 days ago -> APPROVED
        },
    },
    {
        "email": "arjun@example.com",
        "name": "Arjun Iyer",
        "phone": "+91-98765-01015",
        "metadata_": {"tier": "Standard"},
        "order": {
            "order_number": "ORD-1015",
            "product_name": "Automatic Espresso Coffee Machine",
            "category": "appliances",
            "amount": 14500.00,
            "status": "delivered",
            "is_final_sale": False,
            "is_personalized": False,
            "is_customer_damaged": True,  # Customer Damaged -> DENIED
            "purchased_at": NOW - timedelta(days=18),
            "delivered_at": NOW - timedelta(days=14),
        },
    },
]

POLICY_RULES = {
    "version": "v1.0",
    "refund_window_days": 30,
    "eligible_statuses": ["delivered"],
    "restricted_categories": ["food", "digital"],
    "final_sale_refundable": False,
    "personalized_refundable": False,
    "customer_damage_refundable": False,
    "max_refund_amount": None,
    "summary": (
        "Refunds are accepted within 30 days of delivery for eligible items in 'delivered' status. "
        "Final sale, custom/personalized, food, and digital items are strictly non-refundable. "
        "Customer-damaged items are not eligible."
    ),
}


async def seed_database():
    logger.info("Starting database seeding...")
    async with AsyncSessionLocal() as session:
        # Clear existing data in reverse order of foreign keys
        await session.execute(delete(AgentLog))
        await session.execute(delete(RefundRequest))
        await session.execute(delete(AgentSession))
        await session.execute(delete(Order))
        await session.execute(delete(Customer))
        await session.execute(delete(RefundPolicy))
        await session.commit()

        # 1. Seed Refund Policy
        policy = RefundPolicy(id=1, version="v1.0", rules=POLICY_RULES)
        session.add(policy)
        await session.flush()
        logger.info("✅ Refund Policy seeded.")

        # 2. Seed 15 Customers and Orders
        for cdata in CUSTOMERS_DATA:
            customer = Customer(
                name=cdata["name"],
                email=cdata["email"],
                phone=cdata["phone"],
                metadata_=cdata["metadata_"],
            )
            session.add(customer)
            await session.flush()

            odata = cdata["order"]
            order = Order(
                customer_id=customer.id,
                order_number=odata["order_number"],
                product_name=odata["product_name"],
                category=odata["category"],
                amount=odata["amount"],
                currency="USD",
                status=odata["status"],
                is_final_sale=odata["is_final_sale"],
                is_personalized=odata["is_personalized"],
                is_customer_damaged=odata["is_customer_damaged"],
                purchased_at=odata["purchased_at"],
                delivered_at=odata["delivered_at"],
            )
            session.add(order)
            await session.flush()

            # If marked already refunded, add an approved refund request
            if odata.get("already_refunded"):
                refund_req = RefundRequest(
                    order_id=order.id,
                    customer_id=customer.id,
                    status="approved",
                    refund_amount=odata["amount"],
                    denial_reason=None,
                    policy_snapshot=POLICY_RULES,
                    resolved_at=NOW - timedelta(days=10),
                )
                session.add(refund_req)

        await session.commit()
        logger.info("✅ 15 Customers and Orders seeded successfully!")


if __name__ == "__main__":
    asyncio.run(seed_database())
