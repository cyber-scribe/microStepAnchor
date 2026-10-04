from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

class UrgencyLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class ImportanceLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class TaskItem(BaseModel):
    id: str = Field(..., description="Unique task identifier")
    title: str = Field(..., min_length=1, max_length=500, description="Task description entered by user")
    urgency: UrgencyLevel = Field(default=UrgencyLevel.MEDIUM, description="Task urgency")
    importance: ImportanceLevel = Field(default=ImportanceLevel.MEDIUM, description="Task importance")

class PlanGenerationRequest(BaseModel):
    tasks: List[TaskItem] = Field(..., min_length=1, description="List of tasks to prioritize and decompose")

class MicroStepPlanItem(BaseModel):
    task: str = Field(..., description="Original task name")
    priority: int = Field(..., description="Execution priority ranking (1 is first)")
    estimated_minutes: int = Field(..., description="Estimated focus time in minutes")
    micro_steps: List[str] = Field(..., min_length=1, description="Actionable, non-hallucinated micro-steps")

class PlanResponse(BaseModel):
    plan: List[MicroStepPlanItem]
    provider: str = Field(default="mock", description="AI provider used to generate the plan")

class HealthResponse(BaseModel):
    status: str
    backend: str
    ai_provider: str
    message: str
    timestamp: str
