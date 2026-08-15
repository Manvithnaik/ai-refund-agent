"""
Agent Orchestrator v2 — State-Machine Architecture.

Architecture:
  User message
    ↓
  [1] Fast Intent Router (keyword, ~0ms) → LLM NLU only if ambiguous (1 call)
    ↓
  [2] Collect missing info → return template question (0 LLM calls)
    ↓
  [3] Deterministic workflow: get_customer → get_order → refund_status → eligibility (0 LLM calls)
    ↓
  [4] 1 final LLM call → natural-language response
    ↓
  User

LLM call budget:
  - Clear request with all info:   1 LLM call (response only)
  - Ambiguous message:             2 LLM calls (NLU + response)
  - Full refund lifecycle:         2–3 total  (vs previous 6)

The LLM NEVER decides eligibility, tool routing, or business policy.
The backend services and PolicyService are the single source of truth.
"""

from __future__ import annotations
import json
import uuid
import logging
import time
from datetime import datetime, timezone
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.config import get_settings
from app.models.session import AgentSession
from app.models.log import AgentLog
from app.agent.session_state import SessionState, get_or_create_state, clear_state
from app.agent.intent_router import classify_fast, classify_with_llm
from app.agent.tools import TOOLS
from app.agent.tool_handlers import TOOL_HANDLERS
from app.services.customer_service import CustomerService
from app.services.order_service import OrderService
from app.services.refund_service import RefundService
from app.services.policy_service import PolicyService

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Groq client with timeout ──────────────────────────────────────────────────
groq_client = AsyncOpenAI(
    api_key=settings.groq_api_key,
    base_url="https://api.groq.com/openai/v1",
    timeout=15.0,
)

PRIMARY_MODEL = "llama-3.3-70b-versatile"
FALLBACK_MODEL = "llama-3.1-8b-instant"


# ── Session DB helpers ────────────────────────────────────────────────────────

async def create_session(db: AsyncSession) -> AgentSession:
    session = AgentSession(status="active")
    db.add(session)
    await db.flush()
    return session


async def get_session(session_id: uuid.UUID, db: AsyncSession) -> AgentSession | None:
    result = await db.execute(select(AgentSession).where(AgentSession.id == session_id))
    return result.scalar_one_or_none()


# ── Audit logging ─────────────────────────────────────────────────────────────

async def _log(
    db: AsyncSession,
    session_id: uuid.UUID,
    seq: list[int],
    event_type: str,
    message: str | None = None,
    tool_name: str | None = None,
    tool_input: dict | None = None,
    tool_output: dict | None = None,
    error_message: str | None = None,
    duration_ms: int | None = None,
) -> None:
    seq[0] += 1
    log = AgentLog(
        session_id=session_id,
        sequence=seq[0],
        event_type=event_type,
        message=message,
        tool_name=tool_name,
        tool_input=tool_input,
        tool_output=tool_output,
        error_message=error_message,
        duration_ms=duration_ms,
    )
    db.add(log)
    await db.flush()


# ── LLM helpers ───────────────────────────────────────────────────────────────

async def _llm_chat(messages: list[dict]) -> str:
    """Call LLM for response generation only. Returns plain text."""
    for model in (PRIMARY_MODEL, FALLBACK_MODEL):
        try:
            resp = await groq_client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.3,
                max_tokens=400,
            )
            return resp.choices[0].message.content or ""
        except Exception as exc:
            is_rate_limit = "429" in str(exc) or "rate_limit" in str(exc).lower()
            if is_rate_limit and model == PRIMARY_MODEL:
                logger.warning(f"Rate limited on {model}, falling back to {FALLBACK_MODEL}")
                continue
            logger.error(f"LLM error ({model}): {exc}")
            raise
    return "I'm having trouble connecting right now. Please try again."


# ── Static / template responses (0 LLM calls) ────────────────────────────────

_SYSTEM_PROMPT_RESPONSE = """You are RefundBot, a concise and helpful AI customer support agent for ShopEase India.
You will be given a structured summary of what the backend has verified, and you must generate ONE short, natural, customer-friendly message.

Rules:
- Be warm, concise, and direct.
- Always quote amounts in Indian Rupees (₹).
- Do not invent information not present in the context.
- If asking for information, ask for exactly what is missing — nothing more.
- If confirming eligibility, ask for explicit yes/no before processing.
"""

