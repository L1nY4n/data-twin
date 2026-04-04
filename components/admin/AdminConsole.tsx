'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Edge, Node } from '@xyflow/react'
import {
  ArrowUpRight,
  Clock3,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  Workflow,
} from 'lucide-react'
import {
  createAdminEntity,
  createDataConnector,
  createRule,
  deleteAdminEntity,
  deleteDataConnector,
  deleteRule,
  fetchAdminOverview,
  fetchAdminScene,
  listAdminAlarms,
  listAdminAuditEvents,
  listAdminEntities,
  listDataConnectors,
  listEntityBindings,
  listRules,
  replaceEntityBindings,
  updateAdminEntity,
  updateAdminScene,
  updateDataConnector,
  updateRule,
  validateRule,
} from '@/lib/digital-twin/bootstrap-client'
import {
  cloneBindingsDraft,
  cloneConnectorDraft,
  cloneEntityDraft,
  cloneRuleDraft,
  cloneSceneDraft,
  createBindingTemplate,
  createConnectorTemplate,
  createEntityTemplate,
  createRuleTemplate,
  formatAdminJson,
  parseAdminJson,
} from '@/lib/digital-twin/admin-view-models'
import type {
  AdminOverview,
  AdminSection,
  AuditEventRecord,
} from '@/lib/digital-twin/admin'
import {
  ADMIN_NAV_GROUPS,
  ADMIN_SECTION_META,
} from '@/components/admin/admin-meta'
import type {
  Alarm,
  CameraEntity,
  CameraType,
  DataConnector,
  Entity,
  EntityBinding,
  EntityStatus,
  RuleConfig,
  SceneConfig,
  SensorEntity,
  SensorType,
} from '@/lib/digital-twin/types'
import { RuleEditor } from '@/components/digital-twin/rules/RuleEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const ENTITY_STATUSES: EntityStatus[] = ['active', 'inactive', 'warning', 'error']
const SENSOR_TYPES: SensorType[] = [
  'temperature',
  'pressure',
  'flow',
  'gas',
  'level',
  'humidity',
  'other',
]
const CAMERA_TYPES: CameraType[] = ['fixed', 'dome', 'ptz', 'thermal']

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
    <div
      className={cn(
        'rounded-2xl border px-3 py-2 text-xs',
        inverted
          ? 'border-white/10 bg-white/5 text-slate-200'
          : 'bg-background text-muted-foreground'
      )}
    >
      {isLoading ? '正在加载...' : message || '就绪'}
    </div>
  )
}

function SaveLiveWarning({ inverted = false }: { inverted?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-3 py-2 text-xs',
        inverted
          ? 'border-amber-400/25 bg-amber-300/10 text-amber-50'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <ShieldAlert className="h-4 w-4" />
        保存后即时生效
      </div>
      <p className="mt-1 text-[11px]">
        当前阶段未启用发布流，后台保存会直接触发运行态配置刷新，请先确认变更影响范围。
      </p>
    </div>
  )
}

