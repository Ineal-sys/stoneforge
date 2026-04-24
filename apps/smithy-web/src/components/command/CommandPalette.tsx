/**
 * CommandPalette - Cmd+K palette for quick navigation and actions
 * Uses cmdk library for fuzzy search and keyboard navigation
 */

import { useState, useEffect, useCallback } from 'react';
import { Command } from 'cmdk';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from '@stoneforge/i18n';
import {
  Activity,
  CheckSquare,
  Users,
  LayoutGrid,
  Workflow,
  BarChart3,
  Settings,
  Plus,
  Play,
  Square,
  ArrowRight,
  Search,
  Bot,
  Wrench,
  Clock,
  GitBranch,
  GitMerge,
  ClipboardList,
  RefreshCw,
  FileText,
  Terminal,
  Moon,
  Sun,
  Monitor,
  Maximize2,
} from 'lucide-react';

// Command types
type CommandCategory =
  | 'navigation'
  | 'tasks'
  | 'agents'
  | 'workflows'
  | 'actions'
  | 'settings';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
  action: () => void;
  shortcut?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Category icons and i18n keys
const CATEGORY_CONFIG: Record<CommandCategory, { labelKey: string; icon: React.ComponentType<{ className?: string }> }> = {
  navigation: { labelKey: 'commandPalette.categoryNavigation', icon: ArrowRight },
  tasks: { labelKey: 'commandPalette.categoryTasks', icon: CheckSquare },
  agents: { labelKey: 'commandPalette.categoryAgents', icon: Bot },
  workflows: { labelKey: 'commandPalette.categoryWorkflows', icon: Workflow },
  actions: { labelKey: 'commandPalette.categoryQuickActions', icon: Play },
  settings: { labelKey: 'commandPalette.categorySettings', icon: Settings },
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { t } = useTranslation('smithy');
  const [search, setSearch] = useState('');

  // Reset search when closing
  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  // Navigate helper
  const navigateTo = useCallback(
    (path: string, search?: Record<string, string>) => {
      router.navigate({ to: path, search });
      onOpenChange(false);
    },
    [router, onOpenChange]
  );

  // Theme toggle helper
  const setTheme = useCallback((theme: 'light' | 'dark' | 'system') => {
    const root = document.documentElement;
    localStorage.setItem('theme', theme);

    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', isDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }
    onOpenChange(false);
  }, [onOpenChange]);

  // Define all commands
  const commands: CommandItem[] = [
    // Navigation commands
    {
      id: 'nav-activity',
      label: t('commandPalette.navActivity'),
      description: t('commandPalette.navActivityDesc'),
      category: 'navigation',
      icon: Activity,
      keywords: ['home', 'feed', 'events', 'activity'],
      action: () => navigateTo('/activity'),
      shortcut: 'G A',
    },
    {
      id: 'nav-tasks',
      label: t('commandPalette.navTasks'),
      description: t('commandPalette.navTasksDesc'),
      category: 'navigation',
      icon: CheckSquare,
      keywords: ['tasks', 'todos', 'work', 'items'],
      action: () => navigateTo('/tasks'),
      shortcut: 'G T',
    },
    {
      id: 'nav-agents',
      label: t('commandPalette.navAgents'),
      description: t('commandPalette.navAgentsDesc'),
      category: 'navigation',
      icon: Users,
      keywords: ['agents', 'workers', 'director', 'steward'],
      action: () => navigateTo('/agents'),
      shortcut: 'G E',
    },
    {
      id: 'nav-stewards',
      label: t('commandPalette.navStewards'),
      description: t('commandPalette.navStewardsDesc'),
      category: 'navigation',
      icon: Wrench,
      keywords: ['stewards', 'automation', 'merge', 'docs'],
      action: () => navigateTo('/agents', { tab: 'stewards' }),
    },
    {
      id: 'nav-workspaces',
      label: t('commandPalette.navWorkspaces'),
      description: t('commandPalette.navWorkspacesDesc'),
      category: 'navigation',
      icon: LayoutGrid,
      keywords: ['workspaces', 'terminal', 'multiplexer', 'panes'],
      action: () => navigateTo('/workspaces'),
      shortcut: 'G W',
    },
    {
      id: 'nav-workflows',
      label: t('commandPalette.navWorkflows'),
      description: t('commandPalette.navWorkflowsDesc'),
      category: 'navigation',
      icon: Workflow,
      keywords: ['workflows', 'templates', 'playbooks'],
      action: () => navigateTo('/workflows'),
      shortcut: 'G F',
    },
    {
      id: 'nav-metrics',
      label: t('commandPalette.navMetrics'),
      description: t('commandPalette.navMetricsDesc'),
      category: 'navigation',
      icon: BarChart3,
      keywords: ['metrics', 'analytics', 'stats', 'performance', 'dashboard'],
      action: () => navigateTo('/metrics'),
      shortcut: 'G M',
    },
    {
      id: 'nav-settings',
      label: t('commandPalette.navSettings'),
      description: t('commandPalette.navSettingsDesc'),
      category: 'navigation',
      icon: Settings,
      keywords: ['settings', 'preferences', 'config', 'options'],
      action: () => navigateTo('/settings'),
      shortcut: 'G S',
    },
    {
      id: 'nav-plans',
      label: t('commandPalette.navPlans'),
      description: t('commandPalette.navPlansDesc'),
      category: 'navigation',
      icon: ClipboardList,
      keywords: ['plans', 'roadmap', 'milestones', 'goals'],
      action: () => navigateTo('/plans'),
      shortcut: 'G P',
    },
    {
      id: 'nav-merge-requests',
      label: t('commandPalette.navMergeRequests'),
      description: t('commandPalette.navMergeRequestsDesc'),
      category: 'navigation',
      icon: GitMerge,
      keywords: ['merge', 'requests', 'pr', 'pull', 'review', 'git'],
      action: () => navigateTo('/merge-requests'),
      shortcut: 'G R',
    },

    // Task commands
    {
      id: 'task-create',
      label: t('commandPalette.taskCreate'),
      description: t('commandPalette.taskCreateDesc'),
      category: 'tasks',
      icon: Plus,
      keywords: ['create', 'new', 'task', 'add'],
      action: () => navigateTo('/tasks', { action: 'create' }),
      shortcut: 'C T',
    },
    {
      id: 'task-unassigned',
      label: t('commandPalette.taskUnassigned'),
      description: t('commandPalette.taskUnassignedDesc'),
      category: 'tasks',
      icon: Clock,
      keywords: ['unassigned', 'pending', 'queue', 'backlog'],
      action: () => navigateTo('/tasks', { status: 'unassigned' }),
    },
    {
      id: 'task-in-progress',
      label: t('commandPalette.taskInProgress'),
      description: t('commandPalette.taskInProgressDesc'),
      category: 'tasks',
      icon: Play,
      keywords: ['progress', 'active', 'working', 'running'],
      action: () => navigateTo('/tasks', { status: 'in_progress' }),
    },
    {
      id: 'task-awaiting-merge',
      label: t('commandPalette.taskAwaitingMerge'),
      description: t('commandPalette.taskAwaitingMergeDesc'),
      category: 'tasks',
      icon: GitBranch,
      keywords: ['merge', 'review', 'pr', 'pull request', 'awaiting'],
      action: () => navigateTo('/tasks', { status: 'awaiting_merge' }),
    },

    // Agent commands
    {
      id: 'agent-create',
      label: t('commandPalette.agentCreate'),
      description: t('commandPalette.agentCreateDesc'),
      category: 'agents',
      icon: Plus,
      keywords: ['create', 'new', 'agent', 'worker', 'register'],
      action: () => navigateTo('/agents', { action: 'create' }),
      shortcut: 'C A',
    },
    {
      id: 'agent-create-steward',
      label: t('commandPalette.agentCreateSteward'),
      description: t('commandPalette.agentCreateStewardDesc'),
      category: 'agents',
      icon: Wrench,
      keywords: ['create', 'steward', 'automation', 'merge', 'docs'],
      action: () => navigateTo('/agents', { tab: 'stewards', action: 'create' }),
    },
    {
      id: 'agent-start-all',
      label: t('commandPalette.agentStartAll'),
      description: t('commandPalette.agentStartAllDesc'),
      category: 'agents',
      icon: Play,
      keywords: ['start', 'all', 'agents', 'boot'],
      action: () => {
        // This would trigger an API call - for now just navigate
        navigateTo('/agents');
      },
    },
    {
      id: 'agent-stop-all',
      label: t('commandPalette.agentStopAll'),
      description: t('commandPalette.agentStopAllDesc'),
      category: 'agents',
      icon: Square,
      keywords: ['stop', 'all', 'agents', 'halt', 'shutdown'],
      action: () => {
        // This would trigger an API call - for now just navigate
        navigateTo('/agents');
      },
    },

    // Workflow commands
    {
      id: 'workflow-templates',
      label: t('commandPalette.workflowTemplates'),
      description: t('commandPalette.workflowTemplatesDesc'),
      category: 'workflows',
      icon: FileText,
      keywords: ['templates', 'playbooks', 'workflows'],
      action: () => navigateTo('/workflows', { tab: 'templates' }),
    },
    {
      id: 'workflow-active',
      label: t('commandPalette.workflowActive'),
      description: t('commandPalette.workflowActiveDesc'),
      category: 'workflows',
      icon: RefreshCw,
      keywords: ['active', 'running', 'workflows', 'instances'],
      action: () => navigateTo('/workflows', { tab: 'active' }),
    },

    // Quick actions
    {
      id: 'action-refresh',
      label: t('commandPalette.actionRefresh'),
      description: t('commandPalette.actionRefreshDesc'),
      category: 'actions',
      icon: RefreshCw,
      keywords: ['refresh', 'reload', 'sync', 'update'],
      action: () => {
        window.location.reload();
      },
      shortcut: 'R',
    },
    {
      id: 'action-open-terminal',
      label: t('commandPalette.actionOpenTerminal'),
      description: t('commandPalette.actionOpenTerminalDesc'),
      category: 'actions',
      icon: Terminal,
      keywords: ['terminal', 'director', 'console', 'cli'],
      action: () => {
        // Toggle director panel - dispatch custom event
        window.dispatchEvent(new CustomEvent('toggle-director-panel'));
        onOpenChange(false);
      },
      shortcut: 'T',
    },
    {
      id: 'action-maximize-director',
      label: t('commandPalette.actionMaximizeDirector'),
      description: t('commandPalette.actionMaximizeDirectorDesc'),
      category: 'actions',
      icon: Maximize2,
      keywords: ['maximize', 'fullscreen', 'director', 'terminal', 'restore', 'minimize'],
      action: () => {
        window.dispatchEvent(new CustomEvent('maximize-director-panel'));
        onOpenChange(false);
      },
    },

    // Settings commands
    {
      id: 'settings-preferences',
      label: t('commandPalette.settingsPreferences'),
      description: t('commandPalette.settingsPreferencesDesc'),
      category: 'settings',
      icon: Settings,
      keywords: ['preferences', 'settings', 'options'],
      action: () => navigateTo('/settings', { tab: 'preferences' }),
    },
    {
      id: 'settings-workspace',
      label: t('commandPalette.settingsWorkspace'),
      description: t('commandPalette.settingsWorkspaceDesc'),
      category: 'settings',
      icon: LayoutGrid,
      keywords: ['workspace', 'config', 'settings'],
      action: () => navigateTo('/settings', { tab: 'workspace' }),
    },
    {
      id: 'theme-light',
      label: t('commandPalette.themeLight'),
      description: t('commandPalette.themeLightDesc'),
      category: 'settings',
      icon: Sun,
      keywords: ['light', 'theme', 'bright', 'day'],
      action: () => setTheme('light'),
    },
    {
      id: 'theme-dark',
      label: t('commandPalette.themeDark'),
      description: t('commandPalette.themeDarkDesc'),
      category: 'settings',
      icon: Moon,
      keywords: ['dark', 'theme', 'night'],
      action: () => setTheme('dark'),
    },
    {
      id: 'theme-system',
      label: t('commandPalette.themeSystem'),
      description: t('commandPalette.themeSystemDesc'),
      category: 'settings',
      icon: Monitor,
      keywords: ['system', 'theme', 'auto', 'automatic'],
      action: () => setTheme('system'),
    },
  ];

  // Group commands by category
  const groupedCommands = commands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) {
        acc[cmd.category] = [];
      }
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<CommandCategory, CommandItem[]>
  );

  // Category order for display
  const categoryOrder: CommandCategory[] = [
    'navigation',
    'tasks',
    'agents',
    'workflows',
    'actions',
    'settings',
  ];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={t('commandPalette.label')}
      className="fixed inset-0 z-[var(--z-index-modal)] flex items-start justify-center pt-[20vh]"
      data-testid="command-palette"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--color-bg-overlay)] backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        data-testid="command-palette-backdrop"
      />

      {/* Dialog content */}
      <div
        className="relative w-full max-w-lg bg-[var(--color-bg-elevated)] rounded-xl shadow-2xl border border-[var(--color-border)] overflow-hidden"
        data-testid="command-palette-dialog"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-[var(--color-border)]">
          <Search className="w-5 h-5 text-[var(--color-text-muted)]" />
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder={t('commandPalette.placeholder')}
            className="flex-1 h-14 bg-transparent text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none text-base"
            data-testid="command-palette-input"
          />
          {/* viewport-based: renders in fixed overlay outside @container */}
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <Command.List
          className="max-h-[400px] overflow-y-auto p-2"
          data-testid="command-palette-list"
        >
          <Command.Empty className="py-6 text-center text-sm text-[var(--color-text-muted)]">
            {t('commandPalette.noResults')}
          </Command.Empty>

          {categoryOrder.map((category) => {
            const items = groupedCommands[category];
            if (!items || items.length === 0) return null;

            const config = CATEGORY_CONFIG[category];

            return (
              <Command.Group
                key={category}
                heading={t(config.labelKey)}
                className="mb-2"
                data-testid={`command-group-${category}`}
              >
                <div className="px-2 py-1.5 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                  {t(config.labelKey)}
                </div>
                {items.map((cmd) => (
                  <CommandItemComponent
                    key={cmd.id}
                    command={cmd}
                    onSelect={() => cmd.action()}
                  />
                ))}
              </Command.Group>
            );
          })}
        </Command.List>

        {/* Footer with keyboard hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
                ↓
              </kbd>
              <span>{t('commandPalette.navigate')}</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
                ↵
              </kbd>
              <span>{t('commandPalette.select')}</span>
            </span>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs">
              ⌘K
            </kbd>
            {' '}{t('commandPalette.toOpen')}
          </div>
        </div>
      </div>
    </Command.Dialog>
  );
}

// Individual command item component
function CommandItemComponent({
  command,
  onSelect,
}: {
  command: CommandItem;
  onSelect: () => void;
}) {
  const Icon = command.icon;

  return (
    <Command.Item
      value={[command.label, command.description, ...(command.keywords || [])].join(' ')}
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] data-[selected=true]:bg-[var(--color-surface-selected)] data-[selected=true]:text-[var(--color-text)] transition-colors duration-100"
      data-testid={`command-item-${command.id}`}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--color-surface)] text-[var(--color-text-muted)]">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{command.label}</div>
        {command.description && (
          <div className="text-xs text-[var(--color-text-muted)] truncate">
            {command.description}
          </div>
        )}
      </div>
      {command.shortcut && (
        <kbd className="hidden sm:block px-2 py-1 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded">
          {command.shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}

// Hook for global keyboard shortcut
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { open, setOpen };
}

export default CommandPalette;
