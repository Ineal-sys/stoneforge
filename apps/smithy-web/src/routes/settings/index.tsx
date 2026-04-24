/**
 * Settings Page - User preferences and workspace configuration
 *
 * Tabs: Preferences | Workspace
 * - Preferences: Theme, notifications, keyboard shortcuts
 * - Workspace: Worktree directory, ephemeral retention, steward schedules
 */

import { useState, useMemo, useCallback } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import {
  Settings,
  Palette,
  Bell,
  Keyboard,
  Folder,
  Clock,
  Shield,
  Sun,
  Moon,
  Monitor,
  Check,
  RotateCcw,
  Volume2,
  VolumeX,
  GitBranch,
  Trash2,
  Bot,
  ChevronDown,
  Loader2,
  MessageSquare,
  Terminal,
  AlertCircle,
  Workflow,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from '@stoneforge/i18n';
import { ShortcutsSection } from '@stoneforge/ui';
import { useContainerIsMobile } from '../../hooks';
import {
  useSettings,
  useExecutablePathSettings,
  type Theme,
  type AgentProvider,
} from '../../api/hooks/useSettings';
import { useProviders, useProviderModels } from '../../api/hooks/useAgents';
import { PROVIDER_LABELS } from '../../lib/providers';
import { DEFAULT_SHORTCUTS } from '../../lib/keyboard';
import { useDaemonStatus, useUpdateDaemonConfig } from '../../api/hooks/useDaemon';
import { useWorkflowPreset } from '../../api/hooks/useWorkflowPreset';
import { InlinePresetSelector } from '../../components/settings/index.js';

type TabValue = 'preferences' | 'workspace';

export function SettingsPage() {
  const { t } = useTranslation('smithy');
  const search = useSearch({ from: '/settings' }) as { tab?: string };
  const navigate = useNavigate();

  const currentTab = (search.tab as TabValue) || 'preferences';

  const setTab = (tab: TabValue) => {
    navigate({
      to: '/settings',
      search: { tab },
    });
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="settings-page">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
          <Settings className="w-5 h-5 text-[var(--color-primary)]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">{t('settings.title')}</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('settings.subtitle')}
          </p>
        </div>
      </div>

      {/* Tabs: Preferences | Workspace */}
      <div className="border-b border-[var(--color-border)]">
        <nav className="flex gap-1" aria-label={t('settings.tabsLabel')}>
          <button
            onClick={() => setTab('preferences')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              currentTab === 'preferences'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
            }`}
            data-testid="settings-tab-preferences"
          >
            <span className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              {t('settings.tabPreferences')}
            </span>
          </button>
          <button
            onClick={() => setTab('workspace')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              currentTab === 'workspace'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
            }`}
            data-testid="settings-tab-workspace"
          >
            <span className="flex items-center gap-2">
              <Folder className="w-4 h-4" />
              {t('settings.tabWorkspace')}
            </span>
          </button>
        </nav>
      </div>

      {/* Content */}
      {currentTab === 'preferences' ? <PreferencesTab /> : <WorkspaceTab />}
    </div>
  );
}

// ============================================================================
// Preferences Tab
// ============================================================================

