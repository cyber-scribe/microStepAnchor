import os
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from models import PlanGenerationRequest, PlanResponse, HealthResponse
from ai import get_ai_adapter

# Load environment variables
load_dotenv()

app = FastAPI(
    title="MicroStep Anchor API",
    description="Backend service for MicroStep Anchor - Eisenhower prioritization and micro-step decomposition",
    version="1.0.0",
)

# Enable CORS for local dev / Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Verify backend health and active AI adapter configuration."""
    provider = os.getenv("AI_PROVIDER", "mock")
    return HealthResponse(
        status="ok",
        backend="FastAPI",
        ai_provider=provider,
        message="MicroStep Anchor backend is operational",
        timestamp=datetime.now(timezone.utc).isoformat()
    )

@app.post("/api/generate-plan", response_model=PlanResponse)
async def generate_plan(request: PlanGenerationRequest):
    """
    Generate an Eisenhower-prioritized action plan broken into granular micro-steps.
    Validated schema returned to ensure UI consistency.
    """
    if not request.tasks:
        raise HTTPException(status_code=400, detail="At least one task must be provided.")

    try:
        adapter = get_ai_adapter()
        plan_items = await adapter.generate_plan(request.tasks)
        return PlanResponse(plan=plan_items, provider=adapter.provider_used)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate micro-step plan: {str(exc)}"
        )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    host = os.getenv("HOST", "127.0.0.1")
    uvicorn.run("main:app", host=host, port=port, reload=True)
