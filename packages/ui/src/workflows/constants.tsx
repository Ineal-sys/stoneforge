/**
 * @stoneforge/ui Workflows Module Constants
 *
 * Status configuration, colors, and icons for workflow visualization.
 */

import {
  Clock,
  Play,
  CheckCircle,
  XCircle,
  Ban,
  type LucideIcon,
} from 'lucide-react';
import type { WorkflowStatus } from './types';

/**
 * Configuration for workflow status display
 */
export interface WorkflowStatusConfig {
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
}

/**
 * Status configuration map
 */
export const WORKFLOW_STATUS_CONFIG: Record<WorkflowStatus, WorkflowStatusConfig> = {
  pending: {
    label: 'workflow.status.pending',
    icon: Clock,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-900/30',
    borderColor: 'border-gray-300 dark:border-gray-700',
  },
  running: {
    label: 'workflow.status.running',
    icon: Play,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-300 dark:border-blue-700',
  },
  completed: {
    label: 'workflow.status.completed',
    icon: CheckCircle,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    borderColor: 'border-green-300 dark:border-green-700',
  },
  failed: {
    label: 'workflow.status.failed',
    icon: XCircle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    borderColor: 'border-red-300 dark:border-red-700',
  },
  cancelled: {
    label: 'workflow.status.cancelled',
    icon: Ban,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    borderColor: 'border-yellow-300 dark:border-yellow-700',
  },
};

/**
 * Progress bar segment colors
 */
export const PROGRESS_COLORS = {
  completed: 'bg-green-500',
  inProgress: 'bg-blue-500',
  blocked: 'bg-red-400',
  open: 'bg-gray-300 dark:bg-gray-600',
} as const;

/**
 * Task type labels
 */
export const TASK_TYPES = [
  { value: 'task', label: 'workflow.taskType.task' },
  { value: 'bug', label: 'workflow.taskType.bug' },
  { value: 'feature', label: 'workflow.taskType.feature' },
  { value: 'chore', label: 'workflow.taskType.chore' },
] as const;

/**
 * Priority labels
 */
export const PRIORITIES = [
  { value: 5, label: 'workflow.priority.5' },
  { value: 4, label: 'workflow.priority.4' },
  { value: 3, label: 'workflow.priority.3' },
  { value: 2, label: 'workflow.priority.2' },
  { value: 1, label: 'workflow.priority.1' },
] as const;

/**
 * Complexity labels
 */
export const COMPLEXITIES = [
  { value: 1, label: 'workflow.complexity.1' },
  { value: 2, label: 'workflow.complexity.2' },
  { value: 3, label: 'workflow.complexity.3' },
  { value: 4, label: 'workflow.complexity.4' },
  { value: 5, label: 'workflow.complexity.5' },
] as const;

/**
 * Variable type labels
 */
export const VARIABLE_TYPES = [
  { value: 'string', label: 'workflow.variableType.string' },
  { value: 'number', label: 'workflow.variableType.number' },
  { value: 'boolean', label: 'workflow.variableType.boolean' },
] as const;

/**
 * Step type options
 */
export const STEP_TYPES = [
  { value: 'task', label: 'workflow.stepType.task', description: 'workflow.stepType.taskDescription' },
  { value: 'function', label: 'workflow.stepType.function', description: 'workflow.stepType.functionDescription' },
] as const;

/**
 * Function runtime options
 */
export const FUNCTION_RUNTIMES = [
  { value: 'typescript', label: 'workflow.runtime.typescript', description: 'workflow.runtime.typescriptDescription' },
  { value: 'python', label: 'workflow.runtime.python', description: 'workflow.runtime.pythonDescription' },
  { value: 'shell', label: 'workflow.runtime.shell', description: 'workflow.runtime.shellDescription' },
] as const;

/**
 * Status filter options for workflow list
 */
export const STATUS_FILTER_OPTIONS = [
  { value: null, label: 'workflow.filter.all' },
  { value: 'running', label: 'workflow.filter.running' },
  { value: 'pending', label: 'workflow.filter.pending' },
  { value: 'completed', label: 'workflow.filter.completed' },
  { value: 'failed', label: 'workflow.filter.failed' },
  { value: 'cancelled', label: 'workflow.filter.cancelled' },
] as const;

/**
 * Task priority colors
 */
export const TASK_PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-gray-200',
  2: 'bg-blue-200',
  3: 'bg-yellow-200',
  4: 'bg-orange-200',
  5: 'bg-red-200',
};
