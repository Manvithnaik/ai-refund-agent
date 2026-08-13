import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.refund import RefundRequest
from app.models.order import Order
from app.services.policy_service import PolicyService


class RefundService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def process(
        self,
        order_id: uuid.UUID,
        customer_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> dict:
        """
        Process a refund request. Re-validates eligibility before writing to DB.

        This is the final safety net: even if the agent incorrectly calls
        process_refund() after a denial, this service WILL block the operation.

        Returns a structured dict that is NEVER ambiguous:
          { "success": True, "refund_id": ..., "refund_amount": ..., ... }
          { "success": False, "error": <code>, "message": ... }
        """
        policy_svc = PolicyService(self.db)

        # Load order
        result = await self.db.execute(
            select(Order).where(Order.id == order_id)
        )
        order = result.scalar_one_or_none()
        if not order:
            return {
                "success": False,
                "error": "order_not_found",
                "message": "The order could not be found.",
            }

        # Verify customer owns this order (ownership check)
        if order.customer_id != customer_id:
            return {
                "success": False,
                "error": "unauthorized",
                "message": "This order does not belong to the identified customer.",
            }

        # Idempotency guard — check for an existing approved refund first
        existing = await self.db.execute(
            select(RefundRequest).where(
                RefundRequest.order_id == order_id,
                RefundRequest.status == "approved",
            )
        )
        existing_refund = existing.scalar_one_or_none()
        if existing_refund:
            return {
                "success": False,
                "error": "already_refunded",
                "message": "A refund has already been approved for this order.",
                "refund_id": str(existing_refund.id),
                "refund_amount": float(existing_refund.refund_amount) if existing_refund.refund_amount else None,
            }

        # Re-validate eligibility (safety net — never trust the LLM)
        eligibility = await policy_svc.evaluate(order)

        if not eligibility.eligible:
            # IMPORTANT: Do NOT create a RefundRequest row here.
            # A denial is a business decision, not a database event at this stage.
            # The agent audit log will capture it via refund_denied event.
            return {
                "success": False,
                "error": "not_eligible",
                "denial_code": self._get_denial_code(eligibility.policy_rules_applied),
                "message": eligibility.reason,
            }

        # All checks passed — create the approved refund record
        policy_data = await policy_svc.get_policy()
        refund_amount = float(order.amount)
        refund_req = RefundRequest(
            order_id=order_id,
            customer_id=customer_id,
            session_id=session_id,
            status="approved",
            denial_reason=None,
            refund_amount=refund_amount,
            policy_snapshot=policy_data["rules"],
            resolved_at=datetime.now(timezone.utc),
        )
        self.db.add(refund_req)
        await self.db.flush()

        return {
            "success": True,
            "refund_id": str(refund_req.id),
            "refund_amount": refund_amount,
            "currency": order.currency,
            "message": f"Refund of {order.currency} {refund_amount:,.2f} approved and will be processed within 3-5 business days.",
        }

    def _get_denial_code(self, policy_rules_applied: list[str]) -> str:
        """Extract the most specific denial code from applied policy rules."""
        # Last rule applied is typically the blocking rule
        denial_map = {
            "duplicate_check": "already_refunded",
            "status_check": "not_delivered",
            "refund_window": "expired_window",
            "final_sale": "final_sale",
            "personalized": "personalized_product",
            "category_restriction": "restricted_category",
            "damage_check": "customer_damage",
        }
        for rule in reversed(policy_rules_applied):
            if rule in denial_map:
                return denial_map[rule]
        return "not_eligible"

    async def get_refund_history(self, order_id: uuid.UUID) -> list[RefundRequest]:
        result = await self.db.execute(
            select(RefundRequest)
            .where(RefundRequest.order_id == order_id)
            .order_by(RefundRequest.requested_at.desc())
        )
        return list(result.scalars().all())
