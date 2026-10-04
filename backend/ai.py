import json
import os
from abc import ABC, abstractmethod
from typing import List

import httpx

from models import (
    TaskItem,
    MicroStepPlanItem,
    UrgencyLevel,
    ImportanceLevel,
)


class AIEngineAdapter(ABC):
    """Abstract base adapter for AI plan generation."""

    @abstractmethod
    async def generate_plan(self, tasks: List[TaskItem]) -> List[MicroStepPlanItem]:
        pass


class MockAIAdapter(AIEngineAdapter):
    """
    Deterministic fallback.

    This intentionally stays simple and predictable. The real task-specific
    reasoning is handled by OpenWeightAIAdapter when Groq is enabled.
    """

    async def generate_plan(self, tasks: List[TaskItem]) -> List[MicroStepPlanItem]:
        def score_task(task: TaskItem) -> int:
            urgency = {
                UrgencyLevel.HIGH: 3,
                UrgencyLevel.MEDIUM: 2,
                UrgencyLevel.LOW: 1,
            }[task.urgency]

            importance = {
                ImportanceLevel.HIGH: 3,
                ImportanceLevel.MEDIUM: 2,
                ImportanceLevel.LOW: 1,
            }[task.importance]

            return (importance * 10) + (urgency * 6)

        sorted_tasks = sorted(tasks, key=score_task, reverse=True)

        plan = []

        for index, task in enumerate(sorted_tasks, start=1):
            plan.append(
                MicroStepPlanItem(
                    task=task.title.strip(),
                    priority=index,
                    estimated_minutes=self._estimate_minutes(task),
                    micro_steps=[
                        f"Start the most relevant part of '{task.title.strip()}'.",
                        f"Make one concrete piece of progress on '{task.title.strip()}'.",
                        "Stop at a clear checkpoint and continue from there next time.",
                    ],
                )
            )

        return plan

    def _estimate_minutes(self, task: TaskItem) -> int:
        if (
            task.urgency == UrgencyLevel.HIGH
            and task.importance == ImportanceLevel.HIGH
        ):
            return 45

        if task.importance == ImportanceLevel.HIGH:
            return 35

        if task.urgency == UrgencyLevel.HIGH:
            return 25

        return 15


