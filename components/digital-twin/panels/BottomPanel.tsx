'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { 
  Clock, 
  GitBranch, 
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  MonitorPlay,
  Sparkles,
  LocateFixed,
} from 'lucide-react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { isRuntimeIncidentActive } from '@/lib/digital-twin/incident-utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ViewerAdminEmptyCard,
  ViewerAdminPanelHeader,
  ViewerAdminSidePanelBody,
  ViewerAdminSoftCard,
} from '@/components/viewer-admin/primitives'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import { cn } from '@/lib/utils'

const ALARM_ICON_MAP = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  critical: XCircle,
}

const ALARM_COLOR_MAP = {
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#ef4444',
  critical: '#dc2626',
}

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
    persons: stats.persons + Math.floor(Math.random() * 3) - 1,
    vehicles: stats.vehicles + Math.floor(Math.random() * 2) - 1,
    equipment: stats.activeEquipment + Math.floor(Math.random() * 2),
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
  const entityDirectory = useDigitalTwinStore((state) => state.entityDirectory)
  const ruleMap = useDigitalTwinStore((state) => state.rules)
  const rules = useMemo(() => Array.from(ruleMap.values()), [ruleMap])
  const unacknowledgedAlarmCount = useMemo(
    () => alarms.reduce((count, alarm) => (alarm.acknowledged ? count : count + 1), 0),
    [alarms]
  )
  const unacknowledgedIncidentCount = useMemo(
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

  // 统计数据
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

  // 图表单独降频刷新，避免随实体高频更新重绘
  useEffect(() => {
    const timer = setInterval(() => {
      const point = createChartPoint(Date.now(), statsRef.current)
      setChartData((prev) => [...prev.slice(-19), point])
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <ViewerAdminSidePanelBody>
      <Tabs 
        value={bottomPanelTab} 
        onValueChange={(v) => setBottomPanelTab(v as typeof bottomPanelTab)}
        className="flex h-full flex-col"
      >
        <div className="flex items-center justify-between border-b border-white/8 px-4">
          <TabsList className="h-10">
            <TabsTrigger value="timeline" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              时间轴
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-1.5 text-xs">
              <GitBranch className="h-3.5 w-3.5" />
              规则摘要
            </TabsTrigger>
            <TabsTrigger value="charts" className="gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              数据图表
            </TabsTrigger>
          </TabsList>

          {/* 告警摘要 */}
          <div className="flex items-center gap-2">
            {unacknowledgedIncidentCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3 w-3" />
                {unacknowledgedIncidentCount} 条活跃事件
              </Badge>
            )}
            {unacknowledgedAlarmCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {unacknowledgedAlarmCount} 条未处理告警
              </Badge>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {/* 时间轴 */}
          <TabsContent value="timeline" className="m-0 h-full">
            <div className="flex h-full">
              {/* 事件流 */}
              <div className="w-[360px] border-r border-white/8">
                <ViewerAdminPanelHeader
                  title="Citation / 事件流"
                  trailing={
                    <Badge variant="outline" className="text-xs">
                      {incidents.length}
                    </Badge>
                  }
                  className="px-3 py-2"
                />
                <ScrollArea className="h-[calc(100%-41px)]">
                  <div className="space-y-1 p-2">
                    {incidents.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Sparkles className="mb-2 h-8 w-8" />
                        <span className="text-sm">等待事件联动</span>
                        <span className="mt-1 text-xs">等待外部数据源推送事件与告警</span>
                      </div>
                    ) : (
                      incidents.map((incident) => {
                        const Icon = ALARM_ICON_MAP[incident.severity]
                        const color = ALARM_COLOR_MAP[incident.severity]
                        return (
                          <ViewerAdminSoftCard
                            key={incident.id}
                            className={cn(
                              'rounded-xl p-3 transition-colors',
                              incident.acknowledged && 'opacity-50',
                              activeIncident?.id === incident.id &&
                                'border-primary/50 bg-primary/10'
                            )}
                            onClick={() => setActiveIncident(incident.id)}
                          >
                            <div className="flex items-start gap-2">
                              <Icon
                                className="mt-0.5 h-4 w-4 flex-shrink-0"
                                style={{ color }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium">{incident.title}</p>
                                  <Badge variant="outline" className="text-[10px]">
                                    {incident.kind}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">{incident.summary}</p>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {incident.citations.slice(0, 2).map((citation) => (
                                    <Badge key={citation.id} variant="secondary" className="text-[10px]">
                                      {citation.label}: {citation.value}
                                    </Badge>
                                  ))}
                                </div>
                                <p className="mt-2 text-[10px] text-muted-foreground">
                                  {new Date(incident.timestamp).toLocaleString('zh-CN')}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  focusCameraOnEntity(incident.primaryEntityId)
                                  setActiveIncident(incident.id)
                                }}
                              >
                                <LocateFixed className="mr-1 h-3.5 w-3.5" />
                                聚焦
                              </Button>
                              {incident.videoFeed && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    openIncidentVideo(incident.videoFeed!, incident.id)
                                  }}
                                >
                                  <MonitorPlay className="mr-1 h-3.5 w-3.5" />
                                  视频弹窗
                                </Button>
                              )}
                              {!incident.acknowledged && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    acknowledgeIncident(incident.id)
                                  }}
                                >
                                  确认事件
                                </Button>
                              )}
                            </div>
                          </ViewerAdminSoftCard>
                        )
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* 事件详情与实时统计 */}
              <div className="flex-1 p-4">
                <ViewerAdminSoftCard className="mb-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                        Focus incident
                      </div>
                      <h4 className="mt-2 text-base font-semibold">
                        {activeIncident?.title ?? '暂无活跃事件'}
                      </h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activeIncident?.message ?? '系统会根据人 / 车移动状态自动生成证据化事件卡片。'}
                      </p>
                    </div>
                    {activeIncident && (
                      <Badge variant="destructive" className="capitalize">
                        {activeIncident.severity}
                      </Badge>
                    )}
                  </div>

                  {activeIncident?.citations?.length ? (
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {activeIncident.citations.map((citation) => (
                        <ViewerAdminSoftCard key={citation.id} className="rounded-xl p-3">
                          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {citation.label}
                          </div>
                          <div className="mt-1 text-sm">{citation.value}</div>
                        </ViewerAdminSoftCard>
                      ))}
                    </div>
                  ) : null}
                </ViewerAdminSoftCard>

                <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
                  <StatCard
                    label="活跃事件"
                    value={unacknowledgedIncidentCount}
                    color="#8b5cf6"
                    isWarning={unacknowledgedIncidentCount > 0}
                  />
                  <StatCard 
                    label="在线人员" 
                    value={stats.persons} 
                    color="#3b82f6"
                  />
                  <StatCard 
                    label="运行车辆" 
                    value={stats.vehicles} 
                    color="#f59e0b"
                  />
                  <StatCard 
                    label="设备运行" 
                    value={stats.activeEquipment} 
                    total={stats.equipment}
                    color="#22c55e"
                  />
                  <StatCard 
                    label="设备告警" 
                    value={stats.warningEquipment} 
                    color="#ef4444"
                    isWarning
                  />
                </div>

                <ViewerAdminSoftCard className="mt-4 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium">告警摘要</span>
                    <Badge variant="outline">{alarms.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {alarms.slice(0, 4).map((alarm) => {
                      const Icon = ALARM_ICON_MAP[alarm.level]
                      return (
                        <ViewerAdminSoftCard
                          key={alarm.id}
                          className="flex items-center gap-3 rounded-xl p-2.5"
                        >
                          <Icon className="h-4 w-4" style={{ color: ALARM_COLOR_MAP[alarm.level] }} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">{alarm.message}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {new Date(alarm.timestamp).toLocaleString('zh-CN')}
                            </div>
                          </div>
                          {!alarm.acknowledged && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => acknowledgeAlarm(alarm.id)}
                            >
                              确认
                            </Button>
                          )}
                        </ViewerAdminSoftCard>
                      )
                    })}
                    {alarms.length === 0 && (
                      <ViewerAdminEmptyCard className="flex items-center gap-2 border-dashed p-3 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        当前无传统告警，重点关注事件联动卡片。
                      </ViewerAdminEmptyCard>
                    )}
                  </div>
                </ViewerAdminSoftCard>
              </div>
            </div>
          </TabsContent>

          {/* 规则摘要 */}
          <TabsContent value="rules" className="m-0 h-full">
            <div className="flex h-full flex-col gap-4 p-4">
              <ViewerAdminSoftCard className="border-amber-300/30 bg-amber-300/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-medium text-amber-100/90">规则配置已迁移到后台管理中心</h4>
                    <p className="mt-1 text-xs text-amber-100/70">
                      运行态仅展示规则摘要和告警结果，规则作者入口、保存与校验统一在后台完成。
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link href="/admin/rules">前往管理中心</Link>
                  </Button>
                </div>
              </ViewerAdminSoftCard>

              <div className="grid gap-4 md:grid-cols-3">
                <StatCard label="规则总数" value={rules.length} color="#8b5cf6" />
                <StatCard
                  label="启用规则"
                  value={rules.filter((rule) => rule.enabled).length}
                  color="#22c55e"
                />
                <StatCard
                  label="停用规则"
                  value={rules.filter((rule) => !rule.enabled).length}
                  color="#f59e0b"
                />
              </div>

              <ScrollArea className="viewer-admin-soft-card flex-1 rounded-2xl">
                <div className="space-y-3 p-4">
                  {rules.length === 0 ? (
                    <ViewerAdminEmptyCard className="border-dashed p-6 text-center text-sm text-muted-foreground">
                      当前未加载规则配置。
                    </ViewerAdminEmptyCard>
                  ) : (
                    rules.map((rule) => (
                      <ViewerAdminSoftCard key={rule.id} className="rounded-xl p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-medium">{rule.name}</div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {rule.description || '未填写规则描述'}
                            </p>
                          </div>
                          <Badge variant={rule.enabled ? 'secondary' : 'outline'}>
                            {rule.enabled ? '启用中' : '已停用'}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{rule.nodes.length} 个节点</span>
                          <span>{rule.edges.length} 条连线</span>
                          <span>version {rule.version ?? 1}</span>
                        </div>
                      </ViewerAdminSoftCard>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* 数据图表 */}
          <TabsContent value="charts" className="m-0 h-full p-4">
            <div className="grid h-full grid-cols-2 gap-4">
              {/* 人员活动趋势 */}
              <ViewerAdminSoftCard className="p-3">
                <h4 className="mb-2 text-sm font-medium">实时活动趋势</h4>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 10, fill: '#666' }}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: '#666' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="persons" 
                      name="人员"
                      stroke="#3b82f6" 
                      fill="#3b82f680"
                      strokeWidth={2}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="vehicles" 
                      name="车辆"
                      stroke="#f59e0b" 
                      fill="#f59e0b80"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ViewerAdminSoftCard>

              {/* 设备状态 */}
              <ViewerAdminSoftCard className="p-3">
                <h4 className="mb-2 text-sm font-medium">设备运行状态</h4>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 10, fill: '#666' }}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: '#666' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="equipment" 
                      name="运行设备"
                      stroke="#22c55e" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ViewerAdminSoftCard>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </ViewerAdminSidePanelBody>
  )
}

interface StatCardProps {
  label: string
  value: number
  total?: number
  color: string
  isWarning?: boolean
}

function StatCard({ label, value, total, color, isWarning }: StatCardProps) {
  return (
    <ViewerAdminSoftCard
      className={cn(
        'p-3',
        isWarning && value > 0 && 'border-red-400/40 bg-red-500/10'
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color }}>
        {value}
        {total !== undefined && (
          <span className="text-sm font-normal text-muted-foreground">
            /{total}
          </span>
        )}
      </p>
    </ViewerAdminSoftCard>
  )
}
