import { useQuery } from '@tanstack/react-query';
import { useRealtimeEvents } from './api/hooks/useRealtimeEvents';
import type { ConnectionState } from '@stoneforge/ui';
import { useTranslation } from '@stoneforge/i18n';

interface HealthResponse {
  status: string;
  timestamp: string;
  database: string;
  websocket?: {
    clients: number;
    broadcasting: boolean;
  };
}

interface StatsResponse {
  totalElements: number;
  elementsByType: Record<string, number>;
  totalDependencies: number;
  totalEvents: number;
  readyTasks: number;
  blockedTasks: number;
  databaseSize: number;
  computedAt: string;
}

interface Task {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  complexity: number;
  taskType: string;
  assignee?: string;
  owner?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Failed to fetch health');
      return response.json();
    },
    refetchInterval: 30000, // Less frequent since we have WebSocket
  });
}

function useStats() {
  return useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await fetch('/api/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
    // No refetchInterval - WebSocket will invalidate when needed
  });
}

function useReadyTasks() {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'ready'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/ready');
      if (!response.ok) throw new Error('Failed to fetch ready tasks');
      return response.json();
    },
    // No refetchInterval - WebSocket will invalidate when needed
  });
}

function ConnectionStatus({ wsState, health }: { wsState: ConnectionState; health: ReturnType<typeof useHealth> }) {
  const { t } = useTranslation('quarry');
  // Prioritize WebSocket state for connection indicator
  if (wsState === 'connecting' || wsState === 'reconnecting') {
    return (
      <div className="flex items-center gap-2 text-yellow-600">
        <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
        <span>{wsState === 'connecting' ? t('connection.connecting') : t('connection.reconnecting')}</span>
      </div>
    );
  }

  if (wsState === 'connected') {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span>{t('connection.live')}</span>
      </div>
    );
  }

  // WebSocket disconnected - fall back to health check
  if (health.isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <div className="w-3 h-3 rounded-full bg-gray-400 animate-pulse" />
        <span>{t('connection.connecting')}</span>
      </div>
    );
  }

  if (health.isError) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <span>{t('connection.disconnected')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-orange-500">
      <div className="w-3 h-3 rounded-full bg-orange-400" />
      <span>{t('connection.polling')}</span>
    </div>
  );
}

function StatsCard({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{title}</h3>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
    </div>
  );
}

const PRIORITY_LABELS: Record<number, { labelKey: string; color: string }> = {
  1: { labelKey: 'tasks.priority.critical', color: 'bg-red-100 text-red-800' },
  2: { labelKey: 'tasks.priority.high', color: 'bg-orange-100 text-orange-800' },
  3: { labelKey: 'tasks.priority.medium', color: 'bg-yellow-100 text-yellow-800' },
  4: { labelKey: 'tasks.priority.low', color: 'bg-green-100 text-green-800' },
  5: { labelKey: 'tasks.priority.trivial', color: 'bg-gray-100 text-gray-800' },
};

const TASK_TYPE_COLORS: Record<string, string> = {
  bug: 'bg-red-50 border-red-200 text-red-700',
  feature: 'bg-purple-50 border-purple-200 text-purple-700',
  task: 'bg-blue-50 border-blue-200 text-blue-700',
  chore: 'bg-gray-50 border-gray-200 text-gray-700',
};