def _ask_for_customer_info() -> str:
    return (
        "Hi! I'd be happy to help with your refund. "
        "Could you please provide your registered email address or full name?"
    )

def _ask_for_order_info(customer_name: str) -> str:
    return (
        f"Thanks, {customer_name.split()[0]}! "
        "Could you please provide the order number you'd like to return? "
        "(It looks like ORD-XXXX)"
    )

def _customer_not_found(identifier: str) -> str:
    return (
        f"I wasn't able to find an account matching '{identifier}'. "
        "Could you double-check your registered name or email address?"
    )

def _order_not_found(order_number: str) -> str:
    return (
        f"I couldn't find an order with number '{order_number}' linked to your account. "
        "Please check the order number and try again."
    )

POLICY_SUMMARY = (
    "Our refund policy allows returns within **30 days of delivery** for most items. "
    "The following items are **non-refundable**: final-sale items, personalized/custom items, "
    "digital products, and food/perishable goods. Customer-damaged items are also not covered. "
    "Orders must be in 'delivered' status to be eligible."
)


# ── Raw LLM function-calling loop ────────────────────────────────────────────

MAX_TOOL_ITERATIONS = 10


def _build_agent_system_prompt(state: SessionState) -> str:
    """Dynamic system prompt includes current session context so LLM skips already-resolved steps."""
    ctx = []
    if state.customer_name:
        ctx.append(f"- Customer: {state.customer_name} (ID: {state.customer_id})")
    if state.order_number:
        ctx.append(f"- Order: {state.order_number} (ID: {state.order_id})")
    if state.refund_status_checked:
        ctx.append("- Refund status: already checked this session")
    if state.eligibility_checked:
        ctx.append(f"- Eligibility: {'ELIGIBLE' if state.eligible else 'NOT ELIGIBLE'}")
    if state.confirmed:
        ctx.append("- STATUS: Customer has CONFIRMED they want to proceed. Call process_refund now.")
    context = "\n".join(ctx) if ctx else "No information collected yet."

    return f"""You are RefundBot, a professional AI customer support agent for ShopEase India.
You help customers with refund requests using the tools available to you.

## Current Session Context (do NOT re-call tools for info already listed)
{context}

## Tool Sequence for a refund request (skip steps already in session context)
  1. get_customer        — identify the customer by name or email
  2. get_order           — retrieve the order by order number
  3. get_refund_status   — check if a refund already exists
  4. check_refund_eligibility — backend evaluates policy (never decide eligibility yourself)
  5. process_refund      — only when session context shows customer has CONFIRMED

For a status query: get_customer → get_order → get_refund_status

## Rules
- Be warm, concise, and professional. Quote amounts in Indian Rupees (₹).
- Do not invent information not returned by tools.
- The backend enforces refund policy — never decide eligibility yourself.
- If eligibility is confirmed but confirmation is NOT shown above, ask the customer
  yes/no before calling process_refund. Do NOT call process_refund without it.
"""


async def _llm_call_with_tools(messages: list[dict]):
    """Call LLM with TOOLS definitions. Returns raw API response."""
    for model in (PRIMARY_MODEL, FALLBACK_MODEL):
        try:
            resp = await groq_client.chat.completions.create(
                model=model,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.1,
                max_tokens=1000,
            )
            return resp
        except Exception as exc:
            is_rate_limit = "429" in str(exc) or "rate_limit" in str(exc).lower()
            if is_rate_limit and model == PRIMARY_MODEL:
                logger.warning(f"Rate limited on {model} (tool-call), falling back to {FALLBACK_MODEL}")
                continue
            logger.error(f"LLM tool-calling error ({model}): {exc}")
            raise
    raise RuntimeError("Both LLM models failed during tool-calling loop")


