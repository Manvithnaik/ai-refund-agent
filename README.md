# 🤖 AI Refund Agent — ShopEase Customer Support

A fully functional **AI Customer Support Agent** that processes or denies e-commerce refund requests using an LLM-backed agent loop with deterministic policy enforcement.

Built with **Next.js 15** (frontend) and **FastAPI** (backend), powered by **OpenAI / GPT-OSS 120B**.

---

## 🚀 Live Features

- 💬 **Customer Chat Interface** — Multi-turn conversational refund assistant
- 🛡️ **Deterministic Policy Engine** — 7-point rule evaluation. The LLM never decides eligibility
- 🧠 **Agent Loop (Raw Function Calling)** — Dynamic tool orchestration (`get_customer` → `get_order` → `check_refund_eligibility` → `process_refund`)
- 📊 **Admin Dashboard** — Real-time agent reasoning logs with full tool call trace
- 🔐 **Admin Auth** — Session-based login protecting the dashboard

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy (async), Alembic |
| Database | PostgreSQL |
| LLM | OpenAI API — `openai/gpt-oss-120b` (fallback: `gpt-4o-mini` — pending) |
| Agent Pattern | Raw Function Calling / State-Machine Agent Loop |

---

## 🏛️ System Architecture

![AI Refund Agent — System Architecture](./architecture.png)

## ⚙️ Setup & Running

### 1. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Create a .env file:
# DATABASE_URL=postgresql+asyncpg://user:pass@localhost/refunddb
# GROQ_API_KEY=your_groq_api_key

# Run DB migrations
alembic upgrade head

# Seed the database (15 customers + policy)
python -m app.seed.seed_data

# Start the API server
uvicorn app.main:app --reload
```

Backend runs at: `http://localhost:8000`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: `http://localhost:3000`

---

## 🔐 Admin Panel

| Field | Value |
|---|---|
| URL | `http://localhost:3000/admin/login` |
| Email | `admin@123` |
| Password | `123456` |

The admin dashboard shows **live session reasoning logs** for every agent conversation — tool calls, policy decisions, approval/denial events, and LLM responses.

---

## 🗄️ Mock Data — 15 Customer Profiles

All 15 customers cover every approval and denial scenario defined by the refund policy:

| Order | Customer | Product | Expected Outcome | Reason |
|---|---|---|---|---|
| ORD-1001 | Aarav Sharma | Pro Wireless Headphones | ✅ **APPROVED** | Delivered 10 days ago |
| ORD-1002 | Ananya Verma | Mechanical Gaming Keyboard | ❌ **DENIED** | Window expired (45 days) |
| ORD-1003 | Rajesh Patel | Clearance Designer Silk Kurta | ❌ **DENIED** | Final sale item |
| ORD-1004 | Priya Nair | Custom Engraved Leather Wallet | ❌ **DENIED** | Personalized/custom item |
| ORD-1005 | Rohan Gupta | Waterproof All-Weather Jacket | ❌ **DENIED** | Already refunded |
| ORD-1006 | Meera Joshi | Python Data Science Course | ❌ **DENIED** | Digital product (restricted) |
| ORD-1007 | Vikram Malhotra | Trail Running Shoes | ❌ **DENIED** | Not yet delivered (shipped) |
| ORD-1008 | Sneha Kulkarni | 4K IPS Monitor 27-inch | ✅ **APPROVED** | Delivered 16 days ago |
| ORD-1009 | Devansh Mehta | Gourmet Festive Sweets Basket | ❌ **DENIED** | Food category (restricted) |
| ORD-1010 | Kavya Reddy | Pure Merino Wool Shawl | ✅ **APPROVED** | Delivered 20 days ago |
| ORD-1011 | Siddharth Rao | Compact Mirrorless 4K Camera | ❌ **DENIED** | Window expired (31 days) |
| ORD-1012 | Pooja Kapoor | ANC TWS Earbuds | ✅ **APPROVED** | Delivered 28 days ago (edge case) |
| ORD-1013 | Ishaan Bhat | Refurbished AMOLED Smart Watch | ❌ **DENIED** | Final sale (clearance) |
| ORD-1014 | Simran Gill | Ergonomic Mesh Office Chair | ✅ **APPROVED** | Delivered 11 days ago |
| ORD-1015 | Arjun Iyer | Automatic Espresso Machine | ❌ **DENIED** | Customer-damaged item |

---

## 📋 Refund Policy Rules

The `PolicyService` enforces these 7 rules deterministically — the LLM is never consulted for eligibility:

1. **Order Status** — Must be `delivered`
2. **Refund Window** — Must be within **30 days** of delivery
3. **Final Sale** — Non-refundable
4. **Personalized Items** — Non-refundable
5. **Restricted Categories** — `food` and `digital` are excluded
6. **Customer Damage** — Items damaged by the customer are not covered
7. **Duplicate Prevention** — An existing approved refund blocks re-processing

---

## 🧩 Agent Workflow

```
User Message
  → Intent Router  (keyword match; LLM only if ambiguous)
      ├─ Refund Request → Collect Info → get_customer → get_order
      │                                   → check_refund_eligibility (PolicyService)
      │                                       ├─ Eligible   → Confirmation Gate → process_refund
      │                                       └─ Not Eligible → Denial
      ├─ Refund Status → get_refund_status
      └─ General Query → LLM Direct Response
                                   ↓
                        Final LLM call → Response to User
```

**LLM Call Budget:**
- Clear request, all info provided: **1 LLM call**
- Ambiguous message: **2 LLM calls**
- Full refund lifecycle: **2–3 total** (vs. naive 6+)

---

## 📁 Project Structure

```
ai-refund-agent/
├── backend/
│   └── app/
│       ├── agent/          # Orchestrator, intent router, tools, tool handlers
│       ├── services/       # CustomerService, OrderService, PolicyService, RefundService
│       ├── models/         # SQLAlchemy models (Customer, Order, RefundRequest, etc.)
│       ├── routers/        # FastAPI route handlers
│       ├── seed/           # Database seed script (15 customers + policy)
│       └── main.py
└── frontend/
    └── app/
        ├── page.tsx        # Customer chat interface
        ├── admin/          # Admin dashboard + session detail + login
        └── api/            # Next.js API routes (admin auth)
```

---

## 📄 License

MIT — built as a hiring assignment demonstration.
