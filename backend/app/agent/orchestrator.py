"""
Agent Orchestrator — the agentic loop.

Architecture:
  Customer → LLM Agent → Tool Call → Business Service → PolicyService
                                              ↓
                                         Database
                                              ↓
                                     Structured Result
                                              ↓
                                            LLM
                                              ↓
                                     Customer Response

The LLM is responsible for ORCHESTRATION and NATURAL-LANGUAGE communication ONLY.
The backend services are responsible for ALL business rules and decisions.
The LLM NEVER independently approves or denies a refund.
"""

import json
import uuid
import asyncio
import logging
import time
from datetime import datetime, timezone
from openai import AsyncOpenAI  # Groq is OpenAI-API compatible
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.config import get_settings
from app.models.session import AgentSession
from app.models.log import AgentLog
from app.agent.tools import TOOLS
from app.agent.tool_handlers import TOOL_HANDLERS

logger = logging.getLogger(__name__)
settings = get_settings()

# Groq client — OpenAI-API compatible
groq_client = AsyncOpenAI(
    api_key=settings.groq_api_key,
    base_url="https://api.groq.com/openai/v1",
)

SYSTEM_PROMPT = """You are RefundBot, an AI customer support agent for ShopEase India.
You behave like a real customer support agent: natural, helpful, fast, and guided by company policy.

══════════════════════════════════
INTENT RECOGNITION & EFFICIENT TOOL EXECUTION
══════════════════════════════════
Determine the customer's intent from context. Do NOT ask them to classify their own request.
When the user provides multiple pieces of info in one message (e.g. name, email, order ID), execute all required initial tools concurrently in parallel (e.g. get_customer and get_order or get_refund_status together) to respond quickly without unnecessary turn delays.

1. NEW REFUND REQUEST  — customer wants to initiate a refund
2. REFUND STATUS QUERY — customer wants to know the status of an existing refund
3. REFUND POLICY QUESTION — customer asks about the refund policy
4. GENERAL / UNCLEAR — greet and ask how you can help
5. MISSING INFORMATION — you lack info needed to proceed; ask for it naturally

══════════════════════════════════
WORKFLOW FOR NEW REFUND REQUEST
══════════════════════════════════
Follow these steps in order. Skip steps for information the customer already provided.

Step 1 — Identify customer & order
  If customer provided name/email, call get_customer(identifier, identifier_type).
  If customer provided order number, call get_order(order_number, customer_id).
  (If customer provided both name/email and order number, call get_customer and get_order together!).

Step 2 — Check existing refund (MANDATORY — always do this before eligibility)
  Call: get_refund_status(order_id, customer_id)
  • If has_refund=true: inform customer an existing refund was found with reference, amount (₹), and status. STOP here.
  • If has_refund=false: continue to Step 3.

Step 3 — Check eligibility
  Call: check_refund_eligibility(order_id)
  • If eligible=false: explain reason clearly. STOP here.
  • If eligible=true: inform customer order is eligible and ask for explicit confirmation to process.

Step 4 — Confirm with customer BEFORE processing
  Ask: "Good news! Your order for [Product] (₹[Amount]) is eligible for a refund. Would you like me to go ahead and process it?"
  Wait for customer YES before calling process_refund.

Step 5 — Process refund (only after explicit confirmation)
  Call: process_refund(order_id, customer_id)

══════════════════════════════════
WORKFLOW FOR REFUND STATUS QUERY
══════════════════════════════════
When customer asks for status of an existing refund:
  1. Identify customer (get_customer) and/or order (get_order) if needed.
  2. Call: get_refund_status(order_id, customer_id)
  3. Return stored status from database. DO NOT check eligibility. DO NOT process.

══════════════════════════════════
CRITICAL RULES
══════════════════════════════════
- NEVER call get_customer with dummy placeholders (e.g. 'customer email').
- NEVER call process_refund without prior explicit customer confirmation.
- ALWAYS use tools to retrieve data — never invent it.
- ALWAYS quote monetary amounts in Indian Rupees (₹).
- Keep responses concise, warm, and fast."""

MAX_ITERATIONS = 10


async def create_session(db: AsyncSession) -> AgentSession:
    """Create a new agent session."""
    session = AgentSession(status="active")
    db.add(session)
    await db.flush()
    return session


