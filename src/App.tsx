import { useState, useEffect, useMemo, useCallback } from 'react';
import { Anchor, Plus, X, CheckCircle2, Clock, Loader2, RotateCcw, AlertCircle, ChevronRight } from 'lucide-react';
import type {
  TaskItem,
  UrgencyLevel,
  ImportanceLevel,
  MicroStepPlanItem,
  PlanResponse,
  Screen,
} from './types';
import { generatePlan } from './api';

// ---------- small helpers ----------
const URGENCY_OPTIONS: UrgencyLevel[] = ['low', 'medium', 'high'];
const IMPORTANCE_OPTIONS: ImportanceLevel[] = ['low', 'medium', 'high'];

const TASK_PLACEHOLDERS = [
  'Watch YouTube: CS Dojo — Python recursion playlist',
  'Read Atomic Habits by James Clear, Chapter 4',
  'Gym workout: push day (bench, OHP, tricep pushdowns)',
  'Solve CodeChef: 2 problems from Div. 2 Easy',
  'Call client: follow-up on proposal for the redesign',
  'TryHackMe: Beginner Path — Complete 1 room',
  'Duolingo: French lesson streak — 30 XP minimum',
  'Write in journal: 3 things that went well this week',
  'Meditate: 10 minutes of box breathing (4-4-4-4)',
  'Groceries: bread, eggs, oat milk, spinach, tomatoes',
  'Review yesterday\'s lecture notes from class on B-trees',
  'Return package: Amazon return the broken headphones from last week',
  'Plan weekend trip: pick a hotel in Goa for the dates',
  'Cold email: pitch an internship to 3 designers you admire',
  'Practice guitar: memorize the CAGED system, 10 minutes warm up',
  'Wash car — exterior vacuum + shampoo',
  'Schedule: call mom at 7 PM, wish happy birthday to Rahul',
];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptyTask(): TaskItem {
  return { id: uid(), title: '', urgency: 'medium', importance: 'medium' };
}

function placeholderFor(idx: number): string {
  return TASK_PLACEHOLDERS[idx % TASK_PLACEHOLDERS.length];
}

