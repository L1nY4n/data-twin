import type * as React from 'react'
import { ShieldAlert, Workflow } from 'lucide-react'
import type { AdminSection } from '@/lib/digital-twin/admin'
import { ADMIN_SECTION_META } from '@/components/admin/admin-meta'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
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
        'rounded-2xl px-3 py-2 text-xs',
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
        'rounded-2xl px-3 py-2 text-xs',
        inverted
          ? 'border-amber-400/25 bg-amber-300/10 text-amber-50'
          : 'border-amber-300/30 bg-amber-300/10 text-amber-100/80'
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <ShieldAlert className="h-4 w-4" />
        保存后即时生效
      </div>
      <p className="mt-1 text-[11px]">
        当前阶段未启用发布流，后台保存会直接触发运行态配置刷新，请先确认变更影响范围。
      </p>
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
  detail?: string
}

export interface SectionRailCard {
  title: string
  value: string
  detail: string
}

export function SectionPanel({
  eyebrow,
  title,
  description,
  action,
  className,
  children,
}: React.PropsWithChildren<{
  eyebrow?: string
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}>) {
  return (
    <Card
      className={cn(
        'viewer-admin-panel viewer-admin-panel--soft border-white/10 bg-transparent shadow-none backdrop-blur',
        className
      )}
    >
      <CardHeader className="gap-3 border-b border-white/8 bg-white/5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            {eyebrow ? (
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <CardTitle className="text-lg">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  )
}

export function WorkspaceEmptyState({
  eyebrow,
  title,
  description,
  cues,
  asideTitle,
  asideDetail,
}: {
  eyebrow: string
  title: string
  description: string
  cues: Array<{ title: string; detail: string }>
  asideTitle: string
  asideDetail: string
}) {
  return (
    <ViewerAdminPanel className="grid gap-4 rounded-[24px] border border-dashed border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(122,164,255,0.12),_transparent_38%),linear-gradient(180deg,_rgba(18,19,22,0.94)_0%,_rgba(18,19,22,0.78)_100%)] p-5 xl:grid-cols-[minmax(0,1fr)_220px]">
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {eyebrow}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/6 shadow-none">
              <Workflow className="h-4 w-4 text-white/80" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-semibold text-white">{title}</h4>
              <p className="text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {cues.map((cue) => (
            <ViewerAdminSoftCard
              key={cue.title}
              className="rounded-2xl border-white/8 bg-white/5 p-4"
            >
              <p className="text-xs font-medium text-white">{cue.title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {cue.detail}
              </p>
            </ViewerAdminSoftCard>
          ))}
        </div>
      </div>

      <ViewerAdminSoftCard className="rounded-2xl border-white/8 bg-white/5 p-4">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {asideTitle}
        </p>
        <p className="mt-3 text-sm leading-6 text-white/70">{asideDetail}</p>
      </ViewerAdminSoftCard>
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
  showLiveWarning = true,
  children,
}: React.PropsWithChildren<{
  section: AdminSection
  statusMessage: string
  isLoading?: boolean
  actions?: React.ReactNode
  metrics?: SectionMetric[]
  railCards?: SectionRailCard[]
  showLiveWarning?: boolean
}>) {
  const meta = ADMIN_SECTION_META[section]
  const resolvedRailCards =
    railCards.length > 0
      ? railCards
      : [
          {
            title: '操作模式',
            value: 'Live Config',
            detail: '当前保存会直接刷新运行态配置，没有额外发布门。',
          },
          {
            title: '当前模块',
            value: meta.shortTitle,
            detail: meta.operatorHint,
          },
        ]

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(135deg,_#0f172a_0%,_#111827_52%,_#1e293b_100%)] text-white shadow-[0_40px_120px_-56px_rgba(15,23,42,0.9)]">
        <div className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:px-8 xl:py-8">
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.28em] text-sky-200/70">
                  {meta.kicker}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-semibold tracking-tight">{meta.title}</h2>
                  <Badge className="rounded-full border border-white/10 bg-white/10 px-3 text-[11px] font-medium text-white hover:bg-white/10">
                    {meta.shortTitle}
                  </Badge>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-white/70">
                  {meta.description}
                </p>
              </div>
              {actions ? (
                <div className="flex flex-wrap items-center gap-2">{actions}</div>
              ) : null}
            </div>

            <StatusBanner message={statusMessage} isLoading={isLoading} inverted />
            {showLiveWarning ? <SaveLiveWarning inverted /> : null}

            {metrics.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/50">
                      {metric.label}
                    </p>
                    <div className="mt-3 text-2xl font-semibold">{metric.value}</div>
                    {metric.detail ? (
                      <p className="mt-2 text-xs leading-5 text-white/70">
                        {metric.detail}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            {resolvedRailCards.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur"
              >
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/50">
                  {card.title}
                </p>
                <div className="mt-3 text-lg font-semibold">{card.value}</div>
                <p className="mt-2 text-xs leading-5 text-white/70">{card.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {children}
    </div>
  )
}