async def get_session(session_id: uuid.UUID, db: AsyncSession) -> AgentSession | None:
    result = await db.execute(
        select(AgentSession).where(AgentSession.id == session_id)
    )
    return result.scalar_one_or_none()


async def log_event(
    db: AsyncSession,
    session_id: uuid.UUID,
    sequence: int,
    event_type: str,
    message: str | None = None,
    tool_name: str | None = None,
    tool_input: dict | None = None,
    tool_output: dict | None = None,
    error_message: str | None = None,
    retry_count: int = 0,
    duration_ms: int | None = None,
) -> AgentLog:
    """Write a structured event to agent_logs."""
    log = AgentLog(
        session_id=session_id,
        sequence=sequence,
        event_type=event_type,
        message=message,
        tool_name=tool_name,
        tool_input=tool_input,
        tool_output=tool_output,
        error_message=error_message,
        retry_count=retry_count,
        duration_ms=duration_ms,
    )
    db.add(log)
    await db.flush()
    return log


async def call_tool_with_retry(
    tool_name: str,
    args: dict,
    db: AsyncSession,
    session_id: uuid.UUID,
    sequence_counter: list,
    max_retries: int = 2,
) -> dict:
    """Execute a tool handler with retry logic for transient failures."""
    args["session_id"] = str(session_id)
    for attempt in range(max_retries + 1):
        start_time = time.monotonic()
        try:
            result = await TOOL_HANDLERS[tool_name](args, db)
            duration_ms = int((time.monotonic() - start_time) * 1000)

            if "error" in result:
                # Business error — log it but do NOT retry
                sequence_counter[0] += 1
                await log_event(
                    db, session_id, sequence_counter[0],
                    event_type="tool_result",
                    tool_name=tool_name,
                    tool_input=args,
                    tool_output=result,
                    message=f"Tool '{tool_name}' returned error: {result.get('error')}",
                    duration_ms=duration_ms,
                )
            else:
                sequence_counter[0] += 1
                await log_event(
                    db, session_id, sequence_counter[0],
                    event_type="tool_result",
                    tool_name=tool_name,
                    tool_input=args,
                    tool_output=result,
                    message=f"Tool '{tool_name}' completed successfully",
                    duration_ms=duration_ms,
                )
            return result

        except Exception as exc:
            duration_ms = int((time.monotonic() - start_time) * 1000)
            if attempt < max_retries:
                sequence_counter[0] += 1
                await log_event(
                    db, session_id, sequence_counter[0],
                    event_type="retry_attempt",
                    tool_name=tool_name,
                    tool_input=args,
                    error_message=str(exc),
                    retry_count=attempt + 1,
                    message=f"Tool '{tool_name}' failed (attempt {attempt + 1}), retrying...",
                )
                await asyncio.sleep(0.5 * (2 ** attempt))
            else:
                sequence_counter[0] += 1
                await log_event(
                    db, session_id, sequence_counter[0],
                    event_type="tool_error",
                    tool_name=tool_name,
                    tool_input=args,
                    error_message=str(exc),
                    retry_count=attempt,
                    message=f"Tool '{tool_name}' failed after {attempt + 1} attempts",
                    duration_ms=duration_ms,
                )
                return {
                    "error": "service_unavailable",
                    "message": "A temporary error occurred. Please try again.",
                }


async def _call_llm_with_fallback(messages: list[dict], tools: list[dict]):
    """
    Call primary model (llama-3.3-70b-versatile).
    If a 429 RateLimitError occurs, fall back to llama-3.1-8b-instant (higher TPM limit).
    """
    primary_model = "llama-3.3-70b-versatile"
    fallback_model = "llama-3.1-8b-instant"

    try:
        return await groq_client.chat.completions.create(
            model=primary_model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=0.1,
        )
    except Exception as exc:
        is_rate_limit = (
            "429" in str(exc)
            or "rate_limit" in str(exc).lower()
            or "RateLimitError" in type(exc).__name__
        )
        if is_rate_limit:
            logger.warning(
                f"Model '{primary_model}' rate limited. Falling back to '{fallback_model}'. Error: {exc}"
            )
            await asyncio.sleep(1.0)
            return await groq_client.chat.completions.create(
                model=fallback_model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                temperature=0.1,
            )
        raise exc