function PreferencesTab() {
  const { t } = useTranslation('smithy');
  const { theme, notifications, agentDefaults } = useSettings();
  const isMobile = useContainerIsMobile();

  return (
    <div className="space-y-6 max-w-2xl" data-testid="settings-preferences">
      {/* Theme */}
      <SettingsSection
        icon={Palette}
        title={t('settings.themeTitle')}
        description={t('settings.themeDesc')}
      >
        <div className="flex items-center gap-2">
          <ThemeButton
            theme="light"
            icon={Sun}
            label={t('settings.themeLight')}
            isActive={theme.theme === 'light'}
            onClick={() => theme.setTheme('light')}
          />
          <ThemeButton
            theme="dark"
            icon={Moon}
            label={t('settings.themeDark')}
            isActive={theme.theme === 'dark'}
            onClick={() => theme.setTheme('dark')}
          />
          <ThemeButton
            theme="system"
            icon={Monitor}
            label={t('settings.themeSystem')}
            isActive={theme.theme === 'system'}
            onClick={() => theme.setTheme('system')}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
          {theme.theme === 'system'
            ? t('settings.themeSystemUsing', { theme: theme.resolvedTheme })
            : t('settings.themeUsing', { theme: theme.theme })}
        </p>
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection
        icon={Bell}
        title={t('settings.notificationsTitle')}
        description={t('settings.notificationsDesc')}
      >
        <div className="space-y-3">
          <ToggleSetting
            label={t('settings.notifTaskCompletion')}
            description={t('settings.notifTaskCompletionDesc')}
            checked={notifications.settings.taskCompletion}
            onChange={(checked) => notifications.setSettings({ taskCompletion: checked })}
            testId="settings-notify-task"
          />
          <ToggleSetting
            label={t('settings.notifAgentHealth')}
            description={t('settings.notifAgentHealthDesc')}
            checked={notifications.settings.agentHealth}
            onChange={(checked) => notifications.setSettings({ agentHealth: checked })}
            testId="settings-notify-health"
          />
          <ToggleSetting
            label={t('settings.notifMerge')}
            description={t('settings.notifMergeDesc')}
            checked={notifications.settings.mergeNotifications}
            onChange={(checked) => notifications.setSettings({ mergeNotifications: checked })}
            testId="settings-notify-merge"
          />
          <div className="pt-2 border-t border-[var(--color-border)]">
            <ToggleSetting
              label={t('settings.notifSound')}
              description={t('settings.notifSoundDesc')}
              checked={notifications.settings.sound}
              onChange={(checked) => notifications.setSettings({ sound: checked })}
              icon={notifications.settings.sound ? Volume2 : VolumeX}
              testId="settings-notify-sound"
            />
          </div>
          <div className="pt-2">
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              {t('settings.toastDuration')}
            </label>
            <select
              value={notifications.settings.toastDuration}
              onChange={(e) => notifications.setSettings({ toastDuration: Number(e.target.value) })}
              className="px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              data-testid="settings-toast-duration"
            >
              <option value="3000">{t('settings.toast3s')}</option>
              <option value="5000">{t('settings.toast5s')}</option>
              <option value="10000">{t('settings.toast10s')}</option>
              <option value="0">{t('settings.toastNever')}</option>
            </select>
          </div>
          <div className="pt-2">
            <button
              onClick={() => notifications.resetToDefaults()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors"
              data-testid="settings-notify-reset"
            >
              <RotateCcw className="w-4 h-4" />
              {t('settings.resetDefaults')}
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* Agent Defaults */}
      <AgentDefaultsSection
        settings={agentDefaults.settings}
        setSettings={agentDefaults.setSettings}
        setDefaultModel={agentDefaults.setDefaultModel}
        resetToDefaults={agentDefaults.resetToDefaults}
      />

      {/* Keyboard Shortcuts */}
      <SettingsSection
        icon={Keyboard}
        title={t('settings.keyboardShortcutsTitle')}
        description={t('settings.keyboardShortcutsDesc')}
      >
        <ShortcutsSection defaults={DEFAULT_SHORTCUTS} isMobile={isMobile} />
      </SettingsSection>

      {/* Onboarding Tour */}
      <OnboardingTourSection />
    </div>
  );
}

// ============================================================================
// Agent Defaults Section
// ============================================================================

interface AgentDefaultsSectionProps {
  settings: {
    defaultProvider: AgentProvider;
    defaultModels: Record<string, string>;
  };
  setSettings: (updates: { defaultProvider?: AgentProvider }) => void;
  setDefaultModel: (provider: string, model: string) => void;
  resetToDefaults: () => void;
}

