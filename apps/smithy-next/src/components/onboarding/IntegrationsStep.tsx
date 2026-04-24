import { useState, useRef, useEffect, type Dispatch } from 'react'
import { Circle, CircleDot, FolderOpen, ExternalLink, Check, Loader2, ChevronDown, Search } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { OnboardingState, OnboardingAction, IssueSyncOption, MRSyncOption, DocSyncOption, NotificationOption } from './onboarding-types'

interface Props {
  state: OnboardingState
  dispatch: Dispatch<OnboardingAction>
}

type InstallFlowType = 'github' | 'linear' | 'notion' | 'slack' | 'discord' | 'telegram'

interface SyncOption {
  id: string
  name: string
  description?: string
  installFlow?: InstallFlowType
  hasPathInput?: boolean
  pathPlaceholder?: string
}

const ISSUE_OPTIONS: SyncOption[] = [
  { id: 'none', name: 'none', description: 'noneIssueDesc' },
  { id: 'linear', name: 'linear', description: 'linearDesc', installFlow: 'linear' },
  { id: 'github', name: 'githubIssues', description: 'githubIssuesDesc', installFlow: 'github' },
]

const MR_OPTIONS: SyncOption[] = [
  { id: 'none', name: 'none', description: 'noneMrDesc' },
  { id: 'github', name: 'githubPr', description: 'githubPrDesc', installFlow: 'github' },
]

const DOC_OPTIONS: SyncOption[] = [
  { id: 'repo-folder', name: 'repoFolder', description: 'repoFolderDesc', hasPathInput: true, pathPlaceholder: 'docs/' },
  { id: 'notion', name: 'notion', description: 'notionDesc', installFlow: 'notion' },
  { id: 'obsidian', name: 'obsidian', description: 'obsidianDesc', hasPathInput: true, pathPlaceholder: 'docs/' },
  { id: 'none', name: 'none', description: 'noneDocDesc' },
]

const NOTIFICATION_OPTIONS: SyncOption[] = [
  { id: 'none', name: 'none', description: 'noneNotifDesc' },
  { id: 'slack', name: 'slack', description: 'slackDesc', installFlow: 'slack' },
  { id: 'discord', name: 'discord', description: 'discordDesc', installFlow: 'discord' },
  { id: 'telegram', name: 'telegram', description: 'telegramDesc', installFlow: 'telegram' },
]

export function IntegrationsStep({ state, dispatch }: Props) {
  const { t } = useTranslation('smithyNext')
  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
        {t('onboarding.integrations.title')}
      </h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 24 }}>
        {t('onboarding.integrations.description')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <SyncSection
          title={t('onboarding.integrations.issueSync')}
          options={ISSUE_OPTIONS}
          value={state.issueSync}
          onChange={v => dispatch({ type: 'SET_ISSUE_SYNC', value: v as IssueSyncOption })}
        />

        <SyncSection
          title={t('onboarding.integrations.mergeRequestSync')}
          options={MR_OPTIONS}
          value={state.mrSync}
          onChange={v => dispatch({ type: 'SET_MR_SYNC', value: v as MRSyncOption })}
        />

        <SyncSection
          title={t('onboarding.integrations.documentationSync')}
          options={DOC_OPTIONS}
          value={state.docSync}
          onChange={v => dispatch({ type: 'SET_DOC_SYNC', value: v as DocSyncOption })}
          pathValue={state.docPath}
          onPathChange={p => dispatch({ type: 'SET_DOC_PATH', path: p })}
        />

        <SyncSection
          title={t('onboarding.integrations.notificationEndpoint')}
          options={NOTIFICATION_OPTIONS}
          value={state.notificationEndpoint}
          onChange={v => dispatch({ type: 'SET_NOTIFICATION', value: v as NotificationOption })}
        />
      </div>
    </div>
  )
}

