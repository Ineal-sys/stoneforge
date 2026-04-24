import { useRef, useState, useMemo } from 'react'
import { useTranslation } from '@/i18n'
import {
  ArrowLeft,
  Bell,
  User,
  Settings,
  Link2,
  Volume2,
  MessageSquare,
  Building2,
  Users,
  Shield,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Trash2,
  Search,
  Plus,
  Pencil,
  X,
  UserMinus,
  Circle,
  CircleDot,
  ExternalLink,
  FolderOpen,
  Zap,
  Eye,
  ShieldCheck,
  GitBranch,
  Bot,
  AlertTriangle,
  RotateCcw,
  Upload,
} from 'lucide-react'
import { useTeamContext } from '../../TeamContext'
import { mockWorkspaces, type WorkspaceInfo } from '../../mock-data'
import { UserAvatar } from '../UserAvatar'
import { PresenceDot } from '../PresenceDot'
import { WorkspaceIconMark, isIconImage } from '../WorkspaceIconMark'
import {
  WORKFLOW_PRESETS,
  AGENT_PROVIDERS,
  MODELS_BY_PROVIDER,
  type WorkflowPreset,
  type AgentProviderType,
} from '../onboarding/onboarding-types'

interface SettingsOverlayProps {
  onBack: () => void
  initialSection?: string
  appMode?: 'solo' | 'team'
  onToggleMode?: () => void
  activeWorkspace?: WorkspaceInfo
  onUpdateActiveWorkspace?: (updates: { name?: string; icon?: string; description?: string }) => void
}

type Section = 'general' | 'notifications' | 'integrations' | 'account' | 'organization' | 'members' | 'roles'

const baseSections: { id: Section; labelKey: string; icon: typeof Bell }[] = [
  { id: 'general', labelKey: 'settings.nav.general', icon: Settings },
  { id: 'notifications', labelKey: 'settings.nav.notifications', icon: Bell },
  { id: 'integrations', labelKey: 'settings.nav.integrations', icon: Link2 },
  { id: 'account', labelKey: 'settings.nav.account', icon: User },
]

const teamSections: { id: Section; labelKey: string; icon: typeof Bell }[] = [
  { id: 'organization', labelKey: 'settings.nav.organization', icon: Building2 },
  { id: 'members', labelKey: 'settings.nav.members', icon: Users },
  { id: 'roles', labelKey: 'settings.nav.roles', icon: Shield },
]

