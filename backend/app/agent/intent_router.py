"""
Intent Router — fast-path intent classification with LLM fallback.

Priority order:
  1. Keyword/regex fast-path (0ms, no LLM) for unambiguous intents
  2. Single LLM call to extract structured intent + entities for ambiguous messages

The LLM here is used ONLY for NLU — never for decisions or tool routing.
"""

from __future__ import annotations
import json
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# ── Keyword patterns ─────────────────────────────────────────────────────────

_REFUND_PATTERNS = re.compile(
    r"\b(refund|return|money back|get my money|cancel.*refund|refund.*order"
    r"|want.*refund|need.*refund|request.*refund|initiat.*refund|claim.*refund)\b",
    re.IGNORECASE,
)

_STATUS_PATTERNS = re.compile(
    r"\b(status.*refund|refund.*status|where.*refund|track.*refund"
    r"|check.*refund|update.*refund|my refund|pending refund)\b",
    re.IGNORECASE,
)

_POLICY_PATTERNS = re.compile(
    r"\b(policy|policies|eligible|eligibility|rules|what.*refundable|can i return"
    r"|how long|time limit|window|non.refundable|final sale)\b",
    re.IGNORECASE,
)

_CONFIRM_PATTERNS = re.compile(
    r"^(yes|yeah|yep|yup|sure|ok|okay|go ahead|process it|proceed"
    r"|confirm|do it|please do|please proceed|that\'s fine|sounds good"
    r"|absolutely|definitely|correct|right|please|please yes)[\s!.]*$",
    re.IGNORECASE,
)

_DENY_PATTERNS = re.compile(
    r"^(no|nope|nah|cancel|stop|don\'t|never mind|nevermind|forget it"
    r"|not now|no thanks|negative)[\s!.]*$",
    re.IGNORECASE,
)

# Patterns for extracting identifiers from messages
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", re.IGNORECASE)
_ORDER_RE = re.compile(r"\bORD-\d{4}\b", re.IGNORECASE)


class ExtractedInfo:
    """Structured extraction result from intent classification."""

    def __init__(
        self,
        intent: Optional[str],
        customer_name: Optional[str] = None,
        customer_email: Optional[str] = None,
        order_number: Optional[str] = None,
        is_confirmation: bool = False,
        is_denial: bool = False,
    ):
        self.intent = intent
        self.customer_name = customer_name
        self.customer_email = customer_email
        self.order_number = order_number
        self.is_confirmation = is_confirmation
        self.is_denial = is_denial


def _extract_identifiers_from_text(message: str) -> dict:
    """Pull out email, order number from raw text without LLM."""
    email_match = _EMAIL_RE.search(message)
    order_match = _ORDER_RE.search(message)
    return {
        "email": email_match.group(0) if email_match else None,
        "order_number": order_match.group(0).upper() if order_match else None,
    }


def classify_fast(message: str) -> Optional[ExtractedInfo]:
    """
    Fast-path keyword classifier. Returns ExtractedInfo if intent is clear,
    or None if the message is ambiguous and needs LLM interpretation.

    Also extracts any identifiers (email, order number) present in the text.
    """
    stripped = message.strip()
    identifiers = _extract_identifiers_from_text(stripped)

    # Confirmation / denial (checked first — they override other intents)
    if _CONFIRM_PATTERNS.match(stripped):
        return ExtractedInfo(intent=None, is_confirmation=True)

    if _DENY_PATTERNS.match(stripped):
        return ExtractedInfo(intent=None, is_denial=True)

    # Status query (before refund, since "refund status" would match both)
    if _STATUS_PATTERNS.search(stripped):
        return ExtractedInfo(
            intent="status_query",
            customer_email=identifiers["email"],
            order_number=identifiers["order_number"],
        )

    # Refund request
    if _REFUND_PATTERNS.search(stripped):
        return ExtractedInfo(
            intent="refund_request",
            customer_email=identifiers["email"],
            order_number=identifiers["order_number"],
        )

    # Policy question
    if _POLICY_PATTERNS.search(stripped):
        return ExtractedInfo(intent="policy_question")

    # Ambiguous — needs LLM
    return None


async def classify_with_llm(message: str, groq_client, model: str) -> ExtractedInfo:
    """
    Single LLM call for ambiguous messages.
    Extracts structured intent + entities from natural-language text.
    The LLM NEVER makes business decisions here — only understands language.
    """
    system = (
        "You are a customer support intent classifier. "
        "Extract structured information from the customer's message. "
        "Return ONLY valid JSON with these exact keys:\n"
        '  "intent": one of ["refund_request", "status_query", "policy_question", "general"]\n'
        '  "customer_name": string or null\n'
        '  "customer_email": string or null\n'
        '  "order_number": string or null (format: ORD-XXXX)\n'
        "Do not add any explanation. Return only the JSON object."
    )

    try:
        response = await groq_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": message},
            ],
            temperature=0.0,
            max_tokens=150,
            timeout=10.0,
        )
        raw = response.choices[0].message.content or "{}"
        # Strip markdown code fences if present
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(raw)
    except Exception as exc:
        logger.warning(f"Intent LLM extraction failed: {exc}. Defaulting to 'general'.")
        data = {}

    return ExtractedInfo(
        intent=data.get("intent") or "general",
        customer_name=data.get("customer_name"),
        customer_email=data.get("customer_email"),
        order_number=data.get("order_number"),
    )
