'use client'

import {
  Axis3D,
  Compass,
  Grid3X3,
  Magnet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useEditorSceneStore,
  useEditorUiStore,
  useEditorViewerStore,
} from '@/lib/digital-twin/editor-store'
import { cn } from '@/lib/utils'

const STEP_PRESETS = [
  { translate: 0.5, rotate: 15, label: '0.5m / 15deg' },
  { translate: 1, rotate: 15, label: '1m / 15deg' },
  { translate: 2, rotate: 30, label: '2m / 30deg' },
  { translate: 5, rotate: 45, label: '5m / 45deg' },
]

const CAMERA_DIRECTION_CONTROLS = [
  { direction: 'top', label: 'TOP', ariaLabel: 'Focus top view', title: 'Focus top view' },
  { direction: 'north', label: 'N', ariaLabel: 'Focus north view', title: 'Focus north view' },
  { direction: 'east', label: 'E', ariaLabel: 'Focus east view', title: 'Focus east view' },
  { direction: 'south', label: 'S', ariaLabel: 'Focus south view', title: 'Focus south view' },
  { direction: 'west', label: 'W', ariaLabel: 'Focus west view', title: 'Focus west view' },
] as const

const DOCK_TEXT_CONTROL_CLASS = 'editor-control shrink-0 gap-1 px-2 text-[12px]'
const DOCK_DIRECTION_CONTROL_CLASS =
  'editor-control size-8 shrink-0 p-0 text-[10px] font-semibold leading-none'
const DOCK_DIRECTION_LABEL_CLASS =
  'pointer-events-none inline-flex min-w-[1ch] items-center justify-center uppercase'
const DOCK_READOUT_CONTROL_CLASS =
  'editor-control min-w-[7rem] shrink-0 justify-between gap-1.5 px-2 text-[12px]'

export function EditorViewportDock() {
  const sceneConfig = useEditorSceneStore((state) => state.sceneConfig)
  const viewportProjection = useEditorViewerStore((state) => state.viewportProjection)
  const snapEnabled = useEditorUiStore((state) => state.snapEnabled)
  const translateSnap = useEditorUiStore((state) => state.translateSnap)
  const rotateSnapDegrees = useEditorUiStore((state) => state.rotateSnapDegrees)
  const setSceneConfig = useEditorSceneStore((state) => state.setSceneConfig)
  const setViewportProjection = useEditorViewerStore((state) => state.setViewportProjection)
  const focusCameraDirection = useEditorViewerStore((state) => state.focusCameraDirection)
  const setSnapEnabled = useEditorUiStore((state) => state.setSnapEnabled)
  const setTranslateSnap = useEditorUiStore((state) => state.setTranslateSnap)
  const setRotateSnapDegrees = useEditorUiStore((state) => state.setRotateSnapDegrees)

  return (
    <div className="editor-dock flex w-max max-w-full flex-nowrap items-center justify-center gap-1 overflow-x-auto px-2 py-1 text-white">
      <div className="editor-dock-group">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            DOCK_TEXT_CONTROL_CLASS,
            viewportProjection === 'perspective' && 'is-active'
          )}
          aria-pressed={viewportProjection === 'perspective'}
          aria-label="Use perspective projection"
          title="Use perspective projection"
          onClick={() => setViewportProjection('perspective')}
        >
          Perspective
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            DOCK_TEXT_CONTROL_CLASS,
            viewportProjection === 'orthographic' && 'is-active'
          )}
          aria-pressed={viewportProjection === 'orthographic'}
          aria-label="Use orthographic projection"
          title="Use orthographic projection"
          onClick={() => setViewportProjection('orthographic')}
        >
          Ortho
        </Button>
      </div>

      <div className="editor-dock-group">
        {CAMERA_DIRECTION_CONTROLS.map((control) => (
          <Button
            key={control.direction}
            variant="ghost"
            size="icon-sm"
            className={DOCK_DIRECTION_CONTROL_CLASS}
            aria-label={control.ariaLabel}
            title={control.title}
            onClick={() => focusCameraDirection(control.direction)}
          >
            <span className={DOCK_DIRECTION_LABEL_CLASS}>{control.label}</span>
          </Button>
        ))}
      </div>

      <div className="editor-dock-group">
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('editor-control text-[12px]', sceneConfig.showGrid && 'is-active')}
          onClick={() => setSceneConfig({ showGrid: !sceneConfig.showGrid })}
          aria-pressed={sceneConfig.showGrid}
          aria-label="Toggle grid"
          title="Toggle grid"
        >
          <Grid3X3 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('editor-control text-[12px]', sceneConfig.showAxes && 'is-active')}
          onClick={() => setSceneConfig({ showAxes: !sceneConfig.showAxes })}
          aria-pressed={sceneConfig.showAxes}
          aria-label="Toggle axes"
          title="Toggle axes"
        >
          <Axis3D className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(DOCK_TEXT_CONTROL_CLASS, snapEnabled && 'is-active')}
          aria-pressed={snapEnabled}
          aria-label="Toggle transform snap"
          title="Toggle transform snap"
          onClick={() => setSnapEnabled(!snapEnabled)}
        >
          <Magnet className="size-3.5" />
          Snap
        </Button>
      </div>

      <div className="editor-dock-group">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={DOCK_READOUT_CONTROL_CLASS}
              aria-label="Adjust snap step"
              title="Adjust snap step"
            >
              <span className="flex items-center gap-2">
                <Compass className="size-3.5" />
                <span className="truncate">
                  {translateSnap}m / {rotateSnapDegrees}deg
                </span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-44 text-[12px]">
            <DropdownMenuLabel className="text-[11px]">Snap Step</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STEP_PRESETS.map((item) => (
              <DropdownMenuItem
                key={item.label}
                onClick={() => {
                  setTranslateSnap(item.translate)
                  setRotateSnapDegrees(item.rotate)
                }}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
