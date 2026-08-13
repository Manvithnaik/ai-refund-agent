from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.policy import RefundPolicy
from app.models.order import Order
from app.models.refund import RefundRequest
from app.schemas.refund import EligibilityResult


# The canonical policy rules (kept in sync with DB seed)
DEFAULT_POLICY = {
    "version": "v1.0",
    "refund_window_days": 30,
    "eligible_statuses": ["delivered"],
    "restricted_categories": ["food", "digital"],
    "final_sale_refundable": False,
    "personalized_refundable": False,
    "customer_damage_refundable": False,
    "max_refund_amount": None,
    "summary": (
        "Refunds are accepted within 30 days of delivery for most items. "
        "Final-sale, personalized, food, and digital items are non-refundable. "
        "Damaged items due to customer misuse are not eligible. "
        "Orders must be in 'delivered' status."
    ),
}


class PolicyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_policy(self) -> dict:
        """Return the current refund policy from DB, fallback to default."""
        result = await self.db.execute(select(RefundPolicy).where(RefundPolicy.id == 1))
        policy = result.scalar_one_or_none()
        if policy:
            return {
                "version": policy.version,
                "rules": policy.rules,
                "summary": DEFAULT_POLICY["summary"],
            }
        return {
            "version": DEFAULT_POLICY["version"],
            "rules": DEFAULT_POLICY,
            "summary": DEFAULT_POLICY["summary"],
        }

    async def evaluate(self, order: Order) -> EligibilityResult:
        """
        Deterministically evaluate refund eligibility.
        This is the single source of truth for business rules.
        The LLM never makes this decision.
        """
        rules = (await self.get_policy())["rules"]
        rules_applied = []

        # Rule 1: Order status must be "delivered"
        eligible_statuses = rules.get("eligible_statuses", ["delivered"])
        if order.status not in eligible_statuses:
            return EligibilityResult(
                eligible=False,
                reason=f"Order is not eligible for refund — current status is '{order.status}'. Refunds are only available for delivered orders.",
                policy_rules_applied=["status_check"],
                order_id=order.id,
            )
        rules_applied.append("status_check")

        # Rule 2: Must be within the refund window
        if order.delivered_at is None:
            return EligibilityResult(
                eligible=False,
                reason="Order has no delivery date on record.",
                policy_rules_applied=rules_applied,
                order_id=order.id,
            )
        now = datetime.now(timezone.utc)
        delivered_at = order.delivered_at
        if delivered_at.tzinfo is None:
            delivered_at = delivered_at.replace(tzinfo=timezone.utc)
        days_since_delivery = (now - delivered_at).days
        window = rules.get("refund_window_days", 30)
        if days_since_delivery > window:
            return EligibilityResult(
                eligible=False,
                reason=f"Refund window has expired. This order was delivered {days_since_delivery} days ago and our policy allows refunds within {window} days of delivery.",
                policy_rules_applied=rules_applied + ["refund_window"],
                order_id=order.id,
            )
        rules_applied.append("refund_window")

        # Rule 3: Final-sale items
        if order.is_final_sale and not rules.get("final_sale_refundable", False):
            return EligibilityResult(
                eligible=False,
                reason="This item was purchased as a final sale and is not eligible for a refund. Final sale items cannot be returned under any circumstances.",
                policy_rules_applied=rules_applied + ["final_sale"],
                order_id=order.id,
            )
        rules_applied.append("final_sale_check")

        # Rule 4: Personalized items
        if order.is_personalized and not rules.get("personalized_refundable", False):
            return EligibilityResult(
                eligible=False,
                reason="Personalized or custom-made items cannot be refunded as they were created specifically for you.",
                policy_rules_applied=rules_applied + ["personalized"],
                order_id=order.id,
            )
        rules_applied.append("personalized_check")

        # Rule 5: Restricted categories
        restricted = rules.get("restricted_categories", ["food", "digital"])
        if order.category in restricted:
            return EligibilityResult(
                eligible=False,
                reason=f"Items in the '{order.category}' category are not eligible for refunds due to their nature.",
                policy_rules_applied=rules_applied + ["category_restriction"],
                order_id=order.id,
            )
        rules_applied.append("category_check")

        # Rule 6: Customer-damaged items
        if order.is_customer_damaged and not rules.get("customer_damage_refundable", False):
            return EligibilityResult(
                eligible=False,
                reason="Items damaged through customer misuse or negligence are not covered by our refund policy.",
                policy_rules_applied=rules_applied + ["damage_check"],
                order_id=order.id,
            )
        rules_applied.append("damage_check")

        # Rule 7: Already refunded — check for existing approved refund
        existing_refund = await self.db.execute(
            select(RefundRequest).where(
                RefundRequest.order_id == order.id,
                RefundRequest.status == "approved",
            )
        )
        if existing_refund.scalar_one_or_none():
            return EligibilityResult(
                eligible=False,
                reason="A refund has already been processed for this order.",
                policy_rules_applied=rules_applied + ["duplicate_check"],
                order_id=order.id,
            )
        rules_applied.append("duplicate_check")

        # All rules passed — eligible!
        return EligibilityResult(
            eligible=True,
            reason=f"This order qualifies for a refund. It was delivered {days_since_delivery} days ago and meets all policy requirements.",
            policy_rules_applied=rules_applied,
            order_id=order.id,
        )
