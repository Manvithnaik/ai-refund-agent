"""
Tool handler implementations.
Each handler maps an OpenAI tool call to a backend service call.
These are thin adapters — all business logic lives in services/.
"""

import uuid
import asyncio
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.customer_service import CustomerService
from app.services.order_service import OrderService
from app.services.policy_service import PolicyService
from app.services.refund_service import RefundService

logger = logging.getLogger(__name__)


async def handle_get_customer(args: dict, db: AsyncSession) -> dict:
    """Look up customer by email or name."""
    identifier = args.get("identifier", "").strip()
    identifier_type = args.get("identifier_type", "email")

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
    """Retrieve order details by order number."""
    order_number = args.get("order_number", "").strip()
    customer_id_str = args.get("customer_id", "").strip()

    if not order_number:
        return {"error": "invalid_arguments", "message": "Order number is required."}

    try:
        customer_id = uuid.UUID(customer_id_str)
    except (ValueError, AttributeError):
        return {"error": "invalid_arguments", "message": "Invalid customer_id format."}

    svc = OrderService(db)
    order = await svc.get_by_number(order_number, customer_id)

    if not order:
        return {
            "error": "not_found",
            "message": f"Order '{order_number}' was not found for this customer. Please check the order number.",
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
    order_id_str = args.get("order_id", "").strip()
    customer_id_str = args.get("customer_id", "").strip()

    try:
        order_id = uuid.UUID(order_id_str)
    except (ValueError, AttributeError):
        return {"error": "invalid_arguments", "message": "Invalid order_id format."}

    order_svc = OrderService(db)
    order = await order_svc.get_by_id(order_id)

    if not order:
        return {"error": "not_found", "message": "Order not found."}

    # Verify ownership when customer_id is provided
    if customer_id_str:
        try:
            customer_id = uuid.UUID(customer_id_str)
            if order.customer_id != customer_id:
                return {
                    "eligible": False,
                    "reason": "This order does not belong to the identified customer.",
                    "policy_rules_applied": ["ownership_check"],
                    "order_id": str(order_id),
                }
        except (ValueError, AttributeError):
            pass  # Skip ownership check if customer_id is malformed

    policy_svc = PolicyService(db)
    result = await policy_svc.evaluate(order)

    return {
        "eligible": result.eligible,
        "reason": result.reason,
        "policy_rules_applied": result.policy_rules_applied,
        "order_id": str(result.order_id) if result.order_id else None,
    }


async def handle_process_refund(args: dict, db: AsyncSession) -> dict:
    """Execute the refund (with internal re-validation)."""
    order_id_str = args.get("order_id", "").strip()
    customer_id_str = args.get("customer_id", "").strip()
    session_id_str = args.get("session_id", "").strip()

    try:
        order_id = uuid.UUID(order_id_str)
        customer_id = uuid.UUID(customer_id_str)
        session_id = uuid.UUID(session_id_str)
    except (ValueError, AttributeError) as e:
        return {"error": "invalid_arguments", "message": f"Invalid UUID format: {e}"}

    svc = RefundService(db)
    return await svc.process(order_id, customer_id, session_id)


# Registry mapping tool names to handler functions
TOOL_HANDLERS = {
    "get_customer": handle_get_customer,
    "get_order": handle_get_order,
    "get_refund_policy": handle_get_refund_policy,
    "check_refund_eligibility": handle_check_refund_eligibility,
    "process_refund": handle_process_refund,
}
