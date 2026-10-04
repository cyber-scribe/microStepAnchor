import type { TaskItem, PlanResponse } from './types';

export async function generatePlan(tasks: TaskItem[]): Promise<PlanResponse> {
  const res = await fetch('/api/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      if (err?.detail) detail = err.detail;
    } catch {
      /* ignore parse failures */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<PlanResponse>;
}