async def _update_state_from_tool_result(
    state: SessionState,
    tool_name: str,
    result: dict,
    db: AsyncSession,
    session_id: uuid.UUID,
) -> None:
    """Persist tool results into SessionState and PostgreSQL database so Admin Console displays customer details."""
    if result.get("error"):
        return
    if tool_name == "get_customer":
        try:
            cid = uuid.UUID(result["customer_id"])
            state.customer_id = cid
            await db.execute(
                update(AgentSession)
                .where(AgentSession.id == session_id)
                .values(customer_id=cid)
            )
            await db.flush()
        except Exception:
            pass
        state.customer_name = result.get("name") or state.customer_name
        state.customer_email = result.get("email") or state.customer_email
    elif tool_name == "get_order":
        try:
            state.order_id = uuid.UUID(result["order_id"])
        except Exception:
            pass
        state.order_number = result.get("order_number") or state.order_number
        state.order_verified = True
    elif tool_name == "get_refund_status":
        state.refund_status_checked = True
    elif tool_name == "check_refund_eligibility":
        state.eligibility_checked = True
        state.eligible = result.get("eligible")
        if state.eligible is False:
            state.decision = "denied"
            state.reason = result.get("reason", "not_eligible")
    elif tool_name == "process_refund":
        if result.get("success"):
            state.decision = "approved"
            state.reason = "eligible"
            state.refund_id = result.get("refund_id")
            state.refund_amount = result.get("refund_amount")


async def _run_tool_calling_loop(
    state: SessionState,
    db: AsyncSession,
    session_id: uuid.UUID,
    seq: list[int],
    user_message: str,
) -> tuple:
    """
    Raw LLM function-calling agent loop.

    Flow per iteration:
      LLM + TOOLS  →  tool_calls (or final text)
      tool_call    →  TOOL_HANDLERS (backend service)
      tool result  →  back to LLM
      repeat until no tool_calls

    Safety invariant: process_refund only executes when state.confirmed is True.
    All other business logic (eligibility, policy) stays in backend services.
    """
    messages: list[dict] = [{"role": "system", "content": _build_agent_system_prompt(state)}]
    messages.extend(state.conversation_history)
    messages.append({"role": "user", "content": user_message})

    for iteration in range(1, MAX_TOOL_ITERATIONS + 1):
        # ── LLM call ──────────────────────────────────────────────────────
        try:
            response = await _llm_call_with_tools(messages)
        except Exception as exc:
            logger.error(f"Tool-calling loop LLM error (iter {iteration}): {exc}")
            reply = "I'm having trouble connecting right now. Please try again."
            state.conversation_history.append({"role": "assistant", "content": reply})
            return reply, state.conversation_history, "error", "llm_error", None, None

        msg = response.choices[0].message

        if not msg.tool_calls:
            # ── Final text response ────────────────────────────────────────
            final_text = msg.content or ""
            await _log(db, session_id, seq, "agent_response",
                       message=f"LLM final response (loop iter {iteration})")
            state.conversation_history.append({"role": "user", "content": user_message})
            state.conversation_history.append({"role": "assistant", "content": final_text})

            if state.decision == "approved":
                await _close_session(db, session_id, seq, "completed", "approved")
                clear_state(session_id)
                return (final_text, state.conversation_history,
                        "approved", "eligible", state.refund_id, state.refund_amount)
            elif state.decision == "denied":
                await _close_session(db, session_id, seq, "completed", "denied")
                return final_text, state.conversation_history, "denied", state.reason, None, None
            else:
                return final_text, state.conversation_history, "no_action", None, None, None

        # ── Append assistant tool_call message for proper context chain ───
        messages.append({
            "role": "assistant",
            "content": msg.content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": tc.type,
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ],
        })

        for tool_call in msg.tool_calls:
            tool_name = tool_call.function.name
            try:
                args: dict = json.loads(tool_call.function.arguments)
            except (json.JSONDecodeError, TypeError):
                args = {}

            # Log actual LLM-generated tool call (not synthetic)
            await _log(db, session_id, seq, "tool_call",
                       tool_name=tool_name, tool_input=args,
                       message=f"LLM tool call → {tool_name}")

            # ── SAFETY GATE: block process_refund until customer confirms ─
            if tool_name == "process_refund" and not state.confirmed:
                state.waiting_for_confirmation = True
                state.eligible = True
                blocked = {
                    "status": "confirmation_required",
                    "message": "Customer must confirm before refund is executed. Ask them yes/no.",
                }
                await _log(db, session_id, seq, "tool_result",
                           tool_name=tool_name, tool_output=blocked,
                           message="process_refund blocked — awaiting customer confirmation")
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(blocked),
                })
                continue  # LLM will now generate a confirmation-ask text response

            # Inject session_id server-side for process_refund
            if tool_name == "process_refund":
                args["session_id"] = str(session_id)

            # ── Execute via TOOL_HANDLERS ──────────────────────────────────
            handler = TOOL_HANDLERS.get(tool_name)
            if not handler:
                result: dict = {"error": "unknown_tool",
                                "message": f"Tool '{tool_name}' is not available."}
                await _log(db, session_id, seq, "tool_result",
                           tool_name=tool_name, tool_output=result,
                           message=f"Unknown tool requested: {tool_name}")
            else:
                t0 = time.monotonic()
                try:
                    result = await handler(args, db)
                except Exception as exc:
                    result = {"error": "handler_error", "message": str(exc)}
                    logger.error(f"Tool handler '{tool_name}' error: {exc}")
                dur = int((time.monotonic() - t0) * 1000)
                await _log(db, session_id, seq, "tool_result",
                           tool_name=tool_name, tool_output=result,
                           duration_ms=dur, message=f"Tool result: {tool_name}")
                await _update_state_from_tool_result(state, tool_name, result, db, session_id)

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(result, default=str),
            })

    # Max iterations exceeded
    reply = "I'm sorry, I was unable to complete your request. Please start a new conversation."
    state.conversation_history.append({"role": "user", "content": user_message})
    state.conversation_history.append({"role": "assistant", "content": reply})
    await _log(db, session_id, seq, "agent_response",
               message=f"Max tool iterations ({MAX_TOOL_ITERATIONS}) exceeded")
    return reply, state.conversation_history, "error", "max_iterations", None, None


