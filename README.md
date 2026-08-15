# ShopEase India — AI Customer Support Agent

A production-grade AI refund agent for an Indian e-commerce platform. Built as a Next.js Developer assignment submission, it demonstrates a complete agentic system with deterministic policy enforcement, raw LLM function-calling, a real-time admin audit dashboard, and a secure confirmation safety gate.

---

## 🎥 Demo Video

> **[Watch the demo →](https://drive.google.com/drive/folders/1HkOFoacpBEGopp6DwiSuR5JpUJ87InDx)**

---

## Assignment Objective

Build an AI customer support agent capable of processing or denying refund requests end-to-end — using a real LLM function-calling loop, backend policy enforcement, a customer confirmation gate, and a live admin audit trail.

---

## Key Features

- **Conversational AI agent** — multi-turn chat with full session memory
- **Raw LLM function-calling** — 5 tools wired directly into the agent loop (no LangChain/LlamaIndex)
- **Deterministic policy engine** — LLM never decides eligibility; the backend is the single source of truth
- **Confirmation safety gate** — `process_refund` is blocked server-side until the customer explicitly says yes
- **Admin console** — live session browser, full tool-call audit trail per session
- **15 seeded mock customers** — covers every policy edge case (approved, expired, final sale, already refunded, digital, food, damaged, not-delivered)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy (async), Alembic |
| Database | PostgreSQL (Neon serverless) |
| LLM | OpenAI API — `openai/gpt-oss-120b` |
| Agent Pattern | Raw LLM Function-Calling / State-Machine Loop |

---

## Architecture Overview

```
User message
    ↓
[1] Fast Intent Router (keyword/regex — 0ms, no LLM)
    ↓ ambiguous only
[2] LLM NLU call (extract intent + entities)
    ↓
[3] State-Machine Agent Loop
      LLM + TOOLS → tool_calls → TOOL_HANDLERS → tool results → back to LLM
      (repeats until no more tool_calls)
    ↓
[4] Safety gate: process_refund blocked until state.confirmed == True
    ↓
[5] Final LLM response → customer
    ↓
[6] Audit log written to PostgreSQL
```

**LLM call budget per refund lifecycle: 2–3 calls maximum** (vs naive 6+)

> The LLM handles language only. It never decides eligibility, tool routing, or business policy.

---

## How Tool-Calling Works

The backend uses the `openai` Python SDK with raw function-calling — no agent framework.

```python
resp = await llm_client.chat.completions.create(
    model="openai/gpt-oss-120b",
    messages=messages,
    tools=TOOLS,          # JSON function schemas
    tool_choice="auto",
    temperature=0.1,
)
```

Each LLM response is inspected for `tool_calls`. Results are appended as `role: "tool"` messages and fed back into the next iteration. The loop continues until the model returns a plain text response.

### Available Tools

| Tool | Purpose |
|---|---|
| `get_customer` | Look up customer by name or email |
| `get_order` | Retrieve order details by order number |
| `get_refund_status` | Check if a refund already exists for an order |
| `check_refund_eligibility` | Run backend policy evaluation (never the LLM's call) |
| `process_refund` | Execute the refund — **blocked unless `state.confirmed == True`** |

---

## Deterministic Refund Policy

Policy rules live in the database (`refund_policies` table) and are evaluated by `PolicyService` — not the LLM.

| Rule | Value |
|---|---|
| Refund window | 30 days from delivery |
| Eligible status | `delivered` only |
| Restricted categories | `food`, `digital` |
| Final-sale items | Not refundable |
| Personalized/custom items | Not refundable |
| Customer-damaged items | Not refundable |
| Duplicate refund | Blocked |

---

## Confirmation Safety Gate

Even if the LLM calls `process_refund` prematurely, the server blocks it:

```python
if tool_name == "process_refund" and not state.confirmed:
    state.waiting_for_confirmation = True
    # Returns "confirmation_required" to LLM — forces a yes/no question to customer
```

`state.confirmed` is only set `True` when the customer's message matches the confirmation pattern server-side. The LLM cannot bypass this.

---

## Admin Dashboard & Audit Trail

- **URL:** `http://localhost:3000/admin`
- Lists all agent sessions with customer name, outcome, and timestamp
- Click any session to view the complete tool-call audit log:
  - Intent classified
  - Tool called (with input args)
  - Tool result (from backend service)
  - Policy decision
  - LLM response

---

## Database / Mock CRM

PostgreSQL with 15 seeded customers covering all policy scenarios:

| Order | Customer | Scenario |
|---|---|---|
| ORD-1001 | Aarav Sharma | ✅ Eligible — approved |
| ORD-1002 | Ananya Verma | ❌ Expired 30-day window |
| ORD-1003 | Rajesh Patel | ❌ Final sale item |
| ORD-1004 | Priya Nair | ❌ Personalized item |
| ORD-1005 | Rohan Gupta | ❌ Already refunded |
| ORD-1006 | Meera Joshi | ❌ Digital product |
| ORD-1007 | Vikram Malhotra | ❌ Not yet delivered |
| ORD-1008 | Sneha Kulkarni | ✅ Eligible — approved |
| ORD-1009 | Devansh Mehta | ❌ Food/perishable |
| ORD-1010 | Kavya Reddy | ✅ Eligible — approved |
| ORD-1011 | Siddharth Rao | ❌ Just expired (31 days) |
| ORD-1012 | Pooja Kapoor | ✅ Eligible — edge case (28 days) |
| ORD-1013 | Ishaan Bhat | ❌ Final sale (clearance) |
| ORD-1014 | Simran Gill | ✅ Eligible — approved |
| ORD-1015 | Arjun Iyer | ❌ Customer-damaged |

---

## Project Structure

```
ai-refund-agent/
├── backend/
│   ├── app/
│   │   ├── agent/
│   │   │   ├── orchestrator.py      # Main agent loop + LLM function-calling
│   │   │   ├── intent_router.py     # Fast keyword classifier + LLM NLU fallback
│   │   │   ├── tools.py             # Tool JSON schemas (TOOLS list)
│   │   │   ├── tool_handlers.py     # Tool execution handlers
│   │   │   └── session_state.py     # In-memory session state
│   │   ├── services/
│   │   │   ├── customer_service.py
│   │   │   ├── order_service.py
│   │   │   ├── refund_service.py
│   │   │   └── policy_service.py    # Deterministic policy evaluation
│   │   ├── models/                  # SQLAlchemy ORM models
│   │   ├── routers/
│   │   │   ├── chat.py              # POST /chat — main agent endpoint
│   │   │   ├── admin.py             # Admin session/log endpoints
│   │   │   └── dev_reset.py         # Demo reset endpoint (non-production only)
│   │   ├── seed/seed_data.py        # 15 mock customers + policy seeder
│   │   └── config.py
│   ├── .env.example
│   └── requirements.txt
└── frontend/
    ├── app/
    │   ├── page.tsx                 # Chat UI
    │   ├── admin/page.tsx           # Admin session list
    │   └── admin/[sessionId]/       # Per-session audit log
    ├── components/
    │   ├── chat/                    # Chat message components
    │   └── ui/                      # Shared UI components
    └── lib/api.ts                   # Backend API client
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL database (or a [Neon](https://neon.tech) free-tier connection string)

### 1. Clone the repository

```bash
git clone https://github.com/Manvithnaik/ai-refund-agent.git
cd ai-refund-agent
```

### 2. Backend setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt

cp .env.example .env
# Edit .env and fill in your values (see Environment Variables below)

# Run DB migrations
alembic upgrade head

# Seed the database with 15 mock customers
python -m app.seed.seed_data

# Start the backend
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3000**  
Backend API at **http://localhost:8000**

---

## Environment Variables

Create `backend/.env` from `backend/.env.example`:

```env
DATABASE_URL=postgresql+asyncpg://user:password@host/dbname?ssl=require
OPENAI_API_KEY=your-openai-api-key-here
ENVIRONMENT=development
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL async connection string |
| `OPENAI_API_KEY` | OpenAI API key (used for `openai/gpt-oss-120b`) |
| `ENVIRONMENT` | `development` or `production` (controls dev-reset endpoint) |

---

## Admin Console Login

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `shopease2024` |

> Admin credentials are validated in the Next.js API route (`/app/api/admin/login/route.ts`). Change these before any public deployment.

---

## Example Test Scenarios

| Scenario | Customer | Order | Expected |
|---|---|---|---|
| Happy path — approve | Aarav Sharma | ORD-1001 | Eligible → confirm → refund approved |
| Expired window | Ananya Verma | ORD-1002 | Denied — outside 30-day window |
| Already refunded | Rohan Gupta | ORD-1005 | Denied — duplicate refund blocked |
| Eligible VIP | Simran Gill | ORD-1014 | Eligible → confirm → refund approved |
| Final sale | Rajesh Patel | ORD-1003 | Denied — final sale |
| Digital product | Meera Joshi | ORD-1006 | Denied — restricted category |

---

## Demo Reset

During a demo, wipe all session data (keeps customers and orders intact):

```bash
curl -X POST http://localhost:8000/dev/reset-demo-sessions
```

*Only available when `ENVIRONMENT != production`.*

---

*Built by Manvith Naik — Jobform Automator Next.js Developer assignment, August 2026.*
