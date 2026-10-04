import type { TaskItem, PlanResponse } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export async function generatePlan(tasks: TaskItem[]): Promise<PlanResponse> {
  const res = await fetch(`${API_BASE_URL}/api/generate-plan`, {
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
