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

type ViewerAdminPanelHeaderProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: React.ReactNode
  description?: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
  titleClassName?: string
  descriptionClassName?: string
}

export function ViewerAdminPanelHeader({
  title,
  description,
  leading,
  trailing,
  titleClassName,
  descriptionClassName,
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
          <h3 className={cn('truncate text-sm font-medium', titleClassName)}>{title}</h3>
          {description ? (
            <p className={cn('truncate text-xs text-muted-foreground', descriptionClassName)}>
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  )
}

export function ViewerAdminPanelBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('overflow-y-auto p-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

type ViewerAdminCenteredPanelProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: React.ReactNode
  description?: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
  maxWidthClass?: string
  variant?: ViewerAdminPanelProps['variant']
  surfaceClassName?: string
  innerClassName?: string
  mainClassName?: string
  headerClassName?: string
  bodyClassName?: string
}

export function ViewerAdminCenteredPanel({
  title,
  description,
  leading,
  trailing,
  maxWidthClass = 'max-w-md',
  variant = 'accent',
  surfaceClassName,
  innerClassName,
  mainClassName,
  headerClassName,
  bodyClassName,
  className,
  children,
  ...props
}: ViewerAdminCenteredPanelProps) {
  return (
    <ViewerAdminSurfaceShell
      className={cn('min-h-svh overflow-hidden', surfaceClassName)}
      innerClassName={cn('min-h-svh', innerClassName)}
    >
      <main className={cn('flex min-h-svh items-center justify-center px-6 py-10', mainClassName)}>
        <ViewerAdminPanel
          variant={variant}
          className={cn('w-full overflow-hidden rounded-[22px]', maxWidthClass, className)}
          {...props}
        >
          <ViewerAdminPanelHeader
            title={title}
            description={description}
            leading={leading}
            trailing={trailing}
            className={cn('px-5 py-4', headerClassName)}
          />
          {children ? (
            <ViewerAdminPanelBody className={cn('space-y-4 p-5', bodyClassName)}>
              {children}
            </ViewerAdminPanelBody>
          ) : null}
        </ViewerAdminPanel>
      </main>
    </ViewerAdminSurfaceShell>
  )
}

type ViewerAdminNoticeProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: 'info' | 'warning' | 'danger'
  icon?: React.ReactNode
}

export function ViewerAdminNotice({
  tone = 'info',
  icon,
  className,
  children,
  ...props
}: ViewerAdminNoticeProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-2xl border px-3 py-3 text-sm',
        tone === 'info' && 'border-sky-300/20 bg-sky-400/10 text-sky-50',
        tone === 'warning' && 'border-amber-300/20 bg-amber-400/10 text-amber-50',
        tone === 'danger' && 'border-rose-300/20 bg-rose-400/10 text-rose-100',
        className
      )}
      {...props}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0 break-words">{children}</div>
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

export function ViewerAdminSoftLinkCard({
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={cn(
        'viewer-admin-soft-card block transition hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25',
        className
      )}
      {...props}
    />
  )
}

export function ViewerAdminLinkCard({
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <ViewerAdminSoftLinkCard
      className={cn('viewer-admin-link-card group flex items-start justify-between gap-3 p-4', className)}
      {...props}
    />
  )
}

export function ViewerAdminHeroCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <ViewerAdminSoftCard className={cn('viewer-admin-inspector-hero p-3', className)} {...props} />
}

type ViewerAdminContentCardProps = React.HTMLAttributes<HTMLDivElement> & {
  density?: 'compact' | 'comfortable' | 'spacious'
}

export function ViewerAdminContentCard({
  density = 'comfortable',
  className,
  ...props
}: ViewerAdminContentCardProps) {
  return (
    <ViewerAdminSoftCard
      className={cn(
        density === 'compact' && 'p-2.5',
        density === 'comfortable' && 'p-3',
        density === 'spacious' && 'p-4',
        className
      )}
      {...props}
    />
  )
}

type ViewerAdminRecordCardProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: React.ReactNode
  meta?: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
  titleClassName?: string
  metaClassName?: string
  headerClassName?: string
  bodyClassName?: string
  density?: ViewerAdminContentCardProps['density']
}