async def run_agent(
    user_message: str,
    session_id: uuid.UUID,
    conversation_history: list[dict],
    db: AsyncSession,
) -> tuple[str, list[dict], str, str | None, str | None, float | None]:
    """
    Run the agentic loop for one user turn.

    Returns:
        (
          assistant_message: str,
          updated_conversation_history: list[dict],
          decision: str,          # "approved" | "denied" | "no_action" | "error"
          reason: str | None,     # denial code or "eligible"
          refund_id: str | None,  # set on approval
          refund_amount: float | None,  # set on approval
        )

    CRITICAL: decision is derived from backend tool results, NEVER from LLM text.
    """
    seq = [len(conversation_history)]

    # Track refund outcome from tool results — backend is source of truth
    _decision: str = "no_action"
    _reason: str | None = None
    _refund_id: str | None = None
    _refund_amount: float | None = None
    _outcome: str = "pending"

    # Log incoming request
    seq[0] += 1
    await log_event(
        db, session_id, seq[0],
        event_type="request_received",
        message=f"Customer message received: {user_message[:100]}{'...' if len(user_message) > 100 else ''}",
    )

    # Append user message to history
    conversation_history.append({"role": "user", "content": user_message})

    for iteration in range(MAX_ITERATIONS):
        try:
            response = await _call_llm_with_fallback(
                messages=[{"role": "system", "content": SYSTEM_PROMPT}] + conversation_history,
                tools=TOOLS,
            )
        except Exception as exc:
            seq[0] += 1
            await log_event(
                db, session_id, seq[0],
                event_type="llm_error",
                error_message=str(exc),
                message=f"LLM API error: {type(exc).__name__}",
            )
            error_msg = "I'm having trouble connecting right now. Please try again in a moment."
            conversation_history.append({"role": "assistant", "content": error_msg})
            await _close_session(db, session_id, seq, status="error", outcome="error")
            return error_msg, conversation_history, "error", "llm_error", None, None

        choice = response.choices[0]
        assistant_message = choice.message

        # ----- Tool call branch -----
        if assistant_message.tool_calls:
            conversation_history.append(assistant_message.model_dump(exclude_unset=True))

            tool_results = []
            for tool_call in assistant_message.tool_calls:
                tool_name = tool_call.function.name
                try:
                    args = json.loads(tool_call.function.arguments)
                except json.JSONDecodeError:
                    args = {}

                # Log the tool call
                seq[0] += 1
                await log_event(
                    db, session_id, seq[0],
                    event_type="tool_call",
                    tool_name=tool_name,
                    tool_input=args,
                    message=f"Calling tool: {tool_name}",
                )

                # ---- Dispatch each tool and track special outcomes ----

                if tool_name == "get_customer":
                    result = await call_tool_with_retry(tool_name, args, db, session_id, seq)
                    if result.get("customer_id"):
                        seq[0] += 1
                        await log_event(
                            db, session_id, seq[0],
                            event_type="customer_identified",
                            message=f"Customer identified: {result.get('name')} ({result.get('email')})",
                        )
                        # Persist customer_id on session
                        await db.execute(
                            update(AgentSession)
                            .where(AgentSession.id == session_id)
                            .values(customer_id=uuid.UUID(result["customer_id"]))
                        )

                elif tool_name == "get_order":
                    result = await call_tool_with_retry(tool_name, args, db, session_id, seq)
                    if result.get("order_id"):
                        seq[0] += 1
                        await log_event(
                            db, session_id, seq[0],
                            event_type="order_lookup",
                            message=f"Order found: {result.get('order_number')} — {result.get('product_name')} (₹{result.get('amount')})",
                        )

                elif tool_name == "get_refund_status":
                    result = await call_tool_with_retry(tool_name, args, db, session_id, seq)
                    seq[0] += 1
                    _outcome = "refund_status"
                    if result.get("has_refund"):
                        await log_event(
                            db, session_id, seq[0],
                            event_type="refund_status_found",
                            tool_name=tool_name,
                            tool_output=result,
                            message=f"Existing refund found: {result.get('refund_id')} status={result.get('status')} amount=₹{result.get('amount')}",
                        )
                    else:
                        await log_event(
                            db, session_id, seq[0],
                            event_type="no_existing_refund",
                            tool_name=tool_name,
                            tool_output=result,
                            message="No existing refund found for this order.",
                        )

                elif tool_name == "check_refund_eligibility":
                    result = await call_tool_with_retry(tool_name, args, db, session_id, seq)
                    eligible = result.get("eligible", False)
                    seq[0] += 1
                    await log_event(
                        db, session_id, seq[0],
                        event_type="policy_check",
                        tool_name=tool_name,
                        tool_output=result,
                        message=f"Eligibility: {'eligible' if eligible else 'not eligible'} — {result.get('reason', '')[:120]}",
                    )
                    if not eligible:
                        _decision = "denied"
                        _reason = result.get("reason", "not_eligible")
                        _outcome = "denied"
                        seq[0] += 1
                        await log_event(
                            db, session_id, seq[0],
                            event_type="refund_denied",
                            tool_name=tool_name,
                            tool_output=result,
                            message=f"Refund denied: {result.get('reason', '')[:120]}",
                        )
                    else:
                        _outcome = "pending_confirmation"

                elif tool_name == "process_refund":
                    result = await call_tool_with_retry(tool_name, args, db, session_id, seq)
                    if result.get("success"):
                        # APPROVED — derive all decision fields from the backend result
                        _decision = "approved"
                        _reason = "eligible"
                        _refund_id = result.get("refund_id")
                        _refund_amount = result.get("refund_amount")
                        _outcome = "approved"
                        seq[0] += 1
                        await log_event(
                            db, session_id, seq[0],
                            event_type="refund_approved",
                            tool_name=tool_name,
                            tool_output=result,
                            message=f"Refund approved: {result.get('currency', 'INR')} {result.get('refund_amount', 0):,.2f}",
                        )
                    else:
                        # DENIED at processing stage — derive denial code from backend result
                        _decision = "denied"
                        _reason = result.get("denial_code") or result.get("error", "not_eligible")
                        _outcome = "denied"
                        seq[0] += 1
                        await log_event(
                            db, session_id, seq[0],
                            event_type="refund_denied",
                            tool_name=tool_name,
                            tool_output=result,
                            message=f"Refund denied: {result.get('error', '')} — {result.get('message', '')[:100]}",
                        )

                else:
                    result = await call_tool_with_retry(tool_name, args, db, session_id, seq)

                tool_results.append({
                    "tool_call_id": tool_call.id,
                    "role": "tool",
                    "name": tool_name,
                    "content": json.dumps(result),
                })

            conversation_history.extend(tool_results)
            continue  # Next LLM iteration

        # ----- Text response branch (final) -----
        final_message = assistant_message.content or "I'm sorry, I couldn't generate a response."

        seq[0] += 1
        await log_event(
            db, session_id, seq[0],
            event_type="agent_response",
            message=f"Agent response sent ({len(final_message)} chars)",
        )

        # Finalize session on terminal outcomes (approved, denied, refund_status).
        # Active interactions (pending, pending_confirmation) remain "active".
        if _decision in ("approved", "denied") or _outcome in ("approved", "denied", "refund_status"):
            final_outcome = _outcome if _outcome in ("approved", "denied", "refund_status") else _decision
            await _close_session(db, session_id, seq, status="completed", outcome=final_outcome)
        else:
            # Active session — persist current intermediate outcome (pending, pending_confirmation)
            await db.execute(
                update(AgentSession)
                .where(AgentSession.id == session_id)
                .values(status="active", outcome=_outcome)
            )
            await db.flush()

        conversation_history.append({"role": "assistant", "content": final_message})
        return final_message, conversation_history, _decision, _reason, _refund_id, _refund_amount

    # Max iterations exceeded
    await _close_session(
        db, session_id, seq,
        status="error", outcome="error",
        error_msg=f"Max iterations ({MAX_ITERATIONS}) exceeded",
    )
    timeout_msg = "I'm sorry, this request is taking longer than expected. Please try again."
    return timeout_msg, conversation_history, "error", "timeout", None, None


async def _close_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    seq: list,
    status: str,
    outcome: str,
    error_msg: str | None = None,
) -> None:
    """Persist session close event and update session record."""
    seq[0] += 1
    await log_event(
        db, session_id, seq[0],
        event_type="session_ended",
        message=f"Session {status} — outcome: {outcome}",
        error_message=error_msg,
    )
    await db.execute(
        update(AgentSession)
        .where(AgentSession.id == session_id)
        .values(
            status=status,
            outcome=outcome,
            ended_at=datetime.now(timezone.utc),
        )
    )
    await db.flush()

