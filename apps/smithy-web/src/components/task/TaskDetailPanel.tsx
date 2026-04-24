/**
 * TaskDetailPanel - Detail view panel for a selected task
 *
 * Orchestrator-specific features:
 * - Shows orchestrator metadata (branch, worktree, merge status, test results)
 * - Agent assignment with worker selection
 * - Start/Complete actions
 * - Session info if task has active session
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation, i18n } from '@stoneforge/i18n';
import {
  X,
  Calendar,
  User,
  Tag,
  Pencil,
  Check,
  Loader2,
  Trash2,
  GitBranch,
  Play,
  CheckCircle2,
  AlertCircle,
  Bot,
  FlaskConical,
  GitMerge,
  Paperclip,
  FileText,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  RotateCcw,
  RefreshCcw,
  History,
  Eye,
  Shield,
} from 'lucide-react';
import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  useStartTask,
  useCompleteTask,
  useReopenTask,
  useResetTask,
  useUpdateMergeStatus,
  useTaskAttachments,
  useAddAttachment,
  useRemoveAttachment,
  useDocumentsForAttachment,
  type AttachedDocument,
  type UpdateTaskInput,
} from '../../api/hooks/useTasks';
import { useAgents, useOperators, fetchSessionMessages, type Operator } from '../../api/hooks/useAgents';
import { useAllEntities } from '../../api/hooks/useAllElements';
import { TaskStatusBadge, TaskPriorityBadge, TaskTypeBadge, MergeStatusBadge } from './index';
import { TaskDependencySection } from './TaskDependencySection';
import { MarkdownContent } from '../shared/MarkdownContent';
import type { Task, Agent, Priority, TaskStatus, Complexity, MergeStatus, TaskSessionHistoryEntry } from '../../api/types';
import { TranscriptViewer, messageToStreamEvent } from '../shared/TranscriptViewer';
import type { StreamEvent } from '../workspace/types';
import { useImageDrop } from '../../hooks/useImageDrop';

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
  onNavigateToTask?: (taskId: string) => void;
}

// Priority/Status/Complexity labels are resolved via t() in components
const PRIORITY_KEYS: { value: Priority; key: string }[] = [
  { value: 1, key: 'taskDetail.priorityCritical' },
  { value: 2, key: 'taskDetail.priorityHigh' },
  { value: 3, key: 'taskDetail.priorityMedium' },
  { value: 4, key: 'taskDetail.priorityLow' },
  { value: 5, key: 'taskDetail.priorityMinimal' },
];

const STATUS_KEYS: { value: TaskStatus; key: string }[] = [
  { value: 'backlog', key: 'taskDetail.statusBacklog' },
  { value: 'open', key: 'taskDetail.statusOpen' },
  { value: 'in_progress', key: 'taskDetail.statusInProgress' },
  { value: 'blocked', key: 'taskDetail.statusBlocked' },
  { value: 'review', key: 'taskDetail.statusReview' },
  { value: 'deferred', key: 'taskDetail.statusDeferred' },
  { value: 'closed', key: 'taskDetail.statusClosed' },
];

const COMPLEXITY_KEYS: { value: number; key: string }[] = [
  { value: 1, key: 'taskDetail.complexityTrivial' },
  { value: 2, key: 'taskDetail.complexitySimple' },
  { value: 3, key: 'taskDetail.complexityModerate' },
  { value: 4, key: 'taskDetail.complexityComplex' },
  { value: 5, key: 'taskDetail.complexityVeryComplex' },
];

export function TaskDetailPanel({ taskId, onClose, onNavigateToTask }: TaskDetailPanelProps) {
  const { t } = useTranslation('smithy');
  const { data, isLoading, error } = useTask(taskId);
  const { data: agentsData } = useAgents('worker');
  const { data: operatorsData } = useOperators();
  const { data: entities } = useAllEntities();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const startTask = useStartTask();
  const completeTask = useCompleteTask();
  const reopenTask = useReopenTask();
  const resetTask = useResetTask();
  const updateMergeStatus = useUpdateMergeStatus();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  const task = data?.task;
  const workers: Agent[] = agentsData?.agents ?? [];
  const operators: Operator[] = operatorsData?.items ?? [];
  const entityNameMap = new Map<string, string>();
  if (entities) {
    entities.forEach((e) => entityNameMap.set(e.id, e.name));
  }
  const orchestratorMeta = task?.metadata?.orchestrator;
  const description = task?.description;

  const canStart = task?.status === 'open' && task?.assignee;
  const canComplete = task?.status === 'in_progress';
  const canReopen = task?.status === 'closed';
  // Can reset if task has an assignee or is in_progress/review/closed
  const canReset = task?.assignee ||
    task?.status === 'in_progress' ||
    task?.status === 'review' ||
    task?.status === 'closed';

  const handleUpdate = async (updates: Omit<UpdateTaskInput, 'taskId'>) => {
    if (!task) return;
    try {
      await updateTask.mutateAsync({ taskId: task.id, ...updates });
      setEditingField(null);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleUpdateMergeStatus = async (mergeStatus: MergeStatus) => {
    if (!task) return;
    try {
      await updateMergeStatus.mutateAsync({ taskId: task.id, mergeStatus });
    } catch {
      // Error handled by mutation state
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    try {
      await deleteTask.mutateAsync({ taskId: task.id });
      onClose();
    } catch {
      // Error handled by mutation state
    }
  };

  const handleStart = async () => {
    if (!task) return;
    await startTask.mutateAsync({ taskId: task.id });
  };

  const handleComplete = async () => {
    if (!task) return;
    await completeTask.mutateAsync({ taskId: task.id });
  };

  const handleReopen = async (message?: string) => {
    if (!task) return;
    await reopenTask.mutateAsync({ taskId: task.id, message: message || undefined });
    setShowReopenDialog(false);
  };

  const handleReset = async () => {
    if (!task) return;
    await resetTask.mutateAsync({ taskId: task.id });
    setShowResetDialog(false);
  };

  if (isLoading) {
    return (
      <div
        className="h-full flex items-center justify-center bg-[var(--color-surface)]"
        data-testid="task-detail-loading"
      >
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
          <span className="text-sm text-[var(--color-text-secondary)]">{t('taskDetail.loading')}</span>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center bg-[var(--color-surface)]"
        data-testid="task-detail-error"
      >
        <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mb-2" />
        <span className="text-sm text-[var(--color-text-secondary)]">
          {error?.message || t('taskDetail.notFound')}
        </span>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 text-sm text-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] rounded-md"
        >
          {t('taskDetail.close')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-surface)]" data-testid="task-detail-panel">
      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <DeleteConfirmDialog
          taskTitle={task.title}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          isDeleting={deleteTask.isPending}
        />
      )}

      {/* Reopen Dialog */}
      {showReopenDialog && (
        <ReopenDialog
          taskTitle={task.title}
          onConfirm={handleReopen}
          onCancel={() => setShowReopenDialog(false)}
          isReopening={reopenTask.isPending}
        />
      )}

      {/* Reset Dialog */}
      {showResetDialog && (
        <ResetDialog
          taskTitle={task.title}
          onConfirm={handleReset}
          onCancel={() => setShowResetDialog(false)}
          isResetting={resetTask.isPending}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-[var(--color-border)]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <TaskStatusBadge status={task.status} mergeStatus={orchestratorMeta?.mergeStatus} />
            {task.status === 'review' && (orchestratorMeta?.mergeStatus === 'testing' || orchestratorMeta?.mergeStatus === 'merging') && (
              <span className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400" title={t('taskDetail.stewardReviewing')}>
                <Bot className="w-3.5 h-3.5 animate-pulse" />
                {t('taskDetail.reviewing')}
              </span>
            )}
            <TaskPriorityBadge priority={task.priority} />
            <TaskTypeBadge taskType={task.taskType} />
          </div>
          <EditableTitle
            value={task.title}
            onSave={(title) => handleUpdate({ title })}
            isUpdating={updateTask.isPending && editingField === 'title'}
            onEdit={() => setEditingField('title')}
          />
          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--color-text-tertiary)] font-mono">
            <span data-testid="task-detail-id">{task.id}</span>
            {task.ephemeral && (
              <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 rounded text-[10px]">
                {t('taskDetail.ephemeral')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canReset && (
            <button
              onClick={() => setShowResetDialog(true)}
              className="p-1.5 text-[var(--color-text-tertiary)] hover:text-amber-600 hover:bg-amber-100 dark:hover:text-amber-400 dark:hover:bg-amber-900/30 rounded transition-colors"
              aria-label={t('taskDetail.resetTask')}
              title={t('taskDetail.resetTaskTitle')}
              data-testid="task-reset-btn"
            >
              <RefreshCcw className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] rounded transition-colors"
            aria-label={t('taskDetail.deleteTask')}
            data-testid="task-delete-btn"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded transition-colors"
            aria-label={t('taskDetail.closePanel')}
            data-testid="task-detail-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      {(canStart || canComplete || canReopen) && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
          {canStart && (
            <button
              onClick={handleStart}
              disabled={startTask.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-primary-muted)] hover:bg-[var(--color-primary-muted)]/80 rounded-md disabled:opacity-50 transition-colors"
              data-testid="task-start-btn"
            >
              <Play className="w-4 h-4" />
              {startTask.isPending ? t('taskDetail.starting') : t('taskDetail.startTask')}
            </button>
          )}
          {canComplete && (
            <button
              onClick={handleComplete}
              disabled={completeTask.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 dark:text-green-300 dark:bg-green-900/30 dark:hover:bg-green-900/50 rounded-md disabled:opacity-50 transition-colors"
              data-testid="task-complete-btn"
            >
              <CheckCircle2 className="w-4 h-4" />
              {completeTask.isPending ? t('taskDetail.completing') : t('taskDetail.completeTask')}
            </button>
          )}
          {canReopen && (
            <button
              onClick={() => setShowReopenDialog(true)}
              disabled={reopenTask.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 rounded-md disabled:opacity-50 transition-colors"
              data-testid="task-reopen-btn"
            >
              <RotateCcw className="w-4 h-4" />
              {reopenTask.isPending ? t('taskDetail.reopening') : t('taskDetail.reopenTask')}
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Status */}
          <MetadataField label={t('taskDetail.status')} icon={<CheckCircle2 className="w-3 h-3" />}>
            <StatusDropdown
              value={task.status}
              onSave={(status) => handleUpdate({ status })}
              isUpdating={updateTask.isPending && editingField === 'status'}
            />
          </MetadataField>

          {/* Priority */}
          <MetadataField label={t('taskDetail.priority')}>
            <PriorityDropdown
              value={task.priority}
              onSave={(priority) => handleUpdate({ priority })}
              isUpdating={updateTask.isPending && editingField === 'priority'}
            />
          </MetadataField>

          {/* Assignee */}
          <MetadataField label={t('taskDetail.assignedTo')} icon={<User className="w-3 h-3" />}>
            <AssigneeDropdown
              value={task.assignee}
              entityNameMap={entityNameMap}
              workers={workers}
              operators={operators}
              onSave={(assignee) => handleUpdate({ assignee: assignee ?? null })}
              isUpdating={updateTask.isPending && editingField === 'assignee'}
            />
          </MetadataField>

          {/* Complexity */}
          <MetadataField label={t('taskDetail.complexity')}>
            <ComplexityDropdown
              value={task.complexity}
              onSave={(complexity) => handleUpdate({ complexity: complexity as Complexity })}
              isUpdating={updateTask.isPending && editingField === 'complexity'}
            />
          </MetadataField>

          {/* Deadline */}
          <MetadataField label={t('taskDetail.deadline')} icon={<Calendar className="w-3 h-3" />}>
            <DeadlineInput
              value={task.deadline}
              onSave={(deadline) => handleUpdate({ deadline: deadline ?? null })}
              isUpdating={updateTask.isPending && editingField === 'deadline'}
            />
          </MetadataField>
        </div>

        {/* Tags */}
        <EditableTags
          tags={task.tags}
          onSave={(tags) => handleUpdate({ tags })}
          isUpdating={updateTask.isPending && editingField === 'tags'}
          onEdit={() => setEditingField('tags')}
        />

        {/* Description */}
        <EditableDescription
          value={description}
          onSave={(newDescription) => handleUpdate({ description: newDescription ?? null })}
          isUpdating={updateTask.isPending && editingField === 'description'}
          onEdit={() => setEditingField('description')}
        />

        {/* Attachments */}
        <AttachmentsSection taskId={task.id} />

        {/* Dependencies */}
        <TaskDependencySection
          taskId={task.id}
          onNavigateToTask={onNavigateToTask}
        />

        {/* Sessions */}
        {orchestratorMeta?.sessionHistory && orchestratorMeta.sessionHistory.length > 0 && (
          <TaskSessionsSection
            sessionHistory={orchestratorMeta.sessionHistory}
            entityNameMap={entityNameMap}
          />
        )}

        {/* Orchestrator Metadata Section */}
        {orchestratorMeta && (
          <OrchestratorMetadataSection
            meta={orchestratorMeta}
            onUpdateMergeStatus={handleUpdateMergeStatus}
            isUpdatingMergeStatus={updateMergeStatus.isPending}
          />
        )}

        {/* Timestamps */}
        <div className="mt-6 pt-4 border-t border-[var(--color-border)]">
          <div className="grid grid-cols-2 gap-4 text-xs text-[var(--color-text-tertiary)]">
            <div>
              <span className="font-medium">{t('taskDetail.created')}</span>{' '}
              <span title={formatDateTime(task.createdAt)}>{formatRelativeTime(task.createdAt)}</span>
            </div>
            <div>
              <span className="font-medium">{t('taskDetail.updated')}</span>{' '}
              <span title={formatDateTime(task.updatedAt)}>{formatRelativeTime(task.updatedAt)}</span>
            </div>
            {task.closedAt && (
              <div>
                <span className="font-medium">{t('taskDetail.closed')}</span>{' '}
                <span title={formatDateTime(task.closedAt)}>{formatRelativeTime(task.closedAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Error display */}
        {updateTask.isError && (
          <div className="mt-4 p-3 bg-[var(--color-danger-muted)] border border-[var(--color-danger)] rounded-lg text-sm text-[var(--color-danger)]">
            {t('taskDetail.failedUpdate', { message: updateTask.error?.message })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Orchestrator Metadata Section
// ============================================================================

interface OrchestratorMetadataSectionProps {
  meta: NonNullable<Task['metadata']>['orchestrator'];
  onUpdateMergeStatus?: (mergeStatus: MergeStatus) => void;
  isUpdatingMergeStatus?: boolean;
}

function OrchestratorMetadataSection({ meta, onUpdateMergeStatus, isUpdatingMergeStatus }: OrchestratorMetadataSectionProps) {
  const { t } = useTranslation('smithy');

  if (!meta) return null;

  return (
    <div className="mb-6 p-4 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)]">
      <h3 className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">
        {t('taskDetail.orchestratorInfo')}
      </h3>

      <div className="space-y-3">
        {/* Branch */}
        {meta.branch && (
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="w-4 h-4 text-[var(--color-text-tertiary)]" />
            <span className="font-mono text-[var(--color-text)]">{meta.branch}</span>
          </div>
        )}

        {/* Merge Status */}
        {meta.mergeStatus && (
          <div className="flex items-center gap-2 text-sm">
            <GitMerge className="w-4 h-4 text-[var(--color-text-tertiary)]" />
            {onUpdateMergeStatus ? (
              <MergeStatusDropdown
                value={meta.mergeStatus as MergeStatus}
                onSave={onUpdateMergeStatus}
                isUpdating={isUpdatingMergeStatus ?? false}
              />
            ) : (
              <MergeStatusBadge status={meta.mergeStatus} />
            )}
            {meta.mergeFailureReason && (
              <span className="text-xs text-[var(--color-danger)]">
                {meta.mergeFailureReason}
              </span>
            )}
          </div>
        )}

        {/* Test Results */}
        {meta.lastTestResult && (
          <div className="flex items-start gap-2 text-sm">
            <FlaskConical className="w-4 h-4 text-[var(--color-text-tertiary)] mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium ${
                    meta.lastTestResult.passed
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-[var(--color-danger)]'
                  }`}
                >
                  {meta.lastTestResult.passed ? t('taskDetail.testPassed') : t('taskDetail.testFailed')}
                </span>
                {meta.testRunCount && meta.testRunCount > 1 && (
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    ({t('taskDetail.run', { count: meta.testRunCount })})
                  </span>
                )}
              </div>
              {meta.lastTestResult.totalTests !== undefined && (
                <div className="text-xs text-[var(--color-text-tertiary)]">
                  {meta.lastTestResult.passedTests ?? 0}/{meta.lastTestResult.totalTests} {t('taskDetail.passed')}
                  {meta.lastTestResult.failedTests
                    ? `, ${meta.lastTestResult.failedTests} ${t('taskDetail.failed')}`
                    : ''}
                  {meta.lastTestResult.skippedTests
                    ? `, ${meta.lastTestResult.skippedTests} ${t('taskDetail.skipped')}`
                    : ''}
                </div>
              )}
              {meta.lastTestResult.errorMessage && (
                <div className="mt-1 text-xs text-[var(--color-danger)] font-mono">
                  {meta.lastTestResult.errorMessage}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="text-xs text-[var(--color-text-tertiary)] pt-2 border-t border-[var(--color-border)]">
          {meta.startedAt && <div>{t('taskDetail.started')} {formatRelativeTime(meta.startedAt)}</div>}
          {meta.completedAt && <div>{t('taskDetail.completed')} {formatRelativeTime(meta.completedAt)}</div>}
          {meta.mergedAt && <div>{t('taskDetail.merged')} {formatRelativeTime(meta.mergedAt)}</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface MetadataFieldProps {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

function MetadataField({ label, icon, children }: MetadataFieldProps) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-1">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

// Editable Title
function EditableTitle({
  value,
  onSave,
  isUpdating,
  onEdit,
}: {
  value: string;
  onSave: (value: string) => void;
  isUpdating: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation('smithy');
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = () => {
    if (editValue.trim() && editValue !== value) {
      onEdit();
      onSave(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 text-lg font-semibold text-[var(--color-text)] border border-[var(--color-primary)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] bg-[var(--color-input-bg)]"
          data-testid="task-title-input"
        />
        {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-tertiary)]" />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <h2
        className="text-lg font-semibold text-[var(--color-text)] cursor-pointer hover:text-[var(--color-primary)] transition-colors"
        onClick={() => setIsEditing(true)}
        data-testid="task-detail-title"
      >
        {value}
      </h2>
      <button
        onClick={() => setIsEditing(true)}
        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-hover)] rounded transition-opacity"
        aria-label={t('taskDetail.editTitle')}
      >
        <Pencil className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
      </button>
      {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-tertiary)]" />}
    </div>
  );
}

// Valid status transitions (mirrors core package STATUS_TRANSITIONS)
const VALID_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['open', 'deferred', 'closed'],
  open: ['in_progress', 'blocked', 'deferred', 'backlog', 'closed'],
  in_progress: ['open', 'blocked', 'deferred', 'review', 'closed'],
  blocked: ['open', 'in_progress', 'deferred', 'closed'],
  deferred: ['open', 'in_progress', 'backlog'],
  review: ['closed', 'in_progress'],
  closed: ['open'],
  tombstone: [],
};

// Status Dropdown
function StatusDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: TaskStatus;
  onSave: (value: TaskStatus) => void;
  isUpdating: boolean;
}) {
  const { t } = useTranslation('smithy');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter options to only show valid transitions from current status
  const validTransitions = VALID_STATUS_TRANSITIONS[value] || [];
  const availableOptions = STATUS_KEYS.filter(
    (opt) => opt.value === value || validTransitions.includes(opt.value)
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 hover:ring-2 hover:ring-[var(--color-primary)] rounded transition-all"
        disabled={isUpdating}
        data-testid="task-status-dropdown"
      >
        <TaskStatusBadge status={value} />
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[140px]">
          {availableOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (opt.value !== value) onSave(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2 ${
                opt.value === value ? 'bg-[var(--color-surface-elevated)]' : ''
              }`}
            >
              <TaskStatusBadge status={opt.value} />
              <span>{t(opt.key)}</span>
              {opt.value === value && <Check className="w-3 h-3 text-[var(--color-primary)] ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Priority Dropdown
function PriorityDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: Priority;
  onSave: (value: Priority) => void;
  isUpdating: boolean;
}) {
  const { t } = useTranslation('smithy');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 hover:ring-2 hover:ring-[var(--color-primary)] rounded transition-all"
        disabled={isUpdating}
        data-testid="task-priority-dropdown"
      >
        <TaskPriorityBadge priority={value} />
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[120px]">
          {PRIORITY_KEYS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (opt.value !== value) onSave(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2 ${
                opt.value === value ? 'bg-[var(--color-surface-elevated)]' : ''
              }`}
            >
              <TaskPriorityBadge priority={opt.value} showIcon={false} />
              <span>{t(opt.key)}</span>
              {opt.value === value && <Check className="w-3 h-3 text-[var(--color-primary)] ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Assignee Dropdown
function AssigneeDropdown({
  value,
  entityNameMap,
  workers,
  operators,
  onSave,
  isUpdating,
}: {
  value?: string;
  entityNameMap: Map<string, string>;
  workers: Agent[];
  operators: Operator[];
  onSave: (value: string | null) => void;
  isUpdating: boolean;
}) {
  const { t } = useTranslation('smithy');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentName = value ? entityNameMap.get(value) : undefined;
  // Check if current assignee is an operator
  const isOperator = value ? operators.some(op => op.id === value) : false;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1 text-sm rounded bg-[var(--color-surface-elevated)] hover:ring-2 hover:ring-[var(--color-primary)] transition-all"
        disabled={isUpdating}
        data-testid="task-assignee-dropdown"
      >
        {isOperator ? (
          <User className="w-3.5 h-3.5 text-blue-500" />
        ) : value ? (
          <Bot className="w-3.5 h-3.5 text-purple-500" />
        ) : (
          <User className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
        )}
        <span className={currentName ? 'text-[var(--color-text)]' : 'text-[var(--color-text-tertiary)] italic'}>
          {currentName || t('taskDetail.unassigned')}
        </span>
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[180px] max-h-[280px] overflow-y-auto">
          {/* Unassigned option */}
          <button
            onClick={() => {
              if (value) onSave(null);
              setIsOpen(false);
            }}
            className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2 ${
              !value ? 'bg-[var(--color-surface-elevated)]' : ''
            }`}
          >
            <User className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
            <span className="text-[var(--color-text-tertiary)] italic">{t('taskDetail.unassigned')}</span>
            {!value && <Check className="w-3 h-3 text-[var(--color-primary)] ml-auto" />}
          </button>

          {/* Operators section */}
          {operators.length > 0 && (
            <>
              <div className="border-t border-[var(--color-border)] my-1" />
              <div className="px-3 py-1 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                {t('taskDetail.operators')}
              </div>
              {operators.map((operator) => (
                <button
                  key={operator.id}
                  onClick={() => {
                    if (operator.id !== value) onSave(operator.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2 ${
                    operator.id === value ? 'bg-[var(--color-surface-elevated)]' : ''
                  }`}
                >
                  <User className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-[var(--color-text)]">{operator.name}</span>
                  {operator.id === value && <Check className="w-3 h-3 text-[var(--color-primary)] ml-auto" />}
                </button>
              ))}
            </>
          )}

          {/* Workers section */}
          <div className="border-t border-[var(--color-border)] my-1" />
          <div className="px-3 py-1 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
            {t('taskDetail.workerAgents')}
          </div>
          {workers.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--color-text-tertiary)]">
              {t('taskDetail.noWorkerAgents')}
            </div>
          ) : (
            workers.map((agent) => (
              <button
                key={agent.id}
                onClick={() => {
                  if (agent.id !== value) onSave(agent.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2 ${
                  agent.id === value ? 'bg-[var(--color-surface-elevated)]' : ''
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-[var(--color-text)]">{agent.name}</span>
                {agent.id === value && <Check className="w-3 h-3 text-[var(--color-primary)] ml-auto" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Complexity Dropdown
function ComplexityDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: number;
  onSave: (value: number) => void;
  isUpdating: boolean;
}) {
  const { t } = useTranslation('smithy');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentOpt = COMPLEXITY_KEYS.find((opt) => opt.value === value);
  const currentLabel = currentOpt ? t(currentOpt.key) : t('taskDetail.unknown');

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-sm rounded bg-[var(--color-surface-elevated)] hover:ring-2 hover:ring-[var(--color-primary)] transition-all"
        disabled={isUpdating}
        data-testid="task-complexity-dropdown"
      >
        <span className="text-[var(--color-text)]">{currentLabel}</span>
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[120px]">
          {COMPLEXITY_KEYS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (opt.value !== value) onSave(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2 ${
                opt.value === value ? 'bg-[var(--color-surface-elevated)]' : ''
              }`}
            >
              <span className="text-[var(--color-text)]">{t(opt.key)}</span>
              {opt.value === value && <Check className="w-3 h-3 text-[var(--color-primary)] ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Merge Status Options
const MERGE_STATUS_KEYS: { value: MergeStatus; key: string }[] = [
  { value: 'pending', key: 'taskDetail.mergePending' },
  { value: 'testing', key: 'taskDetail.mergeTesting' },
  { value: 'merging', key: 'taskDetail.mergeMerging' },
  { value: 'merged', key: 'taskDetail.mergeMerged' },
  { value: 'conflict', key: 'taskDetail.mergeConflict' },
  { value: 'test_failed', key: 'taskDetail.mergeTestFailed' },
  { value: 'failed', key: 'taskDetail.mergeFailed' },
  { value: 'not_applicable', key: 'taskDetail.mergeNA' },
];

// Merge Status Dropdown
function MergeStatusDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: MergeStatus;
  onSave: (value: MergeStatus) => void;
  isUpdating: boolean;
}) {
  const { t } = useTranslation('smithy');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 hover:ring-2 hover:ring-[var(--color-primary)] rounded transition-all"
        disabled={isUpdating}
        data-testid="merge-status-dropdown"
      >
        <MergeStatusBadge status={value} />
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[140px]">
          {MERGE_STATUS_KEYS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (opt.value !== value) onSave(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2 ${
                opt.value === value ? 'bg-[var(--color-surface-elevated)]' : ''
              }`}
            >
              <MergeStatusBadge status={opt.value} />
              <span>{t(opt.key)}</span>
              {opt.value === value && <Check className="w-3 h-3 text-[var(--color-primary)] ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Deadline Input
function DeadlineInput({
  value,
  onSave,
  isUpdating,
}: {
  value?: string;
  onSave: (value: string | null) => void;
  isUpdating: boolean;
}) {
  const { t } = useTranslation('smithy');
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ? value.split('T')[0] : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value ? value.split('T')[0] : '');
  }, [value]);

  const handleSave = () => {
    const newValue = editValue ? new Date(editValue).toISOString() : null;
    if ((newValue !== value) && (newValue || value)) {
      onSave(newValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') {
      setEditValue(value ? value.split('T')[0] : '');
      setIsEditing(false);
    }
  };

  const handleClear = () => {
    if (value) {
      onSave(null);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="date"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="text-sm text-[var(--color-text)] border border-[var(--color-primary)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] bg-[var(--color-input-bg)]"
          data-testid="task-deadline-input"
        />
        {value && (
          <button
            onClick={handleClear}
            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] rounded"
            aria-label={t('taskDetail.clearDeadline')}
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-tertiary)]" />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <span
        className={`text-sm cursor-pointer hover:text-[var(--color-primary)] transition-colors ${
          value ? 'text-[var(--color-text)]' : 'text-[var(--color-text-tertiary)] italic'
        }`}
        onClick={() => setIsEditing(true)}
        data-testid="task-deadline-display"
      >
        {value ? formatDate(value) : t('taskDetail.noDeadline')}
      </span>
      <button
        onClick={() => setIsEditing(true)}
        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-hover)] rounded transition-opacity"
        aria-label={t('taskDetail.editDeadline')}
      >
        <Pencil className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
      </button>
      {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-tertiary)]" />}
    </div>
  );
}

// Editable Tags
function EditableTags({
  tags,
  onSave,
  isUpdating,
  onEdit,
}: {
  tags: string[];
  onSave: (tags: string[]) => void;
  isUpdating: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation('smithy');
  const [isEditing, setIsEditing] = useState(false);
  const [editTags, setEditTags] = useState<string[]>(tags);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditTags(tags);
  }, [tags]);

  const handleAddTag = () => {
    const trimmed = inputValue.trim().toLowerCase();
    if (trimmed && !editTags.includes(trimmed)) {
      setEditTags([...editTags, trimmed]);
      setInputValue('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditTags(editTags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Escape') {
      setEditTags(tags);
      setInputValue('');
      setIsEditing(false);
    } else if (e.key === 'Backspace' && !inputValue && editTags.length > 0) {
      setEditTags(editTags.slice(0, -1));
    }
  };

  const handleSave = () => {
    const tagsChanged = JSON.stringify(editTags.sort()) !== JSON.stringify([...tags].sort());
    if (tagsChanged) {
      onEdit();
      onSave(editTags);
    }
    setIsEditing(false);
    setInputValue('');
  };

  if (isEditing) {
    return (
      <div className="mb-6" data-testid="tags-editor">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
            <Tag className="w-3 h-3" />
            {t('taskDetail.tags')}
          </div>
          <span className="text-[10px] text-[var(--color-text-tertiary)]">
            {t('taskDetail.tagsHint')}
          </span>
        </div>
        <div className="p-2 border border-[var(--color-primary)] rounded-lg bg-[var(--color-input-bg)] focus-within:ring-2 focus-within:ring-[var(--color-primary)]">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {editTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 rounded-full"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  aria-label={t('taskDetail.removeTag', { tag })}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (inputValue.trim()) handleAddTag();
            }}
            placeholder={t('taskDetail.tagPlaceholder')}
            className="w-full text-sm bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
            data-testid="tags-input"
          />
        </div>
        <div className="flex items-center justify-end gap-2 mt-2">
          {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-tertiary)]" />}
          <button
            onClick={() => {
              setEditTags(tags);
              setInputValue('');
              setIsEditing(false);
            }}
            className="px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded transition-colors"
          >
            {t('common:button.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm font-medium text-white bg-[var(--color-primary)] hover:opacity-90 rounded transition-colors"
          >
            {t('common:button.save')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 group" data-testid="tags-section">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
          <Tag className="w-3 h-3" />
          {t('taskDetail.tags')}
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-hover)] rounded transition-opacity"
          aria-label={t('taskDetail.editTags')}
        >
          <Pencil className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
        </button>
      </div>
      {tags.length > 0 ? (
        <div
          className="flex flex-wrap gap-1.5 p-2 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-primary)] transition-colors"
          onClick={() => setIsEditing(true)}
        >
          {tags.map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="w-full p-2 text-sm text-[var(--color-text-tertiary)] italic bg-[var(--color-surface-elevated)] rounded-lg border border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] hover:text-[var(--color-text-secondary)] transition-colors text-left"
          data-testid="add-tags-btn"
        >
          {t('taskDetail.addTags')}
        </button>
      )}
      {isUpdating && (
        <div className="flex items-center gap-2 mt-2 text-xs text-[var(--color-text-tertiary)]">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('taskDetail.saving')}
        </div>
      )}
    </div>
  );
}

// Editable Description
function EditableDescription({
  value,
  onSave,
  isUpdating,
  onEdit,
}: {
  value?: string;
  onSave: (value: string | null) => void;
  isUpdating: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation('smithy');
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Capture the initial length when entering edit mode to position cursor at end
  const initialLengthRef = useRef<number>(0);

  // Image drag-and-drop support
  const handleImageInsert = useCallback((markdown: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      // Fallback: append to end
      setEditValue((prev) => prev + (prev ? '\n' : '') + markdown);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setEditValue((prev) => {
      const before = prev.slice(0, start);
      const after = prev.slice(end);
      // Add newlines around the image if needed
      const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
      const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
      return before + prefix + markdown + suffix + after;
    });
    // Move cursor after the inserted markdown
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newPos = start + (start > 0 ? 1 : 0) + markdown.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.focus();
      }
    });
  }, []);

  const { dropHandlers, isDragging, isUploading } = useImageDrop({
    onImageInsert: handleImageInsert,
  });

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      // Capture the current length when first entering edit mode
      initialLengthRef.current = editValue.length;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(initialLengthRef.current, initialLengthRef.current);
    }
  }, [isEditing]); // Only run when isEditing changes, not on every keystroke

  useEffect(() => {
    setEditValue(value ?? '');
  }, [value]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed !== (value ?? '')) {
      onEdit();
      onSave(trimmed || null);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditValue(value ?? '');
      setIsEditing(false);
    }
    // Ctrl/Cmd+Enter to save
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  if (isEditing) {
    return (
      <div className="mb-6" data-testid="description-editor">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
            {t('taskDetail.description')}
          </h3>
          <span className="text-[10px] text-[var(--color-text-tertiary)]">
            {t('taskDetail.descriptionHint')}
          </span>
        </div>
        <div
          className="relative"
          onDragOver={dropHandlers.onDragOver}
          onDragLeave={dropHandlers.onDragLeave}
          onDrop={dropHandlers.onDrop}
        >
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={dropHandlers.onPaste}
            rows={8}
            placeholder={t('taskDetail.descriptionPlaceholder')}
            className="w-full p-3 text-sm border border-[var(--color-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] bg-[var(--color-input-bg)] text-[var(--color-text)] resize-y min-h-[120px]"
            data-testid="task-description-input"
          />
          {/* Image drag-and-drop overlay */}
          {isDragging && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-primary)] bg-[var(--color-primary)]/10 pointer-events-none"
              data-testid="description-drop-overlay"
            >
              <span className="text-sm font-medium text-[var(--color-primary)]">
                {t('taskDetail.dropImage')}
              </span>
            </div>
          )}
          {/* Upload progress indicator */}
          {isUploading && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-[var(--color-bg)]/50 pointer-events-none"
              data-testid="description-upload-overlay"
            >
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg)] shadow border border-[var(--color-border)]">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
                <span className="text-sm text-[var(--color-text-secondary)]">{t('taskDetail.uploadingImage')}</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 mt-2">
          {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-tertiary)]" />}
          <button
            onClick={() => {
              setEditValue(value ?? '');
              setIsEditing(false);
            }}
            className="px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded transition-colors"
          >
            {t('common:button.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm font-medium text-white bg-[var(--color-primary)] hover:opacity-90 rounded transition-colors"
          >
            {t('common:button.save')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 group" data-testid="description-section">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
          {t('taskDetail.description')}
        </h3>
        <button
          onClick={() => setIsEditing(true)}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-hover)] rounded transition-opacity"
          aria-label={t('taskDetail.editDescription')}
        >
          <Pencil className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
        </button>
      </div>
      {value ? (
        <div
          onClick={() => setIsEditing(true)}
          className="p-3 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-primary)] transition-colors"
        >
          <MarkdownContent
            content={value}
            className="text-sm text-[var(--color-text)] prose prose-sm dark:prose-invert max-w-none"
            data-testid="task-description"
          />
        </div>
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="w-full p-3 text-sm text-[var(--color-text-tertiary)] italic bg-[var(--color-surface-elevated)] rounded-lg border border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] hover:text-[var(--color-text-secondary)] transition-colors text-left"
          data-testid="add-description-btn"
        >
          {t('taskDetail.addDescription')}
        </button>
      )}
      {isUpdating && (
        <div className="flex items-center gap-2 mt-2 text-xs text-[var(--color-text-tertiary)]">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('taskDetail.saving')}
        </div>
      )}
    </div>
  );
}

// Delete Confirmation Dialog
function DeleteConfirmDialog({
  taskTitle,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  taskTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  const { t } = useTranslation('smithy');
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) onCancel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isDeleting, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="delete-confirm-dialog">
      <div className="absolute inset-0 bg-black/50" onClick={() => !isDeleting && onCancel()} />
      <div className="relative bg-[var(--color-surface)] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-danger-muted)] flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-[var(--color-danger)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{t('taskDetail.deleteTitle')}</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('taskDetail.deleteDescription', { title: taskTitle })}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            data-testid="delete-cancel-btn"
          >
            {t('common:button.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-danger)] rounded-md hover:opacity-90 disabled:opacity-50"
            data-testid="delete-confirm-btn"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('taskDetail.deleting')}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {t('common:button.delete')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Reopen Dialog
export function ReopenDialog({
  taskTitle,
  onConfirm,
  onCancel,
  isReopening,
}: {
  taskTitle: string;
  onConfirm: (message?: string) => void;
  onCancel: () => void;
  isReopening: boolean;
}) {
  const { t } = useTranslation('smithy');
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Image drag-and-drop support
  const handleImageInsert = useCallback((markdown: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMessage((prev) => prev + (prev ? '\n' : '') + markdown);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setMessage((prev) => {
      const before = prev.slice(0, start);
      const after = prev.slice(end);
      const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
      const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
      return before + prefix + markdown + suffix + after;
    });
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newPos = start + (start > 0 ? 1 : 0) + markdown.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.focus();
      }
    });
  }, []);

  const { dropHandlers, isDragging, isUploading } = useImageDrop({
    onImageInsert: handleImageInsert,
  });

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isReopening) onCancel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isReopening, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="reopen-dialog">
      <div className="absolute inset-0 bg-black/50" onClick={() => !isReopening && onCancel()} />
      <div className="relative bg-[var(--color-surface)] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{t('taskDetail.reopenTitle')}</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('taskDetail.reopenDescription', { title: taskTitle })}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
            {t('taskDetail.reopenMessageLabel')}
          </label>
          <div
            className="relative"
            onDragOver={dropHandlers.onDragOver}
            onDragLeave={dropHandlers.onDragLeave}
            onDrop={dropHandlers.onDrop}
          >
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={dropHandlers.onPaste}
              placeholder={t('taskDetail.reopenMessagePlaceholder')}
              rows={3}
              className="w-full p-3 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-[var(--color-input-bg)] text-[var(--color-text)] resize-y"
              data-testid="reopen-message-input"
            />
            {/* Image drag-and-drop overlay */}
            {isDragging && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-amber-500 bg-amber-500/10 pointer-events-none"
                data-testid="reopen-drop-overlay"
              >
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  {t('taskDetail.dropImage')}
                </span>
              </div>
            )}
            {/* Upload progress indicator */}
            {isUploading && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-[var(--color-bg)]/50 pointer-events-none"
                data-testid="reopen-upload-overlay"
              >
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg)] shadow border border-[var(--color-border)]">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  <span className="text-sm text-[var(--color-text-secondary)]">{t('taskDetail.uploadingImage')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isReopening}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            data-testid="reopen-cancel-btn"
          >
            {t('common:button.cancel')}
          </button>
          <button
            onClick={() => onConfirm(message.trim() || undefined)}
            disabled={isReopening}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50"
            data-testid="reopen-confirm-btn"
          >
            {isReopening ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('taskDetail.reopening')}
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                {t('taskDetail.reopenTask')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Reset Dialog
function ResetDialog({
  taskTitle,
  onConfirm,
  onCancel,
  isResetting,
}: {
  taskTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isResetting: boolean;
}) {
  const { t } = useTranslation('smithy');
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isResetting) onCancel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isResetting, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="reset-dialog">
      <div className="absolute inset-0 bg-black/50" onClick={() => !isResetting && onCancel()} />
      <div className="relative bg-[var(--color-surface)] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <RefreshCcw className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{t('taskDetail.resetTitle')}</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('taskDetail.resetDescription', { title: taskTitle })}
            </p>
            <ul className="mt-2 text-sm text-[var(--color-text-secondary)] list-disc list-inside space-y-1">
              <li>{t('taskDetail.resetAction1')}</li>
              <li>{t('taskDetail.resetAction2')}</li>
              <li>{t('taskDetail.resetAction3')}</li>
              <li>{t('taskDetail.resetAction4')}</li>
              <li>{t('taskDetail.resetAction5')}</li>
            </ul>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isResetting}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            data-testid="reset-cancel-btn"
          >
            {t('common:button.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isResetting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50"
            data-testid="reset-confirm-btn"
          >
            {isResetting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('taskDetail.resetting')}
              </>
            ) : (
              <>
                <RefreshCcw className="w-4 h-4" />
                {t('taskDetail.resetTaskButton')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Date Formatting Utilities
// ============================================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(dateStr: string): string {
  // Use imported i18n instance directly (utility function, not a component)
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return i18n.t('smithy:taskDetail.justNow');
  if (diffMins < 60) return i18n.t('smithy:taskDetail.minutesAgo', { count: diffMins });
  if (diffHours < 24) return i18n.t('smithy:taskDetail.hoursAgo', { count: diffHours });
  if (diffDays < 7) return i18n.t('smithy:taskDetail.daysAgo', { count: diffDays });
  return formatDate(dateStr);
}

// ============================================================================
// Attachments Section
// ============================================================================

function AttachmentsSection({ taskId }: { taskId: string }) {
  const { t } = useTranslation('smithy');
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const { data: attachments, isLoading } = useTaskAttachments(taskId);
  const addAttachment = useAddAttachment();
  const removeAttachment = useRemoveAttachment();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleAttach = (documentId: string) => {
    addAttachment.mutate(
      { taskId, documentId },
      { onSuccess: () => setShowPicker(false) }
    );
  };

  const handleRemove = (documentId: string) => {
    setRemovingId(documentId);
    removeAttachment.mutate(
      { taskId, documentId },
      { onSettled: () => setRemovingId(null) }
    );
  };

  const alreadyAttachedIds = attachments?.map((a) => a.id) || [];

  return (
    <div className="mb-6" data-testid="attachments-section">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2 hover:text-[var(--color-text)]"
        data-testid="attachments-toggle"
      >
        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Paperclip className="w-3 h-3" />
        {t('taskDetail.attachments')} ({attachments?.length || 0})
      </button>

      {isExpanded && (
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('taskDetail.loadingAttachments')}
            </div>
          ) : attachments && attachments.length > 0 ? (
            attachments.map((doc) => (
              <ExpandableDocumentCard
                key={doc.id}
                doc={doc}
                onRemove={() => handleRemove(doc.id)}
                isRemoving={removingId === doc.id}
              />
            ))
          ) : (
            <div className="text-sm text-[var(--color-text-tertiary)]" data-testid="attachments-empty">
              {t('taskDetail.noDocumentsAttached')}
            </div>
          )}

          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors w-full"
            data-testid="attach-document-btn"
          >
            <Plus className="w-4 h-4" />
            {t('taskDetail.attachDocument')}
          </button>
        </div>
      )}

      <DocumentPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleAttach}
        alreadyAttachedIds={alreadyAttachedIds}
        isAttaching={addAttachment.isPending}
      />
    </div>
  );
}

// ============================================================================
// Expandable Document Card
// ============================================================================

function getContentPreview(content?: string): string {
  if (!content) return '';
  const firstLine = content.split('\n')[0].trim();
  return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
}

function renderDocumentContent(content: string, contentType: string): React.ReactNode {
  if (contentType === 'json') {
    try {
      const formatted = JSON.stringify(JSON.parse(content), null, 2);
      return (
        <pre className="text-xs font-mono bg-[var(--color-surface)] p-3 rounded overflow-x-auto whitespace-pre-wrap text-[var(--color-text)]">
          {formatted}
        </pre>
      );
    } catch {
      return (
        <pre className="text-xs font-mono bg-[var(--color-surface)] p-3 rounded overflow-x-auto whitespace-pre-wrap text-[var(--color-text)]">
          {content}
        </pre>
      );
    }
  }

  if (contentType === 'markdown') {
    return (
      <MarkdownContent
        content={content}
        className="text-sm text-[var(--color-text)] prose prose-sm dark:prose-invert max-w-none"
        data-testid="attachment-markdown-content"
      />
    );
  }

  // Default: plain text
  return (
    <pre className="whitespace-pre-wrap font-sans text-sm text-[var(--color-text)]">{content}</pre>
  );
}

function ExpandableDocumentCard({
  doc,
  onRemove,
  isRemoving,
}: {
  doc: AttachedDocument;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const { t } = useTranslation('smithy');
  const [isExpanded, setIsExpanded] = useState(false);
  const preview = getContentPreview(doc.content);

  return (
    <div
      className="border border-[var(--color-border)] rounded-lg overflow-hidden"
      data-testid={`attachment-item-${doc.id}`}
    >
      {/* Header - always visible */}
      <div className="flex items-center gap-2 p-2 bg-[var(--color-surface-elevated)] group">
        {/* Expand/Collapse button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-[var(--color-surface-hover)] rounded flex-shrink-0"
          data-testid={`attachment-expand-${doc.id}`}
          aria-label={isExpanded ? t('taskDetail.collapse') : t('taskDetail.expand')}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          )}
        </button>
        <FileText className="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-primary)] truncate">
              {doc.title || t('taskDetail.untitledDocument')}
            </span>
            <span className="px-1.5 py-0.5 bg-[var(--color-surface)] text-[var(--color-text-tertiary)] rounded text-[10px] flex-shrink-0">
              {doc.contentType}
            </span>
          </div>
          {!isExpanded && preview && (
            <div
              className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5"
              data-testid={`attachment-preview-${doc.id}`}
            >
              {preview}
            </div>
          )}
        </div>
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          aria-label={t('taskDetail.removeAttachment')}
          data-testid={`attachment-remove-${doc.id}`}
        >
          {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && doc.content && (
        <div
          className="p-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
          data-testid={`attachment-content-${doc.id}`}
        >
          {renderDocumentContent(doc.content, doc.contentType)}
        </div>
      )}

      {/* Expanded but no content */}
      {isExpanded && !doc.content && (
        <div
          className="p-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text-tertiary)] italic"
          data-testid={`attachment-content-${doc.id}`}
        >
          {t('taskDetail.noContentAvailable')}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Document Picker Modal
// ============================================================================

function DocumentPickerModal({
  isOpen,
  onClose,
  onSelect,
  alreadyAttachedIds,
  isAttaching,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (documentId: string) => void;
  alreadyAttachedIds: string[];
  isAttaching: boolean;
}) {
  const { t } = useTranslation('smithy');
  const [searchQuery, setSearchQuery] = useState('');
  const { data: documents, isLoading } = useDocumentsForAttachment(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isAttaching) {
          onClose();
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isAttaching, onClose]);

  if (!isOpen) return null;

  const availableDocs = documents?.filter((doc) => !alreadyAttachedIds.includes(doc.id)) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="document-picker-modal">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={() => !isAttaching && onClose()} />
      {/* Dialog */}
      <div className="relative bg-[var(--color-surface)] rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col border border-[var(--color-border)]">
        <div className="p-4 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{t('taskDetail.attachDocument')}</h3>
            <button
              onClick={onClose}
              disabled={isAttaching}
              className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] rounded"
              data-testid="document-picker-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
            <input
              ref={inputRef}
              type="text"
              placeholder={t('taskDetail.searchDocuments')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              data-testid="document-picker-search"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-tertiary)]" />
            </div>
          ) : availableDocs.length === 0 ? (
            <div className="text-center py-8 text-[var(--color-text-tertiary)]" data-testid="document-picker-empty">
              {documents?.length === 0
                ? t('taskDetail.noDocumentsAvailable')
                : searchQuery
                  ? t('taskDetail.noDocumentsMatch')
                  : t('taskDetail.allDocumentsAttached')}
            </div>
          ) : (
            <div className="space-y-2">
              {availableDocs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onSelect(doc.id)}
                  disabled={isAttaching}
                  className="w-full flex items-center gap-3 p-3 text-left bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors disabled:opacity-50"
                  data-testid={`document-picker-item-${doc.id}`}
                >
                  <FileText className="w-5 h-5 text-[var(--color-text-tertiary)] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[var(--color-text)] truncate">
                      {doc.title || t('taskDetail.untitledDocument')}
                    </div>
                    <div className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-2">
                      <span className="font-mono">{doc.id}</span>
                      <span className="px-1.5 py-0.5 bg-[var(--color-surface)] text-[var(--color-text-tertiary)] rounded">
                        {doc.contentType}
                      </span>
                    </div>
                  </div>
                  {isAttaching && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Task Sessions Section
// ============================================================================

interface TaskSessionsSectionProps {
  sessionHistory: TaskSessionHistoryEntry[];
  entityNameMap: Map<string, string>;
}

function TaskSessionsSection({ sessionHistory, entityNameMap }: TaskSessionsSectionProps) {
  const { t } = useTranslation('smithy');
  const [isExpanded, setIsExpanded] = useState(true);
  const [viewingSession, setViewingSession] = useState<TaskSessionHistoryEntry | null>(null);
  const [resumingSession, setResumingSession] = useState<TaskSessionHistoryEntry | null>(null);

  // Sort sessions by startedAt descending (most recent first)
  const sortedSessions = [...sessionHistory].sort((a, b) => {
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  return (
    <div className="mb-6" data-testid="sessions-section">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2 hover:text-[var(--color-text)]"
        data-testid="sessions-toggle"
      >
        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <History className="w-3 h-3" />
        {t('taskDetail.sessions')} ({sessionHistory.length})
      </button>

      {isExpanded && (
        <div className="space-y-2">
          {sortedSessions.length > 0 ? (
            sortedSessions.map((entry) => (
              <SessionEntryCard
                key={entry.sessionId}
                entry={entry}
                entityNameMap={entityNameMap}
                onView={() => setViewingSession(entry)}
                onResume={() => setResumingSession(entry)}
              />
            ))
          ) : (
            <div className="text-sm text-[var(--color-text-tertiary)]" data-testid="sessions-empty">
              {t('taskDetail.noSessionsRecorded')}
            </div>
          )}
        </div>
      )}

      {/* Session Transcript Modal */}
      {viewingSession && (
        <SessionTranscriptModal
          entry={viewingSession}
          onClose={() => setViewingSession(null)}
          onResume={() => {
            setViewingSession(null);
            setResumingSession(viewingSession);
          }}
        />
      )}

      {/* Resume Dialog */}
      {resumingSession && (
        <SessionResumeDialog
          entry={resumingSession}
          onClose={() => setResumingSession(null)}
        />
      )}
    </div>
  );
}

// Session Entry Card
interface SessionEntryCardProps {
  entry: TaskSessionHistoryEntry;
  entityNameMap: Map<string, string>;
  onView: () => void;
  onResume: () => void;
}

function SessionEntryCard({ entry, onView, onResume }: SessionEntryCardProps) {
  const { t } = useTranslation('smithy');
  const isWorker = entry.agentRole === 'worker';
  const truncatedSessionId = entry.providerSessionId?.substring(0, 8);

  return (
    <div
      className="flex items-center gap-3 p-3 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)] group"
      data-testid={`session-entry-${entry.sessionId}`}
    >
      {/* Agent icon */}
      {isWorker ? (
        <Bot className="w-4 h-4 text-purple-500 flex-shrink-0" />
      ) : (
        <Shield className="w-4 h-4 text-blue-500 flex-shrink-0" />
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text)] truncate">
            {entry.agentName}
          </span>
          <span
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
              isWorker
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            }`}
          >
            {entry.agentRole}
          </span>
          {truncatedSessionId && (
            <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
              {truncatedSessionId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] mt-0.5">
          <span title={formatDateTime(entry.startedAt)}>
            {formatRelativeTime(entry.startedAt)}
          </span>
          {entry.endedAt && (
            <>
              <span>→</span>
              <span title={formatDateTime(entry.endedAt)}>
                {formatRelativeTime(entry.endedAt)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onView}
          className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded transition-colors"
          aria-label={t('taskDetail.viewTranscript')}
          title={t('taskDetail.viewTranscript')}
          data-testid={`session-view-${entry.sessionId}`}
        >
          <Eye className="w-4 h-4" />
        </button>
        {entry.providerSessionId && (
          <button
            onClick={onResume}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-green-600 dark:hover:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
            aria-label={t('taskDetail.resumeSession')}
            title={t('taskDetail.resumeSession')}
            data-testid={`session-resume-${entry.sessionId}`}
          >
            <Play className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Session Transcript Modal
// ============================================================================

interface SessionTranscriptModalProps {
  entry: TaskSessionHistoryEntry;
  onClose: () => void;
  onResume: () => void;
}

function SessionTranscriptModal({ entry, onClose, onResume }: SessionTranscriptModalProps) {
  const { t } = useTranslation('smithy');
  const [messages, setMessages] = useState<StreamEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchSessionMessages(entry.sessionId);
      const events = response.messages.map(messageToStreamEvent);
      setMessages(events);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('taskDetail.failedLoadMessages'));
    } finally {
      setIsLoading(false);
    }
  }, [entry.sessionId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const isWorker = entry.agentRole === 'worker';
  const truncatedSessionId = entry.providerSessionId?.substring(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="session-transcript-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-[var(--color-surface)] rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[70vh] flex flex-col border border-[var(--color-border)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            {isWorker ? (
              <Bot className="w-5 h-5 text-purple-500" />
            ) : (
              <Shield className="w-5 h-5 text-blue-500" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-[var(--color-text)]">
                  {entry.agentName}
                </h3>
                <span
                  className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                    isWorker
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}
                >
                  {entry.agentRole}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] mt-0.5">
                {truncatedSessionId && (
                  <span className="font-mono">{truncatedSessionId}</span>
                )}
                <span title={formatDateTime(entry.startedAt)}>
                  {t('taskDetail.started')} {formatRelativeTime(entry.startedAt)}
                </span>
                {entry.endedAt && (
                  <span title={formatDateTime(entry.endedAt)}>
                    • {t('taskDetail.endedLabel')} {formatRelativeTime(entry.endedAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {entry.providerSessionId && (
              <button
                onClick={onResume}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 dark:text-green-300 dark:bg-green-900/30 dark:hover:bg-green-900/50 rounded-md transition-colors"
                data-testid="transcript-resume-btn"
              >
                <Play className="w-4 h-4" />
                {t('taskDetail.resume')}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded"
              aria-label={t('taskDetail.closeAriaLabel')}
              data-testid="transcript-close-btn"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)] mb-2" />
              <span className="text-sm text-[var(--color-text-secondary)]">{t('taskDetail.loadingTranscript')}</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <AlertCircle className="w-6 h-6 text-[var(--color-danger)] mb-2" />
              <span className="text-sm text-[var(--color-text-secondary)]">{error}</span>
              <button
                onClick={loadMessages}
                className="mt-3 px-3 py-1.5 text-sm text-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] rounded-md"
              >
                {t('common:button.retry')}
              </button>
            </div>
          ) : (
            <TranscriptViewer events={messages} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Session Resume Dialog
// ============================================================================

interface SessionResumeDialogProps {
  entry: TaskSessionHistoryEntry;
  onClose: () => void;
}

function SessionResumeDialog({ entry, onClose }: SessionResumeDialogProps) {
  const { t } = useTranslation('smithy');
  const [resumePrompt, setResumePrompt] = useState('');
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleResume = () => {
    navigate({
      to: '/workspaces',
      search: {
        layout: 'single',
        agent: entry.agentId,
        resumeSessionId: entry.providerSessionId,
        resumePrompt: resumePrompt.trim() || undefined,
      },
    });
  };

  const isWorker = entry.agentRole === 'worker';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="session-resume-dialog">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-[var(--color-surface)] rounded-lg shadow-xl max-w-md w-full mx-4 p-6 border border-[var(--color-border)]">
        <div className="flex items-start gap-4">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              isWorker
                ? 'bg-purple-100 dark:bg-purple-900/30'
                : 'bg-blue-100 dark:bg-blue-900/30'
            }`}
          >
            {isWorker ? (
              <Bot className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            ) : (
              <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{t('taskDetail.resumeSessionTitle')}</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('taskDetail.resumeSessionDescription', { agentName: entry.agentName })}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
            {t('taskDetail.resumeMessageLabel')}
          </label>
          <textarea
            ref={textareaRef}
            value={resumePrompt}
            onChange={(e) => setResumePrompt(e.target.value)}
            placeholder={t('taskDetail.resumeMessagePlaceholder')}
            rows={3}
            className="w-full p-3 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] bg-[var(--color-input-bg)] text-[var(--color-text)] resize-y"
            data-testid="resume-prompt-input"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)]"
            data-testid="resume-cancel-btn"
          >
            {t('common:button.cancel')}
          </button>
          <button
            onClick={handleResume}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
            data-testid="resume-confirm-btn"
          >
            <Play className="w-4 h-4" />
            {t('taskDetail.resume')}
          </button>
        </div>
      </div>
    </div>
  );
}
