/**
 * API service layer.
 * All types imported from lib/types.ts — a single source of truth.
 */

import type {
  ChatResponse,
  AgentLog,
  Session,
  SessionDetail,
} from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// ---- Chat ----

export async function sendMessage(
  message: string,
  sessionId?: string
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId ?? null }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

// ---- Chat logs ----

export async function getSessionLogs(sessionId: string): Promise<AgentLog[]> {
  const res = await fetch(`${API_URL}/chat/${sessionId}/logs`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ---- Admin ----

export async function getSessions(): Promise<Session[]> {
  const res = await fetch(`${API_URL}/admin/sessions`, {
    // Prevent stale dashboard data between navigations
    next: { revalidate: 0 },
  } as RequestInit);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function getSessionDetail(
  sessionId: string
): Promise<SessionDetail> {
  const res = await fetch(`${API_URL}/admin/sessions/${sessionId}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// Re-export types so pages can import everything from one place
export type { ChatResponse, AgentLog, Session, SessionDetail };
