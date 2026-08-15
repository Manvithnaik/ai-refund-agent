"""
SessionState — structured, isolated per-session state.

Replaces the global _CONVERSATION_HISTORIES dict in chat.py.
Each session_id maps to its own independent SessionState object.
State NEVER leaks between sessions.
"""

from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SessionState:
    """
    All mutable conversation context for a single session.
    The backend uses this as the authoritative source of truth —
    not the LLM conversation history.
    """

    session_id: uuid.UUID

    # ── Intent ──────────────────────────────────────────────────────────────
    intent: Optional[str] = None
    # "refund_request" | "status_query" | "policy_question" | "general" | None

    # ── Customer ─────────────────────────────────────────────────────────────
    customer_id: Optional[uuid.UUID] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None

    # ── Order ────────────────────────────────────────────────────────────────
    order_id: Optional[uuid.UUID] = None
    order_number: Optional[str] = None
    order_verified: bool = False          # customer owns this order (checked)

    # ── Workflow Progress ─────────────────────────────────────────────────────
    refund_status_checked: bool = False   # get_refund_status has been called
    eligibility_checked: bool = False     # check_refund_eligibility has been called
    eligible: Optional[bool] = None       # True / False after eligibility check
    waiting_for_confirmation: bool = False  # eligibility OK, awaiting customer "yes"
    confirmed: bool = False               # customer said "yes" — process_refund may execute

    # ── Outcome ───────────────────────────────────────────────────────────────
    decision: str = "no_action"           # "no_action" | "approved" | "denied" | "error"
    reason: Optional[str] = None          # denial code or "eligible"
    refund_id: Optional[str] = None       # set on approval
    refund_amount: Optional[float] = None # set on approval

    # ── Conversation History (LLM context only — not the source of truth) ─────
    # Pruned to prevent token bloat. Tool results are summarised, not stored verbatim.
    conversation_history: list[dict] = field(default_factory=list)


# ── Isolated registry ─────────────────────────────────────────────────────────
# Keyed strictly by session_id UUID. Each session is completely isolated.
_SESSION_STORE: dict[uuid.UUID, SessionState] = {}


def get_or_create_state(session_id: uuid.UUID) -> SessionState:
    """Return the SessionState for this session, creating it fresh if new."""
    if session_id not in _SESSION_STORE:
        _SESSION_STORE[session_id] = SessionState(session_id=session_id)
    return _SESSION_STORE[session_id]


def get_state(session_id: uuid.UUID) -> Optional[SessionState]:
    """Return existing state or None."""
    return _SESSION_STORE.get(session_id)


def clear_state(session_id: uuid.UUID) -> None:
    """Remove session from registry (e.g. on completion/error)."""
    _SESSION_STORE.pop(session_id, None)
