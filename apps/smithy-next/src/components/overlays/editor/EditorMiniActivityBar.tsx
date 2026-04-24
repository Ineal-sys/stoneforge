import { useTranslation } from '@/i18n'
import { Files, Search, Bot, Settings } from 'lucide-react'

export type EditorSidebarPanel = 'explorer' | 'search' | 'agent-changes'

interface Props {
  activePanel: EditorSidebarPanel
  onPanelChange: (panel: EditorSidebarPanel) => void
  sidebarVisible: boolean
  onToggleSidebar: () => void
}

const topItems: { id: EditorSidebarPanel; icon: typeof Files; labelKey: string }[] = [
  { id: 'explorer', icon: Files, labelKey: 'editor.explorer' },
  { id: 'search', icon: Search, labelKey: 'editor.search' },
  { id: 'agent-changes', icon: Bot, labelKey: 'editor.agentChanges' },
]

export function EditorMiniActivityBar({ activePanel, onPanelChange, sidebarVisible, onToggleSidebar }: Props) {
  const { t } = useTranslation('smithyNext')
  const handleClick = (id: EditorSidebarPanel) => {
    if (id === activePanel && sidebarVisible) {
      onToggleSidebar()
    } else {
      onPanelChange(id)
      if (!sidebarVisible) onToggleSidebar()
    }
  }

  return (
    <div style={{
      width: 40, minWidth: 40,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderRight: '1px solid var(--color-border)',
      background: 'var(--color-bg-secondary)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
        {topItems.map(item => {
          const isActive = activePanel === item.id && sidebarVisible
          return (
            <button
              key={item.id}
              onClick={() => handleClick(item.id)}
              title={t(item.labelKey)}
              style={{
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'var(--color-surface-active)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                cursor: 'pointer',
                transition: `all var(--duration-fast)`,
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--color-surface-hover)'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--color-text-tertiary)'
                }
              }}
            >
              <item.icon size={18} strokeWidth={1.5} />
            </button>
          )
        })}
      </div>
      <div>
        <button
          title={t('editor.settings')}
          style={{
            width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer',
            transition: `all var(--duration-fast)`,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--color-surface-hover)'
            e.currentTarget.style.color = 'var(--color-text-secondary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--color-text-tertiary)'
          }}
        >
          <Settings size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