/** Default executable names for each provider (used as placeholders) */
const PROVIDER_DEFAULT_EXECUTABLES: Record<string, string> = {
  'claude-code': 'claude',
  opencode: 'opencode',
  codex: 'codex',
};

function AgentDefaultsSection({ settings, setSettings, setDefaultModel, resetToDefaults }: AgentDefaultsSectionProps) {
  const { t } = useTranslation('smithy');
  const { data: providersData } = useProviders();
  const providers = useMemo(() => providersData?.providers ?? [], [providersData?.providers]);
  const {
    executablePaths,
    isLoading: execPathsLoading,
    error: execPathsError,
    setExecutablePath,
  } = useExecutablePathSettings();

  // Get available provider names (from API or fallback to known providers)
  const availableProviders = useMemo(() => {
    if (providers.length > 0) return providers;
    // Fallback to known providers if API hasn't loaded yet
    return [
      { name: 'claude-code', available: true, installInstructions: '' },
      { name: 'opencode', available: true, installInstructions: '' },
      { name: 'codex', available: true, installInstructions: '' },
    ];
  }, [providers]);

  return (
    <SettingsSection
      icon={Bot}
      title={t('settings.agentDefaultsTitle')}
      description={t('settings.agentDefaultsDesc')}
    >
      <div className="space-y-4">
        {/* Default Provider */}
        <div>
          <label
            htmlFor="default-provider"
            className="block text-sm text-[var(--color-text-secondary)] mb-1"
          >
            {t('settings.defaultProvider')}
          </label>
          <div className="relative">
            <select
              id="default-provider"
              value={settings.defaultProvider}
              onChange={(e) => setSettings({ defaultProvider: e.target.value as AgentProvider })}
              className="w-full px-3 py-2 pr-8 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              data-testid="settings-default-provider"
            >
              {availableProviders.map((p) => (
                <option key={p.name} value={p.name} disabled={!p.available}>
                  {PROVIDER_LABELS[p.name] ?? p.name}
                  {!p.available ? t('settings.notInstalled') : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] pointer-events-none" />
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            {t('settings.defaultProviderHelp')}
          </p>
        </div>

        {/* Default Model per Provider */}
        <div>
          <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
            {t('settings.defaultModelPerProvider')}
          </label>
          <div className="space-y-3">
            {availableProviders
              .filter((p) => p.available)
              .map((provider) => (
                <ProviderModelSelector
                  key={provider.name}
                  providerName={provider.name}
                  providerLabel={PROVIDER_LABELS[provider.name] ?? provider.name}
                  selectedModel={settings.defaultModels[provider.name] ?? ''}
                  onModelChange={(model) => setDefaultModel(provider.name, model)}
                />
              ))}
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
            {t('settings.defaultModelHelp')}
          </p>
        </div>

        {/* Executable Paths */}
        <div className="pt-2 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-[var(--color-text-secondary)]" />
            <label className="block text-sm text-[var(--color-text-secondary)]">
              {t('settings.customExecPaths')}
            </label>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
            {t('settings.customExecPathsHelp')}
          </p>

          {execPathsError && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 text-xs text-[var(--color-danger-text)] bg-[var(--color-danger-muted)] border border-[var(--color-danger)] rounded-md">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{t('settings.customExecPathsError', { error: execPathsError })}</span>
            </div>
          )}

          {execPathsLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-[var(--color-text-tertiary)]">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('settings.customExecPathsLoading')}
            </div>
          ) : (
            <div className="space-y-3">
              {availableProviders.map((provider) => (
                <ExecutablePathInput
                  key={provider.name}
                  providerName={provider.name}
                  providerLabel={PROVIDER_LABELS[provider.name] ?? provider.name}
                  currentPath={executablePaths[provider.name] ?? ''}
                  defaultExecutable={PROVIDER_DEFAULT_EXECUTABLES[provider.name] ?? provider.name}
                  onPathChange={(path) => setExecutablePath(provider.name, path)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Reset */}
        <div className="pt-2">
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors"
            data-testid="settings-agent-defaults-reset"
          >
            <RotateCcw className="w-4 h-4" />
            {t('settings.resetDefaults')}
          </button>
        </div>
      </div>
    </SettingsSection>
  );
}

// ============================================================================
// Onboarding Tour Section
// ============================================================================

function OnboardingTourSection() {
  const { t } = useTranslation('smithy');
  const navigate = useNavigate();

  const handleRestartTour = useCallback(() => {
    // Dispatch event that the tour hook listens for
    window.dispatchEvent(new CustomEvent('restart-onboarding-tour'));
    // Navigate to activity page where the tour starts
    navigate({ to: '/activity' });
  }, [navigate]);

  return (
    <SettingsSection
      icon={Sparkles}
      title={t('settings.onboardingTitle')}
      description={t('settings.onboardingDesc')}
    >
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('settings.onboardingDescription')}
        </p>
        <button
          onClick={handleRestartTour}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-primary-muted)] border border-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary)] hover:text-white transition-colors"
          data-testid="settings-restart-onboarding"
        >
          <RotateCcw className="w-4 h-4" />
          {t('settings.restartOnboarding')}
        </button>
      </div>
    </SettingsSection>
  );
}

/**
 * Model selector for a specific provider
 */
function ProviderModelSelector({
  providerName,
  providerLabel,
  selectedModel,
  onModelChange,
}: {
  providerName: string;
  providerLabel: string;
  selectedModel: string;
  onModelChange: (model: string) => void;
}) {
  const { t } = useTranslation('smithy');
  const { data: modelsData, isLoading } = useProviderModels(providerName);
  const allModels = useMemo(() => modelsData?.models ?? [], [modelsData?.models]);
  const defaultModel = useMemo(() => allModels.find((m) => m.isDefault), [allModels]);
  const models = useMemo(() => allModels.filter((m) => !m.isDefault), [allModels]);

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-[var(--color-text)] w-24 flex-shrink-0 font-medium">
        {providerLabel}
      </span>
      <div className="relative flex-1">
        {isLoading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-[var(--color-text-tertiary)]">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('settings.loadingModels')}
          </div>
        ) : (
          <>
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full px-3 py-1.5 pr-8 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              data-testid={`settings-default-model-${providerName}`}
            >
              <option value="">
                {defaultModel
                  ? t('settings.providerDefaultModel', { model: defaultModel.displayName })
                  : t('settings.providerDefault')}
              </option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.providerName ? `${m.displayName} — ${m.providerName}` : m.displayName}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] pointer-events-none" />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Executable path input for a specific provider
 */
function ExecutablePathInput({
  providerName,
  providerLabel,
  currentPath,
  defaultExecutable,
  onPathChange,
}: {
  providerName: string;
  providerLabel: string;
  currentPath: string;
  defaultExecutable: string;
  onPathChange: (path: string) => void;
}) {
  const { t } = useTranslation('smithy');
  const hasCustomPath = currentPath.trim() !== '';

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-[var(--color-text)] w-24 flex-shrink-0 font-medium flex items-center gap-1.5">
        {providerLabel}
        {hasCustomPath && (
          <span
            className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-success-muted)] text-[var(--color-success)]"
            title={t('settings.customExecPathSet')}
          >
            {t('settings.customBadge')}
          </span>
        )}
      </span>
      <input
        type="text"
        value={currentPath}
        onChange={(e) => onPathChange(e.target.value)}
        placeholder={defaultExecutable}
        className="flex-1 px-3 py-1.5 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
        data-testid={`settings-executable-path-${providerName}`}
      />
    </div>
  );
}

