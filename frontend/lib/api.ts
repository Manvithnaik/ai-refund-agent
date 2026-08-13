const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export interface ChatResponse {
  session_id: string;
  message: string;
  is_complete: boolean;
  // Authoritative backend decision — use this, never parse the message text
  decision: "approved" | "denied" | "no_action" | "error";
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
  status: string;
  started_at: string;
  ended_at: string | null;
  total_logs: number;
  outcome: string;
  refund_amount: number | null;
  denial_reason: string | null;
}

export interface SessionDetail {
  id: string;
  status: string;
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

export async function sendMessage(
  message: string,
  sessionId?: string
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId || null }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getSessionLogs(sessionId: string): Promise<AgentLog[]> {
  const res = await fetch(`${API_URL}/chat/${sessionId}/logs`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getSessions(): Promise<Session[]> {
  const res = await fetch(`${API_URL}/admin/sessions`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  const res = await fetch(`${API_URL}/admin/sessions/${sessionId}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
