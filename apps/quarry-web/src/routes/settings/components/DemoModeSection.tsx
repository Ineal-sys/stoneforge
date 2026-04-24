/**
 * Demo Mode Section component for settings
 *
 * Allows toggling demo mode, which switches all agents to the
 * opencode provider with the minimax-m2.5-free model.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Loader2, AlertCircle, Check, Users, Cpu, Server } from 'lucide-react';
import { useTranslation } from '@stoneforge/i18n';
import { ToggleSwitch } from './ToggleSwitch';

interface DemoModeStatus {
  enabled: boolean;
  provider: string;
  model: string;
  savedConfigCount: number;
}

interface DemoModeResult {
  enabled: boolean;
  agentsUpdated: number;
  provider: string;
  model: string;
}

interface DemoModeSectionProps {
  isMobile: boolean;
}

export function DemoModeSection({ isMobile: _isMobile }: DemoModeSectionProps) {
  const { t } = useTranslation('quarry');
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<DemoModeResult | null>(null);

  // Fetch current demo mode status
  const {
    data: status,
    isLoading,
    isError: statusError,
  } = useQuery<DemoModeStatus>({
    queryKey: ['settings', 'demo-mode'],
    queryFn: async () => {
      const response = await fetch('/api/settings/demo-mode');
      if (!response.ok) throw new Error('Failed to fetch demo mode status');
      return response.json();
    },
    refetchInterval: 10000,
  });

  // Enable demo mode mutation
  const enableMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/settings/demo-mode/enable', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to enable demo mode');
      return response.json() as Promise<DemoModeResult>;
    },
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ['settings', 'demo-mode'] });
    },
  });

  // Disable demo mode mutation
  const disableMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/settings/demo-mode/disable', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to disable demo mode');
      return response.json() as Promise<DemoModeResult>;
    },
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ['settings', 'demo-mode'] });
    },
  });

  const isToggling = enableMutation.isPending || disableMutation.isPending;
  const toggleError = enableMutation.isError || disableMutation.isError;
  const isEnabled = status?.enabled ?? false;

  const handleToggle = () => {
    if (isToggling) return;
    setLastResult(null);
    if (isEnabled) {
      disableMutation.mutate();
    } else {
      enableMutation.mutate();
    }
  };

  return (
    <div data-testid="settings-demo-mode-section">
      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('demoMode.title')}</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        {t('demoMode.description')}
      </p>

      {/* Toggle Section */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('demoMode.enable')}
              </span>
              {isToggling && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
            </div>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-6">
              {t('demoMode.enableDescription')}
            </p>
          </div>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          ) : (
            <ToggleSwitch
              enabled={isEnabled}
              onToggle={handleToggle}
              disabled={isToggling || statusError}
              testId="demo-mode-toggle"
            />
          )}
        </div>
      </div>

      {/* Status Section */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">{t('demoMode.status')}</h4>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs sm:text-sm">{t('demoMode.loadingStatus')}</span>
            </div>
          ) : statusError ? (
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs sm:text-sm">
                {t('demoMode.unavailable')}
              </span>
            </div>
          ) : status ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('demoMode.status')}</span>
                </div>
                <span
                  className={`text-xs sm:text-sm font-medium ${
                    status.enabled
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                  data-testid="demo-mode-status"
                >
                  {status.enabled ? t('demoMode.active') : t('demoMode.normal')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('demoMode.demoProvider')}</span>
                </div>
                <code
                  className="text-[10px] sm:text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
                  data-testid="demo-mode-provider"
                >
                  {status.provider}
                </code>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('demoMode.demoModel')}</span>
                </div>
                <code
                  className="text-[10px] sm:text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
                  data-testid="demo-mode-model"
                >
                  {status.model}
                </code>
              </div>
              {status.enabled && status.savedConfigCount > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                      {t('demoMode.savedConfigs')}
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400" data-testid="demo-mode-saved-count">
                    {status.savedConfigCount} {t('demoMode.agents')}
                  </span>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Success/Error Feedback */}
      {lastResult && (
        <div
          className="mb-6 sm:mb-8 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
          data-testid="demo-mode-result"
        >
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-1">
            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="font-medium text-xs sm:text-sm">
              {lastResult.enabled ? t('demoMode.enabled') : t('demoMode.disabled')}
            </span>
          </div>
          <p className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 ml-6">
            {lastResult.enabled
              ? `${lastResult.agentsUpdated} ${t('demoMode.agents')} ${t('demoMode.switchedTo', { provider: lastResult.provider, model: lastResult.model })}`
              : `${lastResult.agentsUpdated} ${t('demoMode.agents')} ${t('demoMode.restored')}`}
          </p>
        </div>
      )}

      {toggleError && !lastResult && (
        <div className="mb-6 sm:mb-8 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-xs sm:text-sm">
              {t('demoMode.toggleFailed')}
            </span>
          </div>
        </div>
      )}

      {/* Info Note */}
      <div className="p-3 sm:p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
        <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-400">
          <strong>{t('demoMode.note')}</strong> {t('demoMode.noteText')}
          {t('demoMode.noteText2')}
        </p>
      </div>
    </div>
  );
}