function SyncSection({ title, options, value, onChange, pathValue, onPathChange }: {
  title: string
  options: SyncOption[]
  value: string
  onChange: (id: string) => void
  pathValue?: string
  onPathChange?: (path: string) => void
}) {
  return (
    <div>
      <div style={{
        fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>
        {title}
      </div>
      <div style={{
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      }}>
        {options.map((opt, i) => (
          <SyncOptionRow
            key={opt.id}
            option={opt}
            selected={value === opt.id}
            onClick={() => onChange(opt.id)}
            showBorder={i > 0}
            isFirst={i === 0}
            isLast={i === options.length - 1}
            showPath={value === opt.id && opt.hasPathInput}
            pathValue={pathValue}
            onPathChange={onPathChange}
          />
        ))}
      </div>
    </div>
  )
}

function SyncOptionRow({ option, selected, onClick, showBorder, isFirst, isLast, showPath, pathValue, onPathChange }: {
  option: SyncOption
  selected: boolean
  onClick: () => void
  showBorder: boolean
  isFirst?: boolean
  isLast?: boolean
  showPath?: boolean
  pathValue?: string
  onPathChange?: (path: string) => void
}) {
  const { t } = useTranslation('smithyNext')
  const [hovered, setHovered] = useState(false)
  const hasExpandedContent = selected && (option.installFlow || (showPath && onPathChange))
  const topRadius = isFirst ? 'calc(var(--radius-md) - 1px)' : '0'
  const bottomRadius = isLast ? 'calc(var(--radius-md) - 1px)' : '0'

  return (
    <div
      style={{
        borderTop: showBorder ? '1px solid var(--color-border-subtle)' : 'none',
        background: selected ? 'var(--color-primary-subtle)' : 'transparent',
        borderRadius: `${topRadius} ${topRadius} ${bottomRadius} ${bottomRadius}`,
      }}
    >
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
          borderRadius: `${topRadius} ${topRadius} ${hasExpandedContent ? '0 0' : `${bottomRadius} ${bottomRadius}`}`,
          background: selected
            ? 'var(--color-primary-subtle)'
            : hovered ? 'var(--color-surface-hover)' : 'var(--color-bg-elevated)',
          transition: 'background var(--duration-fast) ease',
        }}
      >
        <span style={{ marginTop: 1, flexShrink: 0, color: selected ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}>
          {selected ? <CircleDot size={15} /> : <Circle size={15} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 500,
            color: selected ? 'var(--color-primary)' : 'var(--color-text)',
          }}>
            {t(`onboarding.integrations.${option.name}`)}
          </div>
          {option.description && (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              {t(`onboarding.integrations.${option.description}`)}
            </div>
          )}
        </div>
      </button>

      {/* Install flow */}
      {selected && option.installFlow && (
        <div style={{ padding: '4px 14px 12px 39px' }}>
          <InstallFlowBlock flowType={option.installFlow} />
        </div>
      )}

      {/* Path input (for repo-folder, obsidian) */}
      {showPath && onPathChange && (
        <div style={{ padding: '4px 14px 10px 39px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          }}>
            <FolderOpen size={13} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            <input
              value={pathValue || ''}
              onChange={e => onPathChange(e.target.value)}
              placeholder={option.pathPlaceholder}
              onClick={e => e.stopPropagation()}
              style={{
                border: 'none', background: 'none', outline: 'none', width: '100%',
                color: 'var(--color-text)', fontSize: 12,
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Install flow configurations ──

interface FlowConfig {
  authLabel: string
  authButton: string
  appLabel?: string
  appButton?: string
  appDetail?: string
  hasOrgRepo?: boolean
  botLabel?: string
  botButton?: string
  botDetail?: string
}

const FLOW_CONFIGS: Record<InstallFlowType, FlowConfig> = {
  github: {
    authLabel: 'authenticateWithGithub',
    authButton: 'connectWithGithub',
    appLabel: 'installGithubApp',
    appButton: 'installGithubAppBtn',
    appDetail: 'githubAppDetail',
    hasOrgRepo: true,
  },
  linear: {
    authLabel: 'authenticateWithLinear',
    authButton: 'connectWithLinear',
    appLabel: 'installLinearIntegration',
    appButton: 'installIntegrationBtn',
    appDetail: 'linearDetail',
  },
  notion: {
    authLabel: 'authenticateWithNotion',
    authButton: 'connectWithNotion',
    appLabel: 'createNotionIntegration',
    appButton: 'createIntegrationBtn',
    appDetail: 'notionDetail',
  },
  slack: {
    authLabel: 'addToSlack',
    authButton: 'addToSlackBtn',
    botDetail: 'slackDetail',
  },
  discord: {
    authLabel: 'addToDiscord',
    authButton: 'addToDiscordBtn',
    botDetail: 'discordDetail',
  },
  telegram: {
    authLabel: 'setupTelegram',
    authButton: 'openTelegramBot',
    botDetail: 'telegramDetail',
  },
}

const MOCK_ORGS = [
  { id: 'personal', name: 'personal', type: 'User' as const },
  { id: 'toolco', name: 'toolco', type: 'Organization' as const },
  { id: 'acme-corp', name: 'acme-corp', type: 'Organization' as const },
]

const MOCK_REPOS: Record<string, string[]> = {
  'personal': ['dotfiles', 'blog', 'side-project'],
  'toolco': ['stoneforge', 'stoneforge-docs', 'smithy', 'forge-cli', 'infra'],
  'acme-corp': ['web-app', 'mobile-app', 'api-gateway', 'shared-libs'],
}

function InstallFlowBlock({ flowType }: { flowType: InstallFlowType }) {
  const { t } = useTranslation('smithyNext')
  const config = FLOW_CONFIGS[flowType]
  const [step, setStep] = useState<'auth' | 'install-app' | 'select' | 'done'>('auth')
  const [loading, setLoading] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)

  const isSimpleFlow = !config.appLabel && !config.hasOrgRepo // slack, discord, telegram
  const hasAppInstall = !!config.appLabel

  function handleAuth(e: React.MouseEvent) {
    e.stopPropagation()
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      if (isSimpleFlow) {
        setStep('done')
      } else {
        setStep('install-app')
      }
    }, 1500)
  }

  function handleAppInstall(e: React.MouseEvent) {
    e.stopPropagation()
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setStep(config.hasOrgRepo ? 'select' : 'done')
    }, 1500)
  }

  function handleOrgSelect(orgId: string) {
    setSelectedOrg(orgId)
    setSelectedRepo(null)
  }

  function handleRepoSelect(repo: string) {
    setSelectedRepo(repo)
    setStep('done')
  }

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 'var(--radius-sm)',
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    }}>
      {/* Step 1: Auth */}
      <FlowStep
        label={t(`onboarding.integrations.${config.authLabel}`)}
        detail={isSimpleFlow && config.botDetail ? t(`onboarding.integrations.${config.botDetail}`) : undefined}
        completed={step !== 'auth'}
        active={step === 'auth'}
      >
        {step === 'auth' && (
          <ActionButton
            label={loading ? t('onboarding.integrations.connecting') : t(`onboarding.integrations.${config.authButton}`)}
            loading={loading}
            onClick={handleAuth}
          />
        )}
      </FlowStep>

      {/* Step 2: App install (github, linear, notion) */}
      {hasAppInstall && step !== 'auth' && (
        <FlowStep
          label={t(`onboarding.integrations.${config.appLabel!}`)}
          detail={config.appDetail ? t(`onboarding.integrations.${config.appDetail}`) : undefined}
          completed={step === 'select' || step === 'done'}
          active={step === 'install-app'}
        >
          {step === 'install-app' && (
            <ActionButton
              label={loading ? t('onboarding.integrations.installing') : t(`onboarding.integrations.${config.appButton!}`)}
              loading={loading}
              onClick={handleAppInstall}
            />
          )}
        </FlowStep>
      )}

      {/* Step 3: Org + Repo selection (github only) */}
      {config.hasOrgRepo && (step === 'select' || step === 'done') && (
        <FlowStep
          label={t('onboarding.integrations.selectOrgAndRepo')}
          completed={step === 'done'}
          active={step === 'select'}
        >
          {(step === 'select' || step === 'done') && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <MiniDropdown
                placeholder={t('onboarding.integrations.organization')}
                value={selectedOrg ? (MOCK_ORGS.find(o => o.id === selectedOrg)?.name ?? null) : null}
                items={MOCK_ORGS.map(o => ({ id: o.id, label: o.name, detail: o.type }))}
                onChange={handleOrgSelect}
                disabled={step === 'done'}
              />
              {selectedOrg && (
                <MiniDropdown
                  placeholder={t('onboarding.integrations.repository')}
                  value={selectedRepo}
                  items={(MOCK_REPOS[selectedOrg] || []).map(r => ({ id: r, label: r }))}
                  onChange={handleRepoSelect}
                  disabled={step === 'done'}
                />
              )}
            </div>
          )}
        </FlowStep>
      )}

      {/* Done state */}
      {step === 'done' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, marginTop: 10,
          fontSize: 12, fontWeight: 500, color: 'var(--color-success)',
        }}>
          <Check size={14} />
          {config.hasOrgRepo && selectedOrg && selectedRepo
            ? t('onboarding.integrations.connectedTo', { org: selectedOrg, repo: selectedRepo })
            : t('onboarding.integrations.connected')}
        </div>
      )}
    </div>
  )
}

