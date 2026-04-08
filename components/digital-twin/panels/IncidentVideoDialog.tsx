'use client'

import { MonitorPlay, RadioTower, Siren, Video } from 'lucide-react'
import { useDigitalTwinStore, useSelectedIncident } from '@/lib/digital-twin/store'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function IncidentVideoDialog() {
  const isOpen = useDigitalTwinStore((state) => state.isIncidentVideoOpen)
  const videoFeed = useDigitalTwinStore((state) => state.incidentVideoFeed)
  const closeIncidentVideo = useDigitalTwinStore((state) => state.closeIncidentVideo)
  const incident = useSelectedIncident()

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeIncidentVideo()}>
      <DialogContent
        className="max-h-[90vh] overflow-hidden border-slate-800 bg-slate-950 p-0 text-slate-50 sm:max-w-4xl"
        showCloseButton
      >
        <div data-testid="incident-video-dialog" className="grid min-h-[560px] md:grid-cols-[1.5fr_0.9fr]">
          <div className="relative overflow-hidden border-b border-slate-800 md:border-b-0 md:border-r">
            <div
              className="absolute inset-0 opacity-90"
              style={{
                background: `radial-gradient(circle at 20% 20%, ${videoFeed?.posterTone ?? '#38bdf8'}55, transparent 40%), linear-gradient(180deg, #0f172a 0%, #020617 100%)`,
              }}
            />
            <div className="absolute inset-x-0 top-0 h-px bg-white/60 opacity-70 shadow-[0_0_18px_rgba(255,255,255,0.7)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.04)_50%,transparent_100%)] bg-[length:100%_12px] opacity-60" />
            <div className="relative flex h-full min-h-[320px] flex-col justify-between p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-400">
                    <RadioTower className="h-3.5 w-3.5" />
                    Mock CCTV Linkage
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold">{videoFeed?.title ?? '事件视频联动面板'}</h3>
                  <p className="mt-2 max-w-xl text-sm text-slate-300">
                    {incident?.summary ?? '根据事件卡片自动联动到对应监控视角，便于值班员快速确认现场态势。'}
                  </p>
                </div>
                <Badge className="border border-emerald-400/40 bg-emerald-500/10 text-emerald-200">
                  {videoFeed?.badge ?? 'LIVE'}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Camera</div>
                  <div className="mt-2 text-sm font-medium">{videoFeed?.cameraName ?? 'Mock Camera'}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Scene</div>
                  <div className="mt-2 text-sm font-medium">{videoFeed?.sceneLabel ?? incident?.zoneName ?? '运行态联动区域'}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Status</div>
                  <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                    <Siren className="h-4 w-4 text-amber-300" />
                    {videoFeed?.status === 'review' ? '复核中' : videoFeed?.status === 'buffering' ? '缓冲中' : '实时联动'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col bg-slate-950/90 p-6">
            <DialogHeader className="text-left">
              <DialogTitle className="flex items-center gap-2 text-slate-50">
                <MonitorPlay className="h-5 w-5 text-sky-300" />
                事件 Citation
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                {incident?.message ?? '展示事件证据、关联对象与监控引用，支持 mock 数据演示。'}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 space-y-3 overflow-auto">
              {incident?.citations?.length ? (
                incident.citations.map((citation) => (
                  <div key={citation.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{citation.label}</div>
                    <div className="mt-2 text-sm text-slate-100">{citation.value}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-white/15 p-6 text-sm text-slate-400">
                  当前无附加证据，保留为视频联动占位面板。
                </div>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400">
              <div className="flex items-center gap-2 text-slate-200">
                <Video className="h-4 w-4 text-sky-300" />
                流地址
              </div>
              <div className="mt-2 break-all font-mono">{videoFeed?.streamUrl ?? 'mock://incident-feed'}</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
