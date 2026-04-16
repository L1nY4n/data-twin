import type * as React from 'react'
import { ShieldAlert, Workflow } from 'lucide-react'
import type { AdminSection } from '@/lib/digital-twin/admin'
import { ADMIN_SECTION_META } from '@/components/admin/admin-meta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ViewerAdminPanel,
  ViewerAdminSoftCard,
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
          ? 'border-white/10 bg-white/5 text-slate-200'
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
  value: number | string
  hint?: string
}) {
  return (
    <Card className="viewer-admin-panel viewer-admin-panel--soft border-white/10 bg-transparent shadow-none backdrop-blur">
      <CardHeader className="gap-2 pb-2">
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          {label}
        </p>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
        {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

export interface SectionMetric {
  label: string
  value: number | string
}

export interface SectionRailCard {
  title: string
  value: string
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
    <Card
      className={cn(
        'admin-section-panel viewer-admin-panel viewer-admin-panel--soft border-white/10 bg-transparent shadow-none backdrop-blur',
        className
      )}
    >
      <CardHeader className="admin-section-panel__header items-center gap-2 border-b border-white/8 bg-transparent px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            {eyebrow ? (
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
    </Card>
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
    <ViewerAdminPanel className="space-y-4 rounded-[24px] border border-dashed border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(122,164,255,0.12),_transparent_38%),linear-gradient(180deg,_rgba(18,19,22,0.94)_0%,_rgba(18,19,22,0.78)_100%)] p-5">
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          {eyebrow}
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/6 shadow-none">
            <Workflow className="h-4 w-4 text-white/80" />
          </div>
          <div>
            <h4 className="text-lg font-semibold text-white">{title}</h4>
          </div>
        </div>
      </div>

      {items && items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <ViewerAdminSoftCard
              key={item}
              className="rounded-full border-white/8 bg-white/5 px-3 py-1.5 text-xs text-white/80"
            >
              {item}
            </ViewerAdminSoftCard>
          ))}
        </div>
      ) : null}
    </ViewerAdminPanel>
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
  const meta = ADMIN_SECTION_META[section]
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
              <h2 className="text-[1.4rem] font-semibold tracking-tight md:text-[1.6rem]">{meta.title}</h2>
              <Badge className="rounded-full border border-white/10 bg-white/10 px-3 text-[11px] font-medium text-white hover:bg-white/10">
                {meta.shortTitle}
              </Badge>
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
                  <div
                    key={metric.label}
                    className="viewer-admin-panel viewer-admin-panel--soft rounded-2xl px-4 py-3"
                  >
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      {metric.label}
                    </p>
                    <div className="mt-2 text-2xl font-semibold">{metric.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div />
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {resolvedRailCards.map((card) => (
                <div
                  key={card.title}
                  className="viewer-admin-panel viewer-admin-panel--soft rounded-2xl px-4 py-3"
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {card.title}
                  </p>
                  <div className="mt-2 text-lg font-semibold">{card.value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {children}
    </div>
  )
}
