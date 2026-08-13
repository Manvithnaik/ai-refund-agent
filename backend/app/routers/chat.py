"""
Chat & Session API router.
Returns structured ChatResponse with authoritative decision field.
The frontend must only read `decision` — never parse the `message` text.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.schemas.agent import ChatRequest, ChatResponse
from app.models.session import AgentSession
from app.models.log import AgentLog
from app.schemas.log import AgentLogOut
from app.agent.orchestrator import create_session, get_session, run_agent

router = APIRouter(prefix="/chat", tags=["chat"])

# In-memory conversation history store for active sessions (keyed by session_id)
_CONVERSATION_HISTORIES: dict[uuid.UUID, list[dict]] = {}


@router.post("", response_model=ChatResponse)
async def chat_endpoint(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Send a message to RefundBot.

    The response includes a structured `decision` field:
      - "approved"  → refund was successfully processed by the backend
      - "denied"    → refund was rejected by the backend policy engine
      - "no_action" → no refund decision was reached in this turn
      - "error"     → a system error occurred

    Use `decision` — never parse the `message` text — to determine UI state.
    """
    session_id = request.session_id

    # Find or create session
    if session_id:
        session = await get_session(session_id, db)
        if not session:
            session = await create_session(db)
            session_id = session.id
    else:
        session = await create_session(db)
        session_id = session.id

    # Retrieve or initialize conversation history
    history = _CONVERSATION_HISTORIES.get(session_id, [])

    # Run the agent loop
    response_message, updated_history, decision, reason, refund_id, refund_amount = await run_agent(
        user_message=request.message,
        session_id=session_id,
        conversation_history=history,
        db=db,
    )

    # Save updated history in memory
    _CONVERSATION_HISTORIES[session_id] = updated_history

    # Re-read session from DB to get the committed (up-to-date) status
    await db.refresh(session)
    is_complete = session.status in ("completed", "error")

    return ChatResponse(
        session_id=session_id,
        message=response_message,
        is_complete=is_complete,
        decision=decision,
        reason=reason,
        refund_id=refund_id,
        refund_amount=refund_amount,
    )


@router.get("/{session_id}/logs", response_model=list[AgentLogOut])
async def get_session_logs(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get all structured event logs for a specific session."""
    session = await get_session(session_id, db)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    result = await db.execute(
        select(AgentLog)
        .where(AgentLog.session_id == session_id)
        .order_by(AgentLog.sequence.asc())
    )
    logs = result.scalars().all()
    return list(logs)
