# MicroStep Anchor ⚓

> *"The user decides what exists. The AI decides what comes next."*

Built for **Hacktoberfest 2026 ("Build for a Friend")** — a focus and productivity tool designed for a friend who has endless things she genuinely wants to do (courses, coding practice, language learning, GitHub, news, books, chess, etc.), but spends too much time deciding what to do next, gets stuck on one task, task-switches, becomes overwhelmed, and ends up distracted.
MicroStep Anchor replaces decision paralysis with frictionless momentum.

---

## 💡 Core Philosophy

- **No Generic To-Do Lists**: Most productivity apps pile up guilt. MicroStep Anchor reduces cognitive load to zero at the moment of action.
- **Eisenhower Prioritization**: Tasks are classified by explicit Urgency and Importance.
- **Context-Preserving Actionability**: The AI creates immediately actionable micro-steps *without* hallucinating or inventing specific topics/chapters the user didn't mention.
- **Single-Step Focus**: During execution, the UI displays **EXACTLY ONE** micro-step at a time. No full checklists, no distractions.

---

## 🛠 Tech Stack & Architecture

```
React (Vite + Tailwind CSS)
          ↓ (Proxy /api)
FastAPI Backend (Python 3.11, Uvicorn, Pydantic v2)
          ↓
AI Adapter Layer (Mock by default; Groq optional)
          ↓
AI Engine (Task-aware Mock / GPT-OSS 20B through Groq)
          ↓
Validated Structured Plan
          ↓
React Single-Step Execution Engine
```

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide icons, responsive and polished UI with calm glassmorphic depth.
- **Backend**: Python FastAPI with Pydantic v2 validation.
- **AI Abstraction**: Pluggable `AIEngineAdapter` supporting offline mock logic and open-weight models without app rewrites.
- **Priority**: The backend fixes task order from the user's urgency and importance. The model only generates steps; its response order is ignored.
- **Provider reporting**: The API response identifies the provider that actually generated the plan (`mock` or `groq`), including mock fallback.

## 🤖 AI Provider Setup

The app defaults to the local `mock` provider and works without an API key. To use GPT-OSS 20B through Groq:

1. Copy `.env.example` to `.env` in the repository root.
2. Set `AI_PROVIDER=groq` and add your Groq key to `AI_API_KEY`.
3. Restart the backend or the Vite development server.

`AI_API_BASE_URL` defaults to `https://api.groq.com/openai/v1` and `AI_MODEL` defaults to `openai/gpt-oss-20b`. The `.env` file is ignored by Git; never commit a real key. When Groq is enabled, task titles are sent to Groq to generate the plan. If the key is missing or the provider returns an error, the app falls back to one conservative, category-aware mock action per task. Mock actions use only the task title and cannot match the context-specific quality of the model.

---

## 🏃 Running the Project

### Backend
```bash
pip install -r backend/requirements.txt
uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8080 --reload
```

### Frontend
```bash
npm install
npm run dev
```
The Vite development server binds to `127.0.0.1:3000` and proxies `/api` to the FastAPI backend on port 8080.
