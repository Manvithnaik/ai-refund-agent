"""
Dev/Demo-only reset router.
Registered ONLY when environment != "production".
Provides a single endpoint to wipe agent sessions and their logs
so the admin dashboard starts clean for a demo recording.

NEVER import this router in production — main.py guards the registration.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, func, select

from app.database import get_db
from app.config import get_settings
from app.models.session import AgentSession
from app.models.log import AgentLog
from app.models.refund import RefundRequest

router = APIRouter(prefix="/dev", tags=["dev-only"])

settings = get_settings()


def _require_non_production():
    """Dependency that blocks the endpoint in production."""
    if settings.environment == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is not available in production.",
        )


@router.post("/reset-demo-sessions")
async def reset_demo_sessions(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_non_production),
):
    """
    Clears all agent sessions (and their cascaded logs) plus any
    session-linked refund_requests created during real chat runs.

    Safe guarantees:
    - customers, orders, refund_policies are NEVER touched.
    - The seeded approved refund for ORD-1005 (session_id IS NULL) is preserved.
    - agent_logs are deleted via CASCADE when sessions are deleted.
    """

    # 1. Count before deletion for the response summary
    session_count_result = await db.execute(select(func.count()).select_from(AgentSession))
    session_count = session_count_result.scalar() or 0

    refund_count_result = await db.execute(
        select(func.count())
        .select_from(RefundRequest)
        .where(RefundRequest.session_id.is_not(None))
    )
    refund_count = refund_count_result.scalar() or 0

    # 2. Delete session-linked refund_requests first (FK: session_id SET NULL → safe,
    #    but we want to remove the demo-created ones, not orphan them)
    await db.execute(
        delete(RefundRequest).where(RefundRequest.session_id.is_not(None))
    )

    # 3. Delete all sessions — agent_logs CASCADE automatically
    await db.execute(delete(AgentSession))

    await db.commit()

    return {
        "success": True,
        "cleared_sessions": session_count,
        "cleared_refund_requests": refund_count,
        "message": (
            f"Cleared {session_count} session(s), {refund_count} demo refund request(s), "
            "and all their audit logs. Seeded data (customers, orders, policy, ORD-1005 refund) is intact."
        ),
    }
