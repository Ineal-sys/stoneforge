import { MousePointer2, Pencil, Square, ArrowUpRight, MessageCircle } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { Tooltip } from '../../Tooltip'
import type { DesignAnnotationTool } from '../../../mock-data'

interface DesignToolbarProps {
  activeTool: DesignAnnotationTool
  onToolChange: (tool: DesignAnnotationTool) => void
}

const tools: { id: DesignAnnotationTool; icon: typeof Pencil; labelKey: string }[] = [
  { id: 'select', icon: MousePointer2, labelKey: 'designMode.select' },
  { id: 'comment', icon: MessageCircle, labelKey: 'designMode.comment' },
  { id: 'draw', icon: Pencil, labelKey: 'designMode.draw' },
  { id: 'rectangle', icon: Square, labelKey: 'designMode.rectangle' },
  { id: 'arrow', icon: ArrowUpRight, labelKey: 'designMode.arrow' },
]

export function DesignToolbar({ activeTool, onToolChange }: DesignToolbarProps) {
  const { t } = useTranslation('smithyNext')
  return (
    <div style={{
      position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 2, padding: 4,
      background: 'var(--color-bg)', border: '1px solid var(--color-border)',
      borderRadius: 20, boxShadow: 'var(--shadow-lg)', zIndex: 20,
    }}>
      {tools.map(tool => {
        const isActive = tool.id === activeTool
        const Icon = tool.icon
        return (
          <Tooltip key={tool.id} label={t(tool.labelKey)} placement="bottom">
            <button
              onClick={() => onToolChange(tool.id)}
              style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'var(--color-primary)' : 'none',
                border: 'none', borderRadius: 16,
                color: isActive ? '#fff' : 'var(--color-text-secondary)',
                cursor: 'pointer', transition: 'all var(--duration-fast)',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--color-primary)' : 'none' }}
            >
              <Icon size={14} strokeWidth={1.5} />
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
