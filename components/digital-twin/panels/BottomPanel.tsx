'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  Clock,
  GitBranch,
  Info,
  LocateFixed,
  MonitorPlay,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { isRuntimeIncidentActive } from '@/lib/digital-twin/incident-utils'
import { resolveRuntimeEventType } from '@/lib/digital-twin/module-registry'
import type { Alarm, RuntimeIncident } from '@/lib/digital-twin/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ViewerAdminEmptyState,
  ViewerAdminContentCard,
  ViewerAdminKicker,
  ViewerAdminPanelHeader,
  ViewerAdminRecordCard,
  ViewerAdminSidePanelBody,
  ViewerAdminMetricTile,
} from '@/components/viewer-admin/primitives'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'

const ALARM_ICON_MAP = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  critical: XCircle,
} satisfies Record<Alarm['level'], typeof Info>

const ALARM_COLOR_MAP = {
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#ef4444',
  critical: '#dc2626',
} satisfies Record<Alarm['level'], string>

function createChartPoint(
  now: number,
  stats: { persons: number; vehicles: number; activeEquipment: number }
) {
  return {
    time: new Date(now).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    persons: Math.max(0, stats.persons + Math.floor(Math.random() * 3) - 1),
    vehicles: Math.max(0, stats.vehicles + Math.floor(Math.random() * 2) - 1),
    equipment: Math.max(0, stats.activeEquipment + Math.floor(Math.random() * 2)),
  }
}