function FlowStep({ label, detail, completed, active, children }: {
  label: string; detail?: string; completed: boolean; active: boolean; children?: React.ReactNode
}) {
  return (
    <div style={{ marginTop: completed || !active ? 8 : 0, paddingTop: completed || !active ? 8 : 0, borderTop: completed || !active ? '1px solid var(--color-border-subtle)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: detail || (active && children) ? 6 : 0 }}>
        {completed ? (
          <span style={{ color: 'var(--color-success)', display: 'flex', flexShrink: 0 }}>
            <Check size={13} />
          </span>
        ) : (
          <span style={{
            width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
            border: `1.5px solid ${active ? 'var(--color-primary)' : 'var(--color-text-tertiary)'}`,
          }} />
        )}
        <span style={{
          fontSize: 12, fontWeight: 500,
          color: completed ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
          textDecoration: completed ? 'line-through' : 'none',
        }}>
          {label}
        </span>
      </div>
      {detail && active && (
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8, marginLeft: 19, lineHeight: 1.4 }}>
          {detail}
        </div>
      )}
      {active && children && (
        <div style={{ marginLeft: 19 }}>{children}</div>
      )}
    </div>
  )
}

function ActionButton({ label, loading, onClick }: {
  label: string; loading: boolean; onClick: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 'var(--radius-sm)',
        fontSize: 12, fontWeight: 500, border: 'none',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all var(--duration-fast) ease',
        background: hovered && !loading ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
        color: hovered && !loading ? '#fff' : 'var(--color-primary)',
      }}
    >
      {loading ? (
        <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
      ) : (
        <ExternalLink size={13} />
      )}
      {label}
    </button>
  )
}

