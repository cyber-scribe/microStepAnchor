export type UrgencyLevel = 'low' | 'medium' | 'high';
export type ImportanceLevel = 'low' | 'medium' | 'high';

export interface TaskItem {
  id: string;
  title: string;
  urgency: UrgencyLevel;
  importance: ImportanceLevel;
}

export interface MicroStepPlanItem {
  task: string;
  priority: number;
  estimated_minutes: number;
  micro_steps: string[];
}

export interface PlanResponse {
  plan: MicroStepPlanItem[];
  provider: string;
}

export type Screen = 'task-input' | 'action-plan' | 'execution' | 'day-complete';