# ── Main entry point ──────────────────────────────────────────────────────────

async def run_agent(
    user_message: str,
    session_id: uuid.UUID,
    conversation_history: list[dict],   # kept for backward compat with chat.py signature
    db: AsyncSession,
) -> tuple[str, list[dict], str, str | None, str | None, float | None]:
    """
    State-machine agent loop (v2).

    Returns: (message, updated_history, decision, reason, refund_id, refund_amount)
    """
    state = get_or_create_state(session_id)
    seq = [len(state.conversation_history)]

    await _log(db, session_id, seq, "request_received",
               message=f"Customer: {user_message[:120]}")

    # ── Step 1: Intent Classification ──────────────────────────────────────────
    fast = classify_fast(user_message)

    # ── Confirmation gate (pending from previous turn) ─────────────────────────
    if state.waiting_for_confirmation:
        if fast and fast.is_confirmation:
            # Customer said yes — set confirmed flag and re-enter tool-calling loop
            state.waiting_for_confirmation = False
            state.confirmed = True
            await _log(db, session_id, seq, "intent_classified",
                       message="Customer confirmed — re-entering LLM tool-calling loop")
            intent = state.intent or "refund_request"
        elif fast and fast.is_denial:
            return await _handle_denial(state, db, session_id, seq)
        else:
            reply = "I'm waiting for your confirmation. Would you like me to process the refund? (Yes / No)"
            state.conversation_history.append({"role": "assistant", "content": reply})
            return reply, state.conversation_history, "no_action", None, None, None
    else:
        # ── Normal intent resolution ─────────────────────────────────────────
        if fast and fast.intent:
            intent = fast.intent
            if fast.customer_email and not state.customer_email:
                state.customer_email = fast.customer_email
            if fast.order_number and not state.order_number:
                state.order_number = fast.order_number.upper()
            await _log(db, session_id, seq, "intent_classified",
                       message=f"Fast-path intent: {intent}")
        elif fast and (fast.is_confirmation or fast.is_denial):
            intent = "general"
        else:
            await _log(db, session_id, seq, "intent_classified",
                       message="Ambiguous intent — calling LLM for NLU")
            extracted = await classify_with_llm(user_message, groq_client, PRIMARY_MODEL)
            intent = extracted.intent or "general"
            if extracted.customer_name and not state.customer_name:
                state.customer_name = extracted.customer_name
            if extracted.customer_email and not state.customer_email:
                state.customer_email = extracted.customer_email
            if extracted.order_number and not state.order_number:
                state.order_number = extracted.order_number.upper() if extracted.order_number else None
            await _log(db, session_id, seq, "intent_classified",
                       message=f"LLM extracted intent: {intent}, name={extracted.customer_name}, "
                               f"email={extracted.customer_email}, order={extracted.order_number}")

        if state.intent is None:
            state.intent = intent

    # ── Step 2: Route by intent ─────────────────────────────────────────────────
    if intent == "policy_question":
        return await _handle_policy(state, db, session_id, seq, user_message)

    if intent == "general":
        return await _handle_general(state, db, session_id, seq, user_message)

    # refund_request and status_query → LLM function-calling loop
    return await _run_tool_calling_loop(state, db, session_id, seq, user_message)