class OpenWeightAIAdapter(AIEngineAdapter):
    """
    Open-weight model adapter.

    Currently optimized for Groq's OpenAI-compatible API and
    openai/gpt-oss-20b.

    The adapter keeps prioritization deterministic and asks the model only
    for task-specific execution steps.
    """

    def __init__(
        self,
        api_base_url: str = "",
        api_key: str = "",
        model: str = "",
    ):
        self.api_base_url = (
            api_base_url
            or os.getenv(
                "AI_API_BASE_URL",
                "https://api.groq.com/openai/v1",
            )
        ).rstrip("/")

        self.api_key = api_key or os.getenv("AI_API_KEY", "")

        self.model = model or os.getenv(
            "AI_MODEL",
            "openai/gpt-oss-20b",
        )

        self.fallback_mock = MockAIAdapter()

    async def generate_plan(
        self,
        tasks: List[TaskItem],
    ) -> List[MicroStepPlanItem]:

        if not self.api_key:
            return await self.fallback_mock.generate_plan(tasks)

        try:
            ordered_tasks = self._prioritize_tasks(tasks)

            prompt = self._build_prompt(ordered_tasks)

            response = await self._call_model(prompt)

            return self._parse_response(
                response,
                ordered_tasks,
            )

        except Exception:
            # Product should remain usable even if the external model fails.
            return await self.fallback_mock.generate_plan(tasks)

    def _prioritize_tasks(
        self,
        tasks: List[TaskItem],
    ) -> List[TaskItem]:

        def score_task(task: TaskItem) -> int:
            urgency = {
                UrgencyLevel.HIGH: 3,
                UrgencyLevel.MEDIUM: 2,
                UrgencyLevel.LOW: 1,
            }[task.urgency]

            importance = {
                ImportanceLevel.HIGH: 3,
                ImportanceLevel.MEDIUM: 2,
                ImportanceLevel.LOW: 1,
            }[task.importance]

            return (importance * 10) + (urgency * 6)

        return sorted(tasks, key=score_task, reverse=True)

    def _build_prompt(
        self,
        tasks: List[TaskItem],
    ) -> str:

        task_data = [
            {
                "title": task.title.strip(),
                "urgency": task.urgency.value,
                "importance": task.importance.value,
            }
            for task in tasks
        ]

        return f"""
You are the execution-planning engine inside MicroStep Anchor.

Your job is NOT to give motivational advice.
Your job is NOT to rewrite the user's task.
Your job is to remove the user's next decision.

The user has already provided urgency and importance.
The application has already ordered the tasks.

For each task, create a short sequence of meaningful actions that helps the
user actually begin and make concrete progress.

CORE RULES:

1. Adapt to the task.
   A study task, coding task, errand, appointment, exercise session,
   creative task, reading task, application, or personal task should not
   receive the same generic structure.

2. The first step must create meaningful momentum.
   Do not waste a step saying:
   - open your laptop
   - open Chrome
   - log in
   - get comfortable
   - start working
   unless that action is genuinely necessary.

3. Never invent missing information.
   If the user says "Study DBMS", do NOT invent:
   - normalization
   - transactions
   - indexing
   - ACID
   or any other topic.

   Instead use the information actually supplied by the user.

4. User-provided details are authoritative.
   If the task says:
   "Study DBMS: ACID properties"
   then the steps may specifically refer to ACID properties.

5. Prefer useful specificity over generic encouragement.

6. Do not add motivational clichés such as:
   - "You've got this"
   - "Great job"
   - "Consistency compounds"
   - "Keep pushing"
   - "Small wins"
   - "You've got this!"
   - "Momentum is everything"

7. Do not add completion/celebration steps.
   The application itself handles the DONE action.

8. Each micro-step should represent meaningful progress, not merely
   preparation.

9. Use between 2 and 5 micro-steps depending on task complexity.
   Do NOT force every task into the same number of steps.

10. Keep each step short enough to display comfortably on a single card.

11. Do not mention AI, the model, prompts, or this instruction.

12. Return ONLY valid JSON.

Expected JSON structure:

{{
  "tasks": [
    {{
      "task": "original task title",
      "estimated_minutes": 30,
      "micro_steps": [
        "meaningful action",
        "meaningful action"
      ]
    }}
  ]
}}

Tasks:

{json.dumps(task_data, ensure_ascii=False, indent=2)}
"""

    async def _call_model(self, prompt: str) -> dict:

        url = f"{self.api_base_url}/chat/completions"

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a precise execution-planning engine. "
                        "Return only valid JSON."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            "temperature": 0.4,
            "max_tokens": 1200,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                url,
                headers=headers,
                json=payload,
            )

        response.raise_for_status()

        return response.json()

    def _parse_response(
        self,
        response: dict,
        ordered_tasks: List[TaskItem],
    ) -> List[MicroStepPlanItem]:

        choices = response.get("choices", [])

        if not choices:
            raise ValueError("Model returned no choices")

        content = choices[0].get("message", {}).get("content", "")

        if not content:
            raise ValueError("Model returned empty content")

        data = json.loads(content)

        generated_tasks = data.get("tasks", [])

        if not isinstance(generated_tasks, list):
            raise ValueError("Invalid tasks response")

        original_by_title = {task.title.strip(): task for task in ordered_tasks}

        result = []

        for index, generated in enumerate(generated_tasks, start=1):
            title = str(generated.get("task", "")).strip()

            if title not in original_by_title:
                continue

            original = original_by_title[title]

            raw_steps = generated.get("micro_steps", [])

            if not isinstance(raw_steps, list):
                continue

            steps = [str(step).strip() for step in raw_steps if str(step).strip()]

            if not steps:
                continue

            minutes = generated.get(
                "estimated_minutes",
                self._estimate_minutes(original),
            )

            try:
                minutes = int(minutes)
            except (TypeError, ValueError):
                minutes = self._estimate_minutes(original)

            minutes = max(5, min(minutes, 120))

            result.append(
                MicroStepPlanItem(
                    task=original.title.strip(),
                    priority=index,
                    estimated_minutes=minutes,
                    micro_steps=steps[:5],
                )
            )

        if len(result) != len(ordered_tasks):
            raise ValueError("Model did not return every task")

        return result

    def _estimate_minutes(self, task: TaskItem) -> int:
        if (
            task.urgency == UrgencyLevel.HIGH
            and task.importance == ImportanceLevel.HIGH
        ):
            return 45

        if task.importance == ImportanceLevel.HIGH:
            return 35

        if task.urgency == UrgencyLevel.HIGH:
            return 25

        return 15


def get_ai_adapter() -> AIEngineAdapter:
    """Return the configured AI adapter."""

    provider = os.getenv("AI_PROVIDER", "mock").strip().lower()

    if provider in {
        "open-weight",
        "openweight",
        "groq",
        "llama",
        "huggingface",
    }:
        return OpenWeightAIAdapter()

    return MockAIAdapter()
