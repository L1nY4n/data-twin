'use client'

import {
  ArrowUp,
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
import { useEditorDigitalTwinStore } from '@/lib/digital-twin/editor-store'
import { cn } from '@/lib/utils'

const STEP_PRESETS = [
  { translate: 0.5, rotate: 15, label: '0.5m / 15deg' },
  { translate: 1, rotate: 15, label: '1m / 15deg' },
  { translate: 2, rotate: 30, label: '2m / 30deg' },
  { translate: 5, rotate: 45, label: '5m / 45deg' },
]

export function EditorViewportDock() {
  const sceneConfig = useEditorDigitalTwinStore((state) => state.sceneConfig)
  const viewportProjection = useEditorDigitalTwinStore(
    (state) => state.viewportProjection
  )
  const snapEnabled = useEditorDigitalTwinStore((state) => state.snapEnabled)
  const translateSnap = useEditorDigitalTwinStore((state) => state.translateSnap)
  const rotateSnapDegrees = useEditorDigitalTwinStore(
    (state) => state.rotateSnapDegrees
  )
  const setSceneConfig = useEditorDigitalTwinStore((state) => state.setSceneConfig)
  const setViewportProjection = useEditorDigitalTwinStore(
    (state) => state.setViewportProjection
  )
  const focusCameraDirection = useEditorDigitalTwinStore(
    (state) => state.focusCameraDirection
  )
  const setSnapEnabled = useEditorDigitalTwinStore((state) => state.setSnapEnabled)
  const setTranslateSnap = useEditorDigitalTwinStore((state) => state.setTranslateSnap)
  const setRotateSnapDegrees = useEditorDigitalTwinStore(
    (state) => state.setRotateSnapDegrees
  )

  return (
    <div className="editor-dock flex max-w-[min(100%,960px)] flex-wrap items-center justify-center gap-1 px-2 py-1.5 text-white">
      <div className="editor-dock-group">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'editor-control',
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
            'editor-control',
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
        <Button
          variant="ghost"
          size="sm"
          className="editor-control"
          aria-label="Focus top view"
          title="Focus top view"
          onClick={() => focusCameraDirection('top')}
        >
          <ArrowUp className="size-3.5" />
          Top
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="editor-control"
          aria-label="Focus north view"
          title="Focus north view"
          onClick={() => focusCameraDirection('north')}
        >
          N
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="editor-control"
          aria-label="Focus east view"
          title="Focus east view"
          onClick={() => focusCameraDirection('east')}
        >
          E
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="editor-control"
          aria-label="Focus south view"
          title="Focus south view"
          onClick={() => focusCameraDirection('south')}
        >
          S
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="editor-control"
          aria-label="Focus west view"
          title="Focus west view"
          onClick={() => focusCameraDirection('west')}
        >
          W
        </Button>
      </div>

      <div className="editor-dock-group">
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('editor-control', sceneConfig.showGrid && 'is-active')}
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
          className={cn('editor-control', sceneConfig.showAxes && 'is-active')}
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
          className={cn('editor-control', snapEnabled && 'is-active')}
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
              className="editor-control min-w-[8.5rem] justify-between"
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
          <DropdownMenuContent align="center" className="w-52">
            <DropdownMenuLabel>Snap Step</DropdownMenuLabel>
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
