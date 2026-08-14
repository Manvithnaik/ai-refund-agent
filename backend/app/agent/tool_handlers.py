"""
Tool handler implementations.
Each handler maps an OpenAI tool call to a backend service call.
These are thin adapters — all business logic lives in services/.
"""

import uuid
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.order import Order
from app.services.customer_service import CustomerService
from app.services.order_service import OrderService
from app.services.policy_service import PolicyService
from app.services.refund_service import RefundService

logger = logging.getLogger(__name__)


async def handle_get_customer(args: dict, db: AsyncSession) -> dict:
    """Look up customer by email or name."""
    identifier = (args.get("identifier") or args.get("customer_name") or args.get("email") or "").strip()
    identifier_type = args.get("identifier_type")

    if not identifier_type:
        identifier_type = "email" if "@" in identifier else "name"

    if not identifier:
        return {"error": "invalid_arguments", "message": "Identifier cannot be empty."}

    svc = CustomerService(db)
    customer = await svc.find_by_identifier(identifier, identifier_type)

    if not customer:
        return {
            "error": "not_found",
            "message": f"No customer found with {identifier_type} '{identifier}'. Please verify the information and try again.",
        }

    return {
        "customer_id": str(customer.id),
        "name": customer.name,
        "email": customer.email,
        "phone": customer.phone,
    }


async def handle_get_order(args: dict, db: AsyncSession) -> dict:
    """Retrieve order details by order number or order ID."""
    order_number = (args.get("order_number") or args.get("order_id") or "").strip()
    customer_id_str = (args.get("customer_id") or "").strip()

    if not order_number:
        return {"error": "invalid_arguments", "message": "Order number or ID is required."}

    customer_id = None
    if customer_id_str:
        try:
            customer_id = uuid.UUID(customer_id_str)
        except (ValueError, AttributeError):
            pass

    order_svc = OrderService(db)

    # 1. Try order_number lookup with customer verification if customer_id provided
    order = None
    if customer_id:
        order = await order_svc.get_by_number(order_number, customer_id)

    # 2. Fallback: try UUID order_id lookup
    if not order:
        try:
            u_id = uuid.UUID(order_number)
            order = await order_svc.get_by_id(u_id)
        except (ValueError, AttributeError):
            pass

    # 3. Fallback: lookup by order_number without strict customer_id check if customer_id wasn't provided yet
    if not order and not customer_id:
        result = await db.execute(select(Order).where(Order.order_number == order_number))
        order = result.scalar_one_or_none()

    if not order:
        return {
            "error": "not_found",
            "message": f"Order '{order_number}' was not found. Please check the order number.",
        }

    return {
        "order_id": str(order.id),
        "order_number": order.order_number,
        "product_name": order.product_name,
        "category": order.category,
        "amount": float(order.amount),
        "currency": order.currency,
        "status": order.status,
        "is_final_sale": order.is_final_sale,
        "is_personalized": order.is_personalized,
        "is_customer_damaged": order.is_customer_damaged,
        "purchased_at": order.purchased_at.isoformat(),
        "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
    }


async def handle_get_refund_policy(args: dict, db: AsyncSession) -> dict:
    """Return the current refund policy."""
    svc = PolicyService(db)
    return await svc.get_policy()


async def handle_check_refund_eligibility(args: dict, db: AsyncSession) -> dict:
    """Deterministically evaluate refund eligibility."""
    order_id_str = (args.get("order_id") or args.get("order_number") or "").strip()
    customer_id_str = (args.get("customer_id") or "").strip()

    order = None
    order_svc = OrderService(db)

    # Try UUID lookup first
    try:
        order_id = uuid.UUID(order_id_str)
        order = await order_svc.get_by_id(order_id)
    except (ValueError, AttributeError):
        pass

    # Try order_number lookup fallback
    if not order and order_id_str:
        result = await db.execute(select(Order).where(Order.order_number == order_id_str))
        order = result.scalar_one_or_none()

    if not order:
        return {"error": "not_found", "message": f"Order '{order_id_str}' not found."}

    # Verify ownership when customer_id is provided
    if customer_id_str:
        try:
            customer_id = uuid.UUID(customer_id_str)
            if order.customer_id != customer_id:
                return {
                    "eligible": False,
                    "reason": "This order does not belong to the identified customer.",
                    "policy_rules_applied": ["ownership_check"],
                    "order_id": str(order.id),
                }
        except (ValueError, AttributeError):
            pass

    policy_svc = PolicyService(db)
    result = await policy_svc.evaluate(order)

    return {
        "eligible": result.eligible,
        "reason": result.reason,
        "policy_rules_applied": result.policy_rules_applied,
        "order_id": str(result.order_id) if result.order_id else str(order.id),
    }


async def handle_process_refund(args: dict, db: AsyncSession) -> dict:
    """Execute the refund (with internal re-validation)."""
    order_id_str = (args.get("order_id") or args.get("order_number") or "").strip()
    customer_id_str = (args.get("customer_id") or "").strip()
    session_id_str = (args.get("session_id") or "").strip()

    order_svc = OrderService(db)
    order = None

    try:
        order_id = uuid.UUID(order_id_str)
        order = await order_svc.get_by_id(order_id)
    except (ValueError, AttributeError):
        pass

    if not order and order_id_str:
        result = await db.execute(select(Order).where(Order.order_number == order_id_str))
        order = result.scalar_one_or_none()

    if not order:
        return {"error": "not_found", "message": "Order not found."}

    try:
        customer_id = uuid.UUID(customer_id_str)
    except (ValueError, AttributeError):
        customer_id = order.customer_id

    try:
        session_id = uuid.UUID(session_id_str)
    except (ValueError, AttributeError):
        return {"error": "invalid_arguments", "message": "Invalid session_id."}

    svc = RefundService(db)
    return await svc.process(order.id, customer_id, session_id)


async def handle_get_refund_status(args: dict, db: AsyncSession) -> dict:
    """Retrieve existing refund status for an order — automatically handles human order numbers or UUIDs."""
    order_id_str = (args.get("order_id") or args.get("order_number") or "").strip()
    customer_id_str = (args.get("customer_id") or "").strip()

    order_svc = OrderService(db)
    order = None

    # Try UUID lookup first
    try:
        order_id = uuid.UUID(order_id_str)
        order = await order_svc.get_by_id(order_id)
    except (ValueError, AttributeError):
        pass

    # Try order_number lookup fallback
    if not order and order_id_str:
        result = await db.execute(select(Order).where(Order.order_number == order_id_str))
        order = result.scalar_one_or_none()

    if not order:
        return {"error": "not_found", "message": f"Order '{order_id_str}' not found."}

    # Resolve customer_id
    customer_id = None
    if customer_id_str:
        try:
            customer_id = uuid.UUID(customer_id_str)
        except (ValueError, AttributeError):
            pass

    if not customer_id:
        customer_id = order.customer_id

    svc = RefundService(db)
    return await svc.get_refund_status(order.id, customer_id)


# Registry mapping tool names to handler functions
TOOL_HANDLERS = {
    "get_customer": handle_get_customer,
    "get_order": handle_get_order,
    "get_refund_policy": handle_get_refund_policy,
    "get_refund_status": handle_get_refund_status,
    "check_refund_eligibility": handle_check_refund_eligibility,
    "process_refund": handle_process_refund,
}
