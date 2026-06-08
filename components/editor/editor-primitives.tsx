import type { ComponentType, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function EditorKicker({
  as = 'p',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'p' | 'span'
}) {
  if (as === 'span') {
    return <span className={cn('editor-kicker', className)} {...props} />
  }

  return <p className={cn('editor-kicker', className)} {...props} />
}

export function EditorEmptyState({
  title,
  description,
  icon: Icon,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ComponentType<{ className?: string }>
  className?: string
}) {
  return (
    <div className={cn('editor-empty editor-empty-state', className)}>
      {Icon ? (
        <span className="editor-empty-state__icon" aria-hidden>
          <Icon className="size-3.5" />
        </span>
      ) : null}
      <div className="min-w-0 space-y-0.5">
        <p className="editor-empty-state__title">{title}</p>
        {description ? (
          <p className="editor-empty-state__description">{description}</p>
        ) : null}
      </div>
    </div>
  )
}

export function EditorLoadingShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'editor-canvas-loading-shell flex h-full w-full items-center justify-center',
        className
      )}
      {...props}
    />
  )
}

export function EditorLoadingCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'editor-loading-card flex flex-col items-center gap-3 px-6 py-5 text-white',
        className
      )}
      {...props}
    />
  )
}

export function EditorStatusNotice({
  tone = 'warning',
  title,
  detail,
  action,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  tone?: 'warning' | 'danger'
  title: ReactNode
  detail?: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      className={cn(
        'editor-status-notice flex items-start gap-2.5 border px-3 py-2 backdrop-blur-xl',
        tone === 'danger' && 'editor-status-notice--danger',
        tone === 'warning' && 'editor-status-notice--warning',
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <EditorKicker className="font-semibold text-current/68">{title}</EditorKicker>
        {detail ? (
          <p className="mt-0.5 text-[12px] leading-4 text-current/92">{detail}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function EditorFloatingHintCard({
  icon,
  label,
  lines,
  className,
}: {
  icon: ReactNode
  label: ReactNode
  lines?: readonly ReactNode[]
  className?: string
}) {
  return (
    <div className={cn('editor-floating-hint-card pointer-events-none', className)}>
      <div className="flex items-center gap-2">
        <div className="editor-floating-hint-card__icon">
          {icon}
        </div>
        <div>
          <EditorKicker>Interaction</EditorKicker>
          <p className="text-[12px] font-semibold text-white">{label}</p>
        </div>
      </div>
      {lines?.length ? (
        <div className="mt-2 space-y-1 text-[11px] text-white/70">
          {lines.map((line, index) => (
            <p key={typeof line === 'string' ? line : index}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function EditorRealtimePreviewFrame({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'editor-realtime-preview-frame relative h-14 w-[4.25rem] shrink-0 overflow-hidden',
        className
      )}
      {...props}
    />
  )
}

export function EditorInsetBlock({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('editor-sidebar-inset', className)}
      {...props}
    />
  )
}

export function EditorTreeSectionCard({
  className,
  ...props
}: HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      className={cn('editor-sidebar-tree-card', className)}
      {...props}
    />
  )
}