export function ViewerAdminRecordCard({
  title,
  meta,
  leading,
  trailing,
  titleClassName,
  metaClassName,
  headerClassName,
  bodyClassName,
  density = 'comfortable',
  className,
  children,
  ...props
}: ViewerAdminRecordCardProps) {
  return (
    <ViewerAdminContentCard density={density} className={className} {...props}>
      <div
        className={cn(
          'flex items-start justify-between gap-3',
          headerClassName
        )}
      >
        <div className="min-w-0 flex items-start gap-2.5">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0">
            <div className={cn('font-medium text-foreground', titleClassName)}>
              {title}
            </div>
            {meta ? (
              <div className={cn('mt-1 text-xs text-muted-foreground', metaClassName)}>
                {meta}
              </div>
            ) : null}
          </div>
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      {children ? <div className={cn('mt-3', bodyClassName)}>{children}</div> : null}
    </ViewerAdminContentCard>
  )
}

type ViewerAdminKickerProps = React.HTMLAttributes<HTMLSpanElement> & {
  leading?: React.ReactNode
}

export function ViewerAdminKicker({
  leading,
  className,
  children,
  ...props
}: ViewerAdminKickerProps) {
  return (
    <span
      className={cn(
        'viewer-admin-kicker',
        leading && 'inline-flex items-center gap-1.5',
        className
      )}
      {...props}
    >
      {leading ? <span className="shrink-0">{leading}</span> : null}
      {children}
    </span>
  )
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

type ViewerAdminControlGroupProps = React.HTMLAttributes<HTMLDivElement> & {
  title: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  description?: React.ReactNode
  actionsClassName?: string
}

export function ViewerAdminControlGroup({
  title,
  icon,
  description,
  actionsClassName,
  className,
  children,
  ...props
}: ViewerAdminControlGroupProps) {
  return (
    <ViewerAdminSection title={title} icon={icon} className={cn('space-y-2', className)} {...props}>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      <div className={cn('flex flex-wrap gap-2', actionsClassName)}>{children}</div>
    </ViewerAdminSection>
  )
}

export function ViewerAdminInfoList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <ViewerAdminContentCard
      density="compact"
      className={cn('space-y-2 text-sm', className)}
      {...props}
    />
  )
}

export function ViewerAdminSidebarFooterCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <ViewerAdminPanel
      variant="soft"
      className={cn(
        'space-y-2 rounded-xl p-3 text-xs group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
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

export type ViewerAdminMetricRow = {
  label: React.ReactNode
  value: React.ReactNode
}

type ViewerAdminMetricTileProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  size?: 'compact' | 'sm' | 'md' | 'lg'
  labelClassName?: string
  valueClassName?: string
  density?: 'compact' | 'comfortable'
}

export function ViewerAdminMetricTile({
  label,
  value,
  hint,
  size = 'md',
  labelClassName,
  valueClassName,
  density = 'comfortable',
  className,
  ...props
}: ViewerAdminMetricTileProps) {
  const valueSizeClass =
    size === 'compact'
      ? 'text-sm'
      : size === 'sm'
        ? 'text-lg'
        : size === 'lg'
          ? 'text-3xl'
          : 'text-2xl'

  return (
    <ViewerAdminPanel
      variant="soft"
      className={cn(
        'rounded-2xl',
        density === 'compact' ? 'px-2.5 py-2.5' : 'px-4 py-3',
        className
      )}
      {...props}
    >
      <ViewerAdminKicker className={cn('block', labelClassName)}>{label}</ViewerAdminKicker>
      <div className={cn('font-semibold text-foreground', density === 'compact' ? 'mt-1' : 'mt-2', valueSizeClass, valueClassName)}>
        {value}
      </div>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </ViewerAdminPanel>
  )
}

type ViewerAdminMetricListCardProps = React.HTMLAttributes<HTMLDivElement> & {
  title: React.ReactNode
  rows: ViewerAdminMetricRow[]
}

export function ViewerAdminMetricListCard({
  title,
  rows,
  className,
  ...props
}: ViewerAdminMetricListCardProps) {
  return (
    <ViewerAdminContentCard
      density="comfortable"
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    >
      <div className="font-medium text-foreground">{title}</div>
      <div className="mt-2 space-y-1">
        {rows.map((row, index) => (
          <ViewerAdminInfoRow
            key={`${index}-${String(row.label)}`}
            label={row.label}
            value={row.value}
            className="gap-4 text-xs"
            valueClassName="font-medium text-foreground"
          />
        ))}
      </div>
    </ViewerAdminContentCard>
  )
}

export function ViewerAdminStatGrid({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <ViewerAdminContentCard
      density="compact"
      className={cn('grid grid-cols-3 gap-2', className)}
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
  return (
    <ViewerAdminContentCard
      density="comfortable"
      className={cn('viewer-admin-empty', className)}
      {...props}
    />
  )
}

type ViewerAdminEmptyStateProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  align?: 'start' | 'center'
  density?: 'compact' | 'comfortable'
  iconClassName?: string
  titleClassName?: string
  descriptionClassName?: string
}

export function ViewerAdminEmptyState({
  title,
  description,
  icon: Icon,
  align = 'start',
  density = 'comfortable',
  iconClassName,
  titleClassName,
  descriptionClassName,
  className,
  children,
  ...props
}: ViewerAdminEmptyStateProps) {
  const isCentered = align === 'center'

  return (
    <ViewerAdminEmptyCard
      className={cn(
        'viewer-admin-empty-state border-dashed text-sm',
        density === 'compact' ? 'p-3' : 'p-4',
        isCentered
          ? 'flex flex-col items-center justify-center gap-2 text-center'
          : 'flex items-start gap-3',
        className
      )}
      {...props}
    >
      {Icon ? (
        <div
          className={cn(
            'viewer-admin-empty-state__icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/6',
            isCentered && 'mx-auto',
            density === 'compact' && 'h-8 w-8 rounded-lg',
            iconClassName
          )}
        >
          <Icon className={cn('h-4 w-4', density === 'compact' && 'h-3.5 w-3.5')} />
        </div>
      ) : null}
      <div className={cn('viewer-admin-empty-state__body min-w-0 space-y-1', isCentered && 'max-w-sm')}>
        <p className={cn('viewer-admin-empty-state__title font-medium text-foreground', titleClassName)}>
          {title}
        </p>
        {description ? (
          <p className={cn('viewer-admin-empty-state__description text-muted-foreground', descriptionClassName)}>
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </ViewerAdminEmptyCard>
  )
}

type ViewerAdminSpotlightEmptyStateProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  items?: readonly React.ReactNode[]
}

export function ViewerAdminSpotlightEmptyState({
  eyebrow,
  title,
  icon: Icon,
  items,
  className,
  children,
  ...props
}: ViewerAdminSpotlightEmptyStateProps) {
  return (
    <ViewerAdminPanel
      variant="soft"
      className={cn('viewer-admin-empty-spotlight space-y-4 border-dashed p-5', className)}
      {...props}
    >
      <div className="space-y-2">
        {eyebrow ? <ViewerAdminKicker className="block">{eyebrow}</ViewerAdminKicker> : null}
        <div className="flex items-center gap-3">
          {Icon ? (
            <div className="viewer-admin-empty-spotlight__icon flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/6 shadow-none">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h4 className="viewer-admin-empty-spotlight__title text-lg font-semibold">
              {title}
            </h4>
          </div>
        </div>
      </div>

      {items && items.length > 0 ? (
        <div className="viewer-admin-empty-spotlight__items flex flex-wrap gap-2">
          {items.map((item, index) => (
            <ViewerAdminContentCard
              key={index}
              density="compact"
              className="viewer-admin-empty-spotlight__item rounded-full px-3 py-1.5 text-xs"
            >
              {item}
            </ViewerAdminContentCard>
          ))}
        </div>
      ) : null}

      {children}
    </ViewerAdminPanel>
  )
}