function MiniDropdown({ placeholder, value, items, onChange, disabled }: {
  placeholder: string
  value: string | null
  items: { id: string; label: string; detail?: string }[]
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('smithyNext')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [hovered, setHovered] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  const filtered = items.filter(it => it.label.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        onClick={() => { if (!disabled) { setOpen(p => !p); setSearch('') } }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)',
          background: open ? 'var(--color-primary-subtle)' : hovered && !disabled ? 'var(--color-surface-hover)' : 'var(--color-surface)',
          color: value ? 'var(--color-text)' : 'var(--color-text-tertiary)',
          fontSize: 12, cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'var(--font-mono)',
          transition: 'all var(--duration-fast) ease',
        }}
      >
        {value || placeholder}
        {!disabled && <ChevronDown size={11} style={{
          color: 'var(--color-text-tertiary)',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform var(--duration-fast) ease',
        }} />}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20,
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-float)',
          overflow: 'hidden', minWidth: 180,
        }}>
          {items.length > 4 && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)' }}>
                <Search size={12} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('onboarding.integrations.search')}
                  style={{ border: 'none', background: 'none', outline: 'none', width: '100%', color: 'var(--color-text)', fontSize: 11 }}
                />
              </div>
            </div>
          )}
          <div style={{ maxHeight: 180, overflow: 'auto' }}>
            {filtered.map(item => {
              const isSelected = item.id === (value || '')
              return <MiniDropdownItem key={item.id} label={item.label} detail={item.detail} selected={isSelected} onClick={() => { onChange(item.id); setOpen(false) }} />
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{t('onboarding.integrations.noResults')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniDropdownItem({ label, detail, selected, onClick }: {
  label: string; detail?: string; selected: boolean; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: 12,
        fontFamily: 'var(--font-mono)',
        background: selected ? 'var(--color-primary-subtle)' : hovered ? 'var(--color-surface-hover)' : 'transparent',
        color: selected ? 'var(--color-primary)' : 'var(--color-text)',
      }}
    >
      <span>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {detail && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{detail}</span>}
        {selected && <Check size={12} style={{ color: 'var(--color-primary)' }} />}
      </span>
    </button>
  )
}
