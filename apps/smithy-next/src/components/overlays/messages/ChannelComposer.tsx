import { useState, useRef, useEffect } from 'react'
import { Send, Bold, Italic, Code, Link, List, Paperclip } from 'lucide-react'
import { useTranslation } from '@/i18n'

interface ChannelComposerProps {
  onSend: (content: string) => void
  placeholder?: string
}

export function ChannelComposer({ onSend, placeholder }: ChannelComposerProps) {
  const { t } = useTranslation('smithyNext')
  const [value, setValue] = useState('')
  const [toolbarVisible, setToolbarVisible] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [value])

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  const insertMarkdown = (prefix: string, suffix: string = prefix) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end)
    const newValue = value.slice(0, start) + prefix + selected + suffix + value.slice(end)
    setValue(newValue)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + prefix.length, end + prefix.length)
    }, 0)
  }

  const toolbarButtons = [
    { icon: Bold, title: t('messages.boldTitle'), action: () => insertMarkdown('**') },
    { icon: Italic, title: t('messages.italicTitle'), action: () => insertMarkdown('*') },
    { icon: Code, title: t('messages.codeTitle'), action: () => insertMarkdown('`') },
    { icon: Link, title: t('messages.linkTitle'), action: () => insertMarkdown('[', '](url)') },
    { icon: List, title: t('messages.listTitle'), action: () => insertMarkdown('- ', '') },
  ]

  return (
    <div style={{
      borderTop: '1px solid var(--color-border-subtle)',
      padding: '8px 16px 12px',
      background: 'var(--color-bg)',
    }}>
      {/* Markdown toolbar */}
      {toolbarVisible && (
        <div style={{
          display: 'flex', gap: 2, marginBottom: 4,
          padding: '2px 0',
        }}>
          {toolbarButtons.map(btn => (
            <button
              key={btn.title}
              onClick={btn.action}
              title={btn.title}
              style={{
                width: 26, height: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none',
                color: 'var(--color-text-tertiary)', cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
            >
              <btn.icon size={14} strokeWidth={1.5} />
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '6px 8px',
      }}>
        {/* Attach button */}
        <button
          style={{
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none',
            color: 'var(--color-text-tertiary)', cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', flexShrink: 0,
          }}
          title={t('messages.attachFile')}
        >
          <Paperclip size={14} strokeWidth={1.5} />
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setToolbarVisible(true)}
          placeholder={placeholder ?? t('messages.writeAMessage')}
          rows={1}
          style={{
            flex: 1, resize: 'none',
            background: 'none', border: 'none', outline: 'none',
            fontSize: 13, lineHeight: 1.5,
            color: 'var(--color-text)',
            fontFamily: 'inherit',
            minHeight: 24, maxHeight: 160,
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!value.trim()}
          style={{
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: value.trim() ? 'var(--color-primary)' : 'var(--color-surface)',
            border: 'none', borderRadius: 'var(--radius-sm)',
            color: value.trim() ? 'white' : 'var(--color-text-tertiary)',
            cursor: value.trim() ? 'pointer' : 'default',
            flexShrink: 0,
            transition: 'background var(--duration-fast)',
          }}
          title={t('messages.sendCmdEnter')}
        >
          <Send size={13} />
        </button>
      </div>

      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4, textAlign: 'right' }}>
        {t('messages.cmdEnterToSend')}
      </div>
    </div>
  )
}