# ── Intent handlers ───────────────────────────────────────────────────────────

async def _handle_general(
    state: SessionState, db: AsyncSession, session_id: uuid.UUID, seq: list[int], user_message: str
) -> tuple:
    reply = await _llm_chat([
        {"role": "system", "content": _SYSTEM_PROMPT_RESPONSE},
        {"role": "user", "content": (
            f"The customer said: '{user_message}'\n"
            "This is a general inquiry. Greet them naturally and ask how you can help. "
            "Keep it to 1–2 sentences."
        )},
    ])
    await _log(db, session_id, seq, "agent_response", message="General greeting")
    state.conversation_history.append({"role": "assistant", "content": reply})
    return reply, state.conversation_history, "no_action", None, None, None


async def _handle_policy(
    state: SessionState, db: AsyncSession, session_id: uuid.UUID, seq: list[int], user_message: str
) -> tuple:
    reply = await _llm_chat([
        {"role": "system", "content": _SYSTEM_PROMPT_RESPONSE},
        {"role": "user", "content": (
            f"Policy summary: {POLICY_SUMMARY}\n\n"
            f"Customer question: '{user_message}'\n"
            "Answer concisely using the policy above. Do not invent rules."
        )},
    ])
    await _log(db, session_id, seq, "agent_response", message="Policy question answered")
    state.conversation_history.append({"role": "assistant", "content": reply})
    return reply, state.conversation_history, "no_action", None, None, None


async def _handle_status_query(
    state: SessionState, db: AsyncSession, session_id: uuid.UUID, seq: list[int]
) -> tuple:
    """Check on an existing refund status."""
    # Collect missing info first
    if not state.customer_id:
        missing = await _resolve_customer(state, db, session_id, seq)
        if missing:
            return missing, state.conversation_history, "no_action", None, None, None

    if not state.order_id:
        missing = await _resolve_order(state, db, session_id, seq)
        if missing:
            return missing, state.conversation_history, "no_action", None, None, None

    # Query refund status
    t0 = time.monotonic()
    svc = RefundService(db)
    result = await svc.get_refund_status(state.order_id, state.customer_id)
    dur = int((time.monotonic() - t0) * 1000)

    await _log(db, session_id, seq, "tool_result",
               tool_name="get_refund_status", tool_output=result,
               message="Refund status retrieved", duration_ms=dur)

    context = json.dumps(result, default=str)
    reply = await _llm_chat([
        {"role": "system", "content": _SYSTEM_PROMPT_RESPONSE},
        {"role": "user", "content": (
            f"Structured refund status data: {context}\n\n"
            "Generate a concise natural-language response for the customer about their refund status. "
            f"Customer name: {state.customer_name or 'Customer'}"
        )},
    ])
    await _log(db, session_id, seq, "agent_response", message="Refund status explained")
    state.conversation_history.append({"role": "assistant", "content": reply})
    await _close_session(db, session_id, seq, status="completed", outcome="refund_status")
    return reply, state.conversation_history, "no_action", None, None, None


