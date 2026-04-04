'use client'

import {
  useEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEditorDigitalTwinStore } from '@/lib/digital-twin/editor-store'
import { getStaticAssetCatalogItem } from '@/lib/digital-twin/static-asset-catalog'
import type { Vector3 } from '@/lib/digital-twin/types'
import {
  resolveEditorTransformAxisConfig,
  type EditorTransformTargetKind,
} from './scene/EditorTransformGizmo'

const AXES: Array<keyof Vector3> = ['x', 'y', 'z']

function formatVector(label: string, value: { x: number; y: number; z: number }) {
  return `${label}: ${value.x.toFixed(2)} / ${value.y.toFixed(2)} / ${value.z.toFixed(2)}`
}

function formatNumberInput(value: number) {
  const normalized = Object.is(value, -0) ? 0 : value
  const rounded = Math.abs(normalized) < 0.005 ? 0 : normalized
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function InspectorPanel({
  eyebrow = 'Inspector',
  title,
  description,
  badge,
  children,
}: {
  eyebrow?: string
  title: string
  description: string
  badge?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="editor-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="editor-kicker">{eyebrow}</p>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-white/52">{description}</p>
        </div>
        {badge}
      </div>

      {children ? <div className="mt-4 space-y-3">{children}</div> : null}
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
    <div className="editor-block p-3.5">
      <p className="editor-kicker">{label}</p>
      <div className="mt-3">{children}</div>
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
        <Label className="editor-field-label">{label}</Label>
        <p className="editor-field-hint">{hint}</p>
      </div>
      <Input
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
  return (
    <div className="editor-inline-field">
      <div className="editor-field-copy">
        <Label className="editor-field-label">{label}</Label>
        <p className="editor-field-hint">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
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

export function EditorInspector() {
  const draftEntity = useEditorDigitalTwinStore((state) => state.draftEntity)
  const savedEntity = useEditorDigitalTwinStore((state) => state.savedEntity)
  const draftStaticAsset = useEditorDigitalTwinStore((state) => state.draftStaticAsset)
  const savedStaticAsset = useEditorDigitalTwinStore((state) => state.savedStaticAsset)
  const placementCatalogId = useEditorDigitalTwinStore((state) => state.placementCatalogId)
  const isDirty = useEditorDigitalTwinStore((state) => state.isDirty)
  const error = useEditorDigitalTwinStore((state) => state.error)
  const updateDraftProperties = useEditorDigitalTwinStore(
    (state) => state.updateDraftProperties
  )
  const setDraftTransformField = useEditorDigitalTwinStore(
    (state) => state.setDraftTransformField
  )

  const placementItem = placementCatalogId
    ? getStaticAssetCatalogItem(placementCatalogId)
    : null

  if (placementItem && !draftEntity && !draftStaticAsset) {
    return (
      <div className="editor-scroll space-y-4 xl:flex xl:h-full xl:flex-col xl:overflow-auto xl:pr-1">
        <InspectorPanel
          eyebrow="Placement"
          title="Placement Armed"
          description={`已选择 ${placementItem.name}。去画布中单击地面即可创建一个新的地图元素草稿。`}
          badge={<Badge className="editor-pill">Armed</Badge>}
        >
          <InspectorBlock label="Catalog Item">
            <p className="text-sm font-semibold text-white">{placementItem.name}</p>
            <p className="mt-2 text-xs leading-5 text-white/56">{placementItem.description}</p>
          </InspectorBlock>

          <InspectorBlock label="Default Footprint">
            <p className="font-mono text-[12px] leading-6 text-white/82 [font-variant-numeric:tabular-nums]">
              {placementItem.dimensions.width} x {placementItem.dimensions.depth} x{' '}
              {placementItem.dimensions.height}
            </p>
          </InspectorBlock>
        </InspectorPanel>

        <InspectorPanel
          eyebrow="Guide"
          title="Placement Rhythm"
          description="Catalog placement now reads as its own staging flow before anything enters the scene collection."
        >
          <div className="editor-empty">
            Pick from the left `Catalog` tab, click on the canvas, then switch to the
            `Scene` tab once the new overlay draft exists.
          </div>
        </InspectorPanel>
      </div>
    )
  }

  if (draftStaticAsset) {
    const catalogId =
      typeof draftStaticAsset.metadata.catalogId === 'string'
        ? draftStaticAsset.metadata.catalogId
        : null
    const catalogItem = catalogId ? getStaticAssetCatalogItem(catalogId) : null
    const translateConfig = resolveEditorTransformAxisConfig('static-asset', 'translate')
    const rotateConfig = resolveEditorTransformAxisConfig('static-asset', 'rotate')

    return (
      <div className="editor-scroll space-y-4 xl:flex xl:h-full xl:flex-col xl:overflow-auto xl:pr-1">
        <InspectorPanel
          eyebrow="Selection"
          title={draftStaticAsset.name}
          description={draftStaticAsset.id}
          badge={
            <Badge className="editor-pill">
              {savedStaticAsset ? (isDirty ? 'Draft' : 'Synced') : 'New Draft'}
            </Badge>
          }
        >
          {buildSelectionBadges(
            [
              draftStaticAsset.assetKind,
              draftStaticAsset.variant,
              draftStaticAsset.visible ? 'Visible' : 'Hidden',
            ].filter(Boolean) as string[]
          )}
        </InspectorPanel>

        <InspectorPanel
          eyebrow="Editing"
          title="Asset Properties"
          description="Core properties can be staged directly here. Save still controls persistence."
        >
          <Tabs key={`asset-${draftStaticAsset.id}`} defaultValue="properties" className="gap-3">
            <TabsList className="editor-tab-list grid grid-cols-3">
              <TabsTrigger value="properties" className="editor-tab-trigger">
                Properties
              </TabsTrigger>
              <TabsTrigger value="transform" className="editor-tab-trigger">
                Transform
              </TabsTrigger>
              <TabsTrigger value="sync" className="editor-tab-trigger">
                Sync
              </TabsTrigger>
            </TabsList>

            <TabsContent value="properties" className="space-y-3">
              <InspectorBlock label="Identity">
                <div className="editor-field-grid">
                  <InspectorTextField
                    label="Display Name"
                    hint="Press Enter or blur to commit the draft label."
                    value={draftStaticAsset.name}
                    onCommit={(value) => updateDraftProperties({ name: value })}
                  />
                  <InspectorToggleField
                    label="Visible"
                    hint="Hiding stays in draft until you explicitly save."
                    checked={draftStaticAsset.visible}
                    onCheckedChange={(checked) =>
                      updateDraftProperties({ visible: checked })
                    }
                  />
                </div>
              </InspectorBlock>

              <InspectorBlock label="Catalog">
                <div className="space-y-3">
                  {buildSelectionBadges(
                    [draftStaticAsset.assetKind, draftStaticAsset.variant]
                      .filter(Boolean) as string[]
                  )}
                  {catalogItem ? (
                    <p className="text-xs leading-5 text-white/54">
                      默认尺寸: {catalogItem.dimensions.width} x{' '}
                      {catalogItem.dimensions.depth} x {catalogItem.dimensions.height}
                    </p>
                  ) : (
                    <div className="editor-empty">
                      This draft is no longer linked to a known catalog item.
                    </div>
                  )}
                </div>
              </InspectorBlock>
            </TabsContent>

            <TabsContent value="transform" className="space-y-3">
              <InspectorBlock label="Axis Rules">
                <p className="text-xs leading-5 text-white/56">
                  Static assets stay on X/Z translation and Y-axis rotation, matching the
                  in-canvas gizmo rules.
                </p>
              </InspectorBlock>

              <InspectorBlock label="Transform">
                <div className="space-y-4">
                  <InspectorVectorEditor
                    label="Position"
                    hint="Ground-anchored assets keep Y locked."
                    value={draftStaticAsset.position}
                    step="0.1"
                    disabledAxes={buildDisabledAxes(translateConfig)}
                    onCommit={(axis, value) =>
                      setDraftTransformField('position', axis, value)
                    }
                  />
                  <InspectorVectorEditor
                    label="Rotation"
                    hint="Rotation is constrained to Y for authored map assets."
                    value={draftStaticAsset.rotation}
                    step="0.05"
                    disabledAxes={buildDisabledAxes(rotateConfig)}
                    onCommit={(axis, value) =>
                      setDraftTransformField('rotation', axis, value)
                    }
                  />
                  <InspectorVectorEditor
                    label="Scale"
                    hint="Scale stays editable from the inspector even when the gizmo is not in scale mode."
                    value={draftStaticAsset.scale}
                    step="0.05"
                    onCommit={(axis, value) =>
                      setDraftTransformField('scale', axis, value)
                    }
                  />
                </div>
              </InspectorBlock>
            </TabsContent>

            <TabsContent value="sync" className="space-y-3">
              {savedStaticAsset ? (
                <InspectorBlock label="Saved Snapshot">
                  <div className="space-y-1 font-mono text-[12px] leading-6 text-white/54 [font-variant-numeric:tabular-nums]">
                    <p>{formatVector('P', savedStaticAsset.position)}</p>
                    <p>{formatVector('R', savedStaticAsset.rotation)}</p>
                    <p>{formatVector('S', savedStaticAsset.scale)}</p>
                  </div>
                </InspectorBlock>
              ) : (
                <div className="editor-empty">
                  New authored overlays do not exist in the runtime until the current draft
                  is saved.
                </div>
              )}

              <InspectorBlock label="Runtime Boundary">
                <p className="text-sm leading-6 text-white/62">
                  放置后的对象不会改写 immutable published chunk，只会作为独立 overlay 持久化。
                </p>
                <p className="text-sm leading-6 text-white/62">
                  保存成功后，viewer 会通过 bootstrap / config_changed 同步到新摆放的结果。
                </p>
                {error ? <p className="text-sm text-[#ffb4b4]">{error}</p> : null}
              </InspectorBlock>
            </TabsContent>
          </Tabs>
        </InspectorPanel>
      </div>
    )
  }

  if (!draftEntity) {
    return (
      <div className="editor-scroll space-y-4 xl:flex xl:h-full xl:flex-col xl:overflow-auto xl:pr-1">
        <InspectorPanel
          eyebrow="Selection"
          title="Inspector"
          description="从左侧 catalog 选择模型并去画布摆放，或从列表和画布里选择一个对象进入编辑会话。"
        />

        <InspectorPanel
          eyebrow="Guide"
          title="Editing Rhythm"
          description="The left rail now separates asset inventory from scene objects, and the inspector becomes the direct property surface."
        >
          <div className="editor-empty">
            Use `Catalog` to arm placement. Use `Scene` to jump back into authored assets
            or runtime entities already in the scene.
          </div>
          {error ? <p className="text-sm text-[#ffb4b4]">{error}</p> : null}
        </InspectorPanel>
      </div>
    )
  }

  const targetKind: EditorTransformTargetKind = draftEntity.type
  const translateConfig = resolveEditorTransformAxisConfig(targetKind, 'translate')
  const rotateConfig = resolveEditorTransformAxisConfig(targetKind, 'rotate')

  return (
    <div className="editor-scroll space-y-4 xl:flex xl:h-full xl:flex-col xl:overflow-auto xl:pr-1">
      <InspectorPanel
        eyebrow="Selection"
        title={draftEntity.name}
        description={draftEntity.id}
        badge={
          <Badge className="editor-pill">
            {isDirty ? 'Draft' : 'Synced'}
          </Badge>
        }
      >
        {buildSelectionBadges([
          draftEntity.type,
          draftEntity.status,
          draftEntity.visible ? 'Visible' : 'Hidden',
        ])}
      </InspectorPanel>

      <InspectorPanel
        eyebrow="Editing"
        title="Entity Properties"
        description="The inspector now carries direct property staging for the current entity."
      >
        <Tabs key={`entity-${draftEntity.id}`} defaultValue="properties" className="gap-3">
          <TabsList className="editor-tab-list grid grid-cols-3">
            <TabsTrigger value="properties" className="editor-tab-trigger">
              Properties
            </TabsTrigger>
            <TabsTrigger value="transform" className="editor-tab-trigger">
              Transform
            </TabsTrigger>
            <TabsTrigger value="sync" className="editor-tab-trigger">
              Sync
            </TabsTrigger>
          </TabsList>

          <TabsContent value="properties" className="space-y-3">
            <InspectorBlock label="Identity">
              <div className="editor-field-grid">
                <InspectorTextField
                  label="Display Name"
                  hint="This label updates the staged entity payload immediately."
                  value={draftEntity.name}
                  onCommit={(value) => updateDraftProperties({ name: value })}
                />
                <InspectorToggleField
                  label="Visible"
                  hint="Canvas and runtime visibility only diverge after you save."
                  checked={draftEntity.visible}
                  onCheckedChange={(checked) =>
                    updateDraftProperties({ visible: checked })
                  }
                />
              </div>
            </InspectorBlock>

            <InspectorBlock label="State">
              <div className="space-y-3">
                {buildSelectionBadges([draftEntity.type, draftEntity.status])}
                <p className="text-xs leading-5 text-white/54">
                  Runtime metadata stays read-only here for now; this pass focuses on
                  direct staging for naming, visibility, and transform.
                </p>
              </div>
            </InspectorBlock>
          </TabsContent>

          <TabsContent value="transform" className="space-y-3">
            <InspectorBlock label="Axis Rules">
              <p className="text-xs leading-5 text-white/56">
                Sensor and camera entities can move vertically. Ground entities keep Y
                translation locked and rotate only on Y.
              </p>
            </InspectorBlock>

            <InspectorBlock label="Transform">
              <div className="space-y-4">
                <InspectorVectorEditor
                  label="Position"
                  hint="Matches the same axis policy used by the canvas gizmo."
                  value={draftEntity.position}
                  step="0.1"
                  disabledAxes={buildDisabledAxes(translateConfig)}
                  onCommit={(axis, value) =>
                    setDraftTransformField('position', axis, value)
                  }
                />
                <InspectorVectorEditor
                  label="Rotation"
                  hint="Entity rotation remains Y-axis only in this editor pass."
                  value={draftEntity.rotation}
                  step="0.05"
                  disabledAxes={buildDisabledAxes(rotateConfig)}
                  onCommit={(axis, value) =>
                    setDraftTransformField('rotation', axis, value)
                  }
                />
                <InspectorVectorEditor
                  label="Scale"
                  hint="Numeric scale editing is available here even without a scale gizmo."
                  value={draftEntity.scale}
                  step="0.05"
                  onCommit={(axis, value) =>
                    setDraftTransformField('scale', axis, value)
                  }
                />
              </div>
            </InspectorBlock>
          </TabsContent>

          <TabsContent value="sync" className="space-y-3">
            {savedEntity ? (
              <InspectorBlock label="Saved Snapshot">
                <div className="space-y-1 font-mono text-[12px] leading-6 text-white/54 [font-variant-numeric:tabular-nums]">
                  <p>{formatVector('P', savedEntity.position)}</p>
                  <p>{formatVector('R', savedEntity.rotation)}</p>
                  <p>{formatVector('S', savedEntity.scale)}</p>
                </div>
              </InspectorBlock>
            ) : null}

            <InspectorBlock label="Runtime Boundary">
              <p className="text-sm leading-6 text-white/62">
                实体仍然走现有 admin entity API，地图元素则走单独的 static asset API。
              </p>
              <p className="text-sm leading-6 text-white/62">
                zone 保留给后续的面域编辑，不在这次迭代内实现。
              </p>
              <p className="text-sm leading-6 text-white/62">
                保存会重新从后端同步 editor 状态，避免本地草稿和后端数据漂移。
              </p>
              {error ? <p className="text-sm text-[#ffb4b4]">{error}</p> : null}
            </InspectorBlock>
          </TabsContent>
        </Tabs>
      </InspectorPanel>
    </div>
  )
}
