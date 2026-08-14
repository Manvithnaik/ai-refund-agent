/**
 * Shared types for the RefundBot frontend.
 * All types mirror the backend API contract exactly.
 */

/** Authoritative refund decision set by backend. Never parse LLM text for this. */
export type Decision = "approved" | "denied" | "no_action" | "error";

/** Session outcome persisted in DB. Richer than Decision. */
export type Outcome =
    | "approved"
    | "denied"
    | "pending"
    | "pending_confirmation"
    | "refund_status"
    | "no_action"
    | "error";

/** Session lifecycle status */
export type SessionStatus = "active" | "completed" | "error";

// ---- Chat ----

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    /** From response.decision — backend source of truth, never parsed from text */
    decision?: Decision;
    refundAmount?: number | null;
    refundId?: string | null;
}

// ---- API response shapes ----

export interface ChatResponse {
    session_id: string;
    message: string;
    is_complete: boolean;
    decision: Decision;
    reason: string | null;
    refund_id: string | null;
    refund_amount: number | null;
}

export interface AgentLog {
    id: string;
    session_id: string;
    sequence: number;
    event_type: string;
    tool_name: string | null;
    tool_input: Record<string, unknown> | null;
    tool_output: Record<string, unknown> | null;
    message: string | null;
    error_message: string | null;
    retry_count: number;
    duration_ms: number | null;
    created_at: string;
}

export interface Session {
    id: string;
    customer_name: string;
    customer_email: string | null;
    status: SessionStatus | string;
    started_at: string;
    ended_at: string | null;
    total_logs: number;
    outcome: Outcome | string;
    refund_amount: number | null;
    denial_reason: string | null;
}

export interface SessionDetail {
    id: string;
    status: SessionStatus | string;
    outcome?: Outcome | string;
    customer: { id: string; name: string; email: string } | null;
    started_at: string;
    ended_at: string | null;
    logs: AgentLog[];
    refund_requests: Array<{
        id: string;
        status: string;
        refund_amount: number | null;
        denial_reason: string | null;
        requested_at: string;
    }>;
}
