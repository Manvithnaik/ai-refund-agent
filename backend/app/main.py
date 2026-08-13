"""
FastAPI Application Entry Point.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import chat, admin, health

settings = get_settings()

app = FastAPI(
    title="AI Customer Support Refund Agent API",
    description="Backend service for AI refund agent with deterministic policy enforcement.",
    version="1.0.0",
)

# CORS configuration — allows Next.js frontend to communicate seamlessly
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(health.router)
app.include_router(chat.router)
app.include_router(admin.router)


@app.get("/")
async def root():
    return {
        "message": "Welcome to AI Customer Support Refund Agent API",
        "docs": "/docs",
        "health": "/health",
    }
