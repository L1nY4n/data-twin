import type * as React from 'react'
import { cn } from '@/lib/utils'

type ViewerAdminSurfaceShellProps = React.HTMLAttributes<HTMLDivElement> & {
  innerClassName?: string
}

export function ViewerAdminSurfaceShell({
  className,
  innerClassName,
  children,
  ...props
}: ViewerAdminSurfaceShellProps) {
  return (
    <div
      className={cn(
        'dark editor-surface viewer-admin-surface viewer-admin-shell relative',
        className
      )}
      {...props}
    >
      <div aria-hidden className="editor-shell-backdrop absolute inset-0" />
      <div aria-hidden className="editor-shell-grid absolute inset-0" />
      <div aria-hidden className="editor-shell-vignette absolute inset-0" />
      <div className={cn('relative z-10', innerClassName)}>{children}</div>
    </div>
  )
}

type ViewerAdminToolbarBarProps = React.HTMLAttributes<HTMLDivElement> & {
  as?: 'div' | 'header'
}

export function ViewerAdminToolbarBar({
  as: Component = 'div',
  className,
  ...props
}: ViewerAdminToolbarBarProps) {
  return <Component className={cn('viewer-admin-toolbar', className)} {...props} />
}

type ViewerAdminPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'soft' | 'accent'
}

export function ViewerAdminPanel({
  variant = 'default',
  className,
  ...props
}: ViewerAdminPanelProps) {
  return (
    <div
      className={cn(
        'viewer-admin-panel',
        variant === 'soft' && 'viewer-admin-panel--soft',
        variant === 'accent' && 'viewer-admin-panel--accent',
        className
      )}
      {...props}
    />
  )
}

type ViewerAdminEdgePanelProps = React.HTMLAttributes<HTMLDivElement> & {
  widthClass: string
  variant?: ViewerAdminPanelProps['variant']
}

export function ViewerAdminEdgePanel({
  widthClass,
  variant = 'default',
  className,
  ...props
}: ViewerAdminEdgePanelProps) {
  return (
    <ViewerAdminPanel
      variant={variant}
      className={cn(
        'viewer-admin-side-panel relative mt-2 flex shrink-0 flex-col overflow-hidden rounded-[22px] transition-all duration-300',
        widthClass,
        className
      )}
      {...props}
    />
  )
}

type ViewerAdminPanelHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  title: React.ReactNode
  description?: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

export function ViewerAdminPanelHeader({
  title,
  description,
  leading,
  trailing,
  className,
  ...props
}: ViewerAdminPanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-b border-white/8 p-3',
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex items-center gap-2">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{title}</h3>
          {description ? (
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  )
}

export function ViewerAdminSidePanelBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('viewer-admin-side-panel flex h-full flex-col text-white', className)}
      {...props}
    />
  )
}

export function ViewerAdminSoftCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('viewer-admin-soft-card', className)} {...props} />
}

type ViewerAdminSectionProps = React.HTMLAttributes<HTMLDivElement> & {
  title: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  headingClassName?: string
}

export function ViewerAdminSection({
  title,
  icon: Icon,
  className,
  headingClassName,
  children,
  ...props
}: ViewerAdminSectionProps) {
  return (
    <div className={className} {...props}>
      <h4
        className={cn(
          'mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground',
          headingClassName
        )}
      >
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {title}
      </h4>
      {children}
    </div>
  )
}

export function ViewerAdminInfoList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <ViewerAdminSoftCard className={cn('space-y-2 p-2.5 text-sm', className)} {...props} />
  )
}

type ViewerAdminInfoRowProps = React.HTMLAttributes<HTMLDivElement> & {
  label: React.ReactNode
  value: React.ReactNode
  labelClassName?: string
  valueClassName?: string
}

export function ViewerAdminInfoRow({
  label,
  value,
  className,
  labelClassName,
  valueClassName,
  ...props
}: ViewerAdminInfoRowProps) {
  return (
    <div className={cn('flex justify-between gap-3 text-sm', className)} {...props}>
      <span className={cn('text-muted-foreground', labelClassName)}>{label}</span>
      <div className={cn('text-right', valueClassName)}>{value}</div>
    </div>
  )
}

export function ViewerAdminStatGrid({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <ViewerAdminSoftCard
      className={cn('grid grid-cols-3 gap-2 p-2.5', className)}
      {...props}
    />
  )
}

type ViewerAdminStatCellProps = React.HTMLAttributes<HTMLDivElement> & {
  label: React.ReactNode
  value: React.ReactNode
}

export function ViewerAdminStatCell({
  label,
  value,
  className,
  ...props
}: ViewerAdminStatCellProps) {
  return (
    <div className={cn('text-center', className)} {...props}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}

export function ViewerAdminEmptyCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('viewer-admin-empty', className)} {...props} />
}