async def _handle_refund_request(
    state: SessionState, db: AsyncSession, session_id: uuid.UUID, seq: list[int]
) -> tuple:
    """Full deterministic refund workflow with 0 LLM calls for routing."""

    # ── collect customer ────────────────────────────────────────────────────
    if not state.customer_id:
        missing = await _resolve_customer(state, db, session_id, seq)
        if missing:
            return missing, state.conversation_history, "no_action", None, None, None

    # ── collect order ──────────────────────────────────────────────────────
    if not state.order_id:
        missing = await _resolve_order(state, db, session_id, seq)
        if missing:
            return missing, state.conversation_history, "no_action", None, None, None

    # ── check existing refund (always before eligibility) ─────────────────
    if not state.refund_status_checked:
        t0 = time.monotonic()
        refund_svc = RefundService(db)
        status_result = await refund_svc.get_refund_status(state.order_id, state.customer_id)
        dur = int((time.monotonic() - t0) * 1000)
        state.refund_status_checked = True

        await _log(db, session_id, seq, "tool_result",
                   tool_name="get_refund_status", tool_output=status_result,
                   message="Refund status checked", duration_ms=dur)

        if status_result.get("has_refund"):
            # Existing refund found — inform customer and stop
            context = json.dumps(status_result, default=str)
            reply = await _llm_chat([
                {"role": "system", "content": _SYSTEM_PROMPT_RESPONSE},
                {"role": "user", "content": (
                    f"An existing refund was found for this order: {context}\n"
                    f"Customer name: {state.customer_name or 'Customer'}\n"
                    "Inform the customer naturally about their existing refund. "
                    "Do not re-initiate the process."
                )},
            ])
            await _log(db, session_id, seq, "agent_response", message="Existing refund reported")
            state.conversation_history.append({"role": "assistant", "content": reply})
            await _close_session(db, session_id, seq, status="completed", outcome="refund_status")
            return reply, state.conversation_history, "no_action", None, None, None

    # ── check eligibility ──────────────────────────────────────────────────
    if not state.eligibility_checked:
        t0 = time.monotonic()
        policy_svc = PolicyService(db)
        order_svc = OrderService(db)
        order = await order_svc.get_by_id(state.order_id)
        elig = await policy_svc.evaluate(order)
        dur = int((time.monotonic() - t0) * 1000)
        state.eligibility_checked = True
        state.eligible = elig.eligible

        await _log(db, session_id, seq, "policy_check",
                   tool_name="check_refund_eligibility",
                   tool_output={"eligible": elig.eligible, "reason": elig.reason},
                   message=f"Eligibility: {elig.eligible} — {elig.reason[:80]}",
                   duration_ms=dur)

        if not elig.eligible:
            # DENIED — deterministic, no LLM needed for the decision
            state.decision = "denied"
            state.reason = elig.reason
            await _log(db, session_id, seq, "refund_denied",
                       message=f"Denied: {elig.reason[:100]}")

            reply = await _llm_chat([
                {"role": "system", "content": _SYSTEM_PROMPT_RESPONSE},
                {"role": "user", "content": (
                    f"The backend has DENIED this refund. Denial reason: {elig.reason}\n"
                    f"Customer name: {state.customer_name or 'Customer'}\n"
                    "Explain this denial kindly and clearly in 2–3 sentences. "
                    "Do not offer to override the policy."
                )},
            ])
            await _log(db, session_id, seq, "agent_response", message="Denial explained")
            state.conversation_history.append({"role": "assistant", "content": reply})
            await _close_session(db, session_id, seq, status="completed", outcome="denied")
            return reply, state.conversation_history, "denied", state.reason, None, None

        # ELIGIBLE — store order details summary for response and set confirmation flag
        state.waiting_for_confirmation = True
        order_svc2 = OrderService(db)
        order2 = await order_svc2.get_by_id(state.order_id)
        amount = float(order2.amount) if order2 else 0
        product = order2.product_name if order2 else "your item"

        reply = await _llm_chat([
            {"role": "system", "content": _SYSTEM_PROMPT_RESPONSE},
            {"role": "user", "content": (
                f"The backend has confirmed this order IS ELIGIBLE for a refund.\n"
                f"Customer name: {state.customer_name or 'Customer'}\n"
                f"Product: {product}\n"
                f"Amount: ₹{amount:,.2f}\n"
                f"Order: {state.order_number}\n"
                "Ask the customer to confirm they want to proceed with the refund. "
                "Make it clear and friendly. End with a yes/no question."
            )},
        ])
        await _log(db, session_id, seq, "agent_response", message="Confirmation requested")
        state.conversation_history.append({"role": "assistant", "content": reply})
        return reply, state.conversation_history, "no_action", None, None, None

    # Eligibility was already checked in a prior turn and was True —
    # but we haven't gotten confirmation yet. Re-ask.
    if state.eligible and state.waiting_for_confirmation:
        reply = "Would you like me to go ahead and process the refund? Please confirm with Yes or No."
        state.conversation_history.append({"role": "assistant", "content": reply})
        return reply, state.conversation_history, "no_action", None, None, None

    # Fallback
    reply = "I'm sorry, something went wrong. Please start a new conversation."
    return reply, state.conversation_history, "error", "state_error", None, None


