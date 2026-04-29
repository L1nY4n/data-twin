'use client'

import {
  Activity,
  AlertTriangle,
  Bell,
  Gauge,
  ListTree,
  PanelLeft,
  PanelRight,
  RadioTower,
} from 'lucide-react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type ViewerHmiOverlayProps = {
  className?: string
}

function formatMetric(value: number, unit = '') {
  if (!Number.isFinite(value)) return `--${unit}`
  return `${value.toFixed(value >= 10 ? 0 : 1)}${unit}`
}

export function ViewerHmiOverlay({ className }: ViewerHmiOverlayProps) {
  const entityDirectory = useDigitalTwinStore((state) => state.entityDirectory)
  const incidents = useDigitalTwinStore((state) => state.incidents)
  const alarms = useDigitalTwinStore((state) => state.alarms)
  const isConnected = useDigitalTwinStore((state) => state.isConnected)
  const runtimeDataSource = useDigitalTwinStore((state) => state.runtimeDataSource)
  const runtimeNotice = useDigitalTwinStore((state) => state.runtimeNotice)
  const performanceMetrics = useDigitalTwinStore((state) => state.performanceMetrics)
  const rendererDiagnostics = useDigitalTwinStore((state) => state.rendererDiagnostics)
  const leftPanelOpen = useDigitalTwinStore((state) => state.leftPanelOpen)
  const rightPanelOpen = useDigitalTwinStore((state) => state.rightPanelOpen)
  const bottomPanelOpen = useDigitalTwinStore((state) => state.bottomPanelOpen)
  const toggleLeftPanel = useDigitalTwinStore((state) => state.toggleLeftPanel)
  const toggleRightPanel = useDigitalTwinStore((state) => state.toggleRightPanel)
  const toggleBottomPanel = useDigitalTwinStore((state) => state.toggleBottomPanel)
  const setBottomPanelTab = useDigitalTwinStore((state) => state.setBottomPanelTab)

  const visibleEntities = Array.from(entityDirectory.values()).filter((entity) => entity.visible).length
  const activeIncidents = incidents.filter((incident) => !incident.acknowledged).slice(0, 3)
  const activeAlarms = alarms.filter((alarm) => !alarm.acknowledged).length
  const connectionLabel = isConnected ? 'LIVE' : runtimeDataSource === 'mock' ? 'MOCK' : 'OFFLINE'
  const rendererLabel = rendererDiagnostics.storageBufferActive
    ? 'GPU Storage'
    : rendererDiagnostics.backend.toUpperCase()

  const openEvents = () => {
    setBottomPanelTab('timeline')
    if (!bottomPanelOpen) toggleBottomPanel()
  }

  return (
    <div
      data-viewer-ui-panel="hmi-overlay"
      className={cn('viewer-hmi-overlay pointer-events-none absolute bottom-4 z-30 hidden xl:grid', className)}
      aria-label="数字孪生 HMI 快捷看板"
    >
      <section
        data-hmi-slot="kpi"
        className="viewer-hmi-slot viewer-hmi-slot--kpi pointer-events-auto"
        aria-label="运行 KPI"
      >
        <div className="viewer-hmi-kicker">Runtime HMI</div>
        <div className="viewer-hmi-kpi-grid">
          <div className="viewer-hmi-kpi-card">
            <Gauge className="h-3.5 w-3.5" />
            <span>FPS</span>
            <strong>{formatMetric(performanceMetrics.fps)}</strong>
          </div>
          <div className="viewer-hmi-kpi-card">
            <Activity className="h-3.5 w-3.5" />
            <span>对象</span>
            <strong>{visibleEntities}</strong>
          </div>
          <div className="viewer-hmi-kpi-card">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>事件</span>
            <strong>{activeIncidents.length + activeAlarms}</strong>
          </div>
          <div className="viewer-hmi-kpi-card">
            <RadioTower className="h-3.5 w-3.5" />
            <span>{connectionLabel}</span>
            <strong>{rendererLabel}</strong>
          </div>
        </div>
      </section>

      <section
        data-hmi-slot="operator-actions"
        className="viewer-hmi-slot viewer-hmi-slot--actions pointer-events-auto"
        aria-label="操作员快捷按钮"
      >
        <Button
          type="button"
          variant={leftPanelOpen ? 'secondary' : 'ghost'}
          size="sm"
          className="viewer-hmi-action-button"
          aria-pressed={leftPanelOpen}
          onClick={toggleLeftPanel}
        >
          <PanelLeft className="h-3.5 w-3.5" />
          对象树
        </Button>
        <Button
          type="button"
          variant={rightPanelOpen ? 'secondary' : 'ghost'}
          size="sm"
          className="viewer-hmi-action-button"
          aria-pressed={rightPanelOpen}
          onClick={toggleRightPanel}
        >
          <PanelRight className="h-3.5 w-3.5" />
          详情
        </Button>
        <Button
          type="button"
          variant={bottomPanelOpen ? 'secondary' : 'ghost'}
          size="sm"
          className="viewer-hmi-action-button"
          aria-pressed={bottomPanelOpen}
          onClick={openEvents}
        >
          <Bell className="h-3.5 w-3.5" />
          事件流
        </Button>
      </section>

      <section
        data-hmi-slot="message-summary"
        className="viewer-hmi-slot viewer-hmi-slot--messages pointer-events-auto"
        aria-label="实时消息摘要"
      >
        <div className="viewer-hmi-message-header">
          <ListTree className="h-3.5 w-3.5" />
          <span>Message Panel</span>
          <Badge variant="outline">{runtimeNotice ? 'notice' : activeIncidents.length}</Badge>
        </div>
        <div className="viewer-hmi-message-list">
          {runtimeNotice ? (
            <p>{runtimeNotice}</p>
          ) : activeIncidents.length > 0 ? (
            activeIncidents.map((incident) => <p key={incident.id}>{incident.title}</p>)
          ) : (
            <p>当前无未确认事件，等待实时信号或规则触发。</p>
          )}
        </div>
      </section>
    </div>
  )
}
