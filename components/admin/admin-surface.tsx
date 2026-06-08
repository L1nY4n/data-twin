import type * as React from 'react'
import { Inbox, ShieldAlert, Workflow } from 'lucide-react'
import type { AdminSection } from '@/lib/digital-twin/admin'
import { getAdminSectionMeta } from '@/components/admin/admin-meta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  ViewerAdminEmptyState,
  ViewerAdminKicker,
  ViewerAdminMetricTile,
  ViewerAdminPanel,
  ViewerAdminPanelBody,
  ViewerAdminPanelHeader,
  ViewerAdminRecordCard,
  ViewerAdminSpotlightEmptyState,
} from '@/components/viewer-admin/primitives'
import { cn } from '@/lib/utils'

function StatusBanner({
  message,
  isLoading,
  inverted = false,
}: {
  message: string
  isLoading?: boolean
  inverted?: boolean
}) {
  return (
    <ViewerAdminPanel
      variant="soft"
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1.5 text-xs',
        inverted
          ? 'border-white/10 bg-white/5 text-white/80'
          : 'bg-background text-muted-foreground'
      )}
    >
      {isLoading ? '正在加载...' : message || '就绪'}
    </ViewerAdminPanel>
  )
}

export function SaveLiveWarning({ inverted = false }: { inverted?: boolean }) {
  return (
    <ViewerAdminPanel
      variant="soft"
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs',
        inverted
          ? 'border-amber-400/25 bg-amber-300/10 text-amber-50'
          : 'border-amber-300/30 bg-amber-300/10 text-amber-100/80'
      )}
    >
      <ShieldAlert className="h-4 w-4" />
      <span className="font-medium">配置发布</span>
    </ViewerAdminPanel>
  )
}

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return <ViewerAdminMetricTile label={label} value={value} hint={hint} size="lg" />
}

export function AdminMetricTile({
  label,
  value,
  size = 'md',
}: {
  label: string
  value: React.ReactNode
  size?: 'md' | 'sm'
}) {
  return <ViewerAdminMetricTile label={label} value={value} size={size} />
}

export const ADMIN_VALUE_PENDING = '未加载'
export const ADMIN_VALUE_UNSET = '未配置'
export const ADMIN_VALUE_UNSELECTED = '未选择'

export function adminDisplayValue(
  value: React.ReactNode | null | undefined,
  fallback: React.ReactNode = ADMIN_VALUE_UNSET
) {
  if (value == null) return fallback
  if (typeof value === 'string' && value.trim().length === 0) return fallback
  return value
}

export interface SectionMetric {
  label: string
  value: React.ReactNode
}

export interface SectionRailCard {
  title: string
  value: React.ReactNode
}

export function AdminButton({
  tone = 'default',
  size = 'sm',
  variant,
  className,
  ...props
}: React.ComponentProps<typeof Button> & {
  tone?: 'default' | 'primary' | 'danger' | 'ghost'
}) {
  const resolvedVariant =
    variant ??
    (tone === 'primary'
      ? 'default'
      : tone === 'danger'
        ? 'destructive'
        : tone === 'ghost'
          ? 'ghost'
          : 'outline')

  return (
    <Button
      variant={resolvedVariant}
      size={size}
      className={cn(
        'h-9 rounded-full px-4 shadow-none',
        size === 'icon' && 'size-9 px-0',
        size === 'icon-sm' && 'size-8 px-0',
        size === 'icon-lg' && 'size-10 px-0',
        className
      )}
      {...props}
    />
  )
}

export function AdminSelect({
  className,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9 w-full rounded-md border bg-background px-2 text-sm shadow-none transition focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export function AdminInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn('admin-input h-9 rounded-full shadow-none', className)}
      {...props}
    />
  )
}

export function AdminTextarea({
  className,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      className={cn('admin-textarea rounded-[18px] shadow-none', className)}
      {...props}
    />
  )
}

export function AdminBadge({
  className,
  ...props
}: React.ComponentProps<typeof Badge>) {
  return (
    <Badge
      className={cn('admin-badge rounded-full px-2.5 text-[10px]', className)}
      {...props}
    />
  )
}

