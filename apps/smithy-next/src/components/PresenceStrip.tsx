import type { StoneforgeUser, PresenceEntry } from '../mock-data'
import { useTranslation } from '@/i18n'
import { UserAvatar } from './UserAvatar'
import { Tooltip } from './Tooltip'

export function PresenceStrip({ users, presence, max = 4 }: { users: StoneforgeUser[]; presence: PresenceEntry[]; max?: number }) {
  const { t } = useTranslation('smithyNext')
  const viewLabels: Record<string, string> = {
    kanban: t('presence.tasks'),
    'merge-requests': t('presence.mergeRequests'),
    ci: t('presence.ciCd'),
    preview: t('presence.preview'),
    automations: t('presence.automations'),
    sessions: t('presence.sessions'),
    agents: t('presence.agents'),
    editor: t('presence.editor'),
    runtimes: t('presence.runtimes'),
    settings: t('presence.settings'),
  }
  const visible = users.slice(0, max)
  const overflow = users.length - max

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {visible.map((user, i) => {
        const entry = presence.find(p => p.userId === user.id)
        const viewLabel = entry?.activeView ? viewLabels[entry.activeView] || entry.activeView : undefined
        const tooltip = `${user.name}${viewLabel ? ` — ${t('presence.viewing')} ${viewLabel}` : ''}`

        return (
          <Tooltip key={user.id} label={tooltip} placement="bottom">
            <div style={{ marginLeft: i === 0 ? 0 : -6, position: 'relative', zIndex: visible.length - i }}>
              <UserAvatar
                user={user}
                size={22}
                showPresence
                style={{
                  border: '2px solid var(--color-bg)',
                  borderRadius: '50%',
                }}
              />
            </div>
          </Tooltip>
        )
      })}
      {overflow > 0 && (
        <Tooltip label={t('presence.more', { count: overflow })} placement="bottom">
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              backgroundColor: 'var(--color-surface-active)',
              color: 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 600,
              marginLeft: -6,
              border: '2px solid var(--color-bg)',
              position: 'relative',
              zIndex: 0,
              lineHeight: 1,
            }}
          >
            +{overflow}
          </div>
        </Tooltip>
      )}
    </div>
  )
}