export function BottomPanel() {
  const bottomPanelTab = useDigitalTwinStore((state) => state.bottomPanelTab)
  const setBottomPanelTab = useDigitalTwinStore((state) => state.setBottomPanelTab)
  const alarms = useDigitalTwinStore((state) => state.alarms)
  const incidents = useDigitalTwinStore((state) => state.incidents)
  const activeIncidentId = useDigitalTwinStore((state) => state.activeIncidentId)
  const setActiveIncident = useDigitalTwinStore((state) => state.setActiveIncident)
  const openIncidentVideo = useDigitalTwinStore((state) => state.openIncidentVideo)
  const focusCameraOnEntity = useDigitalTwinStore((state) => state.focusCameraOnEntity)
  const acknowledgeIncident = useDigitalTwinStore((state) => state.acknowledgeIncident)
  const acknowledgeAlarm = useDigitalTwinStore((state) => state.acknowledgeAlarm)
  const getEventTypeRegistration = useDigitalTwinStore((state) => state.getEventTypeRegistration)
  const entityDirectory = useDigitalTwinStore((state) => state.entityDirectory)
  const ruleMap = useDigitalTwinStore((state) => state.rules)

  const rules = useMemo(() => Array.from(ruleMap.values()), [ruleMap])
  const unacknowledgedAlarmCount = useMemo(
    () => alarms.reduce((count, alarm) => (alarm.acknowledged ? count : count + 1), 0),
    [alarms]
  )
  const activeIncidentCount = useMemo(
    () => incidents.reduce((count, incident) => (isRuntimeIncidentActive(incident) ? count + 1 : count), 0),
    [incidents]
  )
  const activeIncident = useMemo(
    () =>
      incidents.find((incident) => incident.id === activeIncidentId) ??
      incidents.find((incident) => isRuntimeIncidentActive(incident)) ??
      incidents[0] ??
      null,
    [activeIncidentId, incidents]
  )

  const stats = useMemo(() => {
    let persons = 0
    let vehicles = 0
    let equipment = 0
    let activeEquipment = 0
    let warningEquipment = 0

    entityDirectory.forEach((entity) => {
      switch (entity.type) {
        case 'person':
          persons++
          break
        case 'vehicle':
          vehicles++
          break
        case 'equipment':
        case 'sensor':
        case 'camera':
          equipment++
          if (entity.status === 'active') activeEquipment++
          if (entity.status === 'warning' || entity.status === 'error') warningEquipment++
          break
      }
    })

    return { persons, vehicles, equipment, activeEquipment, warningEquipment }
  }, [entityDirectory])

  const statsRef = useRef(stats)
  useEffect(() => {
    statsRef.current = stats
  }, [stats])

  const [chartData, setChartData] = useState(() => {
    const now = Date.now()
    return Array.from({ length: 20 }, (_, i) => createChartPoint(now - (19 - i) * 5000, stats))
  })

  useEffect(() => {
    const timer = setInterval(() => {
      const point = createChartPoint(Date.now(), statsRef.current)
      setChartData((prev) => [...prev.slice(-19), point])
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <ViewerAdminSidePanelBody className="viewer-message-panel">
      <Tabs
        value={bottomPanelTab}
        onValueChange={(value) => setBottomPanelTab(value as typeof bottomPanelTab)}
        className="flex h-full min-h-0 flex-col"
      >
        <ViewerAdminPanelHeader
          title="Message Panel"
          description="事件 / 告警 / 规则摘要"
          leading={<Bell className="h-4 w-4 text-sky-300" />}
          trailing={
            <div className="viewer-message-panel__header-badges">
              <Badge variant={activeIncidentCount > 0 ? 'secondary' : 'outline'}>
                {activeIncidentCount} active
              </Badge>
              <Badge variant={unacknowledgedAlarmCount > 0 ? 'destructive' : 'outline'}>
                {unacknowledgedAlarmCount} alarm
              </Badge>
            </div>
          }
          className="viewer-message-panel__header"
        />

        <div className="viewer-message-panel__tabbar">
          <TabsList className="viewer-message-panel__tabs">
            <TabsTrigger value="timeline" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              消息
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-1.5 text-xs">
              <GitBranch className="h-3.5 w-3.5" />
              规则
            </TabsTrigger>
            <TabsTrigger value="charts" className="gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              趋势
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <TabsContent value="timeline" className="m-0 h-full">
            <div className="viewer-message-panel__timeline">
              <div className="viewer-message-summary-grid">
                <ViewerAdminMetricTile
                  label="活跃事件"
                  value={renderPanelMetricValue(activeIncidentCount, '#8b5cf6')}
                  density="compact"
                  size="compact"
                  className={cn('viewer-message-stat-card', activeIncidentCount > 0 && 'is-warning')}
                />
                <ViewerAdminMetricTile
                  label="未处理告警"
                  value={renderPanelMetricValue(unacknowledgedAlarmCount, '#ef4444')}
                  density="compact"
                  size="compact"
                  className={cn('viewer-message-stat-card', unacknowledgedAlarmCount > 0 && 'is-warning')}
                />
                <ViewerAdminMetricTile
                  label="运行车辆"
                  value={renderPanelMetricValue(stats.vehicles, '#f59e0b')}
                  density="compact"
                  size="compact"
                  className="viewer-message-stat-card"
                />
                <ViewerAdminMetricTile
                  label="设备运行"
                  value={renderPanelMetricValue(stats.activeEquipment, '#22c55e', stats.equipment)}
                  density="compact"
                  size="compact"
                  className="viewer-message-stat-card"
                />
              </div>

              <ScrollArea className="viewer-message-list-scroll">
                <div className="viewer-message-card-stack">
                  {incidents.length === 0 ? (
                    <ViewerAdminEmptyState
                      title="等待事件数据"
                      description="外部数据源推送事件与告警后，会自动生成消息卡片。"
                      icon={Sparkles}
                      align="center"
                      className="viewer-message-empty"
                    />
                  ) : (
                    incidents.map((incident) => {
                      const eventType = resolveRuntimeEventType({
                        eventType: incident.eventType,
                        kind: incident.kind,
                      })
                      const eventTypeMeta = eventType
                        ? getEventTypeRegistration(eventType)
                        : undefined

                      return (
                        <MessageIncidentCard
                          key={incident.id}
                          incident={incident}
                          eventLabel={eventTypeMeta?.displayName ?? eventType ?? incident.kind}
                          active={activeIncident?.id === incident.id}
                          onSelect={() => setActiveIncident(incident.id)}
                          onFocus={() => {
                            focusCameraOnEntity(incident.primaryEntityId)
                            setActiveIncident(incident.id)
                          }}
                          onOpenVideo={() => {
                            if (incident.videoFeed) openIncidentVideo(incident.videoFeed, incident.id)
                          }}
                          onAcknowledge={() => acknowledgeIncident(incident.id)}
                        />
                      )
                    })
                  )}
                </div>
              </ScrollArea>

              <ActiveIncidentCard incident={activeIncident} />
              <AlarmSummary alarms={alarms} onAcknowledge={acknowledgeAlarm} />
            </div>
          </TabsContent>

          <TabsContent value="rules" className="m-0 h-full">
            <div className="viewer-rules-summary-list">
              <ViewerAdminContentCard className="border-amber-300/30 bg-amber-300/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-medium text-amber-100/90">规则配置在后台管理中心维护</h4>
                    <p className="mt-1 text-xs text-amber-100/70">
                      运行态只展示规则摘要和触发结果，编辑、保存与校验统一在管理端完成。
                    </p>
                  </div>
                  <Button asChild size="sm" className="shrink-0">
                    <Link href="/admin/rules">管理</Link>
                  </Button>
                </div>
              </ViewerAdminContentCard>

              <div className="viewer-message-summary-grid">
                <ViewerAdminMetricTile
                  label="规则总数"
                  value={renderPanelMetricValue(rules.length, '#8b5cf6')}
                  density="compact"
                  size="compact"
                  className="viewer-message-stat-card"
                />
                <ViewerAdminMetricTile
                  label="启用"
                  value={renderPanelMetricValue(rules.filter((rule) => rule.enabled).length, '#22c55e')}
                  density="compact"
                  size="compact"
                  className="viewer-message-stat-card"
                />
                <ViewerAdminMetricTile
                  label="停用"
                  value={renderPanelMetricValue(rules.filter((rule) => !rule.enabled).length, '#f59e0b')}
                  density="compact"
                  size="compact"
                  className="viewer-message-stat-card"
                />
              </div>

              <ScrollArea className="viewer-rules-scroll">
                <div className="viewer-message-card-stack">
                  {rules.length === 0 ? (
                    <ViewerAdminEmptyState
                      title="暂无规则配置"
                      description="后台管理中心保存规则后，运行态会展示规则摘要和触发结果。"
                      icon={GitBranch}
                      align="center"
                      className="p-6"
                    />
                  ) : (
                    rules.map((rule) => (
                      <ViewerAdminContentCard key={rule.id} className="viewer-rule-card">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{rule.name}</div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {rule.description || '未填写规则描述'}
                            </p>
                          </div>
                          <Badge variant={rule.enabled ? 'secondary' : 'outline'}>
                            {rule.enabled ? '启用' : '停用'}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{rule.nodes.length} nodes</span>
                          <span>{rule.edges.length} edges</span>
                          <span>v{rule.version ?? 1}</span>
                        </div>
                      </ViewerAdminContentCard>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="charts" className="m-0 h-full">
            <div className="viewer-chart-stack">
              <ViewerAdminContentCard className="viewer-chart-card">
                <h4 className="mb-2 text-sm font-medium">实时活动趋势</h4>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Area type="monotone" dataKey="persons" name="人员" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.18} />
                    <Area type="monotone" dataKey="vehicles" name="车辆" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.18} />
                    <Area type="monotone" dataKey="equipment" name="设备" stroke="#22c55e" fill="#22c55e" fillOpacity={0.18} />
                  </AreaChart>
                </ResponsiveContainer>
              </ViewerAdminContentCard>

              <ViewerAdminContentCard className="viewer-chart-card">
                <h4 className="mb-2 text-sm font-medium">运行负载</h4>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Line type="monotone" dataKey="equipment" name="设备" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="vehicles" name="车辆" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ViewerAdminContentCard>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </ViewerAdminSidePanelBody>
  )
}

const chartTooltipStyle = {
  backgroundColor: 'rgba(18, 19, 22, 0.96)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '12px',
  fontSize: '12px',
} as const

function renderPanelMetricValue(value: number, color: string, total?: number) {
  return (
    <span className="flex items-end gap-1.5">
      <span className="text-lg font-semibold" style={{ color }}>
        {value}
      </span>
      {total !== undefined ? <span className="pb-0.5 text-xs text-muted-foreground">/ {total}</span> : null}
    </span>
  )
}

function MessageIncidentCard({
  incident,
  eventLabel,
  active,
  onSelect,
  onFocus,
  onOpenVideo,
  onAcknowledge,
}: {
  incident: RuntimeIncident
  eventLabel: string
  active: boolean
  onSelect: () => void
  onFocus: () => void
  onOpenVideo: () => void
  onAcknowledge: () => void
}) {
  const Icon = ALARM_ICON_MAP[incident.severity]
  const color = ALARM_COLOR_MAP[incident.severity]

  return (
    <ViewerAdminRecordCard
      title={incident.title}
      meta={incident.summary}
      leading={
        <span className="viewer-message-card__icon" style={{ color }}>
          <Icon className="h-4 w-4" />
        </span>
      }
      trailing={
        <span className="viewer-message-card__time">
          {new Date(incident.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      }
      className={cn('viewer-message-card p-3', active && 'is-active', incident.acknowledged && 'is-acknowledged')}
      titleClassName="truncate text-sm font-semibold"
      metaClassName="line-clamp-2"
      bodyClassName="space-y-3"
      density="compact"
      onClick={onSelect}
    >
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline" className="text-[10px]">{eventLabel}</Badge>
        <Badge variant="secondary" className="text-[10px]">{incident.severity}</Badge>
        {incident.zoneName ? <Badge variant="outline" className="text-[10px]">{incident.zoneName}</Badge> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); onFocus() }}>
          <LocateFixed className="mr-1 h-3.5 w-3.5" />
          聚焦
        </Button>
        {incident.videoFeed ? (
          <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); onOpenVideo() }}>
            <MonitorPlay className="mr-1 h-3.5 w-3.5" />
            视频
          </Button>
        ) : null}
        {!incident.acknowledged ? (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); onAcknowledge() }}>
            确认
          </Button>
        ) : null}
      </div>
    </ViewerAdminRecordCard>
  )
}

