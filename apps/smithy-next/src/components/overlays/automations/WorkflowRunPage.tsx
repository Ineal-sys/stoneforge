import { useState } from 'react'
import {
  ArrowLeft, Check, X, Loader, Clock, SkipForward, Copy, RotateCcw, Square,
  Bot, Terminal, ChevronDown, ChevronRight, AlertTriangle, CircleDot, GitPullRequest, ExternalLink,
  Zap, Globe,
} from 'lucide-react'
import type { Workflow, WFRun, WFStepRun } from './wf-types'
import { WorkflowRunTimeline } from './WorkflowRunTimeline'
import { useTeamContext } from '../../../TeamContext'
import { useTranslation } from '@/i18n'

interface WorkflowRunPageProps {
  workflow: Workflow
  run: WFRun
  onBack: () => void
  onNavigateToCI?: (runId: string) => void
  onNavigateToMR?: (mrId: string) => void
  onNavigateToTask?: (taskId: string) => void
}

const stepStatusIcon: Record<string, typeof Check> = {
  success: Check, failure: X, running: Loader, pending: Clock, skipped: SkipForward,
}
const stepStatusColor: Record<string, string> = {
  success: 'var(--color-success)', failure: 'var(--color-danger)', running: 'var(--color-warning)',
  pending: 'var(--color-text-tertiary)', skipped: 'var(--color-text-tertiary)',
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px',
  borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', border: 'none',
  color: 'var(--color-text-secondary)', cursor: 'pointer',
}

