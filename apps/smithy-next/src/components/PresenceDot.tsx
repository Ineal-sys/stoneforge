import { useTranslation } from '@/i18n'

interface PresenceDotProps {
  status: 'online' | 'away' | 'offline'
  size?: number
  style?: React.CSSProperties
}

const statusColors: Record<string, string> = {
  online: 'var(--color-presence-online)',
  away: 'var(--color-presence-away)',
  offline: 'var(--color-presence-offline)',
}

export function PresenceDot({ status, size = 6, style }: PresenceDotProps) {
  const { t } = useTranslation('smithyNext')
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: statusColors[status],
        border: '1.5px solid var(--color-bg)',
        flexShrink: 0,
        ...style,
      }}
      title={t(`presence.${status}`)}
    />
  )
}
