import type { CSSProperties } from 'react'

/**
 * Renders a workspace icon which may be either:
 *   - a 1–2 letter mark (e.g. "S"), or
 *   - an uploaded image stored as a data URL ("data:image/…").
 *
 * The wrapper preserves the surrounding layout's width/height/border-radius
 * so callers can style the container however they like. When the icon is an
 * image, it fills the container with object-fit: cover.
 */
export function isIconImage(icon: string | null | undefined): boolean {
  return !!icon && (icon.startsWith('data:image/') || icon.startsWith('http://') || icon.startsWith('https://'))
}

export function WorkspaceIconMark({
  icon,
  fallback = '?',
  size = 24,
  radius = 'var(--radius-sm)',
  background = 'var(--color-surface-active)',
  color = 'var(--color-text-secondary)',
  fontSize,
  fontWeight = 700,
  style,
}: {
  icon: string | null | undefined
  fallback?: string
  size?: number
  radius?: string | number
  background?: string
  color?: string
  fontSize?: number
  fontWeight?: number | string
  style?: CSSProperties
}) {
  const isImage = isIconImage(icon)
  const computedFontSize = fontSize ?? Math.round(size * 0.46)
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius,
        background: isImage ? 'transparent' : background,
        color,
        fontSize: computedFontSize,
        fontWeight,
        flexShrink: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      {isImage ? (
        <img
          src={icon as string}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          draggable={false}
        />
      ) : (
        <span>{icon || fallback}</span>
      )}
    </div>
  )
}