export function WorkflowRunPage({ workflow, run, onBack, onNavigateToCI, onNavigateToMR, onNavigateToTask }: WorkflowRunPageProps) {
  const { t } = useTranslation('smithyNext')
  const { getUserById } = useTeamContext()
  const [stepsView, setStepsView] = useState<'steps' | 'json'>('steps')
  const [copied, setCopied] = useState(false)

  const statusConfig: Record<string, { icon: typeof Check; color: string; label: string; bg: string }> = {
    success: { icon: Check, color: 'var(--color-success)', label: t('automations.completed'), bg: 'var(--color-success-subtle)' },
    failure: { icon: X, color: 'var(--color-danger)', label: t('automations.failed'), bg: 'var(--color-danger-subtle)' },
    running: { icon: Loader, color: 'var(--color-warning)', label: t('automations.running'), bg: 'var(--color-warning-subtle)' },
    queued: { icon: Clock, color: 'var(--color-text-tertiary)', label: t('automations.queued'), bg: 'var(--color-surface)' },
    cancelled: { icon: X, color: 'var(--color-text-tertiary)', label: t('automations.cancelled'), bg: 'var(--color-surface)' },
  }

  const triggerLabels: Record<string, string> = {
    schedule: t('automations.scheduled'), manual: t('automations.manualTriggerLabel'), event: t('automations.eventTrigger'), webhook: t('automations.webhookTrigger'),
  }

  const sc = statusConfig[run.status] || statusConfig.queued
  const StatusIcon = sc.icon
  const isActive = run.status === 'running' || run.status === 'queued'
  const triggerUser = run.triggeredByUserId ? getUserById(run.triggeredByUserId) : undefined

  const copyRunId = () => {
    if (run.runId) {
      navigator.clipboard.writeText(run.runId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const lastOutput = [...run.steps].reverse().find(s => s.output)?.output
  const lastError = run.error

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <button onClick={onBack} style={backBtnStyle}>
            <ArrowLeft size={14} strokeWidth={1.5} />
          </button>
          <StatusIcon size={16} strokeWidth={2} style={{ color: sc.color, flexShrink: 0, ...(run.status === 'running' ? { animation: 'spin 1s linear infinite' } : {}) }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>{workflow.name}</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>#{run.runNumber}</span>
              </span>
            </div>
          </div>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 500, background: sc.bg, color: sc.color }}>
            {sc.label}
          </span>

          {/* Cross-reference chips */}
          {run.linkedTaskId && (
            <button onClick={() => onNavigateToTask?.(run.linkedTaskId!)} style={{ ...chipStyle, color: 'var(--color-text-accent)', fontFamily: 'var(--font-mono)' }}>
              {run.linkedTaskId} <ExternalLink size={10} strokeWidth={1.5} style={{ opacity: 0.5 }} />
            </button>
          )}
          {run.linkedMRId && (
            <button onClick={() => onNavigateToMR?.(run.linkedMRId!)} style={chipStyle}>
              <GitPullRequest size={12} strokeWidth={1.5} /> <span style={{ fontFamily: 'var(--font-mono)' }}>{run.linkedMRId}</span>
            </button>
          )}
          {run.linkedCIRunIds && run.linkedCIRunIds.length > 0 && (
            <button onClick={() => onNavigateToCI?.(run.linkedCIRunIds![0])} style={chipStyle}>
              <CircleDot size={10} strokeWidth={1.5} /> {t('automations.ciRun')}
            </button>
          )}

          {/* Actions */}
          {run.status === 'failure' && (
            <button style={{ ...actionBtnStyle, color: 'var(--color-warning)' }}>
              <RotateCcw size={12} strokeWidth={1.5} /> {t('automations.retry')}
            </button>
          )}
          {isActive && (
            <button style={{ ...actionBtnStyle, color: 'var(--color-danger)' }}>
              <Square size={12} strokeWidth={1.5} /> {t('automations.cancel')}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        {/* Error banner */}
        {run.status === 'failure' && run.error && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', marginBottom: 20,
            background: 'var(--color-danger-subtle)', borderRadius: 'var(--radius-md)',
            border: '1px solid color-mix(in srgb, var(--color-danger) 20%, transparent)',
          }}>
            <AlertTriangle size={16} strokeWidth={1.5} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-danger)', marginBottom: 4 }}>{t('automations.automationFailed')}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{run.error}</div>
            </div>
          </div>
        )}

        <div className="wf-run-layout">
          {/* Main column: Timeline + Event History */}
          <div className="wf-run-main" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Timeline */}
            {run.duration && (
              <CollapsibleSection title={t('automations.timeline')} defaultOpen>
                <WorkflowRunTimeline steps={run.steps} totalDuration={run.duration} />
              </CollapsibleSection>
            )}

            {/* Steps / JSON */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{t('automations.eventHistory')}</span>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['steps', 'json'] as const).map(v => (
                    <button key={v} onClick={() => setStepsView(v)} style={{
                      height: 24, padding: '0 10px', border: 'none', borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer', fontSize: 11, fontWeight: 500,
                      background: stepsView === v ? 'var(--color-surface-active)' : 'var(--color-surface)',
                      color: stepsView === v ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                    }}>
                      {v === 'steps' ? t('automations.steps') : t('automations.json')}
                    </button>
                  ))}
                </div>
              </div>

              {stepsView === 'steps' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {run.steps.map((step, i) => (
                    <StepDetail key={step.stepId} step={step} index={i} onNavigateToCI={onNavigateToCI} />
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '12px 16px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)',
                  fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, color: 'var(--color-text-secondary)',
                  whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 500,
                  position: 'relative',
                }}>
                  <button onClick={() => navigator.clipboard.writeText(JSON.stringify(run, null, 2))} style={{
                    position: 'absolute', top: 8, right: 8, ...chipStyle, fontSize: 10, padding: '2px 6px',
                  }}>
                    <Copy size={10} strokeWidth={1.5} /> {t('automations.copy')}
                  </button>
                  {JSON.stringify(run, null, 2)}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: Summary + Input + Result + Links + Actions */}
          <div className="wf-run-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Summary */}
            <SidebarSection title={t('automations.summary')}>
              <SidebarRow label={t('automations.started')} value={run.startedAt} />
              {run.endedAt && <SidebarRow label={t('automations.ended')} value={run.endedAt} />}
              {run.duration && <SidebarRow label={t('automations.duration')} value={run.duration} />}
              <SidebarRow label={t('automations.runId')} value={
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{run.runId ? `${run.runId.slice(0, 8)}...` : run.id}</span>
                  <button onClick={copyRunId} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <Copy size={10} strokeWidth={1.5} />
                  </button>
                  {copied && <span style={{ fontSize: 9, color: 'var(--color-success)' }}>{t('automations.copied')}</span>}
                </span>
              } />
              <SidebarRow label={t('automations.steps')} value={t('automations.stepsCompleted', { completed: String(run.steps.filter(s => s.status === 'success').length), total: String(run.steps.length) })} />
            </SidebarSection>

            {/* Triggered by */}
            <SidebarSection title={t('automations.triggeredBy')}>
              <div style={{
                padding: '8px 10px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)',
              }}>
                {run.triggeredBy === 'manual' && triggerUser ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'var(--color-primary-subtle)', color: 'var(--color-text-accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 600, flexShrink: 0,
                    }}>
                      {triggerUser.avatar}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{triggerUser.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{t('automations.manualTriggerLabel')}</div>
                    </div>
                  </div>
                ) : run.triggeredBy === 'schedule' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={16} strokeWidth={1.5} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{t('automations.scheduled')}</div>
                      {workflow.trigger.cronExpression && (
                        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                          {workflow.trigger.cronHumanReadable || workflow.trigger.cronExpression}
                        </div>
                      )}
                    </div>
                  </div>
                ) : run.triggeredBy === 'event' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Zap size={16} strokeWidth={1.5} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{t('automations.eventTrigger')}</div>
                      {workflow.trigger.eventType && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                          {workflow.trigger.eventType.replace(/_/g, ' ')}
                        </div>
                      )}
                    </div>
                  </div>
                ) : run.triggeredBy === 'webhook' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Globe size={16} strokeWidth={1.5} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{t('automations.webhookTrigger')}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={16} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{triggerLabels[run.triggeredBy] || run.triggeredBy}</div>
                  </div>
                )}
              </div>
            </SidebarSection>

            {/* Input */}
            <SidebarSection title={t('automations.input')}>
              <div style={{
                padding: '8px 10px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.7, color: 'var(--color-text-secondary)',
              }}>
                {Object.keys(run.variables).length > 0
                  ? Object.entries(run.variables).map(([k, v]) => (
                      <div key={k}><span style={{ color: 'var(--color-text-accent)' }}>{k}</span>: "{v}"</div>
                    ))
                  : <span style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>{t('automations.noVariables')}</span>
                }
              </div>
            </SidebarSection>

            {/* Result */}
            <SidebarSection title={t('automations.result')}>
              <div style={{
                padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: run.status === 'failure' ? 'var(--color-danger-subtle)' : 'var(--color-bg-elevated)',
                color: run.status === 'failure' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
              }}>
                {run.result || lastError || lastOutput || <span style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>{t('automations.noResult')}</span>}
              </div>
            </SidebarSection>

            {/* Links */}
            {(run.linkedTaskId || run.linkedMRId || run.linkedCIRunIds?.length) && (
              <SidebarSection title={t('automations.links')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {run.linkedTaskId && (
                    <button onClick={() => onNavigateToTask?.(run.linkedTaskId!)} style={{ ...chipStyle, width: '100%', justifyContent: 'flex-start' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-accent)' }}>{run.linkedTaskId}</span>
                      <ExternalLink size={9} strokeWidth={1.5} style={{ opacity: 0.5 }} />
                    </button>
                  )}
                  {run.linkedMRId && (
                    <button onClick={() => onNavigateToMR?.(run.linkedMRId!)} style={{ ...chipStyle, width: '100%', justifyContent: 'flex-start' }}>
                      <GitPullRequest size={11} strokeWidth={1.5} />
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{run.linkedMRId}</span>
                    </button>
                  )}
                  {run.linkedCIRunIds?.map(ciId => (
                    <button key={ciId} onClick={() => onNavigateToCI?.(ciId)} style={{ ...chipStyle, width: '100%', justifyContent: 'flex-start' }}>
                      <CircleDot size={11} strokeWidth={1.5} />
                      {t('automations.ciRun')}
                    </button>
                  ))}
                </div>
              </SidebarSection>
            )}

            {/* Actions */}
            {(run.status === 'failure' || isActive) && (
              <SidebarSection title={t('automations.actions')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {run.status === 'failure' && (
                    <button style={{ ...actionBtnStyle, width: '100%', justifyContent: 'center', color: 'var(--color-warning)' }}>
                      <RotateCcw size={12} strokeWidth={1.5} /> {t('automations.retryRun')}
                    </button>
                  )}
                  {isActive && (
                    <button style={{ ...actionBtnStyle, width: '100%', justifyContent: 'center', color: 'var(--color-danger)' }}>
                      <Square size={12} strokeWidth={1.5} /> {t('automations.cancelRun')}
                    </button>
                  )}
                </div>
              </SidebarSection>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Sub-components

function StepDetail({ step, index, onNavigateToCI }: { step: WFStepRun; index: number; onNavigateToCI?: (runId: string) => void }) {
  const { t } = useTranslation('smithyNext')
  const [expanded, setExpanded] = useState(step.status === 'failure')
  const Icon = stepStatusIcon[step.status] || Clock
  const color = stepStatusColor[step.status] || 'var(--color-text-tertiary)'
  const TypeIcon = step.stepType === 'agent' ? Bot : Terminal
  const hasContent = !!(step.output || step.error || step.input)

  return (
    <div style={{ background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <div
        onClick={() => hasContent && setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          cursor: hasContent ? 'pointer' : 'default',
        }}
        onMouseEnter={e => { if (hasContent) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', width: 20, textAlign: 'right', flexShrink: 0 }}>
          {index + 1}
        </span>
        <Icon size={14} strokeWidth={2} style={{ color, flexShrink: 0 }} />
        <TypeIcon size={12} strokeWidth={1.5} style={{ color: step.stepType === 'agent' ? 'var(--color-primary)' : 'var(--color-text-tertiary)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', flex: 1 }}>{step.stepName}</span>

        {step.retryAttempt > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-warning)' }}>
            <RotateCcw size={10} strokeWidth={2} /> {t('automations.retry')} {step.retryAttempt}
          </span>
        )}
        {step.linkedCIRunId && (
          <button onClick={e => { e.stopPropagation(); onNavigateToCI?.(step.linkedCIRunId!) }} style={{ ...chipStyle, fontSize: 10, padding: '2px 6px' }}>
            <CircleDot size={9} strokeWidth={1.5} /> {t('automations.ci')}
          </button>
        )}
        {step.startedAt && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{step.startedAt}</span>}
        {step.duration && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{step.duration}</span>}

        {hasContent && (
          expanded
            ? <ChevronDown size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
            : <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
        )}
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 14px 58px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {step.input && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('automations.input')}</div>
              <div style={{
                padding: '8px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-secondary)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {step.input}
              </div>
            </div>
          )}
          {step.output && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('automations.output')}</div>
              <div style={{
                padding: '8px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-secondary)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {step.output}
              </div>
            </div>
          )}
          {step.error && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-danger)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('automations.error')}</div>
              <div style={{
                padding: '8px 10px', background: 'var(--color-danger-subtle)', borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5, color: 'var(--color-danger)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {step.error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CollapsibleSection({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? true)
  return (
    <div>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: 6, width: '100%', border: 'none', background: 'none',
        cursor: 'pointer', padding: '0 0 8px', color: 'var(--color-text)',
      }}>
        {open ? <ChevronDown size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} /> : <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />}
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
      </button>
      {open && children}
    </div>
  )
}

const backBtnStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-secondary)', cursor: 'pointer',
}

const actionBtnStyle: React.CSSProperties = {
  height: 28, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 5,
  background: 'var(--color-surface)', border: 'none', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      {children}
    </div>
  )
}

function SidebarRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--color-text-tertiary)', width: 70, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--color-text-secondary)', flex: 1, minWidth: 0 }}>{value}</span>
    </div>
  )
}
