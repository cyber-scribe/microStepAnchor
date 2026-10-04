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
    async def generate_plan(
        self,
        tasks: List[TaskItem],
    ) -> List[MicroStepPlanItem]:
        pass


class MockAIAdapter(AIEngineAdapter):
    """
    Deterministic fallback used when the real AI provider is unavailable.

    This keeps the product functional during development, demos, or
    temporary provider failures.
    """

    provider_used = "mock"

    async def generate_plan(
        self,
        tasks: List[TaskItem],
    ) -> List[MicroStepPlanItem]:

        sorted_tasks = sorted(
            tasks,
            key=self._score_task,
            reverse=True,
        )

        plan = []

        for index, task in enumerate(sorted_tasks, start=1):
            title = task.title

            plan.append(
                MicroStepPlanItem(
                    task=title,
                    priority=index,
                    estimated_minutes=self._estimate_minutes(task),
                    micro_steps=[self._build_micro_step(title)],
                )
            )

        return plan

    def _build_micro_step(self, title: str) -> str:
        task_text = title.casefold()

        if any(
            word in task_text
            for word in ("read", "book", "article", "chapter")
        ):
            return (
                f"Read the material named in '{title}' "
                "and note its main point."
            )

        if any(
            word in task_text
            for word in (
                "code",
                "program",
                "bug",
                "feature",
                "algorithm",
            )
        ):
            return (
                f"Implement the behavior described in '{title}' "
                "and check it with one example."
            )

        if any(
            word in task_text
            for word in (
                "study",
                "learn",
                "practice",
                "course",
                "lesson",
            )
        ):
            return (
                f"Work through one practice item for '{title}' "
                "using the material you already planned to use."
            )

        if any(
            word in task_text
            for word in (
                "write",
                "draft",
                "essay",
                "email",
                "journal",
            )
        ):
            return f"Write the next missing part of '{title}'."

        if any(
            word in task_text
            for word in (
                "exercise",
                "workout",
                "gym",
                "run",
                "walk",
            )
        ):
            return (
                f"Complete the first exercise explicitly listed in "
                f"'{title}'."
            )

        return (
            f"Complete the next concrete outcome explicitly stated "
            f"in '{title}'."
        )

    def _score_task(self, task: TaskItem) -> int:
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
    Open-weight AI adapter using Groq's OpenAI-compatible API.

    Default model:
        openai/gpt-oss-20b

    The application handles task prioritization deterministically using
    urgency + importance. The open-weight model is responsible for turning
    each task into useful, task-specific execution steps.
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
        self.provider_used = "groq"

    async def generate_plan(
        self,
        tasks: List[TaskItem],
    ) -> List[MicroStepPlanItem]:

        if not tasks:
            raise ValueError("At least one task is required")

        if not self.api_key:
            print(
                "[AI] No AI_API_KEY configured. "
                "Using MockAI fallback."
            )
            self.provider_used = self.fallback_mock.provider_used
            return await self.fallback_mock.generate_plan(tasks)

        ordered_tasks = self._prioritize_tasks(tasks)

        try:
            prompt = self._build_prompt(ordered_tasks)

            response = await self._call_model(prompt)

            self.provider_used = "groq"

            return self._parse_response(
                response,
                ordered_tasks,
            )

        except Exception as exc:
            print(
                "[AI] Open-weight model failed. "
                f"Using MockAI fallback. Error: {exc}"
            )

            self.provider_used = self.fallback_mock.provider_used
            return await self.fallback_mock.generate_plan(tasks)

    def _prioritize_tasks(
        self,
        tasks: List[TaskItem],
    ) -> List[TaskItem]:

        return sorted(
            tasks,
            key=self._score_task,
            reverse=True,
        )

    def _score_task(self, task: TaskItem) -> int:
        """
        Eisenhower-style deterministic priority.

        Importance has slightly more weight than urgency so that important
        work does not consistently lose to merely urgent work.
        """

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

    def _build_prompt(
        self,
        tasks: List[TaskItem],
    ) -> str:

        task_data = [
            {
                "id": task.id,
                "title": task.title,
                "urgency": task.urgency.value,
                "importance": task.importance.value,
            }
            for task in tasks
        ]

        return f"""
You are the execution-planning engine inside a productivity product
called MicroStep Anchor.

Your role is an ACTION ANCHOR ADVISOR.

The user has already decided what tasks exist.
The application has already decided the task order using urgency and
importance.

Your job is to remove the next decision the user would otherwise have to
make.

Do NOT act like a motivational coach.
Do NOT create a generic checklist.
Do NOT rewrite the task into vague productivity language.

Instead, decide what useful action should happen first and, only when
necessary, what naturally follows from it.

CORE PRINCIPLES

1. TASK-SPECIFIC EXECUTION

Adapt the actions to the actual task.

Different tasks should feel different.

Examples:

- Coding should involve actual coding/problem-solving work.
- Studying should involve actual learning or practice.
- Reading should involve actual reading and extracting understanding.
- Applications should involve completing the actual application.
- Writing should involve producing or improving the actual writing.
- Exercise should involve the actual exercise session.
- Errands should involve the actual errand.
- Creative work should involve creating something.

Do not force every task into the same pattern.

2. THE FIRST STEP MUST CREATE REAL PROGRESS

The first micro-step should give the user a meaningful head start.

Avoid empty setup actions such as:

- Open your laptop.
- Open Chrome.
- Log in.
- Get comfortable.
- Find a quiet place.
- Start working.
- Begin the task.

Only mention setup when it is genuinely necessary for the task.

3. NEVER INVENT USER CONTEXT

The task text is the source of truth.

If the user says:

"Study DBMS"

you do NOT know whether they mean:

- normalization
- ACID
- indexing
- transactions
- SQL
- joins
- anything else

Do not invent a topic.

Instead, create an action that works with the information actually
provided.

For example:

"Choose the DBMS material you already planned to study and work through
one focused section."

If the user says:

"Study DBMS: ACID properties"

then you may specifically use ACID properties.

4. USER-PROVIDED DETAILS ARE AUTHORITATIVE

Preserve useful details from the original task.

If the user says:

"Solve one CodeChef problem around the difficulty I am currently practicing"

do not replace that with a generic programming exercise.

If the user says:

"Finish the first draft of my internship application"

the actions should focus on the application and its draft.

5. ONE PRIMARY ACTION PER STEP

Each micro-step should represent one meaningful action or outcome.

Do not bundle an entire mini-project into one sentence.

Bad:

"Read the problem, identify constraints, code the solution, test it,
and submit it."

Better:

"Write down the input, output, and constraint that most affects your
approach."

Then, if another step is actually useful:

"Implement the core approach and test it against one small example."

6. FEWER STEPS ARE BETTER

Return between 1 and 5 micro-steps.

Do NOT create extra steps just to make the list look complete.

If one strong action is enough, return one.

If two are enough, return two.

Use more only when the task naturally requires them.

7. REMOVE DECISION FRICTION

The user should be able to read the current step and immediately know
what meaningful action to take.

Prefer concrete verbs:

- solve
- compare
- draft
- revise
- calculate
- outline
- test
- practice
- summarize
- implement
- identify
- choose
- write
- review

Avoid vague verbs:

- work on
- focus on
- make progress
- get started
- handle
- tackle
- continue working

unless the surrounding context makes them genuinely specific.

8. NO MOTIVATIONAL CLICHÉS

Never use phrases such as:

- You've got this
- Great job
- Keep pushing
- Small wins
- Consistency compounds
- Momentum is everything
- Stay focused
- You can do it
- Believe in yourself

The product provides execution guidance, not motivational speeches.

9. NO COMPLETION STEP

Do not create steps like:

- Mark this complete.
- Celebrate your progress.
- Take a moment to appreciate the work.
- Check the task off.

The application already handles completion.

10. NO TIME INSTRUCTIONS INSIDE STEPS

The application separately displays estimated task time.

Do not create unnecessary steps like:

"Spend 20 minutes studying."

Instead describe what the user should actually do.

A conditional such as:

"If you are stuck after 10 minutes, check the editorial for the missing
idea."

is acceptable when it is genuinely useful.

11. KEEP STEPS DISPLAY-FRIENDLY

Each step should normally be one or two concise sentences.

Do not produce essays.

12. DO NOT MENTION THE AI

Never mention:

- AI
- model
- prompt
- system instructions
- language model
- generated response

13. TASK IDENTITY

The application owns the original task title.

Do NOT return, rewrite, normalize, shorten, correct, or rename the task
title.

Identify each task only by its provided id.

The application will restore the original task title itself.

BEHAVIORAL EXAMPLES

These are examples of the desired behavior, NOT templates to copy.

Task:
"Study DBMS"

Good direction:
"Choose the DBMS material you already planned to study and work through
one uninterrupted section."

Bad direction:
"Study normalization and ACID properties."

Reason:
Those topics were never provided by the user.

Task:
"Study DBMS: ACID properties"

Good direction:
"Work through the ACID section in your planned DBMS material and write
down what each property guarantees."

Possible follow-up:
"Without looking back, explain one example for each ACID property and mark
the one you cannot explain clearly."

Task:
"Solve one CodeChef problem"

Good direction:
"Choose one problem from the difficulty range you are currently
practicing and write down the input, output, and key constraint before
coding."

Possible follow-up:
"Implement the core idea and test it against one small example. If the
approach is still unclear after a focused attempt, use the editorial to
identify the missing idea."

Again: do not copy these examples mechanically.

OUTPUT FORMAT

Return ONLY valid JSON.

Use exactly this structure:

{{
  "tasks": [
    {{
      "id": "original task id",
      "micro_steps": [
        "meaningful action",
        "meaningful action"
      ]
    }}
  ]
}}

Important:

- Use the exact task id provided in the input.
- Do not return the task title.
- Do not return any additional fields.
- Return every input task exactly once.
- Do not invent task ids.
- Do not change task ids.
- Do not rewrite task titles.

Do not return markdown.
Do not wrap the JSON in ```.

TASKS

{json.dumps(task_data, ensure_ascii=False, indent=2)}
"""

    async def _call_model(
        self,
        prompt: str,
    ) -> dict:

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
            "temperature": 0.5,
            "max_tokens": 1800,
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

        message = choices[0].get("message", {})
        content = message.get("content", "")

        if not content:
            raise ValueError("Model returned empty content")

        content = content.strip()

        # Defensive handling in case the model still wraps JSON in
        # markdown despite being instructed not to.
        if content.startswith("```"):
            content = content.replace("```json", "", 1)
            content = content.replace("```", "", 1).strip()

        data = json.loads(content)

        generated_tasks = data.get("tasks")

        if not isinstance(generated_tasks, list):
            raise ValueError("Invalid tasks response")

        original_by_id = {
            task.id: task
            for task in ordered_tasks
        }

        generated_steps_by_id = {}
        seen_ids = set()

        for generated in generated_tasks:
            if not isinstance(generated, dict):
                continue

            task_id = str(
                generated.get("id", "")
            ).strip()

            if not task_id:
                continue

            if task_id not in original_by_id:
                continue

            if task_id in seen_ids:
                continue

            raw_steps = generated.get("micro_steps", [])

            if not isinstance(raw_steps, list):
                continue

            steps = []

            for step in raw_steps:
                if not isinstance(step, str):
                    continue

                cleaned = step.strip()

                if cleaned:
                    steps.append(cleaned)

            # The product should never receive an empty task.
            if not steps:
                continue

            # Keep the model within the product's intended range.
            steps = steps[:5]

            generated_steps_by_id[task_id] = steps
            seen_ids.add(task_id)

        # Every task must receive a plan.
        # If anything is missing, deliberately trigger the fallback instead
        # of showing a partially generated plan.
        if len(generated_steps_by_id) != len(ordered_tasks):
            missing = [
                task.id
                for task in ordered_tasks
                if task.id not in seen_ids
            ]

            raise ValueError(
                "Model did not return every task. "
                f"Missing task IDs: {missing}"
            )

        return [
            MicroStepPlanItem(
                task=task.title,
                priority=index,
                estimated_minutes=self._estimate_minutes(task),
                micro_steps=generated_steps_by_id[task.id],
            )
            for index, task in enumerate(ordered_tasks, start=1)
        ]

    def _estimate_minutes(
        self,
        task: TaskItem,
    ) -> int:

        # Keep timing deterministic rather than asking the model to invent
        # a duration. The frontend can rely on these values consistently.
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
    """
    Return the configured AI adapter.

    Supported values:
        mock
        groq
        open-weight
        openweight
        llama
        huggingface
    """

    provider = os.getenv(
        "AI_PROVIDER",
        "mock",
    ).strip().lower()

    if provider in {
        "open-weight",
        "openweight",
        "groq",
        "llama",
        "huggingface",
    }:
        return OpenWeightAIAdapter()

    return MockAIAdapter()