async def _handle_confirmation(
    state: SessionState, db: AsyncSession, session_id: uuid.UUID, seq: list[int]
) -> tuple:
    """Customer confirmed — process refund directly without another LLM call for routing."""
    state.waiting_for_confirmation = False

    await _log(db, session_id, seq, "tool_call",
               tool_name="process_refund",
               tool_input={"order_id": str(state.order_id), "customer_id": str(state.customer_id)},
               message="Customer confirmed — processing refund")

    t0 = time.monotonic()
    refund_svc = RefundService(db)
    result = await refund_svc.process(state.order_id, state.customer_id, session_id)
    dur = int((time.monotonic() - t0) * 1000)

    await _log(db, session_id, seq, "tool_result",
               tool_name="process_refund", tool_output=result,
               message=f"Process refund result: success={result.get('success')}",
               duration_ms=dur)

    if result.get("success"):
        state.decision = "approved"
        state.reason = "eligible"
        state.refund_id = result.get("refund_id")
        state.refund_amount = result.get("refund_amount")
        await _log(db, session_id, seq, "refund_approved",
                   message=f"Refund ₹{state.refund_amount:,.2f} approved — ID: {state.refund_id}")

        reply = await _llm_chat([
            {"role": "system", "content": _SYSTEM_PROMPT_RESPONSE},
            {"role": "user", "content": (
                f"Refund APPROVED by backend.\n"
                f"Customer name: {state.customer_name or 'Customer'}\n"
                f"Refund amount: ₹{state.refund_amount:,.2f}\n"
                f"Refund ID: {state.refund_id}\n"
                "Generate a warm, concise confirmation message. "
                "Mention the amount, refund ID, and typical processing time of 3–5 business days."
            )},
        ])
        await _log(db, session_id, seq, "agent_response", message="Approval confirmed to customer")
        state.conversation_history.append({"role": "assistant", "content": reply})
        await _close_session(db, session_id, seq, status="completed", outcome="approved")
        clear_state(session_id)
        return reply, state.conversation_history, "approved", "eligible", state.refund_id, state.refund_amount

    else:
        # Backend denied at process stage (safety net re-validation)
        state.decision = "denied"
        state.reason = result.get("denial_code") or result.get("error", "not_eligible")
        await _log(db, session_id, seq, "refund_denied",
                   message=f"Process denied: {result.get('message', '')}")

        reply = await _llm_chat([
            {"role": "system", "content": _SYSTEM_PROMPT_RESPONSE},
            {"role": "user", "content": (
                f"The backend DENIED the refund during processing. Reason: {result.get('message', '')}\n"
                f"Customer name: {state.customer_name or 'Customer'}\n"
                "Explain this clearly and apologetically. Keep it brief."
            )},
        ])
        await _log(db, session_id, seq, "agent_response", message="Processing denial explained")
        state.conversation_history.append({"role": "assistant", "content": reply})
        await _close_session(db, session_id, seq, status="completed", outcome="denied")
        return reply, state.conversation_history, "denied", state.reason, None, None


async def _handle_denial(
    state: SessionState, db: AsyncSession, session_id: uuid.UUID, seq: list[int]
) -> tuple:
    """Customer said no to confirmation."""
    state.waiting_for_confirmation = False
    state.decision = "no_action"
    reply = "No problem! I've cancelled the refund request. Is there anything else I can help you with?"
    await _log(db, session_id, seq, "agent_response", message="Customer declined confirmation")
    state.conversation_history.append({"role": "assistant", "content": reply})
    return reply, state.conversation_history, "no_action", None, None, None


