"""
Admin API router.
Endpoints for the Admin Dashboard to view all sessions, individual session details, and real-time logs.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.session import AgentSession
from app.models.log import AgentLog
from app.models.customer import Customer
from app.models.refund import RefundRequest
from app.schemas.session import AgentSessionOut, AgentSessionWithLogs
from app.schemas.log import AgentLogOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/sessions", response_model=list[dict])
async def list_sessions(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """List recent agent sessions with customer details and outcome summaries."""
    result = await db.execute(
        select(AgentSession)
        .options(
            selectinload(AgentSession.customer),
            selectinload(AgentSession.logs),
            selectinload(AgentSession.refund_requests),
        )
        .order_by(AgentSession.started_at.desc())
        .limit(limit)
    )
    sessions = result.scalars().all()

    session_list = []
    for s in sessions:
        customer_name = s.customer.name if s.customer else None
        customer_email = s.customer.email if s.customer else None

        if not customer_name and s.logs:
            for log in s.logs:
                if log.event_type in ("customer_identified", "tool_result") and log.tool_output and isinstance(log.tool_output, dict):
                    if log.tool_output.get("name"):
                        customer_name = log.tool_output.get("name")
                        customer_email = log.tool_output.get("email")
                        break

        if not customer_name:
            customer_name = "Unidentified"

        # Use the authoritative outcome field from the session record.
        # Fall back to refund_requests only for legacy sessions that pre-date the outcome column.
        outcome = s.outcome  # "approved" | "denied" | "no_action" | "error" | None

        refund_amount = None
        denial_reason = None

        if outcome is None:
            # Legacy fallback for sessions created before outcome column was added
            if s.refund_requests:
                req = s.refund_requests[0]
                outcome = req.status
                refund_amount = float(req.refund_amount) if req.refund_amount else None
                denial_reason = req.denial_reason
            elif s.status == "active":
                outcome = "in_progress"
            else:
                outcome = "no_action"
        elif outcome == "approved" and s.refund_requests:
            # Populate refund amount from approved refund record
            approved = next(
                (r for r in s.refund_requests if r.status == "approved"), None
            )
            if approved:
                refund_amount = float(approved.refund_amount) if approved.refund_amount else None
        elif outcome == "denied":
            if s.refund_requests:
                denied = next(
                    (r for r in s.refund_requests if r.status == "denied"), None
                )
                if denied:
                    denial_reason = denied.denial_reason
            if not denial_reason and s.logs:
                for log in reversed(s.logs):
                    if log.event_type in ("refund_denied", "policy_check") and log.message:
                        denial_reason = log.message
                        break

        session_list.append({
            "id": str(s.id),
            "customer_name": customer_name,
            "customer_email": customer_email,
            "status": s.status,
            "started_at": s.started_at.isoformat(),
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "total_logs": len(s.logs),
            "outcome": outcome or "no_action",
            "refund_amount": refund_amount,
            "denial_reason": denial_reason,
        })

    return session_list


@router.get("/sessions/{session_id}", response_model=dict)
async def get_session_detail(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get full session detail including customer info, logs, and refund requests."""
    result = await db.execute(
        select(AgentSession)
        .where(AgentSession.id == session_id)
        .options(
            selectinload(AgentSession.customer),
            selectinload(AgentSession.logs),
            selectinload(AgentSession.refund_requests),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    logs_data = [
        {
            "id": str(log.id),
            "sequence": log.sequence,
            "event_type": log.event_type,
            "tool_name": log.tool_name,
            "tool_input": log.tool_input,
            "tool_output": log.tool_output,
            "message": log.message,
            "error_message": log.error_message,
            "retry_count": log.retry_count,
            "duration_ms": log.duration_ms,
            "created_at": log.created_at.isoformat(),
        }
        for log in session.logs
    ]

    refund_data = (
        [
            {
                "id": str(r.id),
                "status": r.status,
                "refund_amount": float(r.refund_amount) if r.refund_amount else None,
                "denial_reason": r.denial_reason,
                "requested_at": r.requested_at.isoformat(),
            }
            for r in session.refund_requests
        ]
        if session.refund_requests
        else []
    )

    customer_info = None
    if session.customer:
        customer_info = {
            "id": str(session.customer.id),
            "name": session.customer.name,
            "email": session.customer.email,
        }
    else:
        for log in session.logs:
            if log.event_type in ("customer_identified", "tool_result") and log.tool_output and isinstance(log.tool_output, dict):
                if log.tool_output.get("name"):
                    customer_info = {
                        "id": log.tool_output.get("customer_id", ""),
                        "name": log.tool_output.get("name"),
                        "email": log.tool_output.get("email"),
                    }
                    break

    return {
        "id": str(session.id),
        "status": session.status,
        "outcome": session.outcome,
        "customer": customer_info,
        "started_at": session.started_at.isoformat(),
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "logs": logs_data,
        "refund_requests": refund_data,
    }
