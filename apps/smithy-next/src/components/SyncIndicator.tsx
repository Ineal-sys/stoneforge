import { Loader2 } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { SyncStatus } from '../mock-data'

interface SyncIndicatorProps {
  status: SyncStatus
}

export function SyncIndicator({ status }: SyncIndicatorProps) {
  const { t } = useTranslation('smithyNext')
  const config: Record<SyncStatus, { label: string; color: string; spinning?: boolean }> = {
    synced: { label: t('syncIndicator.synced'), color: 'var(--color-sync-active)' },
    syncing: { label: t('syncIndicator.syncing'), color: 'var(--color-sync-syncing)', spinning: true },
    offline: { label: t('syncIndicator.offline'), color: 'var(--color-sync-offline)' },
    error: { label: t('syncIndicator.syncError'), color: 'var(--color-sync-error)' },
  }
  const { label, color, spinning } = config[status]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        fontSize: 11,
        color,
        fontWeight: 500,
      }}
    >
      {spinning ? (
        <Loader2 size={10} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />
      ) : (
        <div style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
        }} />
      )}
      {label}
    </div>
  )
}
