'use client'

import { useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  Gauge,
  Network,
} from 'lucide-react'
import { useDigitalTwinStore } from '@/lib/digital-twin/store'
import { summarizeEntityDirectorySignalTelemetry } from '@/lib/digital-twin/signal-telemetry'
import { cn } from '@/lib/utils'

type ViewerHmiOverlayProps = {
  className?: string
  panelOpen?: boolean
}

function formatMetric(value: number, unit = '') {
  if (!Number.isFinite(value)) return `--${unit}`
  return `${value.toFixed(value >= 10 ? 0 : 1)}${unit}`
}

function metricCaption(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 'nominal'
  return String(value)
}

export function ViewerHmiOverlay({ className, panelOpen = false }: ViewerHmiOverlayProps) {
  const entityDirectory = useDigitalTwinStore((state) => state.entityDirectory)
  const incidents = useDigitalTwinStore((state) => state.incidents)
  const alarms = useDigitalTwinStore((state) => state.alarms)
  const isConnected = useDigitalTwinStore((state) => state.isConnected)
  const runtimeDataSource = useDigitalTwinStore((state) => state.runtimeDataSource)
  const runtimeNotice = useDigitalTwinStore((state) => state.runtimeNotice)
  const performanceMetrics = useDigitalTwinStore((state) => state.performanceMetrics)
  const rendererDiagnostics = useDigitalTwinStore((state) => state.rendererDiagnostics)

  const visibleEntities = Array.from(entityDirectory.values()).filter(
    (entity) => entity.visible
  ).length
  const signalSummary = useMemo(
    () => summarizeEntityDirectorySignalTelemetry(entityDirectory.values()),
    [entityDirectory]
  )
  const activeIncidents = incidents.filter((incident) => !incident.acknowledged).slice(0, 3)
  const activeAlarms = alarms.filter((alarm) => !alarm.acknowledged).length
  const connectionLabel = isConnected ? 'LIVE' : runtimeDataSource === 'mock' ? 'MOCK' : 'OFFLINE'
  const rendererLabel = rendererDiagnostics.storageBufferActive
    ? 'GPU Storage'
    : rendererDiagnostics.backend.toUpperCase()
  const activeEventCount = activeIncidents.length + activeAlarms

  return (
    <div
      data-viewer-ui-panel="hmi-overlay"
      className={cn(
        'viewer-hmi-overlay pointer-events-none absolute left-1/2 z-30 hidden -translate-x-1/2 xl:flex',
        panelOpen ? 'top-[76px] viewer-hmi-overlay--panel-open' : 'top-4',
        className
      )}
      aria-label="数字孪生 HMI 快捷看板"
    >
      <section
        data-hmi-slot="kpi-bar"
        className="viewer-hmi-kpi-strip pointer-events-auto"
        aria-label="运行 KPI"
      >
        <div className="viewer-hmi-metric-card viewer-hmi-metric-card--green">
          <Gauge className="h-3.5 w-3.5" />
          <span>FPS</span>
          <strong>{formatMetric(performanceMetrics.fps)}</strong>
          <small>{rendererLabel}</small>
          <i className="viewer-hmi-sparkline" aria-hidden />
        </div>
        <div className="viewer-hmi-metric-card viewer-hmi-metric-card--blue">
          <Activity className="h-3.5 w-3.5" />
          <span>对象</span>
          <strong>{visibleEntities}</strong>
          <small>{connectionLabel}</small>
          <i className="viewer-hmi-sparkline" aria-hidden />
        </div>
        <div className="viewer-hmi-metric-card viewer-hmi-metric-card--cyan">
          <Network className="h-3.5 w-3.5" />
          <span>信号</span>
          <strong>{signalSummary.totalSignals}</strong>
          <small>
            {metricCaption(
              signalSummary.degradedSignals > 0
                ? `${signalSummary.degradedSignals} degraded`
                : null
            )}
          </small>
          <i className="viewer-hmi-sparkline" aria-hidden />
        </div>
        <div className="viewer-hmi-metric-card viewer-hmi-metric-card--amber">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>事件</span>
          <strong>{activeEventCount}</strong>
          <small>{runtimeNotice ? 'notice' : `${activeIncidents.length} incidents`}</small>
          <i className="viewer-hmi-sparkline" aria-hidden />
        </div>
      </section>
    </div>
  )
}