// ============================================================================
// Workspace Tab
// ============================================================================

function WorkspaceTab() {
  const { t } = useTranslation('smithy');
  const { workspace, stewardSchedules, resetAllToDefaults } = useSettings();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <div className="space-y-6 max-w-2xl" data-testid="settings-workspace">
      {/* Workflow Preset */}
      <WorkflowPresetSection />

      {/* Git Worktrees */}
      <SettingsSection
        icon={GitBranch}
        title={t('settings.gitWorktreesTitle')}
        description={t('settings.gitWorktreesDesc')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              {t('settings.worktreeDirectory')}
            </label>
            <input
              type="text"
              value={workspace.settings.worktreeDirectory}
              onChange={(e) => workspace.setSettings({ worktreeDirectory: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              placeholder=".stoneforge/.worktrees/"
              data-testid="settings-worktree-dir"
            />
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              {t('settings.worktreeDirectoryHelp')}
            </p>
          </div>
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              {t('settings.defaultBranch')}
            </label>
            <input
              type="text"
              value={workspace.settings.defaultBranch}
              onChange={(e) => workspace.setSettings({ defaultBranch: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              placeholder="main"
              data-testid="settings-default-branch"
            />
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              {t('settings.defaultBranchHelp')}
            </p>
          </div>
          <ToggleSetting
            label={t('settings.autoMerge')}
            description={t('settings.autoMergeDesc')}
            checked={workspace.settings.autoMerge}
            onChange={(checked) => workspace.setSettings({ autoMerge: checked })}
            testId="settings-auto-merge"
          />
        </div>
      </SettingsSection>

      {/* Ephemeral Tasks */}
      <SettingsSection
        icon={Clock}
        title={t('settings.ephemeralTasksTitle')}
        description={t('settings.ephemeralTasksDesc')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              {t('settings.retentionPeriod')}
            </label>
            <select
              value={workspace.settings.ephemeralRetention}
              onChange={(e) => workspace.setSettings({ ephemeralRetention: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              data-testid="settings-ephemeral-retention"
            >
              <option value="1h">{t('settings.retention1h')}</option>
              <option value="6h">{t('settings.retention6h')}</option>
              <option value="12h">{t('settings.retention12h')}</option>
              <option value="24h">{t('settings.retention24h')}</option>
              <option value="7d">{t('settings.retention7d')}</option>
              <option value="30d">{t('settings.retention30d')}</option>
            </select>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              {t('settings.retentionHelp')}
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* Steward Schedules */}
      <SettingsSection
        icon={Shield}
        title={t('settings.stewardSchedulesTitle')}
        description={t('settings.stewardSchedulesDesc')}
      >
        <div className="space-y-4">
          <ToggleSetting
            label={t('settings.mergeSteward')}
            description={t('settings.mergeStewardDesc')}
            checked={stewardSchedules.settings.mergeStewardEnabled}
            onChange={(checked) => stewardSchedules.setSettings({ mergeStewardEnabled: checked })}
            testId="settings-merge-steward"
          />

          <ToggleSetting
            label={t('settings.docsSteward')}
            description={t('settings.docsStewardDesc')}
            checked={stewardSchedules.settings.docsStewardEnabled}
            onChange={(checked) => stewardSchedules.setSettings({ docsStewardEnabled: checked })}
            testId="settings-docs-steward"
          />

          <div className="pt-2">
            <button
              onClick={() => stewardSchedules.resetToDefaults()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors"
              data-testid="settings-steward-reset"
            >
              <RotateCcw className="w-4 h-4" />
              {t('settings.resetDefaults')}
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* Director */}
      <DirectorSection />

      {/* Danger Zone */}
      <SettingsSection
        icon={Trash2}
        title={t('settings.resetAllTitle')}
        description={t('settings.resetAllDesc')}
        variant="danger"
      >
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-danger-text)] bg-[var(--color-danger-muted)] border border-[var(--color-danger)] rounded-md hover:bg-[var(--color-danger)] hover:text-white transition-colors"
            data-testid="settings-reset-all"
          >
            <RotateCcw className="w-4 h-4" />
            {t('settings.resetAllButton')}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-secondary)]">{t('settings.areYouSure')}</span>
            <button
              onClick={() => {
                resetAllToDefaults();
                setShowResetConfirm(false);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-danger)] rounded-md hover:opacity-90 transition-opacity"
              data-testid="settings-reset-confirm"
            >
              <Check className="w-4 h-4" />
              {t('settings.yesReset')}
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
              data-testid="settings-reset-cancel"
            >
              {t('common:button.cancel')}
            </button>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

// ============================================================================
// Director Section
// ============================================================================

function DirectorSection() {
  const { t } = useTranslation('smithy');
  const { data: daemonStatus } = useDaemonStatus();
  const updateConfig = useUpdateDaemonConfig();
  const enabled = daemonStatus?.config?.directorInboxForwardingEnabled ?? false;

  return (
    <SettingsSection
      icon={MessageSquare}
      title={t('settings.directorTitle')}
      description={t('settings.directorDesc')}
    >
      <ToggleSetting
        label={t('settings.autoForwardInbox')}
        description={t('settings.autoForwardInboxDesc')}
        checked={enabled}
        onChange={(checked) => updateConfig.mutate({ directorInboxForwardingEnabled: checked })}
        testId="settings-director-forwarding"
      />
    </SettingsSection>
  );
}

// ============================================================================
// Workflow Preset Section
// ============================================================================

function WorkflowPresetSection() {
  const { t } = useTranslation('smithy');
  const { preset, isLoading, error, setPreset } = useWorkflowPreset();

  return (
    <SettingsSection
      icon={Workflow}
      title={t('settings.workflowPresetTitle')}
      description={t('settings.workflowPresetDesc')}
    >
      {isLoading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-[var(--color-text-tertiary)]">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('settings.workflowPresetLoading')}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-danger-text)] bg-[var(--color-danger-muted)] border border-[var(--color-danger)] rounded-md">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{t('settings.workflowPresetError', { error })}</span>
        </div>
      ) : (
        <InlinePresetSelector currentPreset={preset} onSelect={setPreset} />
      )}
    </SettingsSection>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

interface SettingsSectionProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
  variant?: 'default' | 'danger';
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
  variant = 'default',
}: SettingsSectionProps) {
  const borderClass = variant === 'danger'
    ? 'border-[var(--color-danger)]'
    : 'border-[var(--color-border)]';
  const iconClass = variant === 'danger'
    ? 'text-[var(--color-danger)]'
    : 'text-[var(--color-text-secondary)]';

  return (
    <div
      className={`p-4 rounded-lg border ${borderClass} bg-[var(--color-card-bg)]`}
      data-testid={`settings-section-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <Icon className={`w-5 h-5 ${iconClass}`} />
        <div>
          <h3 className="text-sm font-medium text-[var(--color-text)]">{title}</h3>
          {description && (
            <p className="text-xs text-[var(--color-text-tertiary)]">{description}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

interface ThemeButtonProps {
  theme: Theme;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function ThemeButton({ theme, icon: Icon, label, isActive, onClick }: ThemeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md border transition-colors ${
        isActive
          ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-muted)]'
          : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
      }`}
      data-testid={`settings-theme-${theme}`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {isActive && <Check className="w-3 h-3" />}
    </button>
  );
}

interface ToggleSettingProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: React.ComponentType<{ className?: string }>;
  testId?: string;
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
  icon: Icon,
  testId,
}: ToggleSettingProps) {
  return (
    <label
      className="flex items-center justify-between cursor-pointer group"
      data-testid={testId}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-[var(--color-text-tertiary)]" />}
        <div>
          <span className="text-sm text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
            {label}
          </span>
          {description && (
            <p className="text-xs text-[var(--color-text-tertiary)]">{description}</p>
          )}
        </div>
      </div>
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
          data-checked={checked}
        />
        <div className="w-11 h-6 bg-[var(--color-surface-elevated)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-primary)] rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]" />
      </div>
    </label>
  );
}