function AdvancedJsonEditor({
  value,
  onChange,
  onApply,
}: {
  value: string
  onChange: (value: string) => void
  onApply: () => void
}) {
  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium">
        <span>高级 JSON</span>
        <span className="text-xs text-muted-foreground">专家模式</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t p-3">
        <Textarea
          className="min-h-[220px] font-mono text-xs"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onApply}>
            应用 JSON
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function useStructuredDraft<T>(initialValue: T | null, clone: (value: T) => T) {
  const [draft, setDraft] = useState<T | null>(initialValue)
  const [draftText, setDraftText] = useState(
    initialValue === null ? '' : formatAdminJson(initialValue)
  )

  useEffect(() => {
    if (initialValue === null) {
      setDraft(null)
      setDraftText('')
      return
    }

    const next = clone(initialValue)
    setDraft(next)
    setDraftText(formatAdminJson(next))
  }, [clone, initialValue])

  const replaceDraft = useCallback(
    (value: T | null) => {
      if (value === null) {
        setDraft(null)
        setDraftText('')
        return
      }

      const next = clone(value)
      setDraft(next)
      setDraftText(formatAdminJson(next))
    },
    [clone]
  )

  const updateDraft = useCallback((updater: (current: T) => T) => {
    setDraft((current) => {
      if (current === null) {
        return current
      }

      const next = updater(current)
      setDraftText(formatAdminJson(next))
      return next
    })
  }, [])

  const applyDraftText = useCallback(() => {
    const parsed = parseAdminJson<T | null>(draftText, null)
    if (parsed === null) {
      return null
    }

    const next = clone(parsed)
    setDraft(next)
    setDraftText(formatAdminJson(next))
    return next
  }, [clone, draftText])

  return {
    draft,
    draftText,
    setDraftText,
    replaceDraft,
    updateDraft,
    applyDraftText,
  }
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: number | string
  hint?: string
}) {
  return (
    <Card className="border-slate-200/80 bg-white/85 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
      <CardHeader className="gap-2 pb-2">
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
        {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

interface SectionMetric {
  label: string
  value: number | string
  detail?: string
}

interface SectionRailCard {
  title: string
  value: string
  detail: string
}

function SectionPanel({
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
        'border-slate-200/80 bg-white/90 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)] backdrop-blur',
        className
      )}
    >
      <CardHeader className="gap-3 border-b border-slate-200/80 bg-slate-50/80">
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

function WorkspaceEmptyState({
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
    <div className="grid gap-4 rounded-[24px] border border-dashed border-slate-200/90 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.06),_transparent_38%),linear-gradient(180deg,_rgba(248,250,252,0.96)_0%,_rgba(241,245,249,0.72)_100%)] p-5 xl:grid-cols-[minmax(0,1fr)_220px]">
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {eyebrow}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
              <Workflow className="h-4 w-4 text-slate-700" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-semibold text-slate-950">{title}</h4>
              <p className="text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {cues.map((cue) => (
            <div
              key={cue.title}
              className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.45)]"
            >
              <p className="text-xs font-medium text-slate-900">{cue.title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{cue.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.45)]">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{asideTitle}</p>
        <p className="mt-3 text-sm leading-6 text-slate-700">{asideDetail}</p>
      </div>
    </div>
  )
}

function AdminSectionFrame({
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
                <p className="max-w-2xl text-sm leading-6 text-slate-300">{meta.description}</p>
              </div>
              {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
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
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                      {metric.label}
                    </p>
                    <div className="mt-3 text-2xl font-semibold">{metric.value}</div>
                    {metric.detail ? (
                      <p className="mt-2 text-xs leading-5 text-slate-300">{metric.detail}</p>
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
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  {card.title}
                </p>
                <div className="mt-3 text-lg font-semibold">{card.value}</div>
                <p className="mt-2 text-xs leading-5 text-slate-300">{card.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {children}
    </div>
  )
}

function OverviewSection() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [overviewPayload, alarmPayload, auditPayload] = await Promise.all([
        fetchAdminOverview(),
        listAdminAlarms(),
        listAdminAuditEvents(),
      ])
      setOverview(overviewPayload)
      setAlarms(alarmPayload)
      setAuditEvents(auditPayload)
      setStatusMessage('已同步后台总览与治理信息')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载总览失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const quickLinks = ADMIN_NAV_GROUPS.flatMap((group) => group.items).filter(
    (item) => item.section !== 'overview'
  )

  return (
    <AdminSectionFrame
      section="overview"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadData()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新总览
        </Button>
      }
      metrics={[
        {
          label: 'Scene Version',
          value: overview?.sceneVersion ?? '--',
          detail: '当前运行态引用的场景版本。',
        },
        {
          label: '实体规模',
          value: overview?.entityCount ?? '--',
          detail: `规则 ${overview?.ruleCount ?? '--'} / 连接器 ${overview?.connectorCount ?? '--'}`,
        },
        {
          label: '待处理告警',
          value: overview?.unacknowledgedAlarmCount ?? '--',
          detail: alarms.length > 0 ? `已同步 ${alarms.length} 条告警` : '当前无告警快照',
        },
        {
          label: '最近变更',
          value:
            overview?.recentChangeAt != null
              ? new Date(overview.recentChangeAt).toLocaleDateString('zh-CN')
              : '--',
          detail:
            overview?.recentChangeAt != null
              ? new Date(overview.recentChangeAt).toLocaleTimeString('zh-CN')
              : '暂无变更记录',
        },
      ]}
      railCards={[
        {
          title: '工作台节奏',
          value: 'Observe → Configure → Govern',
          detail: '总览页负责给操作员指路，而不是只罗列数字。',
        },
        {
          title: '当前焦点',
          value: alarms.some((alarm) => !alarm.acknowledged) ? '处理未确认告警' : '检查配置变化',
          detail: '先看告警和变更，再深入具体模块处理。',
        },
      ]}
    >
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Scene Version" value={overview?.sceneVersion ?? '--'} />
        <MetricCard label="实体总数" value={overview?.entityCount ?? '--'} />
        <MetricCard label="规则数" value={overview?.ruleCount ?? '--'} />
        <MetricCard label="连接器数" value={overview?.connectorCount ?? '--'} />
        <MetricCard label="绑定数" value={overview?.bindingCount ?? '--'} />
        <MetricCard
          label="未确认告警"
          value={overview?.unacknowledgedAlarmCount ?? '--'}
          hint={
            overview?.recentChangeAt
              ? `最近变更 ${new Date(overview.recentChangeAt).toLocaleString('zh-CN')}`
              : '暂无变更记录'
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="Governance Feed"
          title="当前告警"
          description="把最需要被响应的事项放在工作台首屏。"
        >
          <div className="space-y-3">
            {alarms.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前无持久化告警。</p>
            ) : (
              alarms.slice(0, 8).map((alarm) => (
                <div
                  key={alarm.id}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{alarm.message}</span>
                    <Badge variant={alarm.acknowledged ? 'outline' : 'destructive'}>
                      {alarm.acknowledged ? '已确认' : '待处理'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(alarm.timestamp).toLocaleString('zh-CN')} · {alarm.level}
                  </p>
                </div>
              ))
            )}
          </div>
        </SectionPanel>

        <SectionPanel
          eyebrow="Change Radar"
          title="最近变更审计"
          description="在进入场景或规则编辑前先看最近谁改过什么。"
        >
          <div className="space-y-3">
            {auditEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前暂无审计事件。</p>
            ) : (
              auditEvents.slice(0, 8).map((event) => (
                <div
                  key={event.id}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{event.action}</span>
                    <Badge variant="outline">{event.resourceType}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {event.actor} · {event.resourceId} ·{' '}
                    {new Date(event.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              ))
            )}
          </div>
        </SectionPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <SectionPanel
          eyebrow="Quick Routes"
          title="下一步操作"
          description="把常见后台路径直接做成落点，减少用户在侧栏中反复切换。"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {quickLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:text-slate-900" />
                </div>
              </Link>
            ))}
          </div>
        </SectionPanel>

        <SectionPanel
          eyebrow="Ops Cue"
          title="值守建议"
          description="总览页要给出一条明确的后台工作路径。"
        >
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <Clock3 className="h-4 w-4" />
                先刷新治理数据
              </div>
              <p className="mt-2 leading-6">先确认告警与最近变更，再决定是处理现场问题还是进入配置编辑。</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <Workflow className="h-4 w-4" />
                变更后回到总览复核
              </div>
              <p className="mt-2 leading-6">后台保存会立即生效，回到总览确认结果应是默认闭环动作。</p>
            </div>
          </div>
        </SectionPanel>
      </div>
    </AdminSectionFrame>
  )
}

function SceneSection() {
  const [sceneVersion, setSceneVersion] = useState(0)
  const [sceneSource, setSceneSource] = useState<SceneConfig | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const draft = useStructuredDraft(sceneSource, cloneSceneDraft)

  const loadScene = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetchAdminScene()
      setSceneVersion(response.sceneVersion)
      setSceneSource(response.sceneConfig)
      setStatusMessage('已同步场景配置')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载场景配置失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadScene()
  }, [loadScene])

  const saveScene = useCallback(async () => {
    const payload = draft.applyDraftText()
    if (!payload) {
      setStatusMessage('场景 JSON 无法解析')
      return
    }

    try {
      const response = await updateAdminScene(payload)
      setSceneVersion(response.sceneVersion)
      setSceneSource(response.sceneConfig)
      setStatusMessage('场景配置已保存')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存场景配置失败')
    }
  }, [draft])

  const sceneDraft = draft.draft

  return (
    <AdminSectionFrame
      section="scene"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadScene()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新场景
        </Button>
      }
      metrics={[
        {
          label: 'Scene Version',
          value: sceneVersion || '--',
          detail: '保存成功后版本号会在这里上升。',
        },
        {
          label: 'Grid Size',
          value: sceneDraft?.gridSize ?? '--',
          detail: `Grid Divisions ${sceneDraft?.gridDivisions ?? '--'}`,
        },
        {
          label: '显示状态',
          value: sceneDraft?.showGrid ? 'Grid On' : 'Grid Off',
          detail: sceneDraft?.showAxes ? '坐标轴显示中' : '坐标轴已隐藏',
        },
        {
          label: '环境光',
          value: sceneDraft?.ambientLightIntensity ?? '--',
          detail: '场景基础氛围与可读性基准。',
        },
      ]}
      railCards={[
        {
          title: '编辑目标',
          value: '基础环境参数',
          detail: '这里适合维护视角、网格、背景和基础渲染配置，不承载复杂业务规则。',
        },
        {
          title: '变更习惯',
          value: '先调参数，再看运行态',
          detail: '场景类配置最好小步保存，每次修改后去首页确认显示效果。',
        },
      ]}
    >
      <SectionPanel
        eyebrow="Scene Controls"
        title="场景基础配置"
        description="把环境、网格、视角集中在一个编辑工作区，不再拆成零碎卡片。"
      >
        <div className="space-y-4">
          {sceneDraft ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>场景名称</Label>
                  <Input
                    value={sceneDraft.name}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>背景色</Label>
                  <Input
                    value={sceneDraft.backgroundColor}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        backgroundColor: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Grid Size</Label>
                  <Input
                    type="number"
                    value={sceneDraft.gridSize}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        gridSize: Number(event.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Grid Divisions</Label>
                  <Input
                    type="number"
                    value={sceneDraft.gridDivisions}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        gridDivisions: Number(event.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>环境光</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={sceneDraft.ambientLightIntensity}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        ambientLightIntensity: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>显示坐标轴</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={sceneDraft.showAxes ? 'true' : 'false'}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        showAxes: event.target.value === 'true',
                      }))
                    }
                  >
                    <option value="true">显示</option>
                    <option value="false">隐藏</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>显示网格</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={sceneDraft.showGrid ? 'true' : 'false'}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        showGrid: event.target.value === 'true',
                      }))
                    }
                  >
                    <option value="true">显示</option>
                    <option value="false">隐藏</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>相机位置</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <Input
                        key={axis}
                        type="number"
                        step="0.1"
                        value={sceneDraft.cameraPosition[axis]}
                        onChange={(event) =>
                          draft.updateDraft((current) => ({
                            ...current,
                            cameraPosition: {
                              ...current.cameraPosition,
                              [axis]: Number(event.target.value),
                            },
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>相机目标</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <Input
                        key={axis}
                        type="number"
                        step="0.1"
                        value={sceneDraft.cameraTarget[axis]}
                        onChange={(event) =>
                          draft.updateDraft((current) => ({
                            ...current,
                            cameraTarget: {
                              ...current.cameraTarget,
                              [axis]: Number(event.target.value),
                            },
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              <AdvancedJsonEditor
                value={draft.draftText}
                onChange={draft.setDraftText}
                onApply={() => {
                  if (!draft.applyDraftText()) {
                    setStatusMessage('场景 JSON 无法解析')
                    return
                  }
                  setStatusMessage('已从 JSON 应用场景配置')
                }}
              />

              <div className="flex justify-end">
                <Button onClick={() => void saveScene()}>
                  <Save className="mr-1 h-4 w-4" />
                  保存场景配置
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">暂无场景配置。</p>
          )}
        </div>
      </SectionPanel>
    </AdminSectionFrame>
  )
}

function EntityFields({
  draft,
  updateDraft,
}: {
  draft: Entity
  updateDraft: (updater: (current: Entity) => Entity) => void
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>ID</Label>
          <Input
            value={draft.id}
            onChange={(event) =>
              updateDraft((current) => ({ ...current, id: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>名称</Label>
          <Input
            value={draft.name}
            onChange={(event) =>
              updateDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>类型</Label>
          <Input value={draft.type} disabled />
        </div>
        <div className="space-y-2">
          <Label>状态</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={draft.status}
            onChange={(event) =>
              updateDraft((current) => ({
                ...current,
                status: event.target.value as EntityStatus,
              }))
            }
          >
            {ENTITY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>可见性</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={draft.visible ? 'true' : 'false'}
            onChange={(event) =>
              updateDraft((current) => ({
                ...current,
                visible: event.target.value === 'true',
              }))
            }
          >
            <option value="true">显示</option>
            <option value="false">隐藏</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <div key={axis} className="space-y-2">
            <Label>位置 {axis.toUpperCase()}</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.position[axis]}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  position: {
                    ...current.position,
                    [axis]: Number(event.target.value),
                  },
                }))
              }
            />
          </div>
        ))}
      </div>

      {draft.type === 'person' ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>角色</Label>
            <Input
              value={draft.role}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'person'
                    ? { ...current, role: event.target.value }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>部门</Label>
            <Input
              value={draft.department}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'person'
                    ? { ...current, department: event.target.value }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>当前活动</Label>
            <Input
              value={draft.currentActivity ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'person'
                    ? { ...current, currentActivity: event.target.value }
                    : current
                )
              }
            />
          </div>
        </div>
      ) : null}

      {draft.type === 'vehicle' ? (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>车牌号</Label>
            <Input
              value={draft.plateNumber}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'vehicle'
                    ? { ...current, plateNumber: event.target.value }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>车辆类型</Label>
            <Input
              value={draft.vehicleType}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'vehicle'
                    ? { ...current, vehicleType: event.target.value as typeof current.vehicleType }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>速度</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.speed}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'vehicle'
                    ? { ...current, speed: Number(event.target.value) }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>航向</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.heading}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'vehicle'
                    ? { ...current, heading: Number(event.target.value) }
                    : current
                )
              }
            />
          </div>
        </div>
      ) : null}

      {draft.type === 'equipment' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>模型 ID</Label>
            <Input
              value={draft.modelId ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'equipment'
                    ? { ...current, modelId: event.target.value }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>模型 URL</Label>
            <Input
              value={draft.modelUrl ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'equipment'
                    ? { ...current, modelUrl: event.target.value }
                    : current
                )
              }
            />
          </div>
        </div>
      ) : null}

      {draft.type === 'sensor' ? (
        <div className="grid gap-4 md:grid-cols-5">
          <div className="space-y-2">
            <Label>传感器类型</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={draft.sensorType}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'sensor'
                    ? {
                        ...current,
                        sensorType: event.target.value as SensorEntity['sensorType'],
                      }
                    : current
                )
              }
            >
              {SENSOR_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>单位</Label>
            <Input
              value={draft.unit}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'sensor' ? { ...current, unit: event.target.value } : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>当前读数</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.reading}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'sensor'
                    ? { ...current, reading: Number(event.target.value) }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>最小阈值</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.thresholdMin ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'sensor'
                    ? {
                        ...current,
                        thresholdMin:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>最大阈值</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.thresholdMax ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'sensor'
                    ? {
                        ...current,
                        thresholdMax:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      }
                    : current
                )
              }
            />
          </div>
        </div>
      ) : null}

      {draft.type === 'camera' ? (
        <div className="grid gap-4 md:grid-cols-5">
          <div className="space-y-2">
            <Label>摄像头类型</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={draft.cameraType}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'camera'
                    ? {
                        ...current,
                        cameraType: event.target.value as CameraEntity['cameraType'],
                      }
                    : current
                )
              }
            >
              {CAMERA_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>流地址</Label>
            <Input
              value={draft.streamUrl ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'camera'
                    ? { ...current, streamUrl: event.target.value }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>FOV</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.fov}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'camera'
                    ? { ...current, fov: Number(event.target.value) }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>航向</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.heading}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'camera'
                    ? { ...current, heading: Number(event.target.value) }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>覆盖距离</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.range ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'camera'
                    ? {
                        ...current,
                        range: event.target.value === '' ? undefined : Number(event.target.value),
                      }
                    : current
                )
              }
            />
          </div>
        </div>
      ) : null}

      {draft.type === 'zone' ? (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>区域类型</Label>
            <Input
              value={draft.zoneType}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'zone'
                    ? { ...current, zoneType: event.target.value as typeof current.zoneType }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>颜色</Label>
            <Input
              value={draft.color}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'zone' ? { ...current, color: event.target.value } : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>容量</Label>
            <Input
              type="number"
              value={draft.capacity ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'zone'
                    ? {
                        ...current,
                        capacity:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>当前占用</Label>
            <Input
              type="number"
              value={draft.currentOccupancy ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'zone'
                    ? {
                        ...current,
                        currentOccupancy:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      }
                    : current
                )
              }
            />
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        复杂嵌套字段如 `metadata`、`parameters`、`boundary`、`accessRules`、`alarms`
        可通过下方高级 JSON 直接编辑。
      </p>
    </>
  )
}

function EntitiesSection() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [newEntityType, setNewEntityType] = useState<Entity['type']>('person')
  const [draftSeed, setDraftSeed] = useState<Entity | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const selectedEntity = useMemo(
    () => entities.find((entity) => entity.id === selectedEntityId) ?? null,
    [entities, selectedEntityId]
  )
  const draft = useStructuredDraft(draftSeed ?? selectedEntity, cloneEntityDraft)

  const loadEntities = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listAdminEntities()
      setEntities(loaded)
      setSelectedEntityId((current) => current ?? loaded[0]?.id ?? null)
      setStatusMessage('已同步实体清单')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载实体失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadEntities()
  }, [loadEntities])

  const saveEntity = useCallback(async () => {
    const payload = draft.applyDraftText()
    if (!payload) {
      setStatusMessage('实体 JSON 无法解析')
      return
    }

    try {
      if (entities.some((entity) => entity.id === payload.id)) {
        await updateAdminEntity(payload.id, payload)
        setStatusMessage('实体已更新')
      } else {
        await createAdminEntity(payload)
        setStatusMessage('实体已创建')
      }
      await loadEntities()
      setSelectedEntityId(payload.id)
      setDraftSeed(null)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存实体失败')
    }
  }, [draft, entities, loadEntities])

  const removeEntity = useCallback(async () => {
    if (!selectedEntityId || !selectedEntity) {
      setStatusMessage('请先选择已存在的实体')
      return
    }

    try {
      await deleteAdminEntity(selectedEntityId)
      setStatusMessage('实体已删除')
      setSelectedEntityId(null)
      setDraftSeed(null)
      await loadEntities()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '删除实体失败')
    }
  }, [loadEntities, selectedEntity, selectedEntityId])

  const activeEntityCount = entities.filter((entity) => entity.status === 'active').length
  const visibleEntityCount = entities.filter((entity) => entity.visible).length
  const typeSummary = Object.entries(
    entities.reduce<Record<string, number>>((accumulator, entity) => {
      accumulator[entity.type] = (accumulator[entity.type] ?? 0) + 1
      return accumulator
    }, {})
  )

  return (
    <AdminSectionFrame
      section="entities"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadEntities()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新实体
        </Button>
      }
      metrics={[
        {
          label: '实体总数',
          value: entities.length,
          detail: `${activeEntityCount} 个 active / ${visibleEntityCount} 个可见`,
        },
        {
          label: '当前选中',
          value: selectedEntity?.name ?? draft.draft?.name ?? '--',
          detail: selectedEntity?.type ?? draft.draft?.type ?? '未选择实体',
        },
        {
          label: '草稿模式',
          value: draftSeed ? 'Template Draft' : 'Edit Existing',
          detail: draftSeed ? '当前正在从模板新建实体。' : '当前在编辑既有实体。',
        },
        {
          label: '结构化编辑',
          value: 'Form + JSON',
          detail: '先用结构化表单处理高频字段，复杂字段再用高级 JSON。',
        },
      ]}
      railCards={[
        {
          title: '清单职责',
          value: 'Roster → Editor',
          detail: '左侧是 roster，右侧是编辑器，不再把所有信息堆成一列。',
        },
        {
          title: '操作建议',
          value: '先筛类型，再改细节',
          detail: '实体多起来后，先通过列表上下文确定对象，再进入右侧深度编辑。',
        },
      ]}
    >
      <div className="grid gap-4 2xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="Entity Roster"
          title="实体清单"
          description="先从 roster 选对象，再把右侧作为唯一编辑上下文。"
        >
          <div className="space-y-3">
            <div className="grid gap-2">
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={newEntityType}
                onChange={(event) => setNewEntityType(event.target.value as Entity['type'])}
              >
                <option value="person">人员</option>
                <option value="vehicle">车辆</option>
                <option value="equipment">设备</option>
                <option value="sensor">传感器</option>
                <option value="camera">摄像头</option>
                <option value="zone">区域</option>
              </select>
              <Button
                variant="outline"
                onClick={() => {
                  const template = createEntityTemplate(newEntityType)
                  setDraftSeed(template)
                  setSelectedEntityId(null)
                  draft.replaceDraft(template)
                  setStatusMessage(`已创建 ${newEntityType} 模板草稿`)
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                新建实体模板
              </Button>
            </div>

            {entities.length > 0 ? (
              <ScrollArea className="h-[520px]">
                <div className="space-y-2 pr-3">
                  {entities.map((entity) => (
                    <button
                      key={entity.id}
                      type="button"
                      className={cn(
                        'w-full rounded-2xl border px-3 py-3 text-left text-sm transition',
                        selectedEntityId === entity.id && draftSeed === null
                          ? 'border-primary bg-primary/10 shadow-[0_20px_50px_-42px_rgba(14,165,233,0.8)]'
                          : 'border-slate-200/80 bg-slate-50/70 hover:border-slate-300 hover:bg-white'
                      )}
                      onClick={() => {
                        setDraftSeed(null)
                        setSelectedEntityId(entity.id)
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-950">{entity.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{entity.id}</div>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {entity.type}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{entity.visible ? '可见于场景' : '隐藏于场景'}</span>
                        <span>{entity.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <WorkspaceEmptyState
                eyebrow="Entity Bootstrap"
                title="先建立第一批实体模板"
                description="空 roster 不该只剩一块白板。先决定对象类型，再把右侧编辑器切成单一上下文。"
                cues={[
                  {
                    title: '1. 选实体类型',
                    detail: '先分清人员、设备、车辆或传感器，避免从一堆通用字段起手。',
                  },
                  {
                    title: '2. 生成模板草稿',
                    detail: '从模板进入编辑，比先写整段 JSON 更适合后台持续维护。',
                  },
                  {
                    title: '3. 在右侧补全细节',
                    detail: '把可视字段、状态和高级 JSON 收到唯一编辑面板里。',
                  },
                ]}
                asideTitle="当前策略"
                asideDetail="即使后端暂时不可达，也可以先把实体结构和字段约定整理成草稿。"
              />
            )}
          </div>
        </SectionPanel>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {typeSummary.length > 0 ? (
              typeSummary.map(([type, count]) => (
                <div
                  key={type}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
                >
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {type}
                  </p>
                  <div className="mt-2 text-2xl font-semibold">{count}</div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm text-muted-foreground">
                当前实体列表为空，先从左侧创建模板。
              </div>
            )}
          </div>

          <SectionPanel
            eyebrow="Entity Editor"
            title={draft.draft ? `${draft.draft.name || '实体草稿'} 配置` : '实体详情'}
            description="高频字段走结构化表单，复杂字段继续交给 JSON。"
          >
            <div className="space-y-4">
              {draft.draft ? (
                <>
                  <EntityFields draft={draft.draft} updateDraft={draft.updateDraft} />
                  <AdvancedJsonEditor
                    value={draft.draftText}
                    onChange={draft.setDraftText}
                    onApply={() => {
                      if (!draft.applyDraftText()) {
                        setStatusMessage('实体 JSON 无法解析')
                        return
                      }
                      setStatusMessage('已从 JSON 应用实体草稿')
                    }}
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="destructive" onClick={() => void removeEntity()}>
                      <Trash2 className="mr-1 h-4 w-4" />
                      删除实体
                    </Button>
                    <Button onClick={() => void saveEntity()}>
                      <Save className="mr-1 h-4 w-4" />
                      保存实体
                    </Button>
                  </div>
                </>
              ) : (
                <WorkspaceEmptyState
                  eyebrow="Editor Standby"
                  title="编辑器正在等待唯一上下文"
                  description="先从左侧选中实体，或直接创建模板。右侧不再同时摊开多个编辑块。"
                  cues={[
                    {
                      title: '结构化字段',
                      detail: '高频业务字段走表单，减少直接操作 JSON 的负担。',
                    },
                    {
                      title: '高级 JSON',
                      detail: '复杂扩展字段仍然保留专家模式，不牺牲表达能力。',
                    },
                    {
                      title: '保存即生效',
                      detail: '确认字段和状态后再保存，避免把运行态配置改成试验场。',
                    },
                  ]}
                  asideTitle="为什么这样做"
                  asideDetail="后台编辑器应该只服务一个当前对象，这样切换、保存和回溯都更稳定。"
                />
              )}
            </div>
          </SectionPanel>
        </div>
      </div>
    </AdminSectionFrame>
  )
}

function ConnectorsSection() {
  const [connectors, setConnectors] = useState<DataConnector[]>([])
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null)
  const [draftSeed, setDraftSeed] = useState<DataConnector | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const selectedConnector = useMemo(
    () => connectors.find((connector) => connector.id === selectedConnectorId) ?? null,
    [connectors, selectedConnectorId]
  )
  const draft = useStructuredDraft(draftSeed ?? selectedConnector, cloneConnectorDraft)

  const loadConnectors = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listDataConnectors()
      setConnectors(loaded)
      setSelectedConnectorId((current) => current ?? loaded[0]?.id ?? null)
      setStatusMessage('已同步连接器配置')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载连接器失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConnectors()
  }, [loadConnectors])

  const saveConnector = useCallback(async () => {
    const payload = draft.applyDraftText()
    if (!payload) {
      setStatusMessage('连接器 JSON 无法解析')
      return
    }

    try {
      if (connectors.some((connector) => connector.id === payload.id)) {
        await updateDataConnector(payload.id, payload)
        setStatusMessage('连接器已更新')
      } else {
        await createDataConnector(payload)
        setStatusMessage('连接器已创建')
      }
      await loadConnectors()
      setSelectedConnectorId(payload.id)
      setDraftSeed(null)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存连接器失败')
    }
  }, [connectors, draft, loadConnectors])

  const removeConnector = useCallback(async () => {
    if (!selectedConnectorId || !selectedConnector) {
      setStatusMessage('请先选择已存在的连接器')
      return
    }

    try {
      await deleteDataConnector(selectedConnectorId)
      setStatusMessage('连接器已删除')
      setSelectedConnectorId(null)
      setDraftSeed(null)
      await loadConnectors()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '删除连接器失败')
    }
  }, [loadConnectors, selectedConnector, selectedConnectorId])

  const enabledConnectorCount = connectors.filter((connector) => connector.enabled).length

  return (
    <AdminSectionFrame
      section="connectors"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadConnectors()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新连接器
        </Button>
      }
      metrics={[
        {
          label: '连接器总数',
          value: connectors.length,
          detail: `${enabledConnectorCount} 个处于启用状态`,
        },
        {
          label: '当前对象',
          value: selectedConnector?.name ?? draft.draft?.name ?? '--',
          detail: selectedConnector?.protocol ?? draft.draft?.protocol ?? '尚未选择连接器',
        },
        {
          label: '接入形态',
          value: 'Protocol / Endpoint / Auth',
          detail: '把接入协议、endpoint 与复杂认证配置拆层管理。',
        },
      ]}
      railCards={[
        {
          title: '模块职责',
          value: '接入抽象层',
          detail: '连接器页维护的是接入描述，不是实体映射；映射关系留在 bindings。',
        },
        {
          title: '编辑路径',
          value: '清单选择 → 详情修改',
          detail: '左侧控制资产范围，右侧处理协议与连接细节。',
        },
      ]}
    >
      <div className="grid gap-4 2xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="Connector Inventory"
          title="连接器列表"
          description="把接入对象先视为资产清单，再进入协议详情。"
        >
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                const template = createConnectorTemplate()
                setDraftSeed(template)
                setSelectedConnectorId(null)
                draft.replaceDraft(template)
                setStatusMessage('已创建连接器模板草稿')
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              新建连接器
            </Button>

            {connectors.length > 0 ? (
              <ScrollArea className="h-[520px]">
                <div className="space-y-2 pr-3">
                  {connectors.map((connector) => (
                    <button
                      key={connector.id}
                      type="button"
                      className={cn(
                        'w-full rounded-2xl border px-3 py-3 text-left text-sm transition',
                        selectedConnectorId === connector.id && draftSeed === null
                          ? 'border-primary bg-primary/10 shadow-[0_20px_50px_-42px_rgba(14,165,233,0.8)]'
                          : 'border-slate-200/80 bg-slate-50/70 hover:border-slate-300 hover:bg-white'
                      )}
                      onClick={() => {
                        setDraftSeed(null)
                        setSelectedConnectorId(connector.id)
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-950">{connector.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{connector.id}</div>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {connector.protocol}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="truncate">{connector.endpoint}</span>
                        <span>{connector.enabled ? 'enabled' : 'disabled'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <WorkspaceEmptyState
                eyebrow="Connector Bootstrap"
                title="先定义接入资产，再补协议细节"
                description="接入页的空态应该告诉你下一步怎么建模，而不是留出一整块未命名空白。"
                cues={[
                  {
                    title: '1. 建立接入对象',
                    detail: '先把连接器当成资产条目维护，再决定它属于哪种协议或系统。',
                  },
                  {
                    title: '2. 填 endpoint 与认证',
                    detail: '把协议字段、endpoint 和 authConfig 作为同一份接入描述统一管理。',
                  },
                  {
                    title: '3. 再去 bindings 绑定实体',
                    detail: '连接器页不承担实体映射，避免职责再次混在一起。',
                  },
                ]}
                asideTitle="工作顺序"
                asideDetail="先定义 source system，再让 bindings 去消费它，后台层级才不会重新塌平。"
              />
            )}
          </div>
        </SectionPanel>

        <SectionPanel
          eyebrow="Connector Editor"
          title={draft.draft ? `${draft.draft.name} 配置` : '连接器详情'}
          description="保持常用字段可视化，复杂认证和扩展配置走 JSON。"
        >
          <div className="space-y-4">
            {draft.draft ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>ID</Label>
                    <Input
                      value={draft.draft.id}
                      onChange={(event) =>
                        draft.updateDraft((current) => ({
                          ...current,
                          id: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>名称</Label>
                    <Input
                      value={draft.draft.name}
                      onChange={(event) =>
                        draft.updateDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>协议</Label>
                    <Input
                      value={draft.draft.protocol}
                      onChange={(event) =>
                        draft.updateDraft((current) => ({
                          ...current,
                          protocol: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Endpoint</Label>
                    <Input
                      value={draft.draft.endpoint}
                      onChange={(event) =>
                        draft.updateDraft((current) => ({
                          ...current,
                          endpoint: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>启用状态</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={draft.draft.enabled ? 'true' : 'false'}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        enabled: event.target.value === 'true',
                      }))
                    }
                  >
                    <option value="true">启用</option>
                    <option value="false">停用</option>
                  </select>
                </div>

                <p className="text-xs text-muted-foreground">
                  `authConfig` 等复杂字段请通过高级 JSON 维护。
                </p>

                <AdvancedJsonEditor
                  value={draft.draftText}
                  onChange={draft.setDraftText}
                  onApply={() => {
                    if (!draft.applyDraftText()) {
                      setStatusMessage('连接器 JSON 无法解析')
                      return
                    }
                    setStatusMessage('已从 JSON 应用连接器草稿')
                  }}
                />

                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="destructive" onClick={() => void removeConnector()}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除连接器
                  </Button>
                  <Button onClick={() => void saveConnector()}>
                    <Save className="mr-1 h-4 w-4" />
                    保存连接器
                  </Button>
                </div>
              </>
            ) : (
              <WorkspaceEmptyState
                eyebrow="Protocol Workspace"
                title="协议编辑区待命中"
                description="先从左侧选择一个连接器，右侧才进入协议、endpoint 与认证配置的深度编辑。"
                cues={[
                  {
                    title: '协议字段',
                    detail: '把通用参数留在结构化表单里，让高频维护更稳定。',
                  },
                  {
                    title: '认证扩展',
                    detail: '复杂的 authConfig 和高级参数继续走 JSON，不把表单做成万能抽屉。',
                  },
                  {
                    title: '运行态影响',
                    detail: '保存连接器后，接入层配置会直接变化，所以这里必须是一个专注工作区。',
                  },
                ]}
                asideTitle="编辑原则"
                asideDetail="先锁定对象，再改协议细节，避免后台回到“每页一堆重复表单”的老问题。"
              />
            )}
          </div>
        </SectionPanel>
      </div>
    </AdminSectionFrame>
  )
}

function BindingsSection() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [connectors, setConnectors] = useState<DataConnector[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [bindingsSource, setBindingsSource] = useState<EntityBinding[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const draft = useStructuredDraft(bindingsSource, cloneBindingsDraft)

  const loadData = useCallback(async (entityId?: string) => {
    setIsLoading(true)
    try {
      const [loadedEntities, loadedConnectors] = await Promise.all([
        listAdminEntities(),
        listDataConnectors(),
      ])
      const nextEntityId = entityId ?? selectedEntityId ?? loadedEntities[0]?.id ?? ''
      const nextBindings = nextEntityId ? await listEntityBindings(nextEntityId) : []

      setEntities(loadedEntities)
      setConnectors(loadedConnectors)
      setSelectedEntityId(nextEntityId)
      setBindingsSource(nextBindings)
      setStatusMessage('已同步绑定配置')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载绑定失败')
    } finally {
      setIsLoading(false)
    }
  }, [selectedEntityId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const saveBindings = useCallback(async () => {
    if (!selectedEntityId) {
      setStatusMessage('请选择实体后再保存绑定')
      return
    }

    const payload = draft.applyDraftText()
    if (!payload) {
      setStatusMessage('绑定 JSON 无法解析')
      return
    }

    try {
      await replaceEntityBindings(selectedEntityId, payload)
      setStatusMessage('绑定已保存')
      await loadData(selectedEntityId)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存绑定失败')
    }
  }, [draft, loadData, selectedEntityId])

  const bindingCount = draft.draft?.length ?? bindingsSource.length

  return (
    <AdminSectionFrame
      section="bindings"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadData()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新绑定
        </Button>
      }
      metrics={[
        {
          label: '目标实体',
          value: entities.find((entity) => entity.id === selectedEntityId)?.name ?? '--',
          detail: selectedEntityId || '先选择一个实体',
        },
        {
          label: '绑定条目',
          value: bindingCount,
          detail: `连接器池 ${connectors.length} 个`,
        },
        {
          label: '编辑方式',
          value: 'Structured + JSON',
          detail: '既保留点位映射表单，也允许整批 JSON 直接覆盖。',
        },
      ]}
      railCards={[
        {
          title: '模块位置',
          value: '实体与连接器之间',
          detail: 'bindings 是中间层，负责把业务对象接到实时点位，不承担源系统定义。',
        },
        {
          title: '操作建议',
          value: '一边选实体，一边维护映射',
          detail: '先切实体，再按条目编辑 sourcePath 和 mapping，避免上下文混乱。',
        },
      ]}
    >
      <SectionPanel
        eyebrow="Binding Workspace"
        title="绑定编辑器"
        description="把选择实体、查看连接器池和编辑绑定条目放进同一工作区。"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>选择实体</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={selectedEntityId}
                onChange={(event) => {
                  setSelectedEntityId(event.target.value)
                  void loadData(event.target.value)
                }}
              >
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name} ({entity.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>连接器概览</Label>
              <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                已接入 {connectors.length} 个连接器
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>结构化绑定表单</Label>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedEntityId}
                onClick={() => {
                  draft.updateDraft((current) => [
                    ...current,
                    createBindingTemplate(selectedEntityId, connectors[0]?.id ?? ''),
                  ])
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                新增绑定
              </Button>
            </div>

            {draft.draft && draft.draft.length > 0 ? (
              draft.draft.map((binding, index) => (
                <div key={binding.bindingId} className="space-y-3 rounded-lg border p-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>连接器</Label>
                      <select
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={binding.connectorId}
                        onChange={(event) =>
                          draft.updateDraft((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, connectorId: event.target.value }
                                : item
                            )
                          )
                        }
                      >
                        {connectors.map((connector) => (
                          <option key={connector.id} value={connector.id}>
                            {connector.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>源路径</Label>
                      <Input
                        value={binding.sourcePath}
                        onChange={(event) =>
                          draft.updateDraft((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, sourcePath: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                      <Label>映射 JSON</Label>
                      <Textarea
                        defaultValue={formatAdminJson(binding.mapping)}
                        className="min-h-[110px] font-mono text-xs"
                        onBlur={(event) => {
                          const nextMapping = parseAdminJson(event.target.value, binding.mapping)
                          draft.updateDraft((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, mapping: nextMapping }
                                : item
                            )
                          )
                        }}
                      />
                    </div>
                    <div className="flex flex-col justify-between gap-2">
                      <div className="space-y-2">
                        <Label>启用状态</Label>
                        <select
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                          value={binding.enabled ? 'true' : 'false'}
                          onChange={(event) =>
                            draft.updateDraft((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, enabled: event.target.value === 'true' }
                                  : item
                              )
                            )
                          }
                        >
                          <option value="true">启用</option>
                          <option value="false">停用</option>
                        </select>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          draft.updateDraft((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index)
                          )
                        }
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">当前实体暂无绑定，可直接新增。</p>
            )}
          </div>

          <AdvancedJsonEditor
            value={draft.draftText}
            onChange={draft.setDraftText}
            onApply={() => {
              if (!draft.applyDraftText()) {
                setStatusMessage('绑定 JSON 无法解析')
                return
              }
              setStatusMessage('已从 JSON 应用绑定草稿')
            }}
          />

          <div className="flex justify-end">
            <Button onClick={() => void saveBindings()}>
              <Save className="mr-1 h-4 w-4" />
              保存绑定
            </Button>
          </div>
        </div>
      </SectionPanel>
    </AdminSectionFrame>
  )
}

function RulesSection() {
  const [rules, setRules] = useState<RuleConfig[]>([])
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [draftSeed, setDraftSeed] = useState<RuleConfig | null>(null)
  const [ruleValidation, setRuleValidation] = useState<string[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const selectedRule = useMemo(
    () => rules.find((rule) => rule.id === selectedRuleId) ?? null,
    [rules, selectedRuleId]
  )
  const draft = useStructuredDraft(draftSeed ?? selectedRule, cloneRuleDraft)

  const loadRulesData = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listRules()
      setRules(loaded)
      setSelectedRuleId((current) => current ?? loaded[0]?.id ?? null)
      setStatusMessage('已同步规则配置')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载规则失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRulesData()
  }, [loadRulesData])

  const saveRule = useCallback(
    async (nodes?: Node[], edges?: Edge[]) => {
      const payload = draft.applyDraftText() ?? draft.draft
      if (!payload) {
        setStatusMessage('规则 JSON 无法解析')
        return
      }

      const nextRule: RuleConfig = {
        ...payload,
        nodes: (nodes as RuleConfig['nodes'] | undefined) ?? payload.nodes,
        edges: (edges as RuleConfig['edges'] | undefined) ?? payload.edges,
        updatedAt: Date.now(),
      }

      try {
        if (rules.some((rule) => rule.id === nextRule.id)) {
          await updateRule(nextRule.id, nextRule)
          setStatusMessage('规则已更新')
        } else {
          await createRule(nextRule)
          setStatusMessage('规则已创建')
        }
        setDraftSeed(null)
        setSelectedRuleId(nextRule.id)
        await loadRulesData()
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '保存规则失败')
      }
    },
    [draft, loadRulesData, rules]
  )

  const removeRule = useCallback(async () => {
    if (!selectedRuleId || !selectedRule) {
      setStatusMessage('请先选择已存在的规则')
      return
    }

    try {
      await deleteRule(selectedRuleId)
      setStatusMessage('规则已删除')
      setSelectedRuleId(null)
      setDraftSeed(null)
      setRuleValidation([])
      await loadRulesData()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '删除规则失败')
    }
  }, [loadRulesData, selectedRule, selectedRuleId])

  const runRuleValidation = useCallback(async () => {
    const payload = draft.applyDraftText() ?? draft.draft
    if (!payload) {
      setStatusMessage('规则 JSON 无法解析')
      return
    }

    try {
      const result = await validateRule(payload.id, payload)
      setRuleValidation(result.errors)
      setStatusMessage(result.valid ? '规则校验通过' : '规则校验未通过')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '规则校验失败')
    }
  }, [draft])

  const enabledRuleCount = rules.filter((rule) => rule.enabled).length

  return (
    <AdminSectionFrame
      section="rules"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadRulesData()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新规则
        </Button>
      }
      metrics={[
        {
          label: '规则总数',
          value: rules.length,
          detail: `${enabledRuleCount} 条当前启用`,
        },
        {
          label: '当前规则',
          value: draft.draft?.name ?? selectedRule?.name ?? '--',
          detail: draft.draft?.enabled ? '启用中' : '未启用或未选择',
        },
        {
          label: '校验结果',
          value: ruleValidation.length > 0 ? `${ruleValidation.length} 条问题` : 'Ready',
          detail: '规则图保存前建议至少跑一次后端校验。',
        },
      ]}
      railCards={[
        {
          title: '编排模式',
          value: 'List + Canvas',
          detail: '左侧挑选规则，右侧在图画布和描述区内完成编辑。',
        },
        {
          title: '安全边界',
          value: '先校验，再保存',
          detail: '规则错误的破坏面比普通配置大，后台需要给出更强的验证反馈。',
        },
      ]}
    >
      <div className="grid gap-4 2xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="Rule Inventory"
          title="规则列表"
          description="把规则作为一组可编排资产管理，而不是孤立的 JSON 文本。"
        >
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                const template = createRuleTemplate()
                setDraftSeed(template)
                setSelectedRuleId(null)
                draft.replaceDraft(template)
                setRuleValidation([])
                setStatusMessage('已创建规则模板草稿')
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              新建规则
            </Button>

            <ScrollArea className="h-[520px]">
              <div className="space-y-2 pr-3">
                {rules.map((rule) => (
                  <button
                    key={rule.id}
                    type="button"
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      selectedRuleId === rule.id && draftSeed === null
                        ? 'border-primary bg-primary/10'
                        : ''
                    }`}
                    onClick={() => {
                      setDraftSeed(null)
                      setSelectedRuleId(rule.id)
                      setRuleValidation([])
                    }}
                  >
                    <div className="font-medium">{rule.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {rule.enabled ? '启用' : '停用'} · version {rule.version ?? 1}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </SectionPanel>

        <SectionPanel
          eyebrow="Rule Workspace"
          title={draft.draft ? draft.draft.name : '规则详情'}
          description="描述、启停、图编排与校验结果都应该聚合在同一个编辑工作区。"
        >
          <div className="space-y-4">
            {draft.draft ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>规则名称</Label>
                    <Input
                      value={draft.draft.name}
                      onChange={(event) =>
                        draft.updateDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>启用状态</Label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={draft.draft.enabled ? 'true' : 'false'}
                      onChange={(event) =>
                        draft.updateDraft((current) => ({
                          ...current,
                          enabled: event.target.value === 'true',
                        }))
                      }
                    >
                      <option value="true">启用</option>
                      <option value="false">停用</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>描述</Label>
                  <Textarea
                    className="min-h-[90px]"
                    value={draft.draft.description}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="h-[480px] overflow-hidden rounded-lg border">
                  <RuleEditor
                    ruleId={draft.draft.id}
                    ruleName={draft.draft.name}
                    initialNodes={draft.draft.nodes as unknown as Node[]}
                    initialEdges={draft.draft.edges as unknown as Edge[]}
                    onSave={(nodes, edges) => {
                      draft.updateDraft((current) => ({
                        ...current,
                        nodes: nodes as unknown as RuleConfig['nodes'],
                        edges: edges as unknown as RuleConfig['edges'],
                      }))
                      void saveRule(nodes, edges)
                    }}
                  />
                </div>

                {ruleValidation.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    {ruleValidation.join('；')}
                  </div>
                ) : null}

                <AdvancedJsonEditor
                  value={draft.draftText}
                  onChange={draft.setDraftText}
                  onApply={() => {
                    if (!draft.applyDraftText()) {
                      setStatusMessage('规则 JSON 无法解析')
                      return
                    }
                    setStatusMessage('已从 JSON 应用规则草稿')
                  }}
                />

                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => void runRuleValidation()}>
                    校验规则
                  </Button>
                  <Button variant="destructive" onClick={() => void removeRule()}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除规则
                  </Button>
                  <Button onClick={() => void saveRule()}>
                    <Save className="mr-1 h-4 w-4" />
                    保存规则
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">请选择规则或创建新模板。</p>
            )}
          </div>
        </SectionPanel>
      </div>
    </AdminSectionFrame>
  )
}

function AlarmsSection() {
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const loadAlarms = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listAdminAlarms()
      setAlarms(loaded)
      setStatusMessage('已同步告警中心数据')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载告警失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAlarms()
  }, [loadAlarms])

  const unacknowledgedCount = alarms.filter((alarm) => !alarm.acknowledged).length

  return (
    <AdminSectionFrame
      section="alarms"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadAlarms()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新告警
        </Button>
      }
      metrics={[
        {
          label: '告警总数',
          value: alarms.length,
          detail: `${unacknowledgedCount} 条待确认`,
        },
        {
          label: '治理阶段',
          value: 'Read Only',
          detail: '首期以观测和排查为主，处置流留到后续阶段。',
        },
      ]}
      railCards={[
        {
          title: '当前能力',
          value: '观察与聚焦',
          detail: '告警中心先承担态势展示职责，后续再承接完整处置动作。',
        },
        {
          title: '阅读方式',
          value: '先看待确认，再看时间线',
          detail: '后台页需要让高优先级告警天然浮到上面。',
        },
      ]}
      showLiveWarning={false}
    >
      <SectionPanel
        eyebrow="Alarm Feed"
        title="当前告警列表"
        description="把告警做成治理 feed，而不是普通列表。"
      >
        <div className="space-y-3">
          {alarms.length === 0 ? (
            <p className="text-sm text-muted-foreground">当前没有持久化告警记录。</p>
          ) : (
            alarms.map((alarm) => (
              <div
                key={alarm.id}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{alarm.message}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(alarm.timestamp).toLocaleString('zh-CN')} · level {alarm.level}
                    </div>
                  </div>
                  <Badge variant={alarm.acknowledged ? 'outline' : 'destructive'}>
                    {alarm.acknowledged ? '已确认' : '待确认'}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionPanel>
    </AdminSectionFrame>
  )
}

function AuditSection() {
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const loadAudit = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listAdminAuditEvents()
      setAuditEvents(loaded)
      setStatusMessage('已同步审计日志')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载审计日志失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAudit()
  }, [loadAudit])

  return (
    <AdminSectionFrame
      section="audit"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadAudit()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新审计
        </Button>
      }
      metrics={[
        {
          label: '事件数',
          value: auditEvents.length,
          detail: '用于追踪后台配置行为和生效时间。',
        },
        {
          label: '最近操作者',
          value: auditEvents[0]?.actor ?? '--',
          detail: auditEvents[0]?.resourceType ?? '暂无审计记录',
        },
      ]}
      railCards={[
        {
          title: '模块定位',
          value: '变更时间线',
          detail: '审计页是后台责任链，不该只是普通文本列表。',
        },
        {
          title: '使用方式',
          value: '改完即回看',
          detail: '每次修改后回到审计页，确认 actor、resource 和 payload 是否正确落库。',
        },
      ]}
      showLiveWarning={false}
    >
      <SectionPanel
        eyebrow="Audit Timeline"
        title="最近审计事件"
        description="突出变更责任和 payload，而不是让日志淹没在统一卡片里。"
      >
        <div className="space-y-3">
          {auditEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">当前暂无审计记录。</p>
          ) : (
            auditEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{event.action}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {event.actor} · {event.resourceType} · {event.resourceId}
                    </div>
                  </div>
                  <Badge variant="outline">
                    {new Date(event.createdAt).toLocaleString('zh-CN')}
                  </Badge>
                </div>
                <pre className="mt-3 overflow-x-auto rounded bg-muted p-2 text-[11px] text-muted-foreground">
                  {formatAdminJson(event.payload)}
                </pre>
              </div>
            ))
          )}
        </div>
      </SectionPanel>
    </AdminSectionFrame>
  )
}

export function AdminConsole({ section }: { section: AdminSection }) {
  switch (section) {
    case 'overview':
      return <OverviewSection />
    case 'scene':
      return <SceneSection />
    case 'entities':
      return <EntitiesSection />
    case 'connectors':
      return <ConnectorsSection />
    case 'bindings':
      return <BindingsSection />
    case 'rules':
      return <RulesSection />
    case 'alarms':
      return <AlarmsSection />
    case 'audit':
      return <AuditSection />
    default:
      return (
        <Card>
          <CardHeader>
            <CardTitle>未知后台模块</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              请返回<Link href="/admin/overview" className="text-primary underline">总览</Link>。
            </p>
          </CardContent>
        </Card>
      )
  }
}
