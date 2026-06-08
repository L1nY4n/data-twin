'use client'

import { MonitorPlay, RadioTower, Siren, Video } from 'lucide-react'
import { useDigitalTwinStore, useSelectedIncident } from '@/lib/digital-twin/store'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ViewerAdminDialogContent } from '@/components/viewer-admin/dialog'
import {
  ViewerAdminEmptyState,
  ViewerAdminKicker,
  ViewerAdminMetricTile,
  ViewerAdminContentCard,
} from '@/components/viewer-admin/primitives'

export function IncidentVideoDialog() {
  const isOpen = useDigitalTwinStore((state) => state.isIncidentVideoOpen)
  const videoFeed = useDigitalTwinStore((state) => state.incidentVideoFeed)
  const closeIncidentVideo = useDigitalTwinStore((state) => state.closeIncidentVideo)
  const incident = useSelectedIncident()

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeIncidentVideo()}>
      <ViewerAdminDialogContent
        className="max-h-[90vh] overflow-hidden sm:max-w-4xl"
        showCloseButton
      >
        <div data-testid="incident-video-dialog" className="grid min-h-[560px] md:grid-cols-[1.5fr_0.9fr]">
          <div className="relative overflow-hidden border-b border-white/10 md:border-b-0 md:border-r">
            <div
              className="absolute inset-0 opacity-90"
              style={{
                background: `radial-gradient(circle at 20% 20%, ${videoFeed?.posterTone ?? '#38bdf8'}55, transparent 40%), linear-gradient(180deg, rgba(18, 19, 22, 0.94) 0%, rgba(8, 12, 20, 0.96) 100%)`,
              }}
            />
            <div className="absolute inset-x-0 top-0 h-px bg-white/60 opacity-70 shadow-[0_0_18px_rgba(255,255,255,0.7)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.04)_50%,transparent_100%)] bg-[length:100%_12px] opacity-60" />
            <div className="relative flex h-full min-h-[320px] flex-col justify-between p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <ViewerAdminKicker
                    leading={<RadioTower className="h-3.5 w-3.5" />}
                    className="flex"
                  >
                    CCTV Linkage
                  </ViewerAdminKicker>
                  <h3 className="mt-3 text-2xl font-semibold">{videoFeed?.title ?? '事件视频联动面板'}</h3>
                  <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                    {incident?.summary ?? '根据事件卡片自动联动到对应监控视角，便于值班员快速确认现场态势。'}
                  </p>
                </div>
                <Badge className="border border-emerald-400/40 bg-emerald-500/10 text-emerald-200">
                  {videoFeed?.badge ?? 'LIVE'}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <ViewerAdminMetricTile
                  label="Camera"
                  value={videoFeed?.cameraName ?? 'Runtime Camera'}
                  size="compact"
                  className="backdrop-blur"
                />
                <ViewerAdminMetricTile
                  label="Scene"
                  value={videoFeed?.sceneLabel ?? incident?.zoneName ?? '运行态联动区域'}
                  size="compact"
                  className="backdrop-blur"
                />
                <ViewerAdminMetricTile
                  label="Status"
                  value={
                    <span className="flex items-center gap-2">
                      <Siren className="h-4 w-4 text-amber-300" />
                      {videoFeed?.status === 'review' ? '复核中' : videoFeed?.status === 'buffering' ? '缓冲中' : '实时联动'}
                    </span>
                  }
                  size="compact"
                  className="backdrop-blur"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col p-6">
            <DialogHeader className="text-left">
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <MonitorPlay className="h-5 w-5 text-sky-300" />
                事件 Citation
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {incident?.message ?? '展示事件证据、关联对象与监控引用。'}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 space-y-3 overflow-auto">
              {incident?.citations?.length ? (
                incident.citations.map((citation) => (
                  <ViewerAdminMetricTile
                    key={citation.id}
                    label={citation.label}
                    value={citation.value}
                    size="compact"
                  />
                ))
              ) : (
                <ViewerAdminEmptyState
                  title="暂无附加证据"
                  description="保留为视频联动占位面板，后续事件证据会显示在这里。"
                  icon={Video}
                  className="p-6"
                />
              )}
            </div>

            <ViewerAdminContentCard density="compact" className="mt-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground">
                <Video className="h-4 w-4 text-sky-300" />
                流地址
              </div>
              <div className="mt-2 break-all font-mono">{videoFeed?.streamUrl ?? 'runtime://incident-feed'}</div>
            </ViewerAdminContentCard>
          </div>
        </div>
      </ViewerAdminDialogContent>
    </Dialog>
  )
}
