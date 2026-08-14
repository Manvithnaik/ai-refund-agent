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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, session_id: sessionId ?? null }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out. The server took too long to respond. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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
