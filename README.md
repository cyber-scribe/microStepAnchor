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
AI Adapter Layer (Configurable via environment variables)
          ↓
AI Engine (Offline Mock Matrix / Open-Weight LLM via API)
          ↓
Validated Structured Plan
          ↓
React Single-Step Execution Engine
```

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide icons, responsive and polished UI with calm glassmorphic depth.
- **Backend**: Python FastAPI with Pydantic v2 validation.
- **AI Abstraction**: Pluggable `AIEngineAdapter` supporting offline mock logic and open-weight models without app rewrites.

---

## 🚀 Development Roadmap

- [x] **Stage 1**: Project structure & working React + FastAPI setup with live health verification.
- [ ] **Stage 2**: Task Input UI with multi-row input, Urgency & Importance dropdowns, and validation.
- [ ] **Stage 3**: FastAPI endpoint & Eisenhower-prioritized micro-step decomposition logic.
- [ ] **Stage 4**: Action Plan screen with 60-second automatic countdown & "START NOW" trigger.
- [ ] **Stage 5**: Single micro-step execution experience with "DONE" transitions & Day Complete screen.
- [ ] **Stage 6**: Real open-weight AI provider integration via the AI adapter.
- [ ] **Stage 7**: End-to-end testing with realistic daily learning & practice tasks.
- [ ] **Stage 8**: Production polish and deployment readiness.

---

## 🏃 Running the Project

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8080 --reload
```

### Frontend
```bash
npm install
npm run dev
```
The Vite development server runs on port 3000 and proxies `/api` to the FastAPI backend on port 8080.