export function AdminSelectableCard({
  active = false,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> & {
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        'admin-selectable-card w-full text-left text-sm transition',
        active && 'is-active',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

type AdminSelectableRecordCardProps = Omit<
  React.ComponentProps<typeof AdminSelectableCard>,
  'children'
> & {
  title: React.ReactNode
  meta?: React.ReactNode
  trailing?: React.ReactNode
  footer?: React.ReactNode
  titleClassName?: string
  metaClassName?: string
  headerClassName?: string
  children?: React.ReactNode
}

export function AdminSelectableRecordCard({
  title,
  meta,
  trailing,
  footer,
  titleClassName,
  metaClassName,
  headerClassName,
  className,
  children,
  ...props
}: AdminSelectableRecordCardProps) {
  return (
    <AdminSelectableCard className={cn('px-3 py-3', className)} {...props}>
      <div
        className={cn(
          'flex items-start justify-between gap-3',
          headerClassName
        )}
      >
        <div className="min-w-0">
          <div className={cn('font-medium text-foreground', titleClassName)}>{title}</div>
          {meta ? (
            <div className={cn('mt-1 text-xs text-muted-foreground', metaClassName)}>
              {meta}
            </div>
          ) : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      {footer ? (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          {footer}
        </div>
      ) : null}
      {children}
    </AdminSelectableCard>
  )
}

export function AdminInsetBlock({
  tone = 'default',
  className,
  ...props
}: React.ComponentProps<'div'> & {
  tone?: 'default' | 'warning'
}) {
  return (
    <div
      className={cn(
        'admin-inset-block border p-4',
        tone === 'warning' && 'admin-inset-block--warning',
        className
      )}
      {...props}
    />
  )
}

type AdminRecordCardProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: React.ReactNode
  meta?: React.ReactNode
  trailing?: React.ReactNode
  titleClassName?: string
  metaClassName?: string
  headerClassName?: string
  bodyClassName?: string
  density?: 'compact' | 'comfortable' | 'spacious'
}

export function AdminRecordCard({
  title,
  meta,
  trailing,
  titleClassName,
  metaClassName,
  headerClassName,
  bodyClassName,
  density = 'spacious',
  className,
  children,
  ...props
}: AdminRecordCardProps) {
  return (
    <ViewerAdminRecordCard
      title={title}
      meta={meta}
      trailing={trailing}
      titleClassName={cn('leading-6', titleClassName)}
      metaClassName={metaClassName}
      headerClassName={headerClassName}
      bodyClassName={bodyClassName}
      density={density}
      className={className}
      {...props}
    >
      {children}
    </ViewerAdminRecordCard>
  )
}

export function SectionPanel({
  eyebrow,
  title,
  action,
  className,
  children,
}: React.PropsWithChildren<{
  eyebrow?: string
  title: string
  action?: React.ReactNode
  className?: string
}>) {
  return (
    <ViewerAdminPanel
      variant="soft"
      className={cn(
        'admin-section-panel overflow-hidden border-white/10 bg-transparent shadow-none backdrop-blur',
        className
      )}
    >
      <ViewerAdminPanelHeader
        title={title}
        description={eyebrow ? <ViewerAdminKicker>{eyebrow}</ViewerAdminKicker> : undefined}
        trailing={action}
        titleClassName="text-lg"
        descriptionClassName="mt-1.5"
        className="admin-section-panel__header items-center gap-2 border-b border-white/8 bg-transparent px-5 py-4 md:h-[var(--admin-section-header-height)] md:min-h-0 md:pt-0 md:pb-0"
      />
      <ViewerAdminPanelBody className="pt-5 text-foreground">{children}</ViewerAdminPanelBody>
    </ViewerAdminPanel>
  )
}

export function AdminEmptyState({
  title = '暂无数据',
  description,
  icon = Inbox,
  className,
  children,
}: React.PropsWithChildren<{
  title?: React.ReactNode
  description?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  className?: string
}>) {
  return (
    <ViewerAdminEmptyState
      title={title}
      description={description}
      icon={icon}
      className={className}
    >
      {children}
    </ViewerAdminEmptyState>
  )
}

export function WorkspaceEmptyState({
  eyebrow,
  title,
  items,
}: {
  eyebrow: string
  title: string
  items?: string[]
}) {
  return (
    <ViewerAdminSpotlightEmptyState
      eyebrow={eyebrow}
      title={title}
      icon={Workflow}
      items={items}
    />
  )
}

export function AdminSectionFrame({
  section,
  statusMessage,
  isLoading,
  actions,
  metrics = [],
  railCards = [],
  showSummaryCards = true,
  showLiveWarning = true,
  children,
}: React.PropsWithChildren<{
  section: AdminSection
  statusMessage: string
  isLoading?: boolean
  actions?: React.ReactNode
  metrics?: SectionMetric[]
  railCards?: SectionRailCard[]
  showSummaryCards?: boolean
  showLiveWarning?: boolean
}>) {
  const meta = getAdminSectionMeta(section) ?? {
    title: '未知模块',
    shortTitle: 'Unknown',
    icon: Workflow,
  }
  const resolvedRailCards =
    railCards.length > 0
      ? railCards
      : [
          {
            title: '模式',
            value: '草稿',
          },
          {
            title: '模块',
            value: meta.title,
          },
        ]

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[1.4rem] font-semibold md:text-[1.6rem]">{meta.title}</h2>
              <AdminBadge className="border border-white/10 bg-white/10 px-3 text-[11px] font-medium text-white hover:bg-white/10">
                {meta.shortTitle}
              </AdminBadge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showLiveWarning ? <SaveLiveWarning /> : null}
            {actions}
          </div>
        </div>

        {statusMessage || isLoading ? (
          <StatusBanner message={statusMessage} isLoading={isLoading} />
        ) : null}

        {showSummaryCards && (metrics.length > 0 || resolvedRailCards.length > 0) ? (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
            {metrics.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => (
                  <AdminMetricTile
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                  />
                ))}
              </div>
            ) : (
              <div />
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {resolvedRailCards.map((card) => (
                <AdminMetricTile
                  key={card.title}
                  label={card.title}
                  value={card.value}
                  size="sm"
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {children}
    </div>
  )
}