export function SettingsOverlay({ onBack, initialSection, appMode, onToggleMode, activeWorkspace, onUpdateActiveWorkspace }: SettingsOverlayProps) {
  const { isTeamMode } = useTeamContext()
  const { t } = useTranslation('smithyNext')
  const sections = useMemo(() => {
    if (isTeamMode) return [...baseSections, ...teamSections]
    return baseSections
  }, [isTeamMode])

  const [activeSection, setActiveSection] = useState<Section>((initialSection as Section) || 'general')

  const renderContent = () => {
    switch (activeSection) {
      case 'general': return <GeneralSection appMode={appMode} onToggleMode={onToggleMode} activeWorkspace={activeWorkspace} onUpdateActiveWorkspace={onUpdateActiveWorkspace} />
      case 'notifications': return <NotificationsSection />
      case 'integrations': return <IntegrationsSection />
      case 'account': return <AccountSection />
      case 'organization': return isTeamMode ? <OrganizationSection /> : null
      case 'members': return isTeamMode ? <MembersSection /> : null
      case 'roles': return isTeamMode ? <RolesAccessSection /> : null
      default: return <PlaceholderSection title={t(sections.find(s => s.id === activeSection)?.labelKey || '')} />
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 24px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <button
          onClick={onBack}
          style={{
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-surface)', border: 'none',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>{t('settings.title')}</h1>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left nav */}
        <div style={{
          width: 200, minWidth: 200,
          borderRight: '1px solid var(--color-border)',
          padding: '12px 8px',
          overflow: 'auto',
        }}>
          {sections.map((s, i) => {
            const isActive = activeSection === s.id
            // Add divider before team sections
            const showDivider = isTeamMode && i === baseSections.length
            return (
              <div key={s.id}>
                {showDivider && (
                  <div style={{
                    height: 1,
                    background: 'var(--color-border-subtle)',
                    margin: '8px 12px',
                  }} />
                )}
                <button
                  onClick={() => setActiveSection(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '7px 12px', border: 'none',
                    background: isActive ? 'var(--color-surface-active)' : 'transparent',
                    boxShadow: isActive ? 'inset 2px 0 0 var(--color-primary)' : 'none',
                    color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    fontSize: 12, fontWeight: isActive ? 500 : 400, textAlign: 'left',
                    transition: 'all var(--duration-fast)',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--color-surface-active)' : 'transparent' }}
                >
                  <s.icon size={15} strokeWidth={1.5} />
                  {t(s.labelKey)}
                </button>
              </div>
            )
          })}
        </div>

        {/* Right content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

// ── General Section ──

function GeneralSection({ appMode, onToggleMode, activeWorkspace, onUpdateActiveWorkspace }: {
  appMode?: 'solo' | 'team'
  onToggleMode?: () => void
  activeWorkspace?: WorkspaceInfo
  onUpdateActiveWorkspace?: (updates: { name?: string; icon?: string; description?: string }) => void
}) {
  const { t } = useTranslation('smithyNext')
  const isSolo = appMode !== 'team'

  // Workspace identity — derived from props so updates reflect everywhere (Activity Rail, TopBar, etc.)
  const wsName = activeWorkspace?.name ?? ''
  const wsIcon = activeWorkspace?.icon ?? ''
  const wsDescription = activeWorkspace?.description ?? ''
  const setWsName = (name: string) => onUpdateActiveWorkspace?.({ name })
  const setWsIcon = (icon: string) => onUpdateActiveWorkspace?.({ icon })
  const setWsDescription = (description: string) => onUpdateActiveWorkspace?.({ description })

  // Workflow
  const [workflowPreset, setWorkflowPreset] = useState<WorkflowPreset>('review')

  // Git defaults
  const [defaultBranch, setDefaultBranch] = useState('main')
  const [worktreeDir, setWorktreeDir] = useState('.stoneforge/.worktrees/')
  const [autoMerge, setAutoMerge] = useState(false)

  // Agent defaults
  const [defaultProvider, setDefaultProvider] = useState<AgentProviderType>('claude-code')
  const [defaultModels, setDefaultModels] = useState<Record<AgentProviderType, string>>({
    'claude-code': 'sonnet-4.6',
    'codex': 'gpt-5.4',
    'opencode': 'gpt-5.4',
  })

  // Director
  const [directorForward, setDirectorForward] = useState(true)

  // Housekeeping
  const [ephemeralRetention, setEphemeralRetention] = useState('24h')

  // Danger zone
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div style={{ maxWidth: 800 }}>
      {/* ── Workspace identity ── */}
      <SectionHeader title={t('settings.general.workspace.title')} description={t('settings.general.workspace.description')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 32 }}>
        <InputRow label={t('settings.general.workspace.name')} placeholder={t('settings.general.workspace.namePlaceholder')} value={wsName} onChange={setWsName} />
        <TextareaRow label={t('settings.general.workspace.descriptionLabel')} placeholder={t('settings.general.workspace.descriptionPlaceholder')} value={wsDescription} onChange={setWsDescription} />
        <IconRow icon={wsIcon} onChange={setWsIcon} />
      </div>

      {/* ── Workspace Mode ── */}
      {onToggleMode && (
        <div style={{ marginBottom: 32 }}>
          <SectionHeader title={t('settings.general.mode.title')} description={t('settings.general.mode.description')} />
          <div style={{
            display: 'inline-flex',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
          }}>
            <button
              onClick={() => { if (!isSolo) onToggleMode() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', border: 'none',
                background: isSolo ? 'var(--color-primary-subtle)' : 'transparent',
                color: isSolo ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
                fontSize: 13, fontWeight: 500,
                cursor: isSolo ? 'default' : 'pointer',
                transition: 'all var(--duration-fast)',
              }}
              onMouseEnter={e => { if (!isSolo) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { if (!isSolo) e.currentTarget.style.background = 'transparent' }}
            >
              <User size={14} strokeWidth={1.5} />
              {t('settings.general.mode.solo')}
            </button>
            <div style={{ width: 1, background: 'var(--color-border)' }} />
            <button
              onClick={() => { if (isSolo) onToggleMode() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', border: 'none',
                background: !isSolo ? 'var(--color-primary-subtle)' : 'transparent',
                color: !isSolo ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
                fontSize: 13, fontWeight: 500,
                cursor: !isSolo ? 'default' : 'pointer',
                transition: 'all var(--duration-fast)',
              }}
              onMouseEnter={e => { if (isSolo) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { if (isSolo) e.currentTarget.style.background = 'transparent' }}
            >
              <Users size={14} strokeWidth={1.5} />
              {t('settings.general.mode.team')}
            </button>
          </div>
        </div>
      )}

      {/* ── Workflow preset (promoted selector) ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader
          title={t('settings.general.workflow.title')}
          description={t('settings.general.workflow.description')}
        />
        <WorkflowPresetSelector value={workflowPreset} onChange={setWorkflowPreset} />
      </div>

      {/* ── Git ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader title={t('settings.general.git.title')} description={t('settings.general.git.description')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <InputRow label={t('settings.general.git.defaultBranch')} placeholder={t('settings.general.git.defaultBranchPlaceholder')} value={defaultBranch} onChange={setDefaultBranch} />
          <InputRow label={t('settings.general.git.worktreeDir')} placeholder={t('settings.general.git.worktreeDirPlaceholder')} value={worktreeDir} onChange={setWorktreeDir} />
          <ToggleRow label={t('settings.general.git.autoMerge')} checked={autoMerge} onChange={setAutoMerge} icon={GitBranch} />
        </div>
      </div>

      {/* ── Agent defaults ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader title={t('settings.general.agentDefaults.title')} description={t('settings.general.agentDefaults.description')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <SelectRow
            label={t('settings.general.agentDefaults.defaultProvider')}
            value={defaultProvider}
            onChange={v => setDefaultProvider(v as AgentProviderType)}
            options={AGENT_PROVIDERS.map(p => ({ value: p.id, label: p.name }))}
          />
          {AGENT_PROVIDERS.map(p => (
            <SelectRow
              key={p.id}
              label={t('settings.general.agentDefaults.modelLabel', { provider: p.name })}
              value={defaultModels[p.id]}
              onChange={v => setDefaultModels(prev => ({ ...prev, [p.id]: v }))}
              options={MODELS_BY_PROVIDER[p.id].map(m => ({ value: m.id, label: m.name }))}
            />
          ))}
        </div>
      </div>

      {/* ── Director ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader title={t('settings.general.director.title')} description={t('settings.general.director.description')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ToggleRow label={t('settings.general.director.autoForward')} checked={directorForward} onChange={setDirectorForward} icon={Bot} />
        </div>
      </div>

      {/* ── Housekeeping ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader title={t('settings.general.housekeeping.title')} description={t('settings.general.housekeeping.description')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <SelectRow
            label={t('settings.general.housekeeping.ephemeralRetention')}
            value={ephemeralRetention}
            onChange={setEphemeralRetention}
            options={[
              { value: '1h', label: t('settings.general.housekeeping.retentionOptions.1h') },
              { value: '6h', label: t('settings.general.housekeeping.retentionOptions.6h') },
              { value: '12h', label: t('settings.general.housekeeping.retentionOptions.12h') },
              { value: '24h', label: t('settings.general.housekeeping.retentionOptions.24h') },
              { value: '7d', label: t('settings.general.housekeeping.retentionOptions.7d') },
              { value: '30d', label: t('settings.general.housekeeping.retentionOptions.30d') },
            ]}
          />
        </div>
      </div>

      {/* ── Danger zone ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--color-danger)' }}>
            <AlertTriangle size={14} strokeWidth={1.5} />
            {t('settings.general.dangerZone.title')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            {t('settings.general.dangerZone.description')}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <DangerAction
            icon={RotateCcw}
            label={t('settings.general.dangerZone.resetSettings')}
            description={t('settings.general.dangerZone.resetSettingsDescription')}
            confirmLabel={t('settings.general.dangerZone.resetSettingsConfirm')}
            confirming={confirmReset}
            onClick={() => setConfirmReset(true)}
            onConfirm={() => setConfirmReset(false)}
            onCancel={() => setConfirmReset(false)}
            cancelLabel={t('settings.general.dangerZone.cancel')}
          />
          <DangerAction
            icon={Trash2}
            label={t('settings.general.dangerZone.deleteWorkspace')}
            description={t('settings.general.dangerZone.deleteWorkspaceDescription')}
            confirmLabel={t('settings.general.dangerZone.deleteWorkspaceConfirm')}
            confirming={confirmDelete}
            onClick={() => setConfirmDelete(true)}
            onConfirm={() => setConfirmDelete(false)}
            onCancel={() => setConfirmDelete(false)}
            cancelLabel={t('settings.general.dangerZone.cancel')}
          />
        </div>
      </div>
    </div>
  )
}

// ── Workflow preset selector (promoted radio group) ──

function WorkflowPresetSelector({ value, onChange }: { value: WorkflowPreset; onChange: (v: WorkflowPreset) => void }) {
  const { t } = useTranslation('smithyNext')
  const iconMap: Record<string, typeof Zap> = {
    'auto': Zap,
    'review': Eye,
    'approve': ShieldCheck,
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
    }}>
      {WORKFLOW_PRESETS.map((preset, i) => {
        const selected = value === preset.id
        const Icon = iconMap[preset.id] || Zap
        return (
          <button
            key={preset.id}
            onClick={() => onChange(preset.id)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 14px',
              background: selected ? 'var(--color-primary-subtle)' : 'transparent',
              borderTop: i === 0 ? 'none' : '1px solid var(--color-border-subtle)',
              borderLeft: selected ? '2px solid var(--color-primary)' : '2px solid transparent',
              borderRight: 'none', borderBottom: 'none',
              textAlign: 'left', cursor: 'pointer',
              transition: 'background var(--duration-fast), border-color var(--duration-fast)',
            }}
            onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{ marginTop: 1, flexShrink: 0 }}>
              {selected ? (
                <CircleDot size={15} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
              ) : (
                <Circle size={15} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <Icon size={13} strokeWidth={1.5} style={{ color: selected ? 'var(--color-text-accent)' : 'var(--color-text-secondary)' }} />
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  color: selected ? 'var(--color-text-accent)' : 'var(--color-text)',
                }}>
                  {t(`settings.general.workflow.${preset.id}.name`)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
                {t(`settings.general.workflow.${preset.id}.description`)}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Danger zone action row ──

function DangerAction({
  icon: Icon,
  label,
  description,
  confirmLabel,
  confirming,
  onClick,
  onConfirm,
  onCancel,
  cancelLabel,
}: {
  icon: typeof Trash2
  label: string
  description: string
  confirmLabel: string
  confirming: boolean
  onClick: () => void
  onConfirm: () => void
  onCancel: () => void
  cancelLabel?: string
}) {
  const { t } = useTranslation('smithyNext')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 12px',
      border: `1px solid ${confirming ? 'var(--color-danger)' : 'var(--color-border-subtle)'}`,
      borderRadius: 'var(--radius-sm)',
      background: confirming ? 'var(--color-danger-subtle)' : 'transparent',
      transition: 'all var(--duration-fast)',
    }}>
      <Icon size={14} strokeWidth={1.5} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{description}</div>
      </div>
      {!confirming ? (
        <button
          onClick={onClick}
          style={{
            height: 26, padding: '0 10px',
            background: 'transparent', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-danger)', fontSize: 11, fontWeight: 500,
            cursor: 'pointer',
            transition: 'all var(--duration-fast)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-danger-subtle)'; e.currentTarget.style.borderColor = 'var(--color-danger)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
        >
          {label}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onConfirm}
            style={{
              height: 26, padding: '0 10px',
              background: 'var(--color-danger)', border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: 'white', fontSize: 11, fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            style={{
              height: 26, padding: '0 10px',
              background: 'transparent', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {cancelLabel || t('settings.general.dangerZone.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Account Section ──

function AccountSection() {
  const { currentUser, isTeamMode, org } = useTeamContext()
  const { t } = useTranslation('smithyNext')

  return (
    <div style={{ maxWidth: 800 }}>
      <SectionHeader title={t('settings.account.title')} description={t('settings.account.description')} />

      {/* Profile card */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: 16,
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-bg-secondary)',
        marginBottom: 24,
      }}>
        <UserAvatar user={currentUser} size={48} showPresence={isTeamMode} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>{currentUser.name}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{currentUser.email}</div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 8,
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            background: isTeamMode ? 'var(--color-primary-subtle)' : 'var(--color-surface-active)',
            fontSize: 11, fontWeight: 500,
            color: isTeamMode ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
          }}>
            {isTeamMode ? (
              <>
                <Building2 size={11} strokeWidth={1.5} />
                {t('settings.account.connectedToTeam', { orgName: org?.name })}
              </>
            ) : (
              <>{t('settings.account.soloMode')}</>
            )}
          </div>
        </div>
      </div>

      {/* Role info (team-mode only) */}
      {isTeamMode && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', width: 80 }}>{t('settings.account.role')}</span>
            <span style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: currentUser.role === 'admin' ? 'var(--color-primary-subtle)' : 'var(--color-surface-active)',
              color: currentUser.role === 'admin' ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
              fontSize: 12, fontWeight: 500,
              textTransform: 'capitalize',
            }}>
              {currentUser.role}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', width: 80 }}>{t('settings.account.teams')}</span>
            <span style={{ fontSize: 13, color: 'var(--color-text)' }}>
              {org?.teams.filter(t => t.memberIds.includes(currentUser.id)).map(t => t.name).join(', ') || t('settings.account.none')}
            </span>
          </div>
        </div>
      )}

      {/* Preferences */}
      <SectionHeader title={t('settings.account.preferences.title')} description={t('settings.account.preferences.description')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <SelectRow label={t('settings.account.preferences.language')} value="en" options={[
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Español' },
          { value: 'fr', label: 'Français' },
          { value: 'de', label: 'Deutsch' },
        ]} onChange={() => {}} />
        <SelectRow label={t('settings.account.preferences.timezone')} value="pst" options={[
          { value: 'pst', label: 'Pacific (UTC-8)' },
          { value: 'est', label: 'Eastern (UTC-5)' },
          { value: 'utc', label: 'UTC' },
          { value: 'cet', label: 'Central European (UTC+1)' },
        ]} onChange={() => {}} />
      </div>
    </div>
  )
}

