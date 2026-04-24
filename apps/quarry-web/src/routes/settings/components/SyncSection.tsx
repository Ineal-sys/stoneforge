/**
 * Sync Section component for settings
 */

import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Download, Upload, Loader2, HardDrive, AlertCircle, AlertTriangle, Check } from 'lucide-react';
import { useTranslation } from '@stoneforge/i18n';
import type { SyncStatus, ExportResult, ImportResult, SyncSettings } from '../types';
import { DEFAULT_SYNC_SETTINGS } from '../constants';
import { getStoredSyncSettings, setStoredSyncSettings } from '../utils';
import { ToggleSwitch } from './ToggleSwitch';

interface SyncSectionProps {
  isMobile: boolean;
}

export function SyncSection({ isMobile }: SyncSectionProps) {
  const { t } = useTranslation('quarry');
  const queryClient = useQueryClient();
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(DEFAULT_SYNC_SETTINGS);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load settings on mount
  useEffect(() => {
    setSyncSettings(getStoredSyncSettings());
  }, []);

  // Fetch sync status
  const { data: syncStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<SyncStatus>({
    queryKey: ['sync', 'status'],
    queryFn: async () => {
      const response = await fetch('/api/sync/status');
      if (!response.ok) throw new Error('Failed to fetch sync status');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async (includeEphemeral: boolean = false) => {
      const response = await fetch('/api/sync/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeEphemeral }),
      });
      if (!response.ok) throw new Error('Failed to export');
      return response.json() as Promise<ExportResult>;
    },
    onSuccess: (data) => {
      setExportResult(data);
      setImportResult(null);
      // Update last export time in settings
      const newSettings = { ...syncSettings, lastExportAt: data.exportedAt };
      setSyncSettings(newSettings);
      setStoredSyncSettings(newSettings);
      // Refetch status to update dirty count
      refetchStatus();
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (params: { elements: string; dependencies?: string; dryRun?: boolean; force?: boolean }) => {
      const response = await fetch('/api/sync/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!response.ok) throw new Error('Failed to import');
      return response.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setImportResult(data);
      setExportResult(null);
      // Update last import time in settings
      const newSettings = { ...syncSettings, lastImportAt: data.importedAt };
      setSyncSettings(newSettings);
      setStoredSyncSettings(newSettings);
      // Invalidate all queries since data changed
      queryClient.invalidateQueries();
    },
  });

  const handleExport = () => {
    exportMutation.mutate(false);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      // Read all selected files
      let elementsContent = '';
      let dependenciesContent = '';

      for (const file of Array.from(files)) {
        const content = await file.text();
        if (file.name.includes('elements')) {
          elementsContent = content;
        } else if (file.name.includes('dependencies')) {
          dependenciesContent = content;
        } else {
          // Assume it's elements if not specified
          elementsContent = content;
        }
      }

      if (!elementsContent) {
        alert(t('sync.noValidFile'));
        return;
      }

      importMutation.mutate({ elements: elementsContent, dependencies: dependenciesContent });
    } catch (error) {
      console.error('Failed to read files:', error);
      alert(t('sync.failedToRead'));
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const updateAutoExport = (enabled: boolean) => {
    const newSettings = { ...syncSettings, autoExport: enabled };
    setSyncSettings(newSettings);
    setStoredSyncSettings(newSettings);
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return t('sync.never');
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div data-testid="settings-sync-section">
      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('sync.title')}</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        {t('sync.description')}
      </p>

      {/* Status Section */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">{t('sync.status')}</h4>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 space-y-3">
          {statusLoading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs sm:text-sm">{t('sync.loadingStatus')}</span>
            </div>
          ) : syncStatus ? (
            <>
              <div className={`flex gap-2 ${isMobile ? 'flex-col' : 'items-center justify-between'}`}>
                <div className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('sync.exportPath')}</span>
                </div>
                <code className="text-[10px] sm:text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded truncate max-w-full" data-testid="export-path">
                  {syncStatus.exportPath}
                </code>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('sync.pendingChanges')}</span>
                </div>
                <span
                  className={`text-xs sm:text-sm font-medium ${syncStatus.hasPendingChanges ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}
                  data-testid="dirty-element-count"
                >
                  {syncStatus.dirtyElementCount} {t('sync.elements')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('sync.lastExport')}</span>
                </div>
                <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400" data-testid="last-export-time">
                  {formatTimestamp(syncSettings.lastExportAt)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('sync.lastImport')}</span>
                </div>
                <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400" data-testid="last-import-time">
                  {formatTimestamp(syncSettings.lastImportAt)}
                </span>
              </div>
            </>
          ) : (
            <div className="text-xs sm:text-sm text-red-500">{t('sync.failedToLoadStatus')}</div>
          )}
        </div>
      </div>

      {/* Auto-Export Toggle */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">{t('sync.autoExport')}</h4>
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="min-w-0 flex-1">
            <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 block">{t('sync.enableAutoExport')}</span>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {t('sync.autoExportDescription')}
            </p>
          </div>
          <ToggleSwitch
            enabled={syncSettings.autoExport}
            onToggle={() => updateAutoExport(!syncSettings.autoExport)}
            disabled={true} // Not yet implemented
            testId="auto-export-toggle"
          />
        </div>
      </div>

      {/* Export Section */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">{t('sync.exportData')}</h4>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
          <p className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
            {t('sync.exportDescription')}
          </p>
          <button
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className={`flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm min-h-[44px] ${isMobile ? 'w-full' : ''}`}
            data-testid="export-now-button"
          >
            {exportMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {exportMutation.isPending ? t('sync.exporting') : t('sync.exportNow')}
          </button>

          {/* Export Result */}
          {exportResult && (
            <div className="mt-3 sm:mt-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" data-testid="export-result">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="font-medium text-xs sm:text-sm">{t('sync.exportSuccessful')}</span>
              </div>
              <div className="text-[10px] sm:text-sm text-green-600 dark:text-green-400 space-y-1">
                <div>{t('sync.elementsExported')} {exportResult.elementsExported}</div>
                <div>{t('sync.dependenciesExported')} {exportResult.dependenciesExported}</div>
                <div className="text-[10px] sm:text-xs mt-2 break-all">
                  <div>{t('sync.elementsFile')} {exportResult.elementsFile}</div>
                  <div>{t('sync.dependenciesFile')} {exportResult.dependenciesFile}</div>
                </div>
              </div>
            </div>
          )}

          {exportMutation.isError && (
            <div className="mt-3 sm:mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm">{t('sync.exportFailed')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import Section */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">{t('sync.importData')}</h4>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
          <p className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
            {t('sync.importDescription')}
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".jsonl"
            multiple
            className="hidden"
            data-testid="import-file-input"
          />
          <button
            onClick={handleImportClick}
            disabled={importMutation.isPending}
            className={`flex items-center justify-center gap-2 px-4 py-3 sm:py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm min-h-[44px] ${isMobile ? 'w-full' : ''}`}
            data-testid="import-button"
          >
            {importMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {importMutation.isPending ? t('sync.importing') : t('sync.importFromFile')}
          </button>

          {/* Import Result */}
          {importResult && (
            <div
              className={`mt-3 sm:mt-4 p-3 rounded-lg ${
                importResult.errors.length > 0
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                  : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              }`}
              data-testid="import-result"
            >
              <div className={`flex items-center gap-2 ${
                importResult.errors.length > 0
                  ? 'text-yellow-700 dark:text-yellow-300'
                  : 'text-green-700 dark:text-green-300'
              } mb-2`}>
                {importResult.errors.length > 0 ? (
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
                <span className="font-medium text-xs sm:text-sm">
                  {importResult.errors.length > 0 ? t('sync.importWithWarnings') : t('sync.importSuccessful')}
                </span>
              </div>
              <div className={`text-[10px] sm:text-sm ${
                importResult.errors.length > 0
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-green-600 dark:text-green-400'
              } space-y-1`}>
                <div>{t('sync.elementsImported')} {importResult.elementsImported}</div>
                <div>{t('sync.elementsSkipped')} {importResult.elementsSkipped}</div>
                <div>{t('sync.dependenciesImported')} {importResult.dependenciesImported}</div>
                <div>{t('sync.dependenciesSkipped')} {importResult.dependenciesSkipped}</div>
                {importResult.conflicts.length > 0 && (
                  <div className="mt-2">{t('sync.conflictsResolved')} {importResult.conflicts.length}</div>
                )}
                {importResult.errors.length > 0 && (
                  <div className="mt-2 text-[10px] sm:text-xs text-red-600 dark:text-red-400">
                    {t('sync.errors')} {importResult.errors.length}
                    <ul className="list-disc list-inside mt-1">
                      {importResult.errors.slice(0, 3).map((err, i) => (
                        <li key={i} className="break-all">{err.file}:{err.line} - {err.message}</li>
                      ))}
                      {importResult.errors.length > 3 && (
                        <li>{t('sync.moreErrors', { count: importResult.errors.length - 3 })}</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {importMutation.isError && (
            <div className="mt-3 sm:mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm">{t('sync.importFailed')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Note */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        {t('sync.gitlNote')}
      </p>
    </div>
  );
}
