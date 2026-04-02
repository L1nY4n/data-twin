'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { 
  Clock, 
  GitBranch, 
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
} from 'lucide-react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { RuleEditor } from '../rules/RuleEditor'
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
  const acknowledgeAlarm = useDigitalTwinStore((state) => state.acknowledgeAlarm)
  const entityDirectory = useDigitalTwinStore((state) => state.entityDirectory)
  const unacknowledgedAlarmCount = useMemo(
    () => alarms.reduce((count, alarm) => (alarm.acknowledged ? count : count + 1), 0),
    [alarms]
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
    <div className="flex h-full flex-col">
      <Tabs 
        value={bottomPanelTab} 
        onValueChange={(v) => setBottomPanelTab(v as typeof bottomPanelTab)}
        className="flex h-full flex-col"
      >
        <div className="flex items-center justify-between border-b px-4">
          <TabsList className="h-10">
            <TabsTrigger value="timeline" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              时间轴
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-1.5 text-xs">
              <GitBranch className="h-3.5 w-3.5" />
              规则引擎
            </TabsTrigger>
            <TabsTrigger value="charts" className="gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              数据图表
            </TabsTrigger>
          </TabsList>

          {/* 告警摘要 */}
          <div className="flex items-center gap-2">
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
              {/* 告警列表 */}
              <div className="w-80 border-r">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-sm font-medium">告警列表</span>
                  <Badge variant="outline" className="text-xs">
                    {alarms.length}
                  </Badge>
                </div>
                <ScrollArea className="h-[calc(100%-41px)]">
                  <div className="space-y-1 p-2">
                    {alarms.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <CheckCircle2 className="mb-2 h-8 w-8" />
                        <span className="text-sm">暂无告警</span>
                      </div>
                    ) : (
                      alarms.map((alarm) => {
                        const Icon = ALARM_ICON_MAP[alarm.level]
                        const color = ALARM_COLOR_MAP[alarm.level]
                        return (
                          <div
                            key={alarm.id}
                            className={cn(
                              'flex items-start gap-2 rounded-md border p-2',
                              alarm.acknowledged && 'opacity-50'
                            )}
                          >
                            <Icon
                              className="mt-0.5 h-4 w-4 flex-shrink-0"
                              style={{ color }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs">{alarm.message}</p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {new Date(alarm.timestamp).toLocaleString('zh-CN')}
                              </p>
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
                          </div>
                        )
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* 实时统计 */}
              <div className="flex-1 p-4">
                <div className="grid grid-cols-4 gap-4">
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
              </div>
            </div>
          </TabsContent>

          {/* 规则引擎 */}
          <TabsContent value="rules" className="m-0 h-full">
            <RuleEditor 
              ruleName="访客危险区域告警规则"
              onSave={(nodes, edges) => {
                console.log('[v0] Rule saved:', { nodes, edges })
              }}
            />
          </TabsContent>

          {/* 数据图表 */}
          <TabsContent value="charts" className="m-0 h-full p-4">
            <div className="grid h-full grid-cols-2 gap-4">
              {/* 人员活动趋势 */}
              <div className="rounded-lg border p-3">
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
              </div>

              {/* 设备状态 */}
              <div className="rounded-lg border p-3">
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
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
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
    <div className={cn(
      'rounded-lg border p-3',
      isWarning && value > 0 && 'border-red-500/50 bg-red-500/5'
    )}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color }}>
        {value}
        {total !== undefined && (
          <span className="text-sm font-normal text-muted-foreground">
            /{total}
          </span>
        )}
      </p>
    </div>
  )
}