function TaskCard({ task }: { task: Task }) {
  const { t } = useTranslation('quarry');
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const typeColor = TASK_TYPE_COLORS[task.taskType] || TASK_TYPE_COLORS.task;

  return (
    <div className={`p-4 rounded-lg border ${typeColor}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 truncate">{task.title}</h4>
          <p className="text-xs text-gray-500 mt-1 font-mono">{task.id}</p>
        </div>
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${priority.color}`}>
          {t(priority.labelKey)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-600 capitalize">{task.taskType}</span>
        {task.assignee && (
          <span className="text-xs text-gray-500">{t('tasks.detail.assignee')} {task.assignee}</span>
        )}
        {task.tags.length > 0 && (
          <div className="flex gap-1">
            {task.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-200 rounded">
                {tag}
              </span>
            ))}
            {task.tags.length > 3 && (
              <span className="text-xs text-gray-500">+{task.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReadyTasksList() {
  const { t } = useTranslation('quarry');
  const readyTasks = useReadyTasks();

  return (
    <div className="mt-8">
      <h3 className="text-md font-medium text-gray-900 mb-4">{t('dashboard.readyTasks.title')}</h3>

      {readyTasks.isLoading && (
        <div className="text-gray-500">{t('dashboard.readyTasks.loading')}</div>
      )}

      {readyTasks.isError && (
        <div className="text-red-600">{t('dashboard.readyTasks.failedToLoad')}</div>
      )}

      {readyTasks.data && readyTasks.data.length === 0 && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          {t('dashboard.readyTasks.empty')}
        </div>
      )}

      {readyTasks.data && readyTasks.data.length > 0 && (
        <div className="space-y-3">
          {readyTasks.data.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const { t } = useTranslation('quarry');
  const health = useHealth();
  const stats = useStats();

  // Connect to WebSocket and subscribe to all events
  const { connectionState } = useRealtimeEvents({
    channels: ['*'],
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">{t('app.name')}</h1>
          <ConnectionStatus wsState={connectionState} health={health} />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-lg font-medium text-gray-900 mb-6">{t('dashboard.systemOverview')}</h2>

        {stats.isLoading && (
          <div className="text-gray-500">{t('dashboard.loadingStats')}</div>
        )}

        {stats.isError && (
          <div className="text-red-600">{t('dashboard.failedToLoadStats')}</div>
        )}

        {stats.data && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatsCard
              title={t('dashboard.metrics.totalElements')}
              value={stats.data.totalElements}
            />
            <StatsCard
              title={t('dashboard.metrics.readyTasks')}
              value={stats.data.readyTasks}
              subtitle={t('dashboard.metrics.readyTasksSubtitle')}
            />
            <StatsCard
              title={t('dashboard.metrics.blockedTasks')}
              value={stats.data.blockedTasks}
              subtitle={t('dashboard.metrics.blockedTasksSubtitle')}
            />
            <StatsCard
              title={t('dashboard.metrics.totalEvents')}
              value={stats.data.totalEvents}
              subtitle={t('dashboard.metrics.totalEventsSubtitle')}
            />
          </div>
        )}

        {/* Ready Tasks List */}
        <ReadyTasksList />

        {/* Element Types Breakdown */}
        {stats.data && Object.keys(stats.data.elementsByType).length > 0 && (
          <div className="mt-8">
            <h3 className="text-md font-medium text-gray-900 mb-4">{t('dashboard.elementsByType')}</h3>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="space-y-3">
                {Object.entries(stats.data.elementsByType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-gray-700 capitalize">{type}</span>
                    <span className="font-medium text-gray-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Server Info */}
        {health.data && (
          <div className="mt-8">
            <h3 className="text-md font-medium text-gray-900 mb-4">{t('dashboard.serverInfo')}</h3>
            <div className="bg-white rounded-lg shadow p-6">
              <dl className="space-y-3">
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">{t('dashboard.serverFields.database')}</dt>
                  <dd className="font-mono text-sm text-gray-700">{health.data.database}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">{t('dashboard.serverFields.lastUpdated')}</dt>
                  <dd className="text-gray-700">{new Date(health.data.timestamp).toLocaleString()}</dd>
                </div>
                {health.data.websocket && (
                  <>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">{t('dashboard.serverFields.websocketClients')}</dt>
                      <dd className="text-gray-700">{health.data.websocket.clients}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">{t('dashboard.serverFields.broadcasting')}</dt>
                      <dd className="text-gray-700">{health.data.websocket.broadcasting ? t('common:common.yes') : t('common:common.no')}</dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