// ── Organization Section (team-mode only) ──

function OrganizationSection() {
  const { org } = useTeamContext()
  const { t } = useTranslation('smithyNext')
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [copiedOrgId, setCopiedOrgId] = useState(false)

  // Team management state
  const [teams, setTeams] = useState(() => org?.teams.map(t => ({ ...t, memberIds: [...t.memberIds], workspaceIds: [...t.workspaceIds] })) || [])
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [addingMemberToTeam, setAddingMemberToTeam] = useState<string | null>(null)
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState<string | null>(null)

  if (!org) return null

  const toggleTeam = (teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  const copyOrgId = () => {
    navigator.clipboard.writeText(org.id)
    setCopiedOrgId(true)
    setTimeout(() => setCopiedOrgId(false), 2000)
  }

  const startRename = (team: { id: string; name: string }) => {
    setEditingTeamId(team.id)
    setEditingName(team.name)
  }

  const commitRename = () => {
    if (!editingTeamId || !editingName.trim()) return
    setTeams(prev => prev.map(t => t.id === editingTeamId ? { ...t, name: editingName.trim() } : t))
    setEditingTeamId(null)
    setEditingName('')
  }

  const createTeam = () => {
    if (!newTeamName.trim()) return
    const id = `team-${newTeamName.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
    setTeams(prev => [...prev, { id, name: newTeamName.trim(), memberIds: [], workspaceIds: [] }])
    setNewTeamName('')
    setCreatingTeam(false)
    setExpandedTeams(prev => new Set(prev).add(id))
  }

  const deleteTeam = (teamId: string) => {
    setTeams(prev => prev.filter(t => t.id !== teamId))
    setConfirmDeleteTeam(null)
    setExpandedTeams(prev => { const next = new Set(prev); next.delete(teamId); return next })
  }

  const removeMember = (teamId: string, userId: string) => {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, memberIds: t.memberIds.filter(id => id !== userId) } : t))
  }

  const addMember = (teamId: string, userId: string) => {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, memberIds: [...t.memberIds, userId] } : t))
    setAddingMemberToTeam(null)
  }

  const planColors: Record<string, { bg: string; text: string }> = {
    free: { bg: 'var(--color-surface-active)', text: 'var(--color-text-secondary)' },
    team: { bg: 'var(--color-primary-subtle)', text: 'var(--color-text-accent)' },
    enterprise: { bg: 'var(--color-warning-subtle)', text: 'var(--color-warning)' },
  }
  const planStyle = planColors[org.plan] || planColors.free

  return (
    <div style={{ maxWidth: 800 }}>
      <SectionHeader title={t('settings.organization.title')} description={t('settings.organization.description')} />

      {/* Org header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: 16,
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-bg-secondary)',
        marginBottom: 24,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--radius-md)',
          background: 'var(--color-primary-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, color: 'var(--color-text-accent)',
        }}>
          {org.name.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>{org.name}</span>
            <span style={{
              padding: '1px 7px',
              borderRadius: 'var(--radius-sm)',
              background: planStyle.bg,
              color: planStyle.text,
              fontSize: 10, fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              {org.plan}
            </span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
          }}>
            <span style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11, color: 'var(--color-text-tertiary)',
            }}>
              {org.id}
            </span>
            <button
              onClick={copyOrgId}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 2, color: 'var(--color-text-tertiary)',
                display: 'flex', alignItems: 'center',
              }}
              title={t('settings.organization.copyOrgIdTitle')}
            >
              {copiedOrgId ? <Check size={12} strokeWidth={1.5} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} strokeWidth={1.5} />}
            </button>
          </div>
        </div>
      </div>

      {/* Teams list */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <SectionHeader title={t('settings.organization.teams.title')} description={t('settings.organization.teams.description', { count: teams.length })} />
        {!creatingTeam && (
          <button
            onClick={() => setCreatingTeam(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 28, padding: '0 10px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-secondary)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              transition: 'all var(--duration-fast)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-text-tertiary)'; e.currentTarget.style.color = 'var(--color-text)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          >
            <Plus size={13} strokeWidth={1.5} />
            {t('settings.organization.teams.newTeam')}
          </button>
        )}
      </div>

      {/* Create team inline form */}
      {creatingTeam && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', marginBottom: 8,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-primary)',
          background: 'var(--color-primary-subtle)',
        }}>
          <Users size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-accent)', flexShrink: 0 }} />
          <input
            autoFocus
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createTeam(); if (e.key === 'Escape') { setCreatingTeam(false); setNewTeamName('') } }}
            placeholder={t('settings.organization.teams.teamNamePlaceholder')}
            style={{
              flex: 1, height: 26, padding: '0 8px',
              background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
              fontSize: 12, outline: 'none',
            }}
          />
          <button
            onClick={createTeam}
            disabled={!newTeamName.trim()}
            style={{
              height: 26, padding: '0 10px',
              background: newTeamName.trim() ? 'var(--color-primary)' : 'var(--color-surface-active)',
              border: 'none', borderRadius: 'var(--radius-sm)',
              color: newTeamName.trim() ? 'white' : 'var(--color-text-tertiary)',
              fontSize: 11, fontWeight: 500, cursor: newTeamName.trim() ? 'pointer' : 'default',
            }}
          >
            {t('settings.organization.teams.create')}
          </button>
          <button
            onClick={() => { setCreatingTeam(false); setNewTeamName('') }}
            style={{
              width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-tertiary)', cursor: 'pointer',
            }}
          >
            <X size={13} strokeWidth={1.5} />
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 24 }}>
        {teams.map(team => {
          const isExpanded = expandedTeams.has(team.id)
          const members = org.members.filter(m => team.memberIds.includes(m.id))
          const nonMembers = org.members.filter(m => !team.memberIds.includes(m.id))
          const workspaces = mockWorkspaces.filter(w => team.workspaceIds.includes(w.id))
          const isEditing = editingTeamId === team.id
          const isConfirmingDelete = confirmDeleteTeam === team.id
          return (
            <div key={team.id} style={{
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${isConfirmingDelete ? 'var(--color-danger)' : 'var(--color-border-subtle)'}`,
              overflow: 'hidden',
              transition: 'border-color var(--duration-fast)',
            }}>
              {/* Team header row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px',
              }}>
                <button
                  onClick={() => toggleTeam(team.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    flex: 1, padding: 0,
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  {isExpanded
                    ? <ChevronDown size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                    : <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                  }
                  <Users size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-secondary)' }} />
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditingTeamId(null); setEditingName('') } }}
                      onBlur={commitRename}
                      onClick={e => e.stopPropagation()}
                      style={{
                        flex: 1, height: 24, padding: '0 6px',
                        background: 'var(--color-bg)', border: '1px solid var(--color-primary)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                        fontSize: 13, fontWeight: 500, outline: 'none',
                      }}
                    />
                  ) : (
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{team.name}</span>
                  )}
                </button>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                  {t('settings.organization.teams.memberCount', { count: members.length })}
                </span>
                {/* Edit button */}
                <button
                  onClick={e => { e.stopPropagation(); startRename(team) }}
                  style={{
                    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text-tertiary)', cursor: 'pointer',
                    transition: 'all var(--duration-fast)',
                  }}
                  title={t('settings.organization.teams.renameTeamTitle')}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                >
                  <Pencil size={12} strokeWidth={1.5} />
                </button>
                {/* Delete button */}
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDeleteTeam(isConfirmingDelete ? null : team.id) }}
                  style={{
                    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text-tertiary)', cursor: 'pointer',
                    transition: 'all var(--duration-fast)',
                  }}
                  title={t('settings.organization.teams.deleteTeamTitle')}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-danger-subtle)'; e.currentTarget.style.color = 'var(--color-danger)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </div>

              {/* Delete confirmation */}
              {isConfirmingDelete && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px',
                  background: 'var(--color-danger-subtle)',
                  borderTop: '1px solid var(--color-danger)',
                  fontSize: 12, color: 'var(--color-text)',
                }}>
                  <span style={{ flex: 1 }}>{t('settings.organization.teams.deleteConfirmMessage', { teamName: team.name })}</span>
                  <button
                    onClick={() => deleteTeam(team.id)}
                    style={{
                      height: 24, padding: '0 10px',
                      background: 'var(--color-danger)', border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      color: 'white', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    {t('settings.organization.teams.delete')}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteTeam(null)}
                    style={{
                      height: 24, padding: '0 8px',
                      background: 'transparent', border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    {t('settings.organization.teams.cancel')}
                  </button>
                </div>
              )}

              {/* Expanded content */}
              {isExpanded && (
                <div style={{
                  padding: '0 12px 10px 38px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  {/* Members sub-section */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('settings.organization.teams.membersSubsection')}</div>
                    {nonMembers.length > 0 && (
                      <button
                        onClick={() => setAddingMemberToTeam(addingMemberToTeam === team.id ? null : team.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          height: 22, padding: '0 7px',
                          background: 'transparent', border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-text-tertiary)', fontSize: 10, fontWeight: 500,
                          cursor: 'pointer', transition: 'all var(--duration-fast)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-text-tertiary)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                      >
                        <UserPlus size={10} strokeWidth={1.5} />
                        {t('settings.organization.teams.add')}
                      </button>
                    )}
                  </div>

                  {/* Add member dropdown */}
                  {addingMemberToTeam === team.id && (
                    <div style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-bg-secondary)',
                      padding: 4,
                      marginBottom: 4,
                    }}>
                      {nonMembers.map(m => (
                        <button
                          key={m.id}
                          onClick={() => addMember(team.id, m.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            width: '100%', padding: '5px 8px',
                            background: 'transparent', border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer', textAlign: 'left',
                            transition: 'background var(--duration-fast)',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <UserAvatar user={m} size={18} showPresence />
                          <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{m.name}</span>
                          <Plus size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', marginLeft: 'auto' }} />
                        </button>
                      ))}
                    </div>
                  )}

                  {members.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>{t('settings.organization.teams.noMembers')}</div>
                  )}
                  {members.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <UserAvatar user={m} size={20} showPresence />
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text)' }}>{m.name}</span>
                      <button
                        onClick={() => removeMember(team.id, m.id)}
                        style={{
                          width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-text-tertiary)', cursor: 'pointer',
                          transition: 'all var(--duration-fast)',
                        }}
                        title={t('settings.organization.teams.removeTitle', { name: m.name })}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-danger-subtle)'; e.currentTarget.style.color = 'var(--color-danger)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                      >
                        <UserMinus size={11} strokeWidth={1.5} />
                      </button>
                    </div>
                  ))}

                  {/* Workspaces */}
                  {workspaces.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6, marginBottom: 2 }}>{t('settings.organization.teams.workspacesSubsection')}</div>
                      {workspaces.map(w => (
                        <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <WorkspaceIconMark icon={w.icon} size={18} fontSize={10} fontWeight={600} />
                          <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{w.name}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Workspaces with team access */}
      <SectionHeader title={t('settings.organization.workspaces.title')} description={t('settings.organization.workspaces.description')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {mockWorkspaces.slice(0, 6).map(w => {
          const accessTeams = teams.filter(t => t.workspaceIds.includes(w.id))
          return (
            <div key={w.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
            }}>
              <WorkspaceIconMark icon={w.icon} size={22} fontSize={11} fontWeight={600} />
              <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text)' }}>{w.name}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {accessTeams.map(t => (
                  <span key={t.id} style={{
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-active)',
                    fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 500,
                  }}>
                    {t.name}
                  </span>
                ))}
                {accessTeams.length === 0 && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{t('settings.organization.workspaces.noTeamAssigned')}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Members Section (team-mode only) ──

function MembersSection() {
  const { org, currentUser: cUser } = useTeamContext()
  const { t } = useTranslation('smithyNext')
  const [search, setSearch] = useState('')
  const [roles, setRoles] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    org?.members.forEach(m => { init[m.id] = m.role })
    return init
  })

  if (!org) return null

  const filteredMembers = org.members.filter(m => {
    if (!search) return true
    const q = search.toLowerCase()
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  })

  return (
    <div style={{ maxWidth: 800 }}>
      <SectionHeader title={t('settings.members.title')} description={t('settings.members.description', { count: org.members.length, orgName: org.name })} />

      {/* Search + invite */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 16,
      }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          height: 32, padding: '0 10px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
        }}>
          <Search size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('settings.members.searchPlaceholder')}
            style={{
              flex: 1, border: 'none', background: 'transparent',
              color: 'var(--color-text)', fontSize: 12, outline: 'none',
            }}
          />
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 12px',
          background: 'var(--color-primary)',
          border: 'none', borderRadius: 'var(--radius-sm)',
          color: 'white', fontSize: 12, fontWeight: 500,
          cursor: 'pointer',
          transition: 'opacity var(--duration-fast)',
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <UserPlus size={13} strokeWidth={1.5} />
          {t('settings.members.inviteMember')}
        </button>
      </div>

      {/* Members table */}
      <div style={{
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 100px 80px 60px',
          gap: 8,
          padding: '8px 14px',
          background: 'var(--color-bg-secondary)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('settings.members.table.name')}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('settings.members.table.email')}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('settings.members.table.role')}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('settings.members.table.status')}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}></span>
        </div>

        {/* Table rows */}
        {filteredMembers.map(m => {
          const isMe = m.id === cUser.id
          return (
            <div
              key={m.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 100px 80px 60px',
                gap: 8,
                padding: '10px 14px',
                alignItems: 'center',
                borderBottom: '1px solid var(--color-border-subtle)',
                transition: 'background var(--duration-fast)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Name + avatar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <UserAvatar user={m} size={24} showPresence />
                <span style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.name}{isMe && <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}> {t('settings.members.table.you')}</span>}
                </span>
              </div>

              {/* Email */}
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.email}
              </span>

              {/* Role dropdown */}
              <select
                value={roles[m.id] || m.role}
                onChange={e => setRoles(prev => ({ ...prev, [m.id]: e.target.value }))}
                disabled={isMe}
                style={{
                  height: 26, padding: '0 6px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text)',
                  fontSize: 11, cursor: isMe ? 'default' : 'pointer',
                  outline: 'none',
                  opacity: isMe ? 0.6 : 1,
                }}
              >
                <option value="admin">{t('settings.members.roles.admin')}</option>
                <option value="member">{t('settings.members.roles.member')}</option>
                <option value="viewer">{t('settings.members.roles.viewer')}</option>
              </select>

              {/* Presence */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <PresenceDot status={m.presence} size={6} />
                <span style={{
                  fontSize: 11, color: 'var(--color-text-tertiary)',
                  textTransform: 'capitalize',
                }}>
                  {m.presence}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {!isMe && (
                  <button
                    style={{
                      width: 26, height: 26,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'transparent', border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-tertiary)',
                      cursor: 'pointer',
                      transition: 'all var(--duration-fast)',
                    }}
                    title={t('settings.members.removeMemberTitle')}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-danger-subtle)'; e.currentTarget.style.color = 'var(--color-danger)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {filteredMembers.length === 0 && (
          <div style={{
            padding: 24,
            textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)',
          }}>
            {t('settings.members.noResults', { search })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Roles & Access Section (team-mode only) ──

function RolesAccessSection() {
  const { org } = useTeamContext()
  const { t } = useTranslation('smithyNext')
  const [accessMatrix, setAccessMatrix] = useState<Record<string, Set<string>>>(() => {
    const matrix: Record<string, Set<string>> = {}
    if (org) {
      mockWorkspaces.forEach(w => {
        const ids = new Set<string>()
        org.teams.forEach(t => {
          if (t.workspaceIds.includes(w.id)) {
            t.memberIds.forEach(id => ids.add(id))
          }
        })
        matrix[w.id] = ids
      })
    }
    return matrix
  })

  if (!org) return null

  const workspaces = mockWorkspaces.slice(0, 6)
  const allEntities: { id: string; label: string; type: 'team' | 'member' }[] = [
    ...org.teams.map(t => ({ id: t.id, label: t.name, type: 'team' as const })),
    ...org.members.map(m => ({ id: m.id, label: m.name, type: 'member' as const })),
  ]

  const isChecked = (workspaceId: string, entityId: string, entityType: 'team' | 'member'): boolean => {
    if (entityType === 'team') {
      const team = org.teams.find(t => t.id === entityId)
      return team ? team.workspaceIds.includes(workspaceId) : false
    }
    return accessMatrix[workspaceId]?.has(entityId) || false
  }

  const toggleAccess = (workspaceId: string, entityId: string, entityType: 'team' | 'member') => {
    setAccessMatrix(prev => {
      const next = { ...prev }
      if (!next[workspaceId]) next[workspaceId] = new Set()
      const ws = new Set(next[workspaceId])

      if (entityType === 'team') {
        const team = org.teams.find(t => t.id === entityId)
        if (!team) return next
        const allIn = team.memberIds.every(id => ws.has(id))
        team.memberIds.forEach(id => {
          if (allIn) ws.delete(id)
          else ws.add(id)
        })
      } else {
        if (ws.has(entityId)) ws.delete(entityId)
        else ws.add(entityId)
      }
      next[workspaceId] = ws
      return next
    })
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <SectionHeader title={t('settings.roles.title')} description={t('settings.roles.description')} />

      {/* Access matrix */}
      <div style={{
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'auto',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
        }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-secondary)' }}>
              <th style={{
                padding: '8px 12px', textAlign: 'left',
                fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase', letterSpacing: 0.5,
                borderBottom: '1px solid var(--color-border-subtle)',
                position: 'sticky', left: 0, background: 'var(--color-bg-secondary)',
                minWidth: 120,
              }}>
                {t('settings.roles.workspaceColumn')}
              </th>
              {allEntities.map(e => (
                <th key={e.id} style={{
                  padding: '8px 6px', textAlign: 'center',
                  fontSize: 11, fontWeight: 600,
                  color: e.type === 'team' ? 'var(--color-text-accent)' : 'var(--color-text-tertiary)',
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  borderBottom: '1px solid var(--color-border-subtle)',
                  whiteSpace: 'nowrap',
                  minWidth: 64,
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    {e.type === 'team' ? (
                      <Users size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-accent)' }} />
                    ) : (
                      <User size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                    )}
                    <span>{e.label}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workspaces.map(w => (
              <tr key={w.id}>
                <td style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  position: 'sticky', left: 0,
                  background: 'var(--color-bg)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <WorkspaceIconMark icon={w.icon} size={20} fontSize={10} fontWeight={600} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{w.name}</span>
                  </div>
                </td>
                {allEntities.map(e => {
                  const checked = isChecked(w.id, e.id, e.type)
                  return (
                    <td key={e.id} style={{
                      padding: '8px 6px',
                      textAlign: 'center',
                      borderBottom: '1px solid var(--color-border-subtle)',
                    }}>
                      <label style={{ display: 'inline-flex', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAccess(w.id, e.id, e.type)}
                          style={{
                            width: 14, height: 14,
                            accentColor: 'var(--color-primary)',
                            cursor: 'pointer',
                          }}
                        />
                      </label>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 16, marginTop: 12,
        fontSize: 11, color: 'var(--color-text-tertiary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Users size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-accent)' }} />
          {t('settings.roles.legendTeam')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <User size={11} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
          {t('settings.roles.legendIndividual')}
        </div>
      </div>
    </div>
  )
}

// ── Notifications Section ──

function NotificationsSection() {
  const { t } = useTranslation('smithyNext')
  const [events, setEvents] = useState({
    agentCompleted: true,
    agentError: true,
    mrReview: true,
    ciFailed: true,
    ciPassed: false,
    agentNeedsInput: true,
  })

  const [toastEnabled, setToastEnabled] = useState(true)
  const [toastDuration, setToastDuration] = useState('8s')
  const [toastPosition, setToastPosition] = useState('bottom-right')
  const [soundEnabled, setSoundEnabled] = useState(false)

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Event types */}
      <SectionHeader title={t('settings.notifications.events.title')} description={t('settings.notifications.events.description')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 32 }}>
        <ToggleRow label={t('settings.notifications.events.agentCompleted')} checked={events.agentCompleted} onChange={v => setEvents(e => ({ ...e, agentCompleted: v }))} />
        <ToggleRow label={t('settings.notifications.events.agentError')} checked={events.agentError} onChange={v => setEvents(e => ({ ...e, agentError: v }))} />
        <ToggleRow label={t('settings.notifications.events.mrReview')} checked={events.mrReview} onChange={v => setEvents(e => ({ ...e, mrReview: v }))} />
        <ToggleRow label={t('settings.notifications.events.ciFailed')} checked={events.ciFailed} onChange={v => setEvents(e => ({ ...e, ciFailed: v }))} />
        <ToggleRow label={t('settings.notifications.events.ciPassed')} checked={events.ciPassed} onChange={v => setEvents(e => ({ ...e, ciPassed: v }))} />
        <ToggleRow label={t('settings.notifications.events.agentNeedsInput')} checked={events.agentNeedsInput} onChange={v => setEvents(e => ({ ...e, agentNeedsInput: v }))} />
      </div>

      {/* Toast preferences */}
      <SectionHeader title={t('settings.notifications.toast.title')} description={t('settings.notifications.toast.description')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
        <ToggleRow label={t('settings.notifications.toast.enabled')} checked={toastEnabled} onChange={setToastEnabled} />
        <SelectRow label={t('settings.notifications.toast.autoDismiss')} value={toastDuration} options={[
          { value: '5s', label: t('settings.notifications.toast.dismissOptions.5s') },
          { value: '8s', label: t('settings.notifications.toast.dismissOptions.8s') },
          { value: '15s', label: t('settings.notifications.toast.dismissOptions.15s') },
          { value: 'never', label: t('settings.notifications.toast.dismissOptions.never') },
        ]} onChange={setToastDuration} />
        <SelectRow label={t('settings.notifications.toast.position')} value={toastPosition} options={[
          { value: 'bottom-right', label: t('settings.notifications.toast.positionOptions.bottomRight') },
          { value: 'top-right', label: t('settings.notifications.toast.positionOptions.topRight') },
        ]} onChange={setToastPosition} />
        <ToggleRow label={t('settings.notifications.toast.playSound')} checked={soundEnabled} onChange={setSoundEnabled} icon={Volume2} />
      </div>

      {/* Hint: external messaging moved */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '10px 12px',
        background: 'var(--color-surface-active)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 12, color: 'var(--color-text-secondary)',
      }}>
        <MessageSquare size={13} strokeWidth={1.5} style={{ marginTop: 1, flexShrink: 0, color: 'var(--color-text-tertiary)' }} />
        <span>
          {t('settings.notifications.externalHint')}
        </span>
      </div>
    </div>
  )
}

// ── Integrations Section ──
// Source of truth for the integration catalog is:
//   apps/smithy-next/src/components/onboarding/IntegrationsStep.tsx
// If the onboarding flow adds or renames an option, mirror the change here.

type IntegrationStatus = 'connected' | 'partial' | 'disconnected'

interface IntegrationChoice {
  id: string
  name: string
  description: string
  requiresAuth?: boolean
  authButton?: string
  authDetail?: string
  hasPath?: boolean
  pathLabel?: string
  pathPlaceholder?: string
  hasOrgRepo?: boolean
  hasChannel?: boolean
  channelLabel?: string
  shareGithubHint?: boolean
}

interface IntegrationChoiceKeys {
  id: string
  nameKey: string
  descriptionKey: string
  requiresAuth?: boolean
  authButtonKey?: string
  authDetailKey?: string
  hasPath?: boolean
  pathLabelKey?: string
  pathPlaceholderKey?: string
  hasOrgRepo?: boolean
  hasChannel?: boolean
  channelLabelKey?: string
  shareGithubHint?: boolean
}

const ISSUE_SYNC_OPTION_KEYS: IntegrationChoiceKeys[] = [
  { id: 'none', nameKey: 'settings.integrations.issueSync.noneName', descriptionKey: 'settings.integrations.issueSync.noneDescription' },
  { id: 'linear', nameKey: 'settings.integrations.issueSync.linearName', descriptionKey: 'settings.integrations.issueSync.linearDescription', requiresAuth: true, authButtonKey: 'settings.integrations.issueSync.linearAuthButton', authDetailKey: 'settings.integrations.issueSync.linearAuthDetail' },
  { id: 'github', nameKey: 'settings.integrations.issueSync.githubName', descriptionKey: 'settings.integrations.issueSync.githubDescription', requiresAuth: true, authButtonKey: 'settings.integrations.issueSync.githubAuthButton', authDetailKey: 'settings.integrations.issueSync.githubAuthDetail', hasOrgRepo: true },
]

const MR_SYNC_OPTION_KEYS: IntegrationChoiceKeys[] = [
  { id: 'none', nameKey: 'settings.integrations.mrSync.noneName', descriptionKey: 'settings.integrations.mrSync.noneDescription' },
  { id: 'github', nameKey: 'settings.integrations.mrSync.githubName', descriptionKey: 'settings.integrations.mrSync.githubDescription', requiresAuth: true, authButtonKey: 'settings.integrations.mrSync.githubAuthButton', authDetailKey: 'settings.integrations.mrSync.githubAuthDetail', hasOrgRepo: true, shareGithubHint: true },
]

const DOC_SYNC_OPTION_KEYS: IntegrationChoiceKeys[] = [
  { id: 'none', nameKey: 'settings.integrations.docSync.noneName', descriptionKey: 'settings.integrations.docSync.noneDescription' },
  { id: 'repo-folder', nameKey: 'settings.integrations.docSync.repoFolderName', descriptionKey: 'settings.integrations.docSync.repoFolderDescription', hasPath: true, pathLabelKey: 'settings.integrations.docSync.repoFolderPathLabel', pathPlaceholderKey: 'settings.integrations.docSync.repoFolderPathPlaceholder' },
  { id: 'notion', nameKey: 'settings.integrations.docSync.notionName', descriptionKey: 'settings.integrations.docSync.notionDescription', requiresAuth: true, authButtonKey: 'settings.integrations.docSync.notionAuthButton', authDetailKey: 'settings.integrations.docSync.notionAuthDetail' },
  { id: 'obsidian', nameKey: 'settings.integrations.docSync.obsidianName', descriptionKey: 'settings.integrations.docSync.obsidianDescription', hasPath: true, pathLabelKey: 'settings.integrations.docSync.obsidianPathLabel', pathPlaceholderKey: 'settings.integrations.docSync.obsidianPathPlaceholder' },
]

const NOTIFICATION_OPTION_KEYS: IntegrationChoiceKeys[] = [
  { id: 'none', nameKey: 'settings.integrations.notifications.noneName', descriptionKey: 'settings.integrations.notifications.noneDescription' },
  { id: 'slack', nameKey: 'settings.integrations.notifications.slackName', descriptionKey: 'settings.integrations.notifications.slackDescription', requiresAuth: true, authButtonKey: 'settings.integrations.notifications.slackAuthButton', authDetailKey: 'settings.integrations.notifications.slackAuthDetail', hasChannel: true, channelLabelKey: 'settings.integrations.notifications.slackChannelLabel' },
  { id: 'discord', nameKey: 'settings.integrations.notifications.discordName', descriptionKey: 'settings.integrations.notifications.discordDescription', requiresAuth: true, authButtonKey: 'settings.integrations.notifications.discordAuthButton', authDetailKey: 'settings.integrations.notifications.discordAuthDetail', hasChannel: true, channelLabelKey: 'settings.integrations.notifications.discordChannelLabel' },
  { id: 'telegram', nameKey: 'settings.integrations.notifications.telegramName', descriptionKey: 'settings.integrations.notifications.telegramDescription', requiresAuth: true, authButtonKey: 'settings.integrations.notifications.telegramAuthButton', authDetailKey: 'settings.integrations.notifications.telegramAuthDetail' },
]

function resolveOptions(t: (key: string) => string, keys: IntegrationChoiceKeys[]): IntegrationChoice[] {
  return keys.map(k => ({
    id: k.id,
    name: t(k.nameKey),
    description: t(k.descriptionKey),
    requiresAuth: k.requiresAuth,
    authButton: k.authButtonKey ? t(k.authButtonKey) : undefined,
    authDetail: k.authDetailKey ? t(k.authDetailKey) : undefined,
    hasPath: k.hasPath,
    pathLabel: k.pathLabelKey ? t(k.pathLabelKey) : undefined,
    pathPlaceholder: k.pathPlaceholderKey ? t(k.pathPlaceholderKey) : undefined,
    hasOrgRepo: k.hasOrgRepo,
    hasChannel: k.hasChannel,
    channelLabel: k.channelLabelKey ? t(k.channelLabelKey) : undefined,
    shareGithubHint: k.shareGithubHint,
  }))
}

function IntegrationsSection() {
  const { t } = useTranslation('smithyNext')

  const ISSUE_SYNC_OPTIONS = useMemo(() => resolveOptions(t, ISSUE_SYNC_OPTION_KEYS), [t])
  const MR_SYNC_OPTIONS = useMemo(() => resolveOptions(t, MR_SYNC_OPTION_KEYS), [t])
  const DOC_SYNC_OPTIONS = useMemo(() => resolveOptions(t, DOC_SYNC_OPTION_KEYS), [t])
  const NOTIFICATION_OPTIONS = useMemo(() => resolveOptions(t, NOTIFICATION_OPTION_KEYS), [t])

  // Selection state
  const [issueSync, setIssueSync] = useState<string>('none')
  const [mrSync, setMrSync] = useState<string>('none')
  const [docSync, setDocSync] = useState<string>('repo-folder')
  const [notification, setNotification] = useState<string>('none')

  // Connection / config state (mock)
  const [issueConnected, setIssueConnected] = useState<Record<string, IntegrationStatus>>({})
  const [mrConnected, setMrConnected] = useState<Record<string, IntegrationStatus>>({})
  const [docConnected, setDocConnected] = useState<Record<string, IntegrationStatus>>({})
  const [notifConnected, setNotifConnected] = useState<Record<string, IntegrationStatus>>({})

  const [docPath, setDocPath] = useState('docs/')
  const [obsidianPath, setObsidianPath] = useState('')
  const [githubOrg, setGithubOrg] = useState('')
  const [githubIssueRepo, setGithubIssueRepo] = useState('')
  const [githubMrRepo, setGithubMrRepo] = useState('')
  const [slackChannel, setSlackChannel] = useState('')
  const [discordChannel, setDiscordChannel] = useState('')

  const mockOrgs = ['toolco', 'acme-inc', 'stoneforge-labs']
  const mockRepos: Record<string, string[]> = {
    'toolco': ['stoneforge', 'smithy-web', 'infra'],
    'acme-inc': ['marketing-site', 'product-api', 'design-system'],
    'stoneforge-labs': ['prototypes', 'research'],
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <IntegrationSyncGroup
        title={t('settings.integrations.issueSync.title')}
        description={t('settings.integrations.issueSync.description')}
        value={issueSync}
        onChange={setIssueSync}
        options={ISSUE_SYNC_OPTIONS}
        connectionStatus={issueConnected}
        onConnect={(id) => setIssueConnected(prev => ({ ...prev, [id]: 'connected' }))}
        onDisconnect={(id) => setIssueConnected(prev => { const next = { ...prev }; delete next[id]; return next })}
        renderConfig={(option) => {
          if (option.id === 'github') {
            return (
              <GithubRepoPicker
                org={githubOrg}
                onOrgChange={setGithubOrg}
                repo={githubIssueRepo}
                onRepoChange={setGithubIssueRepo}
                orgs={mockOrgs}
                repos={mockRepos}
              />
            )
          }
          if (option.id === 'linear') {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <SelectRow
                  label={t('settings.integrations.issueSync.linearTeamLabel')}
                  value="team-stoneforge"
                  onChange={() => {}}
                  options={[
                    { value: 'team-stoneforge', label: 'Stoneforge' },
                    { value: 'team-platform', label: 'Platform' },
                    { value: 'team-frontend', label: 'Frontend' },
                  ]}
                />
              </div>
            )
          }
          return null
        }}
      />

      <IntegrationSyncGroup
        title={t('settings.integrations.mrSync.title')}
        description={t('settings.integrations.mrSync.description')}
        value={mrSync}
        onChange={setMrSync}
        options={MR_SYNC_OPTIONS}
        connectionStatus={mrConnected}
        onConnect={(id) => setMrConnected(prev => ({ ...prev, [id]: 'connected' }))}
        onDisconnect={(id) => setMrConnected(prev => { const next = { ...prev }; delete next[id]; return next })}
        sharedGithubActive={issueSync === 'github' && issueConnected['github'] === 'connected'}
        renderConfig={(option) => {
          if (option.id === 'github') {
            return (
              <GithubRepoPicker
                org={githubOrg}
                onOrgChange={setGithubOrg}
                repo={githubMrRepo}
                onRepoChange={setGithubMrRepo}
                orgs={mockOrgs}
                repos={mockRepos}
              />
            )
          }
          return null
        }}
      />

      <IntegrationSyncGroup
        title={t('settings.integrations.docSync.title')}
        description={t('settings.integrations.docSync.description')}
        value={docSync}
        onChange={setDocSync}
        options={DOC_SYNC_OPTIONS}
        connectionStatus={docConnected}
        onConnect={(id) => setDocConnected(prev => ({ ...prev, [id]: 'connected' }))}
        onDisconnect={(id) => setDocConnected(prev => { const next = { ...prev }; delete next[id]; return next })}
        renderConfig={(option) => {
          if (option.id === 'repo-folder') {
            return (
              <PathPickerRow
                label={DOC_SYNC_OPTIONS.find(o => o.id === 'repo-folder')?.pathLabel || 'Folder path'}
                value={docPath}
                onChange={setDocPath}
                placeholder={DOC_SYNC_OPTIONS.find(o => o.id === 'repo-folder')?.pathPlaceholder || 'docs/'}
              />
            )
          }
          if (option.id === 'obsidian') {
            return (
              <PathPickerRow
                label={DOC_SYNC_OPTIONS.find(o => o.id === 'obsidian')?.pathLabel || 'Vault path'}
                value={obsidianPath}
                onChange={setObsidianPath}
                placeholder={DOC_SYNC_OPTIONS.find(o => o.id === 'obsidian')?.pathPlaceholder || '~/Documents/MyVault'}
              />
            )
          }
          return null
        }}
      />

      <IntegrationSyncGroup
        title={t('settings.integrations.notifications.title')}
        description={t('settings.integrations.notifications.description')}
        value={notification}
        onChange={setNotification}
        options={NOTIFICATION_OPTIONS}
        connectionStatus={notifConnected}
        onConnect={(id) => setNotifConnected(prev => ({ ...prev, [id]: 'connected' }))}
        onDisconnect={(id) => setNotifConnected(prev => { const next = { ...prev }; delete next[id]; return next })}
        isLast
        renderConfig={(option) => {
          if (option.id === 'slack') {
            return (
              <InputRow label={NOTIFICATION_OPTIONS.find(o => o.id === 'slack')?.channelLabel || 'Channel'} placeholder={t('settings.integrations.notifications.slackChannelPlaceholder')} value={slackChannel} onChange={setSlackChannel} />
            )
          }
          if (option.id === 'discord') {
            return (
              <InputRow label={NOTIFICATION_OPTIONS.find(o => o.id === 'discord')?.channelLabel || 'Channel'} placeholder={t('settings.integrations.notifications.discordChannelPlaceholder')} value={discordChannel} onChange={setDiscordChannel} />
            )
          }
          return null
        }}
      />
    </div>
  )
}

function IntegrationSyncGroup({
  title,
  description,
  value,
  onChange,
  options,
  connectionStatus,
  onConnect,
  onDisconnect,
  renderConfig,
  sharedGithubActive,
  isLast,
}: {
  title: string
  description: string
  value: string
  onChange: (v: string) => void
  options: IntegrationChoice[]
  connectionStatus: Record<string, IntegrationStatus>
  onConnect: (id: string) => void
  onDisconnect: (id: string) => void
  renderConfig: (option: IntegrationChoice) => React.ReactNode
  sharedGithubActive?: boolean
  isLast?: boolean
}) {
  const { t } = useTranslation('smithyNext')
  return (
    <div style={{ marginBottom: isLast ? 0 : 32 }}>
      <SectionHeader title={title} description={description} />
      <div style={{
        display: 'flex', flexDirection: 'column',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        {options.map((option, i) => {
          const selected = value === option.id
          const status = connectionStatus[option.id] || 'disconnected'
          const isConnected = status === 'connected'
          const isShared = sharedGithubActive && option.shareGithubHint && option.requiresAuth

          return (
            <div
              key={option.id}
              style={{
                borderTop: i === 0 ? 'none' : '1px solid var(--color-border-subtle)',
                background: selected ? 'var(--color-primary-subtle)' : 'transparent',
                transition: 'background var(--duration-fast)',
              }}
            >
              {/* Option row */}
              <button
                onClick={() => onChange(option.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  width: '100%', padding: '11px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderLeft: selected ? '2px solid var(--color-primary)' : '2px solid transparent',
                  textAlign: 'left', cursor: 'pointer',
                  transition: 'background var(--duration-fast), border-color var(--duration-fast)',
                }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ marginTop: 1, flexShrink: 0 }}>
                  {selected ? (
                    <CircleDot size={14} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
                  ) : (
                    <Circle size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 500,
                      color: selected ? 'var(--color-text-accent)' : 'var(--color-text)',
                    }}>
                      {option.name}
                    </span>
                    {option.requiresAuth && selected && (
                      <StatusChip status={isShared ? 'connected' : status} label={isShared ? t('settings.integrations.shared.usingSharedGithub') : undefined} />
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2, lineHeight: 1.4 }}>
                    {option.description}
                  </div>
                </div>
              </button>

              {/* Expanded config block (only for selected non-none options) */}
              {selected && option.id !== 'none' && (
                <div style={{
                  padding: '0 14px 14px 30px',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  {option.authDetail && !isShared && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
                      {option.authDetail}
                    </div>
                  )}

                  {/* Auth controls */}
                  {option.requiresAuth && !isShared && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!isConnected ? (
                        <button
                          onClick={() => onConnect(option.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            height: 28, padding: '0 12px',
                            background: 'var(--color-primary)', border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            color: 'white', fontSize: 12, fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'opacity var(--duration-fast)',
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        >
                          <ExternalLink size={12} strokeWidth={1.5} />
                          {option.authButton || t('settings.integrations.shared.connect')}
                        </button>
                      ) : (
                        <button
                          onClick={() => onDisconnect(option.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            height: 28, padding: '0 10px',
                            background: 'transparent', border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all var(--duration-fast)',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.borderColor = 'var(--color-danger)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
                        >
                          {t('settings.integrations.shared.disconnect')}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Per-option configuration */}
                  {(isConnected || isShared || option.hasPath) && renderConfig(option)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusChip({ status, label }: { status: IntegrationStatus; label?: string }) {
  const { t } = useTranslation('smithyNext')
  const config: Record<IntegrationStatus, { color: string; bg: string; text: string }> = {
    connected: { color: 'var(--color-success)', bg: 'var(--color-success-subtle, rgba(34,197,94,0.12))', text: t('settings.integrations.shared.statusConnected') },
    partial: { color: 'var(--color-warning)', bg: 'var(--color-warning-subtle, rgba(245,158,11,0.12))', text: t('settings.integrations.shared.statusPartial') },
    disconnected: { color: 'var(--color-text-tertiary)', bg: 'var(--color-surface-active)', text: t('settings.integrations.shared.statusDisconnected') },
  }
  const c = config[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 7px',
      borderRadius: 'var(--radius-sm)',
      background: c.bg, color: c.color,
      fontSize: 10, fontWeight: 500,
    }}>
      {status === 'connected' && <Check size={10} strokeWidth={2} />}
      {label || c.text}
    </span>
  )
}

function GithubRepoPicker({
  org, onOrgChange, repo, onRepoChange, orgs, repos,
}: {
  org: string
  onOrgChange: (v: string) => void
  repo: string
  onRepoChange: (v: string) => void
  orgs: string[]
  repos: Record<string, string[]>
}) {
  const { t } = useTranslation('smithyNext')
  const availableRepos = org ? (repos[org] || []) : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SelectRow
        label={t('settings.integrations.shared.organization')}
        value={org}
        onChange={(v) => { onOrgChange(v); onRepoChange('') }}
        options={[{ value: '', label: t('settings.integrations.shared.selectOrg') }, ...orgs.map(o => ({ value: o, label: o }))]}
      />
      <SelectRow
        label={t('settings.integrations.shared.repository')}
        value={repo}
        onChange={onRepoChange}
        options={[{ value: '', label: org ? t('settings.integrations.shared.selectRepo') : t('settings.integrations.shared.chooseOrgFirst') }, ...availableRepos.map(r => ({ value: r, label: r }))]}
      />
    </div>
  )
}

function PathPickerRow({ label, value, onChange, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <span style={{ width: 100, fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{label}</span>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        flex: 1, height: 30, padding: '0 10px',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        transition: 'border-color var(--duration-fast)',
      }}>
        <FolderOpen size={12} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: 'var(--color-text)', fontSize: 12, outline: 'none',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        />
      </div>
    </div>
  )
}

function PlaceholderSection({ title }: { title: string }) {
  const { t } = useTranslation('smithyNext')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: 200, color: 'var(--color-text-tertiary)', fontSize: 13,
    }}>
      {t('settings.placeholder.comingSoon', { title })}
    </div>
  )
}

// ── Shared components ──

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{description}</div>
    </div>
  )
}

function ToggleRow({ label, checked, onChange, icon: Icon }: { label: string; checked: boolean; onChange: (v: boolean) => void; icon?: typeof Volume2 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', borderRadius: 'var(--radius-sm)',
      transition: 'background var(--duration-fast)',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {Icon && <Icon size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-tertiary)' }} />}
      <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text)' }}>{label}</span>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10,
        border: 'none', cursor: 'pointer',
        background: checked ? 'var(--color-primary)' : 'var(--color-surface-active)',
        position: 'relative',
        transition: 'background var(--duration-fast)',
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background: 'white',
        position: 'absolute', top: 2,
        left: checked ? 18 : 2,
        transition: 'left var(--duration-fast)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

function SelectRow({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', borderRadius: 'var(--radius-sm)',
    }}>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text)' }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          height: 28, padding: '0 8px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
          fontSize: 12, cursor: 'pointer', outline: 'none',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function IconRow({ icon, onChange }: { icon: string; onChange: (next: string) => void }) {
  const { t } = useTranslation('smithyNext')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const hasImage = isIconImage(icon)
  const letterValue = hasImage ? '' : icon

  const onFile = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onChange(reader.result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <span style={{ width: 100, fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{t('settings.general.workspace.icon')}</span>
      {/* Live preview — matches ActivityRail / TopBar / WorkspacesOverlay */}
      <WorkspaceIconMark icon={icon} fallback="?" size={28} fontSize={11} />
      <input
        value={letterValue}
        onChange={e => {
          // 1–2 chars, auto-uppercase, no whitespace
          const next = e.target.value.replace(/\s/g, '').slice(0, 2).toUpperCase()
          onChange(next)
        }}
        placeholder="S"
        maxLength={2}
        disabled={hasImage}
        title={hasImage ? t('settings.general.workspace.iconHasImageTitle') : t('settings.general.workspace.iconLetterTitle')}
        style={{
          width: 64, height: 30, padding: '0 10px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
          fontSize: 12, outline: 'none',
          fontVariantCaps: 'all-small-caps',
          transition: 'border-color var(--duration-fast)',
          opacity: hasImage ? 0.5 : 1,
        }}
        onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
        onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          onFile(e.target.files?.[0] ?? null)
          // allow re-uploading the same file
          if (e.target) e.target.value = ''
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        style={{
          height: 30, padding: '0 10px',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)',
          fontSize: 12, cursor: 'pointer',
          transition: 'all var(--duration-fast)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
      >
        <Upload size={12} strokeWidth={1.6} />
        {hasImage ? t('settings.general.workspace.iconReplaceImage') : t('settings.general.workspace.iconUploadImage')}
      </button>
      {hasImage && (
        <button
          onClick={() => onChange('')}
          title={t('settings.general.workspace.iconRemoveTitle')}
          style={{
            height: 30, padding: '0 10px',
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none',
            color: 'var(--color-text-tertiary)',
            fontSize: 12, cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-danger)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
        >
          <X size={12} strokeWidth={1.8} />
          {t('settings.general.workspace.iconRemove')}
        </button>
      )}
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto', textAlign: 'right', maxWidth: 220 }}>
        {hasImage ? t('settings.general.workspace.iconHintImage') : t('settings.general.workspace.iconHintLetters')}
      </span>
    </div>
  )
}

function InputRow({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <span style={{ width: 100, fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, height: 30, padding: '0 10px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
          fontSize: 12, outline: 'none',
          transition: 'border-color var(--duration-fast)',
        }}
        onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
        onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
      />
    </div>
  )
}

function TextareaRow({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
      <span style={{ width: 100, fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0, paddingTop: 6 }}>{label}</span>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        style={{
          flex: 1, padding: '6px 10px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
          fontSize: 12, outline: 'none',
          resize: 'vertical', minHeight: 48,
          fontFamily: 'inherit', lineHeight: 1.5,
          transition: 'border-color var(--duration-fast)',
        }}
        onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
        onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
      />
    </div>
  )
}