function capitalize<T extends string>(s: T): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = Math.floor(total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function App() {
  // ---------- screen / plumbing ----------
  const [screen, setScreen] = useState<Screen>('task-input');
  const [error, setError] = useState<string | null>(null);

  // ---------- task input state ----------
  const [tasks, setTasks] = useState<TaskItem[]>([emptyTask()]);

  // ---------- plan state ----------
  const [plan, setPlan] = useState<MicroStepPlanItem[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [countdown, setCountdown] = useState<number>(60);

  // ---------- execution cursor (flat index across all tasks' micro-steps) ----------
  const executionCursor = useMemo(() => {
    let globalIdx = 0;
    const list: { taskIdx: number; stepIdx: number; global: number }[] = [];
    plan.forEach((item, taskIdx) => {
      item.micro_steps.forEach((_, stepIdx) => {
        list.push({ taskIdx, stepIdx, global: globalIdx });
        globalIdx += 1;
      });
    });
    return { list, total: globalIdx };
  }, [plan]);

  const [completedSteps, setCompletedSteps] = useState<number>(0);

  // ---------- transition keys so animations replay on step / task change ----------
  const prevTaskIdxRef = useState<number>(-1)[0];
  const [taskTransitionKey, setTaskTransitionKey] = useState<number>(0);
  const [stepTransitionKey, setStepTransitionKey] = useState<number>(0);
  const [taskLeaving, setTaskLeaving] = useState<boolean>(false);

  // ---------- derived ----------
  const currentStep = executionCursor.list[completedSteps];
  const totalSteps = executionCursor.total;
  const currentPlanItem: MicroStepPlanItem | null = currentStep ? plan[currentStep.taskIdx] : null;

  // ---------- input handlers ----------
  const updateTask = useCallback((id: string, patch: Partial<TaskItem>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const addTask = useCallback(() => {
    setTasks((prev) => [...prev, emptyTask()]);
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => (prev.length <= 1 ? [emptyTask()] : prev.filter((t) => t.id !== id)));
  }, []);

  // ---------- plan generation ----------
  const startPlanGeneration = useCallback(async () => {
    setError(null);
    const valid = tasks.filter((t) => t.title.trim().length > 0);
    if (valid.length === 0) {
      setError('Please add at least one task before continuing.');
      return;
    }
    setPlanLoading(true);
    try {
      const response: PlanResponse = await generatePlan(valid);
      setPlan(response.plan);
      setCountdown(45);
      setCompletedSteps(0);
      setScreen('action-plan');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to plan tasks.';
      setError(`Something went wrong while planning: ${msg}`);
    } finally {
      setPlanLoading(false);
    }
  }, [tasks]);

  // ---------- 45s countdown ----------
  useEffect(() => {
    if (screen !== 'action-plan') return;
    if (countdown <= 0) {
      setScreen('execution');
      return;
    }
    const id = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [screen, countdown]);

  // ---------- bump transition keys whenever the step/task changes ----------
  const lastSeenGlobalRef = useState<number>(-1)[0];
  useEffect(() => {
    if (!currentStep) return;
    // Using the (mutable) current state value via ref pattern through a 2nd effect-free approach:
    // We compare against a state slot acting as our memory (initialised once via useState above).
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    currentStep.global;
  }, [currentStep]);

  // Use refs via a tiny manual-ref-with-state technique:
  const [lastTaskIdx, setLastTaskIdx] = useState<number>(-1);
  const [lastGlobal, setLastGlobal] = useState<number>(-1);

  useEffect(() => {
    if (!currentStep) return;
    const first = lastGlobal === -1;

    if (first) {
      setStepTransitionKey((k) => k + 1);
      setTaskTransitionKey((k) => k + 1);
      setLastTaskIdx(currentStep.taskIdx);
      setLastGlobal(currentStep.global);
      return;
    }

    const taskChanged = currentStep.taskIdx !== lastTaskIdx;
    const stepChanged = currentStep.global !== lastGlobal;

    if (taskChanged) {
      // leave-then-enter choreography: mark leaving, wait for leave anim, then swap
      setTaskLeaving(true);
      const leaveMs = 240;
      const t1 = window.setTimeout(() => {
        setTaskTransitionKey((k) => k + 1);
        setStepTransitionKey((k) => k + 1);
        setLastTaskIdx(currentStep.taskIdx);
        setLastGlobal(currentStep.global);
        setTaskLeaving(false);
      }, leaveMs);
      // prevent double-set in React strict:
      return () => window.clearTimeout(t1);
    } else if (stepChanged) {
      setStepTransitionKey((k) => k + 1);
      setLastGlobal(currentStep.global);
    }
    // Intentionally skip exhaustive deps — we drive this only off the cursor moving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.global]);

  // ---------- execution progression ----------
  const advanceStep = useCallback(() => {
    setCompletedSteps((prev) => {
      const next = prev + 1;
      if (next >= totalSteps) {
        setScreen('day-complete');
        return prev;
      }
      return next;
    });
  }, [totalSteps]);

  // ---------- reset ----------
  const resetAll = useCallback(() => {
    setScreen('task-input');
    setPlan([]);
    setCompletedSteps(0);
    setCountdown(60);
    setError(null);
    setLastTaskIdx(-1);
    setLastGlobal(-1);
    setTaskLeaving(false);
  }, []);

  // ---------- page background: soft ambient tone circles on ALL screens, always perfect circles ----------
  const ambientVisible = true;

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100 flex flex-col">
      {/* Soft ambient circles (perfectly round — rounded-full, no non-square aspect) */}
      {ambientVisible && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full bg-teal-500/[0.05]" />
          <div className="absolute top-52 -right-40 w-[420px] h-[420px] rounded-full bg-indigo-500/[0.04]" />
        </div>
      )}

      {/* Header: opaque (NOT transparent), project name centered */}
      <header className="sticky top-0 z-50 isolate bg-[#0b1220] border-b border-slate-800/80">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-center sm:justify-center relative">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <Anchor className="w-4 h-4" strokeWidth={2.25} />
            </div>
            <span className="font-semibold tracking-tight text-white text-[17px] sm:text-[18px]">MicroStep Anchor</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* ---------------------------- TASK INPUT ---------------------------- */}
        {screen === 'task-input' && (
          <div className="space-y-10 anim-step-in">
            <header className="max-w-2xl space-y-5">
              <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-teal-400/90">
                Step 1 of 3
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl sm:text-[38px] font-semibold tracking-[-0.025em] text-white leading-[1.1]">
                  Add Your Tasks
                </h1>

                <p className="text-[15px] sm:text-[16px] leading-7 text-slate-400 max-w-xl">
                  Tell me what needs your attention today. I&apos;ll tell you what deserves it first.
                </p>
              </div>

              <div className="border-l-2 border-teal-500/30 pl-4">
                <p className="text-[13px] sm:text-[14px] leading-6 text-slate-400">
                  <span className="text-slate-300 font-medium">
                    Be specific.
                  </span>{' '}
                  The more specific your task, the more useful your next step will be.
                </p>
              </div>
            </header>

            {error && (
              <div
                className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 text-sm text-rose-200 flex items-start gap-2.5 anim-step-in"
                key={error}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" strokeWidth={2} />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3">
              {tasks.map((task, idx) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-slate-800/90 bg-slate-900/40 p-4 sm:p-5 transition-colors focus-within:border-slate-700 focus-within:bg-slate-900/60"
                >
                  <div className="space-y-3.5">
                    <input
                      type="text"
                      value={task.title}
                      onChange={(e) => updateTask(task.id, { title: e.target.value })}
                      placeholder={placeholderFor(idx)}
                      className="w-full bg-transparent border-b border-slate-800 text-slate-100 placeholder:text-slate-500 px-0 py-2.5 text-[16px] leading-6 focus:outline-none focus:border-teal-500/70 transition-colors"
                      maxLength={500}
                    />

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      <label className="flex items-center gap-3">
                        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Urgency</span>
                        <select
                          value={task.urgency}
                          onChange={(e) => updateTask(task.id, { urgency: e.target.value as UrgencyLevel })}
                          className="bg-slate-950/70 border border-slate-800 text-slate-200 rounded-md text-[13px] px-2.5 py-1.5 focus:outline-none focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/10"
                        >
                          {URGENCY_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{capitalize(opt)}</option>
                          ))}
                        </select>
                      </label>

                      <label className="flex items-center gap-3">
                        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Importance</span>
                        <select
                          value={task.importance}
                          onChange={(e) => updateTask(task.id, { importance: e.target.value as ImportanceLevel })}
                          className="bg-slate-950/70 border border-slate-800 text-slate-200 rounded-md text-[13px] px-2.5 py-1.5 focus:outline-none focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/10"
                        >
                          {IMPORTANCE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{capitalize(opt)}</option>
                          ))}
                        </select>
                      </label>

                      <div className="flex-1" />

                      <button
                        type="button"
                        onClick={() => removeTask(task.id)}
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded-md hover:bg-rose-500/10 transition-colors"
                        aria-label="Remove task"
                        title="Remove task"
                      >
                        <X className="w-4 h-4" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={addTask}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-[13px] font-medium text-slate-300 border border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 hover:border-slate-700 hover:text-slate-200 transition-colors"
              >
                <Plus className="w-4 h-4" strokeWidth={2} />
                Add Task
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={startPlanGeneration}
                disabled={planLoading}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-[14px] font-semibold tracking-wide bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-sm shadow-teal-500/15 border border-teal-400/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {planLoading
                  ? (<><Loader2 className="w-4 h-4 animate-spin" /> Planning…</>)
                  : (<>LET&apos;S GET STARTED <ChevronRight className="w-4 h-4" strokeWidth={2.5} /></>)}
              </button>
            </div>
          </div>
        )}

        {/* ---------------------------- ACTION PLAN ---------------------------- */}
        {screen === 'action-plan' && plan.length > 0 && (
          <div className="space-y-10 anim-step-in">
            <header className="space-y-4 text-center">
              <div className="mx-auto text-[11px] font-mono uppercase tracking-[0.22em] text-teal-400/90">Step 2 of 3</div>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-[1.1]">ACTION PLAN</h1>
              <p className="text-[15px] leading-relaxed text-slate-400 max-w-xl mx-auto">
                Your path for today, ordered by urgency and importance. When the countdown ends, we&apos;ll begin the first step.
              </p>
            </header>

            {/* Countdown */}
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-4 px-5 py-3 rounded-2xl border border-slate-800/80 bg-slate-900/40">
                <Clock className="w-4 h-4 text-teal-400" strokeWidth={2} />
                <span className="font-mono text-3xl font-semibold tabular-nums text-slate-100 tracking-wide">{formatSeconds(countdown)}</span>
              </div>
            </div>

            {/* Vertical path */}
            <div className="relative max-w-xl mx-auto">
              {/* Central vertical connecting line */}
              <div
                aria-hidden
                className="absolute left-[22px] top-3 bottom-3 w-px bg-slate-800/80 anim-path-line"
                style={{ animationDelay: '80ms' }}
              />

              <ul className="space-y-1">
                {plan.map((item, i) => {
                  const steps = item.micro_steps.length;
                  return (
                    <li
                      key={`${item.task}-${item.priority}-${i}`}
                      className="anim-plan-item relative pl-16 pr-1 py-4"
                      style={{ animationDelay: `${120 + i * 70}ms` }}
                    >
                      {/* Stage number */}
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-11 h-11 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center">
                        <span className="text-[15px] font-mono font-semibold text-slate-200">{i + 1}</span>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 min-h-[2.25rem]">
                        <div className="text-[15px] font-medium text-slate-100 leading-snug tracking-tight flex-1 min-w-0 truncate">
                          {item.task}
                        </div>
                        <div className="shrink-0 text-[12px] text-slate-400"><span className="tabular-nums">{steps} steps</span></div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {error && (
              <div
                className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 text-sm text-rose-200 flex items-start gap-2.5 max-w-xl mx-auto anim-step-in"
                key={error}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" strokeWidth={2} />
                <span>{error}</span>
              </div>
            )}

            {/* Encouragement / Kudos */}
            <div className="max-w-xl mx-auto anim-plan-item" style={{ animationDelay: `${200 + plan.length * 70}ms` }}>
              <div className="rounded-2xl border border-teal-500/15 bg-teal-500/[0.05] px-5 sm:px-6 py-4 sm:py-5 text-center space-y-1.5">
                <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-teal-400/90">You got this</div>
                <p className="text-[15px] leading-relaxed text-slate-200">
                  {plan.length === 1
                    ? 'Just one thing today. Stay with it start to finish, and you\'ll close the day proud.'
                    : `You've got ${plan.length} tasks ahead. One small, focused action at a time — that's the whole game. When the countdown ends, we begin.`}
                </p>
                <p className="text-[13px] text-slate-400">
                  Kudos for planning it out instead of letting it bounce around in your head — that's the hard part already done.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setScreen('task-input')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-medium text-slate-300 border border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 hover:border-slate-700 hover:text-slate-200 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />
                Edit tasks
              </button>
              <button
                type="button"
                onClick={() => setScreen('execution')}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-[14px] font-semibold tracking-wide bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-sm shadow-teal-500/15 border border-teal-400/40 transition-colors"
              >
                START NOW <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        {/* ---------------------------- EXECUTION ---------------------------- */}
        {screen === 'execution' && currentPlanItem && currentStep && (
          <div className="min-h-[65vh] flex flex-col items-center justify-center py-6 sm:py-10 anim-step-in">
            {/* Progress context line */}
            <div className="mb-6 sm:mb-10 text-center space-y-1">
              <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-slate-500">
                Task {currentStep.taskIdx + 1} of {plan.length}
              </div>
            </div>

            {/* The single task card */}
            <div
              key={`${taskTransitionKey}-card`}
              className={
                taskLeaving
                  ? 'w-full max-w-xl anim-task-leave'
                  : 'w-full max-w-xl anim-task-enter'
              }
            >
              <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_30px_60px_-30px_rgba(0,0,0,0.5)]">
                {/* Card header: just the task title — no time estimate shown, steps-only focus */}
                <div className="flex items-center px-6 sm:px-7 py-4 border-b border-slate-800/70">
                  <div className="min-w-0 w-full">
                    <div className="text-[14px] font-medium text-slate-200 leading-tight truncate tracking-tight">{currentPlanItem.task}</div>
                  </div>
                </div>

                {/* Card body: micro-step */}
                <div key={`${stepTransitionKey}-step`} className="px-6 sm:px-8 py-10 sm:py-14 anim-step-in">
                  <p className="text-xl sm:text-2xl leading-[1.35] font-medium text-slate-50 tracking-tight">
                    {plan[currentStep.taskIdx].micro_steps[currentStep.stepIdx]}
                  </p>
                </div>

                {/* Card footer: progress + step counter */}
                <div className="px-6 sm:px-7 pb-5 pt-1 border-t border-slate-800/60">
                  <div className="h-px w-full bg-slate-800/70 relative overflow-hidden rounded-full">
                    <div
                      className="absolute inset-y-0 left-0 bg-teal-500/80 transition-[width] duration-500 ease-out"
                      style={{ width: `${((completedSteps + 1) / totalSteps) * 100}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-500 tabular-nums">
                    <span>
                      Step {currentStep.stepIdx + 1} of {currentPlanItem.micro_steps.length}
                    </span>
                    <span>
                      {completedSteps + 1} / {totalSteps}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* DONE button */}
            <div className="mt-8 sm:mt-10">
              <button
                type="button"
                onClick={advanceStep}
                className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-2xl text-[15px] font-semibold tracking-wide bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/15 border border-teal-400/40 transition-colors"
              >
                <CheckCircle2 className="w-5 h-5" strokeWidth={2.25} />
                DONE
              </button>
            </div>
          </div>
        )}

        {screen === 'execution' && !currentPlanItem && totalSteps === 0 && (
          <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-5 anim-step-in">
            <p className="text-slate-300">No steps to execute.</p>
            <button
              onClick={resetAll}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-slate-200 border border-slate-800 bg-slate-900 hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Start over
            </button>
          </div>
        )}

        {/* ---------------------------- DAY COMPLETE ---------------------------- */}
        {screen === 'day-complete' && (
          <div className="min-h-[65vh] flex flex-col items-center justify-center py-10 space-y-10 text-center anim-step-in">
            <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-center text-teal-400">
              <CheckCircle2 className="w-8 h-8" strokeWidth={2} />
            </div>

            <div className="space-y-3 max-w-md mx-auto">
              <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-teal-400/90">Done</div>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-[1.1]">Day complete</h1>
              <p className="text-[15px] leading-relaxed text-slate-400">
                Great focus. You worked through {totalSteps} micro-steps across {plan.length} tasks.
              </p>
            </div>

            <ul className="w-full max-w-md space-y-1.5 text-left">
              {plan.map((item, i) => (
                <li
                  key={`${item.task}-${item.priority}-done`}
                  className="rounded-xl border border-slate-800/80 bg-slate-900/30 px-4 sm:px-5 py-3 flex items-center gap-3 anim-plan-item"
                  style={{ animationDelay: `${60 + i * 50}ms` }}
                >
                  <div className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} />
                  </div>
                  <span className="text-[14px] text-slate-200 flex-1 min-w-0 truncate tracking-tight">{item.task}</span>
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">{item.micro_steps.length} steps</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-[14px] font-semibold tracking-wide bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-sm shadow-teal-500/15 border border-teal-400/40 transition-colors"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={2} />
              Plan tomorrow
            </button>
          </div>
        )}
      </main>

      {(screen === 'task-input' || screen === 'action-plan') && (
        <footer className="relative z-10 border-t border-slate-800/60 py-5 text-center text-[12px] text-slate-500 tracking-tight">
          Don&apos;t think about everything. Just do this one thing.
        </footer>
      )}
    </div>
  );
}