# ── Resolution helpers (0 LLM calls) ─────────────────────────────────────────

async def _resolve_customer(
    state: SessionState, db: AsyncSession, session_id: uuid.UUID, seq: list[int]
) -> str | None:
    """
    Resolve customer_id from known name/email.
    If no identifier is available, return a question string.
    If identifier is present but no match found, return not-found message.
    Returns None if customer was successfully resolved.
    """
    identifier = state.customer_email or state.customer_name
    if not identifier:
        reply = _ask_for_customer_info()
        state.conversation_history.append({"role": "assistant", "content": reply})
        await _log(db, session_id, seq, "agent_response", message="Asking for customer info")
        return reply

    # Try to look up
    t0 = time.monotonic()
    svc = CustomerService(db)
    id_type = "email" if (state.customer_email and "@" in state.customer_email) else "name"
    customer = await svc.find_by_identifier(identifier, id_type)
    dur = int((time.monotonic() - t0) * 1000)

    if not customer:
        await _log(db, session_id, seq, "tool_result",
                   tool_name="get_customer",
                   tool_output={"error": "not_found", "identifier": identifier},
                   message=f"Customer not found: {identifier}", duration_ms=dur)
        # Clear the bad identifier so customer can try again
        state.customer_email = None
        state.customer_name = None
        reply = _customer_not_found(identifier)
        state.conversation_history.append({"role": "assistant", "content": reply})
        return reply

    state.customer_id = customer.id
    state.customer_name = customer.name
    state.customer_email = customer.email

    await _log(db, session_id, seq, "customer_identified",
               tool_name="get_customer",
               tool_output={"customer_id": str(customer.id), "name": customer.name},
               message=f"Customer identified: {customer.name} ({customer.email})",
               duration_ms=dur)

    # Persist on DB session
    await db.execute(
        update(AgentSession)
        .where(AgentSession.id == session_id)
        .values(customer_id=customer.id)
    )
    return None


async def _resolve_order(
    state: SessionState, db: AsyncSession, session_id: uuid.UUID, seq: list[int]
) -> str | None:
    """
    Resolve order_id from known order_number.
    Returns None on success, or a question/error string.
    """
    if not state.order_number:
        reply = _ask_for_order_info(state.customer_name or "there")
        state.conversation_history.append({"role": "assistant", "content": reply})
        await _log(db, session_id, seq, "agent_response", message="Asking for order number")
        return reply

    t0 = time.monotonic()
    order_svc = OrderService(db)
    order = await order_svc.get_by_number(state.order_number, state.customer_id)
    dur = int((time.monotonic() - t0) * 1000)

    if not order:
        await _log(db, session_id, seq, "tool_result",
                   tool_name="get_order",
                   tool_output={"error": "not_found", "order_number": state.order_number},
                   message=f"Order not found: {state.order_number}", duration_ms=dur)
        old_number = state.order_number
        state.order_number = None
        reply = _order_not_found(old_number)
        state.conversation_history.append({"role": "assistant", "content": reply})
        return reply

    state.order_id = order.id
    state.order_number = order.order_number
    state.order_verified = True

    await _log(db, session_id, seq, "order_lookup",
               tool_name="get_order",
               tool_output={"order_id": str(order.id), "order_number": order.order_number,
                            "product_name": order.product_name, "amount": float(order.amount)},
               message=f"Order found: {order.order_number} — {order.product_name} (₹{order.amount:,.2f})",
               duration_ms=dur)
    return None


# ── Session close helper ──────────────────────────────────────────────────────

async def _close_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    seq: list[int],
    status: str,
    outcome: str,
    error_msg: str | None = None,
) -> None:
    seq[0] += 1
    db.add(AgentLog(
        session_id=session_id,
        sequence=seq[0],
        event_type="session_ended",
        message=f"Session {status} — outcome: {outcome}",
        error_message=error_msg,
    ))
    await db.execute(
        update(AgentSession)
        .where(AgentSession.id == session_id)
        .values(status=status, outcome=outcome, ended_at=datetime.now(timezone.utc))
    )
    await db.flush()
