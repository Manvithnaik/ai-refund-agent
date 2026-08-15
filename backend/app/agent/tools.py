"""
OpenAI tool definitions for the refund agent.
These are the JSON schemas passed to the OpenAI API.
The LLM uses these to decide which tools to call and with what arguments.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_customer",
            "description": (
                "Look up a customer in the CRM database by their email address or full name. "
                "CRITICAL: ONLY call this when the customer has explicitly provided their real email or name in the conversation. "
                "NEVER call this with placeholder text like 'customer email or name' or before the customer gives their name/email."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "identifier": {
                        "type": "string",
                        "description": "The exact email address or full name provided by the customer in the conversation",
                    },
                    "identifier_type": {
                        "type": "string",
                        "enum": ["email", "name"],
                        "description": "Must be exactly 'email' or 'name'",
                    },
                },
                "required": ["identifier", "identifier_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_order",
            "description": (
                "Retrieve order details by order number. "
                "Requires a verified customer_id. "
                "Always call get_customer before this tool."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "order_number": {
                        "type": "string",
                        "description": "The order number (e.g., ORD-1001)",
                    },
                    "customer_id": {
                        "type": "string",
                        "description": "The UUID of the identified customer",
                    },
                },
                "required": ["order_number", "customer_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_refund_policy",
            "description": (
                "Retrieve the current refund policy rules. "
                "Call this to understand the policy before or after checking eligibility, "
                "especially when explaining a denial to the customer."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_refund_status",
            "description": (
                "Retrieve the current refund status for an order. "
                "Always call this BEFORE check_refund_eligibility for any new refund request, "
                "and always call this (instead of eligibility/process tools) when the customer "
                "asks about the status of an existing refund. "
                "Returns has_refund=true with full details if a refund already exists, "
                "or has_refund=false if no refund has been processed yet."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "The UUID of the order to check refund status for",
                    },
                    "customer_id": {
                        "type": "string",
                        "description": "The UUID of the verified customer (for ownership check)",
                    },
                },
                "required": ["order_id", "customer_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_refund_eligibility",
            "description": (
                "Deterministically check whether an order is eligible for a refund "
                "based on company policy. This uses backend business logic — "
                "do NOT make eligibility decisions yourself. Always call this before process_refund."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "The UUID of the order to check",
                    },
                },
                "required": ["order_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "process_refund",
            "description": (
                "Execute a refund for an eligible order. "
                "ONLY call this after check_refund_eligibility returns eligible=true "
                "AND the customer has explicitly confirmed they want to proceed. "
                "Never call this without first checking eligibility."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "The UUID of the order to refund",
                    },
                    "customer_id": {
                        "type": "string",
                        "description": "The UUID of the customer",
                    },
                    "session_id": {
                        "type": "string",
                        "description": "Session ID (injected server-side — do not supply)",
                    },
                },
                "required": ["order_id", "customer_id"],
            },
        },
    },
]
