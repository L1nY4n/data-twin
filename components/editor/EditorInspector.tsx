'use client'

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useEditorDigitalTwinStore } from '@/lib/digital-twin/editor-store'
import { getStaticAssetCatalogItem } from '@/lib/digital-twin/static-asset-catalog'
import type { Vector3 } from '@/lib/digital-twin/types'
import { cn } from '@/lib/utils'
import {
  resolveEditorTransformAxisConfig,
  type EditorTransformTargetKind,
} from './scene/EditorTransformGizmo'

const AXES: Array<keyof Vector3> = ['x', 'y', 'z']

function formatNumberInput(value: number) {
  const normalized = Object.is(value, -0) ? 0 : value
  const rounded = Math.abs(normalized) < 0.005 ? 0 : normalized
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function getMetadataText(
  metadata: Record<string, unknown>,
  key: string,
  fallback = ''
) {
  const value = metadata[key]
  return typeof value === 'string' ? value : fallback
}

function getMetadataNumber(
  metadata: Record<string, unknown>,
  key: string,
  fallback: number
) {
  const value = metadata[key]
  return typeof value === 'number' ? value : fallback
}

function InspectorPanel({
  eyebrow,
  title,
  description,
  badge,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  badge?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="editor-panel p-3.5">
      <div className="flex items-start justify-between gap-2.5">
        <div>
          <p className="editor-kicker">{eyebrow}</p>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="mt-1 text-[11px] leading-4.5 text-white/52">{description}</p>
        </div>
        {badge}
      </div>

      {children ? <div className="mt-3 space-y-2.5">{children}</div> : null}
    </section>
  )
}

function InspectorBlock({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="editor-block p-3">
      <p className="editor-kicker">{label}</p>
      <div className="mt-2.5 space-y-3">{children}</div>
    </div>
  )
}

function InspectorTextField({
  label,
  hint,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  hint: string
  value: string
  placeholder?: string
  onCommit: (value: string) => void
}) {
  const [draftValue, setDraftValue] = useState(value)
  const inputId = useId()

  useEffect(() => {
    setDraftValue(value)
  }, [value])

  const commitValue = () => {
    const nextValue = draftValue.trim()
    if (!nextValue) {
      setDraftValue(value)
      return
    }

    if (nextValue !== value) {
      onCommit(nextValue)
      return
    }

    setDraftValue(value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    }

    if (event.key === 'Escape') {
      setDraftValue(value)
      event.currentTarget.blur()
    }
  }

  return (
    <div className="editor-field-grid">
      <div className="editor-field-copy">
        <Label htmlFor={inputId} className="editor-field-label">
          {label}
        </Label>
        <p className="editor-field-hint">{hint}</p>
      </div>
      <Input
        id={inputId}
        name={inputId}
        value={draftValue}
        placeholder={placeholder}
        className="editor-input"
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={commitValue}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

function InspectorToggleField({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const switchId = useId()

  return (
    <div className="editor-inline-field">
      <div className="editor-field-copy">
        <Label htmlFor={switchId} className="editor-field-label">
          {label}
        </Label>
        <p className="editor-field-hint">{hint}</p>
      </div>
      <Switch
        id={switchId}
        name={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

function InspectorNumberField({
  axis,
  value,
  step,
  disabled,
  onCommit,
}: {
  axis: keyof Vector3
  value: number
  step: string
  disabled?: boolean
  onCommit: (value: number) => void
}) {
  const [draftValue, setDraftValue] = useState(formatNumberInput(value))
  const inputId = useId()

  useEffect(() => {
    setDraftValue(formatNumberInput(value))
  }, [value])

  const commitValue = () => {
    const nextValue = Number(draftValue)
    if (!Number.isFinite(nextValue)) {
      setDraftValue(formatNumberInput(value))
      return
    }

    if (nextValue !== value) {
      onCommit(nextValue)
      return
    }

    setDraftValue(formatNumberInput(value))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    }

    if (event.key === 'Escape') {
      setDraftValue(formatNumberInput(value))
      event.currentTarget.blur()
    }
  }

  return (
    <div className="editor-axis-field">
      <span className="editor-axis-chip">{axis}</span>
      <Input
        id={inputId}
        name={inputId}
        type="number"
        step={step}
        disabled={disabled}
        value={draftValue}
        className="editor-input"
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={commitValue}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

function InspectorScalarField({
  label,
  hint,
  value,
  step,
  min,
  max,
  onCommit,
}: {
  label: string
  hint: string
  value: number
  step: string
  min?: number
  max?: number
  onCommit: (value: number) => void
}) {
  const [draftValue, setDraftValue] = useState(formatNumberInput(value))
  const inputId = useId()

  useEffect(() => {
    setDraftValue(formatNumberInput(value))
  }, [value])

  const commitValue = () => {
    const nextValue = Number(draftValue)
    if (!Number.isFinite(nextValue)) {
      setDraftValue(formatNumberInput(value))
      return
    }

    const withMin = typeof min === 'number' ? Math.max(min, nextValue) : nextValue
    const normalizedValue = typeof max === 'number' ? Math.min(max, withMin) : withMin
    if (normalizedValue !== value) {
      onCommit(normalizedValue)
      return
    }

    setDraftValue(formatNumberInput(value))
  }

  return (
    <div className="editor-field-grid">
      <div className="editor-field-copy">
        <Label htmlFor={inputId} className="editor-field-label">
          {label}
        </Label>
        <p className="editor-field-hint">{hint}</p>
      </div>
      <Input
        id={inputId}
        name={inputId}
        type="number"
        value={draftValue}
        step={step}
        min={min}
        max={max}
        className="editor-input"
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={commitValue}
      />
    </div>
  )
}

function InspectorColorField({
  label,
  hint,
  value,
  onCommit,
}: {
  label: string
  hint: string
  value: string
  onCommit: (value: string) => void
}) {
  const inputId = useId()
  const swatchValue = /^#([0-9a-f]{6})$/i.test(value) ? value : '#7da7ff'

  return (
    <div className="editor-field-grid">
      <div className="editor-field-copy">
        <Label htmlFor={inputId} className="editor-field-label">
          {label}
        </Label>
        <p className="editor-field-hint">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          name={inputId}
          type="color"
          value={swatchValue}
          className="editor-input h-10 w-14 p-1"
          onChange={(event) => onCommit(event.target.value)}
        />
        <Input
          value={value}
          className="editor-input"
          onChange={(event) => onCommit(event.target.value)}
        />
      </div>
    </div>
  )
}

function InspectorVectorEditor({
  label,
  hint,
  value,
  step,
  disabledAxes,
  onCommit,
}: {
  label: string
  hint: string
  value: Vector3
  step: string
  disabledAxes?: Partial<Record<keyof Vector3, boolean>>
  onCommit: (axis: keyof Vector3, value: number) => void
}) {
  return (
    <div className="editor-field-grid">
      <div className="editor-field-copy">
        <Label className="editor-field-label">{label}</Label>
        <p className="editor-field-hint">{hint}</p>
      </div>
      <div className="editor-axis-grid">
        {AXES.map((axis) => (
          <InspectorNumberField
            key={axis}
            axis={axis}
            value={value[axis]}
            step={step}
            disabled={disabledAxes?.[axis]}
            onCommit={(nextValue) => onCommit(axis, nextValue)}
          />
        ))}
      </div>
    </div>
  )
}

function buildDisabledAxes(config: { showX: boolean; showY: boolean; showZ: boolean }) {
  return {
    x: !config.showX,
    y: !config.showY,
    z: !config.showZ,
  }
}

function buildSelectionBadges(values: string[]) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <Badge key={value} className="editor-pill">
          {value}
        </Badge>
      ))}
    </div>
  )
}

type EditorInspectorProps = {
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function EditorInspector({
  collapsed = false,
  onToggleCollapse,
}: EditorInspectorProps) {
  return (
    <EditorInspectorContent
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    />
  )
}

function InspectorCollapseHeader({
  collapseLabel,
  onToggleCollapse,
}: {
  collapseLabel: string
  onToggleCollapse?: () => void
}) {
  return (
    <section className="editor-panel editor-panel--accent px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2.5 rounded-[14px] text-white">
        {onToggleCollapse ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={collapseLabel}
            title={collapseLabel}
            onClick={onToggleCollapse}
            className="editor-control editor-header-icon size-8 rounded-[12px]"
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        ) : (
          <div className="editor-header-icon flex size-8 items-center justify-center rounded-[12px]">
            <SlidersHorizontal className="size-4" />
          </div>
        )}
        <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
          <span className="truncate text-[13px] font-semibold">属性编辑 / 场景</span>
          <span className="truncate text-[11px] text-white/54">
            调整对象参数或场景级配置
          </span>
        </div>
      </div>
    </section>
  )
}

function InspectorFrame({
  collapseLabel,
  onToggleCollapse,
  summaryKicker,
  summaryTitle,
  summaryDescription,
  summaryBadge,
  children,
}: {
  collapseLabel: string
  onToggleCollapse?: () => void
  summaryKicker: string
  summaryTitle: string
  summaryDescription: string
  summaryBadge: string
  children: ReactNode
}) {
  return (
    <div className="editor-side-shell editor-panel editor-panel--soft flex h-full min-h-0 flex-col overflow-hidden px-2 py-2 text-white">
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <InspectorCollapseHeader
          collapseLabel={collapseLabel}
          onToggleCollapse={onToggleCollapse}
        />

        <div className="editor-group px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="editor-kicker">{summaryKicker}</p>
              <p className="mt-1 truncate text-[13px] font-semibold leading-5">
                {summaryTitle}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-white/54">
                {summaryDescription}
              </p>
            </div>
            <Badge className="editor-pill">{summaryBadge}</Badge>
          </div>
        </div>

        <div className="editor-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-0.5">
          {children}
        </div>
      </div>
    </div>
  )
}

function EditorInspectorContent({
  collapsed = false,
  onToggleCollapse,
}: EditorInspectorProps) {
  const draftEntity = useEditorDigitalTwinStore((state) => state.draftEntity)
  const savedEntity = useEditorDigitalTwinStore((state) => state.savedEntity)
  const draftStaticAsset = useEditorDigitalTwinStore((state) => state.draftStaticAsset)
  const savedStaticAsset = useEditorDigitalTwinStore((state) => state.savedStaticAsset)
  const placementCatalogId = useEditorDigitalTwinStore((state) => state.placementCatalogId)
  const sceneConfig = useEditorDigitalTwinStore((state) => state.sceneConfig)
  const viewportProjection = useEditorDigitalTwinStore(
    (state) => state.viewportProjection
  )
  const snapEnabled = useEditorDigitalTwinStore((state) => state.snapEnabled)
  const translateSnap = useEditorDigitalTwinStore((state) => state.translateSnap)
  const rotateSnapDegrees = useEditorDigitalTwinStore(
    (state) => state.rotateSnapDegrees
  )
  const isDirty = useEditorDigitalTwinStore((state) => state.isDirty)
  const error = useEditorDigitalTwinStore((state) => state.error)
  const setSceneConfig = useEditorDigitalTwinStore((state) => state.setSceneConfig)
  const setViewportProjection = useEditorDigitalTwinStore(
    (state) => state.setViewportProjection
  )
  const setSnapEnabled = useEditorDigitalTwinStore((state) => state.setSnapEnabled)
  const setTranslateSnap = useEditorDigitalTwinStore((state) => state.setTranslateSnap)
  const setRotateSnapDegrees = useEditorDigitalTwinStore(
    (state) => state.setRotateSnapDegrees
  )
  const updateDraftProperties = useEditorDigitalTwinStore(
    (state) => state.updateDraftProperties
  )
  const updateDraftMetadata = useEditorDigitalTwinStore(
    (state) => state.updateDraftMetadata
  )
  const setDraftTransformField = useEditorDigitalTwinStore(
    (state) => state.setDraftTransformField
  )
  const collapseLabel = collapsed ? 'Expand inspector panel' : 'Collapse inspector panel'

  if (collapsed) {
    return (
      <div className="editor-side-shell editor-panel editor-panel--soft flex size-10 items-center justify-center p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={collapseLabel}
          title={collapseLabel}
          onClick={onToggleCollapse}
          className="editor-control editor-header-icon size-8 rounded-[12px]"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      </div>
    )
  }

  const placementItem = placementCatalogId
    ? getStaticAssetCatalogItem(placementCatalogId)
    : null

  const resetTransform = (
    target: { position: Vector3; rotation: Vector3; scale: Vector3 },
    type: 'position' | 'rotation' | 'scale'
  ) => {
    const defaults =
      type === 'scale'
        ? { x: 1, y: 1, z: 1 }
        : { x: 0, y: 0, z: 0 }

    for (const axis of AXES) {
      if (target[type][axis] !== defaults[axis]) {
        setDraftTransformField(type, axis, defaults[axis])
      }
    }
  }

  if (!draftEntity && !draftStaticAsset) {
    return (
      <InspectorFrame
        collapseLabel={collapseLabel}
        onToggleCollapse={onToggleCollapse}
        summaryKicker="Workspace"
        summaryTitle={sceneConfig.name}
        summaryDescription={
          placementItem
            ? `放置准备中 · ${placementItem.name}`
            : '空选中时显示场景级属性'
        }
        summaryBadge={isDirty ? 'Draft' : 'Scene'}
      >
        {placementItem ? (
          <InspectorPanel
            eyebrow="Placement"
            title={placementItem.name}
            description="资源已就绪。拖放或点击画布地面即可生成新的对象草稿。"
            badge={<Badge className="editor-pill">Armed</Badge>}
          />
        ) : null}

        <InspectorPanel
          eyebrow="Scene"
          title={sceneConfig.name}
          description="空选中时只显示场景级设置。"
          badge={<Badge className="editor-pill">{isDirty ? 'Draft' : 'Scene'}</Badge>}
        >
          <InspectorBlock label="Environment">
            <InspectorColorField
              label="Background"
              hint="画布背景色。"
              value={sceneConfig.backgroundColor}
              onCommit={(value) => setSceneConfig({ backgroundColor: value })}
            />
            <InspectorScalarField
              label="Ambient Light"
              hint="环境基础亮度。"
              value={sceneConfig.ambientLightIntensity}
              step="0.05"
              min={0.1}
              max={2}
              onCommit={(value) => setSceneConfig({ ambientLightIntensity: value })}
            />
          </InspectorBlock>

          <InspectorBlock label="Ground">
            <InspectorToggleField
              label="Show Grid"
              hint="编辑网格。"
              checked={sceneConfig.showGrid}
              onCheckedChange={(checked) => setSceneConfig({ showGrid: checked })}
            />
            <InspectorToggleField
              label="Show Axes"
              hint="坐标轴。"
              checked={sceneConfig.showAxes}
              onCheckedChange={(checked) => setSceneConfig({ showAxes: checked })}
            />
            <InspectorScalarField
              label="Grid Size"
              hint="网格覆盖范围。"
              value={sceneConfig.gridSize}
              step="1"
              min={20}
              onCommit={(value) => setSceneConfig({ gridSize: value })}
            />
            <InspectorScalarField
              label="Grid Divisions"
              hint="网格细分。"
              value={sceneConfig.gridDivisions}
              step="1"
              min={4}
              onCommit={(value) => setSceneConfig({ gridDivisions: value })}
            />
          </InspectorBlock>

          <InspectorBlock label="Camera">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'editor-control',
                  viewportProjection === 'perspective' && 'is-active'
                )}
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
                onClick={() => setViewportProjection('orthographic')}
              >
                Orthographic
              </Button>
            </div>
          </InspectorBlock>

          <InspectorBlock label="Snap">
            <InspectorToggleField
              label="Transform Snap"
              hint="画布 gizmo 吸附。"
              checked={snapEnabled}
              onCheckedChange={setSnapEnabled}
            />
            <InspectorScalarField
              label="Translate Step"
              hint="平移步长。"
              value={translateSnap}
              step="0.1"
              min={0.1}
              onCommit={setTranslateSnap}
            />
            <InspectorScalarField
              label="Rotate Step"
              hint="旋转步长。"
              value={rotateSnapDegrees}
              step="1"
              min={1}
              onCommit={setRotateSnapDegrees}
            />
          </InspectorBlock>

          {error ? (
            <InspectorBlock label="Status">
              <p className="text-sm text-[#ffb4b4]">{error}</p>
            </InspectorBlock>
          ) : null}
        </InspectorPanel>
      </InspectorFrame>
    )
  }

  const draftTarget = draftStaticAsset ?? draftEntity
  const savedTarget = savedStaticAsset ?? savedEntity
  if (!draftTarget) return null

  const targetKind: EditorTransformTargetKind = draftStaticAsset
    ? 'static-asset'
    : draftEntity?.type ?? 'equipment'
  const translateConfig = resolveEditorTransformAxisConfig(targetKind, 'translate')
  const rotateConfig = resolveEditorTransformAxisConfig(targetKind, 'rotate')
  const metadata = draftTarget.metadata
  const selectionBadges = draftStaticAsset
    ? [
        draftStaticAsset.assetKind,
        draftStaticAsset.variant ?? 'default',
        draftTarget.visible ? 'Visible' : 'Hidden',
      ]
    : [
        draftEntity?.type ?? 'entity',
        draftEntity?.status ?? 'active',
        draftTarget.visible ? 'Visible' : 'Hidden',
      ]
  const catalogItem =
    draftStaticAsset && typeof draftStaticAsset.metadata.catalogId === 'string'
      ? getStaticAssetCatalogItem(draftStaticAsset.metadata.catalogId)
      : null
  const color = getMetadataText(metadata, 'color', '#7da7ff')
  const opacity = getMetadataNumber(metadata, 'opacity', 1)
  const emissive = getMetadataText(metadata, 'emissive', '#0f172a')

  return (
    <InspectorFrame
      collapseLabel={collapseLabel}
      onToggleCollapse={onToggleCollapse}
      summaryKicker="Selection"
      summaryTitle={draftTarget.name}
      summaryDescription={draftTarget.id}
      summaryBadge={savedTarget ? (isDirty ? 'Draft' : 'Synced') : 'New Draft'}
    >
      <InspectorPanel
        eyebrow="Selection"
        title={draftTarget.name}
        description={draftTarget.id}
        badge={
          <Badge className="editor-pill">
            {savedTarget ? (isDirty ? 'Draft' : 'Synced') : 'New Draft'}
          </Badge>
        }
      >
        {buildSelectionBadges(selectionBadges)}
      </InspectorPanel>

      <InspectorPanel
        eyebrow="Transform"
        title="Transform"
        description="位置、旋转、缩放、对齐与重置。"
      >
        <InspectorBlock label="Transform">
          <InspectorVectorEditor
            label="Position"
            hint="与画布 gizmo 使用同一坐标约束。"
            value={draftTarget.position}
            step="0.1"
            disabledAxes={buildDisabledAxes(translateConfig)}
            onCommit={(axis, value) => setDraftTransformField('position', axis, value)}
          />
          <InspectorVectorEditor
            label="Rotation"
            hint="平面对象默认只开放 Y 轴旋转。"
            value={draftTarget.rotation}
            step="0.05"
            disabledAxes={buildDisabledAxes(rotateConfig)}
            onCommit={(axis, value) => setDraftTransformField('rotation', axis, value)}
          />
          <InspectorVectorEditor
            label="Scale"
            hint="可独立编辑每个轴向。"
            value={draftTarget.scale}
            step="0.05"
            onCommit={(axis, value) => setDraftTransformField('scale', axis, value)}
          />
        </InspectorBlock>

        <InspectorBlock label="Align / Reset">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="editor-control"
              onClick={() => setDraftTransformField('position', 'y', 0)}
            >
              Ground
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="editor-control"
              onClick={() => resetTransform(draftTarget, 'position')}
            >
              Reset Position
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="editor-control"
              onClick={() => resetTransform(draftTarget, 'rotation')}
            >
              Reset Rotation
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="editor-control"
              onClick={() => resetTransform(draftTarget, 'scale')}
            >
              Reset Scale
            </Button>
          </div>
        </InspectorBlock>
      </InspectorPanel>

      <InspectorPanel
        eyebrow="Asset"
        title="Asset"
        description="名称、分类、实例名、分组和可见性。"
      >
        <InspectorBlock label="Identity">
          <InspectorTextField
            label="Display Name"
            hint="对象实例名。"
            value={draftTarget.name}
            onCommit={(value) => updateDraftProperties({ name: value })}
          />
          <InspectorToggleField
            label="Visible"
            hint="控制当前对象可见性。"
            checked={draftTarget.visible}
            onCheckedChange={(checked) => updateDraftProperties({ visible: checked })}
          />
        </InspectorBlock>

        <InspectorBlock label="Classification">
          {buildSelectionBadges(
            draftStaticAsset
              ? [draftStaticAsset.assetKind, draftStaticAsset.variant ?? 'default']
              : [draftEntity?.type ?? 'entity', draftEntity?.status ?? 'active']
          )}
          <InspectorTextField
            label="Group"
            hint="逻辑分组。"
            value={getMetadataText(metadata, 'group', '')}
            placeholder="例如：东区罐组"
            onCommit={(value) => updateDraftMetadata({ group: value })}
          />
          <InspectorTextField
            label="Layer"
            hint="图层名称。"
            value={getMetadataText(metadata, 'layer', '')}
            placeholder="例如：authored-static"
            onCommit={(value) => updateDraftMetadata({ layer: value })}
          />
          {catalogItem ? (
            <p className="text-xs leading-5 text-white/54">
              参考尺寸: {catalogItem.dimensions.width} x {catalogItem.dimensions.depth} x{' '}
              {catalogItem.dimensions.height}
            </p>
          ) : null}
        </InspectorBlock>
      </InspectorPanel>

      <InspectorPanel
        eyebrow="Material"
        title="Material"
        description="颜色、透明度、自发光等视觉属性。"
      >
        <InspectorBlock label="Surface">
          <InspectorColorField
            label="Color"
            hint="主颜色。"
            value={color}
            onCommit={(value) => updateDraftMetadata({ color: value })}
          />
          <InspectorColorField
            label="Emissive"
            hint="发光色。"
            value={emissive}
            onCommit={(value) => updateDraftMetadata({ emissive: value })}
          />
          <InspectorScalarField
            label="Opacity"
            hint="0 到 1。"
            value={opacity}
            step="0.05"
            min={0}
            max={1}
            onCommit={(value) => updateDraftMetadata({ opacity: value })}
          />
        </InspectorBlock>
      </InspectorPanel>

      <InspectorPanel
        eyebrow="Business"
        title="Business"
        description="业务编码、标签、告警和绑定点位。"
      >
        <InspectorBlock label="Bindings">
          <InspectorTextField
            label="Asset Code"
            hint="业务编码。"
            value={getMetadataText(metadata, 'assetCode', '')}
            placeholder="例如：TK-201"
            onCommit={(value) => updateDraftMetadata({ assetCode: value })}
          />
          <InspectorTextField
            label="Business Tag"
            hint="业务标签。"
            value={getMetadataText(metadata, 'businessTag', '')}
            placeholder="例如：储运 / 东区"
            onCommit={(value) => updateDraftMetadata({ businessTag: value })}
          />
          <InspectorTextField
            label="Alarm Level"
            hint="告警级别。"
            value={getMetadataText(metadata, 'alarmLevel', '')}
            placeholder="例如：warning"
            onCommit={(value) => updateDraftMetadata({ alarmLevel: value })}
          />
          <InspectorTextField
            label="Binding Point"
            hint="绑定点位或连接标识。"
            value={getMetadataText(metadata, 'bindingPoint', '')}
            placeholder="例如：opcua://line-a/point-1"
            onCommit={(value) => updateDraftMetadata({ bindingPoint: value })}
          />
        </InspectorBlock>
      </InspectorPanel>

      {error ? (
        <InspectorPanel
          eyebrow="Status"
          title="Runtime"
          description="当前编辑态状态。"
        >
          <p className="text-sm text-[#ffb4b4]">{error}</p>
        </InspectorPanel>
      ) : null}
    </InspectorFrame>
  )
}