function ActiveIncidentCard({ incident }: { incident: RuntimeIncident | null }) {
  if (!incident) {
    return (
      <ViewerAdminEmptyState
        title="暂无活跃事件"
        description="系统会根据移动对象、实时信号和规则触发生成证据化事件卡片。"
        icon={Sparkles}
        className="viewer-message-detail-card"
      />
    )
  }

  return (
    <ViewerAdminContentCard className="viewer-message-detail-card">
      <ViewerAdminKicker>focus message</ViewerAdminKicker>
      <h4 className="mt-1 line-clamp-2 text-sm font-semibold">
        {incident.title}
      </h4>
      <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
        {incident.message}
      </p>
      {incident.citations?.length ? (
        <div className="mt-3 grid gap-2">
          {incident.citations.slice(0, 3).map((citation) => (
            <div key={citation.id} className="viewer-message-citation-row">
              <span>{citation.label}</span>
              <strong>{citation.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </ViewerAdminContentCard>
  )
}

function AlarmSummary({
  alarms,
  onAcknowledge,
}: {
  alarms: Alarm[]
  onAcknowledge: (alarmId: string) => void
}) {
  return (
    <ViewerAdminContentCard className="viewer-alarm-summary">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">告警摘要</span>
        <Badge variant="outline">{alarms.length}</Badge>
      </div>
      <div className="space-y-2">
        {alarms.slice(0, 3).map((alarm) => {
          const Icon = ALARM_ICON_MAP[alarm.level]
          return (
            <div key={alarm.id} className="viewer-alarm-row">
              <Icon className="h-4 w-4" style={{ color: ALARM_COLOR_MAP[alarm.level] }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{alarm.message}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(alarm.timestamp).toLocaleString('zh-CN')}
                </div>
              </div>
              {!alarm.acknowledged ? (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onAcknowledge(alarm.id)}>
                  确认
                </Button>
              ) : null}
            </div>
          )
        })}
        {alarms.length === 0 ? (
          <ViewerAdminEmptyState
            title="暂无传统告警"
            description="当前重点关注事件联动卡片。"
            icon={CheckCircle2}
            density="compact"
            iconClassName="text-green-400"
          />
        ) : null}
      </div>
    </ViewerAdminContentCard>
  )
}
