'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Box,
  Factory,
  Layers3,
  MapPinned,
  Search,
  TowerControl,
  Workflow,
  Upload,
  Image as ImageIcon,
} from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EDITOR_CATALOG_TRANSFER_MIME } from '@/lib/digital-twin/editor-dnd'
import type { FloorPlanDetectionResultDto } from '@/lib/digital-twin/floor-plan-detector'
import { detectFloorPlanFromImageUrl } from '@/lib/digital-twin/floor-plan-detector'
import {
  type EditorFloorPlanReference,
  isEditorEntityEditable,
  useEditorSceneStore,
  useEditorUiStore,
  useEditorViewerStore,
} from '@/lib/digital-twin/editor-store'
import {
  type StaticAssetCatalogDomain,
  type StaticAssetCatalogItem,
  getStaticAssetDomainLabel,
  getStaticAssetKindLabel,
  getStaticAssetPlacementLabel,
  listStaticAssetCatalog,
  matchesStaticAssetCatalogDomain,
} from '@/lib/digital-twin/static-asset-catalog'
import type {
  Entity,
  StaticAssetInstance,
  Vector3,
  ZoneEntity,
} from '@/lib/digital-twin/types'
import { cn } from '@/lib/utils'

type ResourceTab = 'catalog' | 'scene'
type CatalogFilter = 'all' | StaticAssetCatalogDomain
type SceneLayerFilter = 'all' | 'static-assets' | 'runtime-entities'
type TreeNodeKind = 'zone' | 'root'

export type EditorSceneTreeSection = {
  id: string
  kind: TreeNodeKind
  label: string
  subtitle: string
  assetCount: number
  entityCount: number
  assets: StaticAssetInstance[]
  entities: Entity[]
}

type EditorAppSidebarProps = {
  className?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  returnHref?: string
  importBusy?: boolean
  onImportDetectedFloorPlan?: (
    detection: FloorPlanDetectionResultDto,
    reference: Pick<EditorFloorPlanReference, 'position' | 'scaleMeters'>
  ) => Promise<boolean>
}

const CATALOG_FILTERS: Array<{ key: CatalogFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'industrial', label: getStaticAssetDomainLabel('industrial') },
  { key: 'building-shell', label: getStaticAssetDomainLabel('building-shell') },
  { key: 'ibms-device', label: getStaticAssetDomainLabel('ibms-device') },
  { key: 'smart-home', label: getStaticAssetDomainLabel('smart-home') },
]

const ENTITY_TYPE_LABELS: Record<string, string> = {
  person: '人员',
  vehicle: '车辆',
  equipment: '设备',
  sensor: '传感器',
  camera: '摄像头',
  zone: '区域',
}

const ALLOWED_FLOOR_PLAN_TYPES = new Set(['image/png', 'image/jpeg'])
const MAX_FLOOR_PLAN_BYTES = 10 * 1024 * 1024

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function CatalogPreviewTile({ item }: { item: StaticAssetCatalogItem }) {
  return (
    <div className="flex h-10 w-[3.1rem] shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.045] text-[#d9e6ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <Image
        aria-hidden="true"
        alt=""
        src={item.thumbnailUrl}
        width={96}
        height={64}
        loading="lazy"
        className="h-8.5 w-[2.65rem] rounded-[8px] object-cover"
      />
    </div>
  )
}

function PanelMenuButton({
  active = false,
  onClick,
  title,
  className,
  draggable,
  onDragStart,
  onDragEnd,
  children,
}: {
  active?: boolean
  onClick?: () => void
  title?: string
  className?: string
  draggable?: boolean
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void
  onDragEnd?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      data-active={active}
      title={title}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'editor-menu-button flex w-full items-start gap-2 overflow-hidden px-2.5 py-2 text-left',
        className
      )}
    >
      {children}
    </button>
  )
}

function SceneGroupChip({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean
  count: number
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="editor-menu-button inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-[11px]"
    >
      <span>{label}</span>
      <span className="editor-mini-pill">{count}</span>
    </button>
  )
}

function matchesCatalogFilter(item: StaticAssetCatalogItem, filter: CatalogFilter) {
  return matchesStaticAssetCatalogDomain(item, filter)
}

function matchesSceneGroup(
  groupKey: string,
  itemType: 'asset' | 'entity',
  kind: string
) {
  if (groupKey === 'all') return true
  if (groupKey.startsWith('asset:')) {
    return itemType === 'asset' && groupKey.slice('asset:'.length) === kind
  }
  if (groupKey.startsWith('entity:')) {
    return itemType === 'entity' && groupKey.slice('entity:'.length) === kind
  }
  return true
}

export function isPointInsideZoneBoundary(point: Vector3, boundary: Vector3[]) {
  if (boundary.length < 3) return false

  let inside = false
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const xi = boundary[i].x
    const zi = boundary[i].z
    const xj = boundary[j].x
    const zj = boundary[j].z

    const intersects =
      zi > point.z !== zj > point.z &&
      point.x < ((xj - xi) * (point.z - zi)) / (zj - zi || Number.EPSILON) + xi

    if (intersects) inside = !inside
  }

  return inside
}

export function buildEditorSceneTree(
  zones: ZoneEntity[],
  assets: StaticAssetInstance[],
  entities: Entity[]
): EditorSceneTreeSection[] {
  const orderedZones = [...zones].sort((left, right) =>
    left.name.localeCompare(right.name, 'zh-CN')
  )
  const zoneSections = orderedZones.map<EditorSceneTreeSection>((zone) => ({
    id: zone.id,
    kind: 'zone',
    label: zone.name,
    subtitle: `区域 · ${zone.zoneType}`,
    assetCount: 0,
    entityCount: 0,
    assets: [],
    entities: [],
  }))

  const rootSection: EditorSceneTreeSection = {
    id: 'scene-root',
    kind: 'root',
    label: '未分区 / 场景根',
    subtitle: '未落入任何区域边界的对象',
    assetCount: 0,
    entityCount: 0,
    assets: [],
    entities: [],
  }

  const findSectionForPoint = (point: Vector3) =>
    zoneSections.find((section) => {
      const zone = orderedZones.find((item) => item.id === section.id)
      return zone ? isPointInsideZoneBoundary(point, zone.boundary) : false
    }) ?? rootSection

  for (const asset of assets) {
    const section = findSectionForPoint(asset.position)
    section.assets.push(asset)
    section.assetCount += 1
  }

  for (const entity of entities) {
    const section = findSectionForPoint(entity.position)
    section.entities.push(entity)
    section.entityCount += 1
  }

  return [...zoneSections, rootSection].filter(
    (section) => section.assetCount > 0 || section.entityCount > 0
  )
}

function TreeSectionTrigger({
  label,
  subtitle,
  open,
  onToggle,
  assetCount,
  entityCount,
}: {
  label: string
  subtitle: string
  open: boolean
  onToggle: () => void
  assetCount: number
  entityCount: number
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="editor-menu-button flex w-full items-center gap-2 px-2.5 py-2 text-left"
    >
      {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
      <MapPinned className="size-4 shrink-0 text-white/58" />
      <div className="grid min-w-0 flex-1 gap-0.5 leading-tight">
        <span className="truncate text-[11px] font-medium">{label}</span>
        <span className="truncate text-[10px] text-white/38">{subtitle}</span>
      </div>
      <span className="editor-mini-pill">{assetCount + entityCount}</span>
    </button>
  )
}

export function EditorAppSidebar({
  className,
  collapsed = false,
  onToggleCollapse,
  returnHref,
  importBusy = false,
  onImportDetectedFloorPlan,
}: EditorAppSidebarProps) {
  const entities = useEditorSceneStore((state) => state.entities)
  const staticAssets = useEditorSceneStore((state) => state.staticAssets)
  const draftStaticAsset = useEditorSceneStore((state) => state.draftStaticAsset)
  const selectedEntityId = useEditorViewerStore((state) => state.selectedEntityId)
  const selectedStaticAssetId = useEditorViewerStore((state) => state.selectedStaticAssetId)
  const editorCameraTarget = useEditorViewerStore((state) => state.editorCameraTarget)
  const placementCatalogId = useEditorUiStore((state) => state.placementCatalogId)
  const floorPlanReference = useEditorUiStore((state) => state.floorPlanReference)
  const selectEntity = useEditorViewerStore((state) => state.selectEntity)
  const selectStaticAsset = useEditorViewerStore((state) => state.selectStaticAsset)
  const armStaticAssetPlacement = useEditorUiStore((state) => state.armStaticAssetPlacement)
  const setFloorPlanReference = useEditorUiStore((state) => state.setFloorPlanReference)
  const updateFloorPlanReference = useEditorUiStore((state) => state.updateFloorPlanReference)
  const isLoading = useEditorUiStore((state) => state.isLoading)
  const setError = useEditorUiStore((state) => state.setError)
  const [resourceTab, setResourceTab] = useState<ResourceTab>('catalog')
  const [isDetectingFloorPlan, setIsDetectingFloorPlan] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [sceneSearch, setSceneSearch] = useState('')
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all')
  const [sceneLayerFilter, setSceneLayerFilter] = useState<SceneLayerFilter>('all')
  const [sceneGroupFilter, setSceneGroupFilter] = useState('all')
  const [collapsedTreeSections, setCollapsedTreeSections] = useState<Record<string, boolean>>({})
  const floorPlanInputRef = useRef<HTMLInputElement | null>(null)

  const catalogItems = listStaticAssetCatalog()

  const editableEntities = useMemo(
    () =>
      [...entities.values()]
        .filter((entity) => entity.visible && isEditorEntityEditable(entity))
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    [entities]
  )

  const visibleZones = useMemo(
    () =>
      [...entities.values()]
        .filter((entity): entity is ZoneEntity => entity.visible && entity.type === 'zone')
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    [entities]
  )

  const authoredStaticAssets = useMemo(() => {
    const items = [...staticAssets.values()]

    if (draftStaticAsset && !items.some((asset) => asset.id === draftStaticAsset.id)) {
      items.push(draftStaticAsset)
    }

    return items.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  }, [draftStaticAsset, staticAssets])

  useEffect(() => {
    if (placementCatalogId) {
      setResourceTab('catalog')
      return
    }

    if (selectedEntityId || selectedStaticAssetId) {
      setResourceTab('scene')
    }
  }, [placementCatalogId, selectedEntityId, selectedStaticAssetId])

  const filteredCatalogItems = useMemo(() => {
    const keyword = normalizeText(catalogSearch)
    return catalogItems.filter((item) => {
      if (!matchesCatalogFilter(item, catalogFilter)) return false
      if (!keyword) return true
      return normalizeText(
        `${item.name} ${item.description} ${item.assetKind} ${item.domain} ${item.subcategory} ${item.tags.join(' ')}`
      ).includes(keyword)
    })
  }, [catalogFilter, catalogItems, catalogSearch])

  const filteredAuthoredStaticAssets = useMemo(() => {
    const keyword = normalizeText(sceneSearch)
    return authoredStaticAssets.filter((asset) => {
      if (sceneLayerFilter === 'runtime-entities') return false
      if (!matchesSceneGroup(sceneGroupFilter, 'asset', asset.assetKind)) return false
      if (!keyword) return true
      const metadata = asset.metadata as {
        domain?: string
        subcategory?: string
        placementMode?: string
        tags?: unknown
      }
      const tags = Array.isArray(metadata.tags) ? metadata.tags.join(' ') : ''

      return normalizeText(
        `${asset.name} ${getStaticAssetKindLabel(asset.assetKind)} ${asset.assetKind} ${asset.variant ?? ''} ${metadata.domain ?? ''} ${metadata.subcategory ?? ''} ${metadata.placementMode ?? ''} ${tags}`
      ).includes(keyword)
    })
  }, [authoredStaticAssets, sceneGroupFilter, sceneLayerFilter, sceneSearch])

  const filteredEditableEntities = useMemo(() => {
    const keyword = normalizeText(sceneSearch)
    return editableEntities.filter((entity) => {
      if (sceneLayerFilter === 'static-assets') return false
      if (!matchesSceneGroup(sceneGroupFilter, 'entity', entity.type)) return false
      if (!keyword) return true
      return normalizeText(`${entity.name} ${entity.type} ${entity.status}`).includes(keyword)
    })
  }, [editableEntities, sceneGroupFilter, sceneLayerFilter, sceneSearch])

  const sceneTreeSections = useMemo(
    () => buildEditorSceneTree(visibleZones, filteredAuthoredStaticAssets, filteredEditableEntities),
    [filteredAuthoredStaticAssets, filteredEditableEntities, visibleZones]
  )

  const sceneGroupOptions = useMemo(() => {
    const assetGroups = new Map<string, { label: string; count: number }>()
    const entityGroups = new Map<string, { label: string; count: number }>()

    for (const asset of authoredStaticAssets) {
      const current = assetGroups.get(asset.assetKind) ?? {
        label: getStaticAssetKindLabel(asset.assetKind),
        count: 0,
      }
      current.count += 1
      assetGroups.set(asset.assetKind, current)
    }

    for (const entity of editableEntities) {
      const current = entityGroups.get(entity.type) ?? {
        label: ENTITY_TYPE_LABELS[entity.type] ?? entity.type,
        count: 0,
      }
      current.count += 1
      entityGroups.set(entity.type, current)
    }

    return [
      { key: 'all', label: '全部', count: authoredStaticAssets.length + editableEntities.length },
      ...[...assetGroups.entries()].map(([key, value]) => ({
        key: `asset:${key}`,
        label: `资产 · ${value.label}`,
        count: value.count,
      })),
      ...[...entityGroups.entries()].map(([key, value]) => ({
        key: `entity:${key}`,
        label: `实体 · ${value.label}`,
        count: value.count,
      })),
    ]
  }, [authoredStaticAssets, editableEntities])

  const collapseLabel = collapsed ? 'Expand resources panel' : 'Collapse resources panel'
  const resolvedReturnHref = returnHref?.trim() || '/'
  const floorPlanBusy = importBusy || isDetectingFloorPlan

  const handleFloorPlanFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      if (!ALLOWED_FLOOR_PLAN_TYPES.has(file.type)) {
        setError('floor plan 仅支持 PNG 或 JPEG 图片。')
        event.target.value = ''
        return
      }

      if (file.size > MAX_FLOOR_PLAN_BYTES) {
        setError('floor plan 图片过大，请控制在 10MB 以内。')
        event.target.value = ''
        return
      }

      const nextUrl = URL.createObjectURL(file)
      if (floorPlanReference?.src?.startsWith('blob:')) {
        URL.revokeObjectURL(floorPlanReference.src)
      }

      setError(null)
      setFloorPlanReference({
        src: nextUrl,
        label: file.name,
        position: {
          x: editorCameraTarget.x,
          y: 0,
          z: editorCameraTarget.z,
        },
        scaleMeters: 12,
        opacity: 0.72,
        visible: true,
      })
      event.target.value = ''
    },
    [
      editorCameraTarget.x,
      editorCameraTarget.z,
      floorPlanReference?.src,
      setError,
      setFloorPlanReference,
    ]
  )

  const handleImportFloorPlan = useCallback(async () => {
    if (!floorPlanReference || !onImportDetectedFloorPlan || floorPlanBusy) return

    setIsDetectingFloorPlan(true)
    try {
      setError(null)
      const detection = await detectFloorPlanFromImageUrl(floorPlanReference.src)
      await onImportDetectedFloorPlan(detection, {
        position: floorPlanReference.position,
        scaleMeters: floorPlanReference.scaleMeters,
      })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'floor plan 识别失败')
    } finally {
      setIsDetectingFloorPlan(false)
    }
  }, [floorPlanBusy, floorPlanReference, onImportDetectedFloorPlan, setError])

  useEffect(() => {
    return () => {
      if (floorPlanReference?.src?.startsWith('blob:')) {
        URL.revokeObjectURL(floorPlanReference.src)
      }
    }
  }, [floorPlanReference?.src])

  if (collapsed) {
    return (
      <aside className={cn('h-full w-full min-w-0', className)}>
        <div className="editor-side-shell editor-panel editor-panel--soft flex size-10 items-center justify-center p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={collapseLabel}
            title={collapseLabel}
            onClick={onToggleCollapse}
            className="editor-control editor-edge-toggle editor-edge-toggle--left editor-header-icon size-8 rounded-[12px]"
          >
            <Layers3 className="size-4" />
          </Button>
        </div>
      </aside>
    )
  }

  return (
    <aside className={cn('h-full w-full min-w-0', className)}>
      <div className="editor-side-shell-wrap editor-side-shell-wrap--left h-full">
        <div className="editor-side-shell editor-panel editor-panel--soft flex h-full min-h-0 flex-col overflow-hidden px-2 py-2 text-white">
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="editor-panel editor-panel--accent editor-side-header px-2.5 py-2">
              <div className="flex min-w-0 items-center gap-2.5 rounded-[14px] text-white">
                {onToggleCollapse ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={collapseLabel}
                    title={collapseLabel}
                    onClick={onToggleCollapse}
                    className="editor-control editor-header-icon size-8 shrink-0 rounded-[12px]"
                  >
                    <Layers3 className="size-4" />
                  </Button>
                ) : (
                  <div className="editor-header-icon flex size-8 items-center justify-center rounded-[12px]">
                    <Layers3 className="size-4" />
                  </div>
                )}
                <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                  <span className="truncate text-[13px] font-semibold">资源库 / 场景</span>
                </div>
                <Button asChild variant="ghost" size="sm" className="editor-control gap-1 px-2 text-[11px]">
                  <Link href={resolvedReturnHref}>
                    <ArrowLeft className="size-3.5" />
                    退出编辑
                  </Link>
                </Button>
              </div>
            </div>

            <div className="editor-group px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="editor-kicker">Workspace</p>
                  <p className="mt-1 text-[13px] font-semibold leading-5">
                    {isLoading
                      ? '正在同步编辑态'
                      : `${authoredStaticAssets.length} 个已摆放对象 / ${editableEntities.length} 个运行实体`}
                  </p>
                </div>
              </div>
            </div>

            <div className="editor-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-0.5">
              <Tabs
                value={resourceTab}
                onValueChange={(value) => setResourceTab(value as ResourceTab)}
                className="gap-2"
              >
                <div className="editor-panel editor-panel--soft p-1.5">
                  <TabsList className="editor-tab-list grid grid-cols-2">
                    <TabsTrigger value="catalog" className="editor-tab-trigger">
                      资源库
                    </TabsTrigger>
                    <TabsTrigger value="scene" className="editor-tab-trigger">
                      场景
                    </TabsTrigger>
                  </TabsList>
                </div>

              <TabsContent value="catalog" className="space-y-2">
                <section className="editor-group p-1.5">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="size-4 text-white/44" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/38">
                        Floor Plan
                      </span>
                    </div>
                    <span className="editor-mini-pill">
                      {floorPlanReference ? 'Loaded' : 'Empty'}
                    </span>
                  </div>

                  <input
                    ref={floorPlanInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={handleFloorPlanFileChange}
                  />

                  <div className="mt-2 space-y-2 rounded-[12px] border border-white/6 bg-black/10 p-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="editor-control gap-1 px-2 text-[11px]"
                        onClick={() => floorPlanInputRef.current?.click()}
                      >
                        <Upload className="size-3.5" />
                        上传图纸
                      </Button>
                      {floorPlanReference ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="editor-control gap-1 px-2 text-[11px]"
                            onClick={() =>
                              updateFloorPlanReference({
                                visible: !floorPlanReference.visible,
                              })
                            }
                          >
                            {floorPlanReference.visible ? '隐藏参考' : '显示参考'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="editor-control gap-1 px-2 text-[11px]"
                            onClick={() => {
                              if (floorPlanReference.src.startsWith('blob:')) {
                                URL.revokeObjectURL(floorPlanReference.src)
                              }
                              setFloorPlanReference(null)
                            }}
                          >
                            移除
                          </Button>
                        </>
                      ) : null}
                    </div>

                    {floorPlanReference ? (
                      <div className="space-y-2">
                        <p className="text-[11px] text-white/52">{floorPlanReference.label}</p>
                        <div className="grid grid-cols-[auto,1fr] items-center gap-2 text-[11px]">
                          <span className="text-white/48">锚点 X</span>
                          <Input
                            type="number"
                            step={0.5}
                            value={floorPlanReference.position.x}
                            onChange={(event) =>
                              updateFloorPlanReference({
                                position: {
                                  ...floorPlanReference.position,
                                  x: Number(event.target.value) || 0,
                                },
                              })
                            }
                            className="editor-input h-8"
                          />
                          <span className="text-white/48">锚点 Z</span>
                          <Input
                            type="number"
                            step={0.5}
                            value={floorPlanReference.position.z}
                            onChange={(event) =>
                              updateFloorPlanReference({
                                position: {
                                  ...floorPlanReference.position,
                                  z: Number(event.target.value) || 0,
                                },
                              })
                            }
                            className="editor-input h-8"
                          />
                          <span className="text-white/48">宽度</span>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={floorPlanReference.scaleMeters}
                            onChange={(event) =>
                              updateFloorPlanReference({
                                scaleMeters: Number(event.target.value) || 12,
                              })
                            }
                            className="editor-input h-8"
                          />
                          <span className="text-white/48">透明度</span>
                          <Input
                            type="number"
                            min={0.05}
                            max={1}
                            step={0.05}
                            value={floorPlanReference.opacity}
                            onChange={(event) =>
                              updateFloorPlanReference({
                                opacity: Number(event.target.value) || 0.72,
                              })
                            }
                            className="editor-input h-8"
                          />
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!onImportDetectedFloorPlan || floorPlanBusy}
                          className="editor-control w-full justify-center gap-1 px-2 text-[11px]"
                          onClick={() => void handleImportFloorPlan()}
                        >
                          {floorPlanBusy ? '识别中…' : '识别并导入墙体 / 门窗'}
                        </Button>
                      </div>
                    ) : (
                      <div className="editor-empty">
                        上传 floor plan 图片作为地面参考，并导入可编辑墙体 / 门窗。
                      </div>
                    )}
                  </div>
                </section>

                <div className="editor-group p-1.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/36" />
                    <Input
                      value={catalogSearch}
                      onChange={(event) => setCatalogSearch(event.target.value)}
                      placeholder="搜索墙体、门、摄像头、传感器、温控器..."
                      className="editor-input pl-9"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CATALOG_FILTERS.map((item) => (
                      <SceneGroupChip
                        key={item.key}
                        active={catalogFilter === item.key}
                        count={
                          item.key === 'all'
                            ? catalogItems.length
                            : catalogItems.filter((catalogItem) =>
                                matchesCatalogFilter(catalogItem, item.key)
                              ).length
                        }
                        label={item.label}
                        onClick={() => setCatalogFilter(item.key)}
                      />
                    ))}
                  </div>
                </div>

                <section className="editor-group p-1.5">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <TowerControl className="size-4 text-white/44" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/38">
                        Asset Library
                      </span>
                    </div>
                    <span className="editor-mini-pill">{filteredCatalogItems.length}</span>
                  </div>
                  <ul className="mt-1 flex flex-col gap-1">
                    {filteredCatalogItems.map((item) => (
                      <li key={item.id}>
                        <PanelMenuButton
                          active={placementCatalogId === item.id}
                          title={item.name}
                          draggable
                          onDragStart={(event) => {
                            armStaticAssetPlacement(item.id)
                            event.dataTransfer.effectAllowed = 'copy'
                            event.dataTransfer.setData(EDITOR_CATALOG_TRANSFER_MIME, item.id)
                            event.dataTransfer.setData('text/plain', item.id)
                          }}
                          onDragEnd={() => {
                            if (placementCatalogId === item.id) {
                              armStaticAssetPlacement(null)
                            }
                          }}
                          onClick={() =>
                            armStaticAssetPlacement(
                              placementCatalogId === item.id ? null : item.id
                            )
                          }
                        >
                          <CatalogPreviewTile item={item} />
                          <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                            <span className="truncate text-[11px] font-medium">{item.name}</span>
                            <span className="line-clamp-1 text-[11px] text-white/46">
                              {item.description}
                            </span>
                            <span className="text-[10px] text-white/30">
                              {getStaticAssetDomainLabel(item.domain)} ·{' '}
                              {getStaticAssetPlacementLabel(item.placementMode)}
                            </span>
                            <span className="text-[10px] text-white/30">
                              {Math.round(item.dimensions.width)} × {Math.round(item.dimensions.depth)} ×{' '}
                              {Math.round(item.dimensions.height)}m
                            </span>
                          </div>
                        </PanelMenuButton>
                      </li>
                    ))}
                  </ul>
                  {filteredCatalogItems.length === 0 ? (
                    <div className="mt-2 editor-empty">没有符合当前搜索和筛选的资源。</div>
                  ) : null}
                </section>
              </TabsContent>

              <TabsContent value="scene" className="space-y-2">
                <div className="editor-group p-1.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/36" />
                    <Input
                      value={sceneSearch}
                      onChange={(event) => setSceneSearch(event.target.value)}
                      placeholder="搜索对象、实体、图层、分组..."
                      className="editor-input pl-9"
                    />
                  </div>
                </div>

                <section className="editor-group p-1.5">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <Layers3 className="size-4 text-white/44" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/38">
                        图层
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <SceneGroupChip
                      active={sceneLayerFilter === 'all'}
                      count={authoredStaticAssets.length + editableEntities.length}
                      label="全部"
                      onClick={() => setSceneLayerFilter('all')}
                    />
                    <SceneGroupChip
                      active={sceneLayerFilter === 'static-assets'}
                      count={authoredStaticAssets.length}
                      label="已摆放"
                      onClick={() => setSceneLayerFilter('static-assets')}
                    />
                    <SceneGroupChip
                      active={sceneLayerFilter === 'runtime-entities'}
                      count={editableEntities.length}
                      label="运行实体"
                      onClick={() => setSceneLayerFilter('runtime-entities')}
                    />
                  </div>
                </section>

                <section className="editor-group p-1.5">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <Workflow className="size-4 text-white/44" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/38">
                        分组
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sceneGroupOptions.map((item) => (
                      <SceneGroupChip
                        key={item.key}
                        active={sceneGroupFilter === item.key}
                        count={item.count}
                        label={item.label}
                        onClick={() => setSceneGroupFilter(item.key)}
                      />
                    ))}
                  </div>
                </section>

                <section className="editor-group p-1.5">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <MapPinned className="size-4 text-white/44" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/38">
                        场景树
                      </span>
                    </div>
                    <span className="editor-mini-pill">{sceneTreeSections.length}</span>
                  </div>
                  {sceneTreeSections.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1">
                      {sceneTreeSections.map((section) => {
                        const open = !collapsedTreeSections[section.id]

                        return (
                          <li key={section.id} className="rounded-[14px] border border-white/6 bg-white/[0.02]">
                            <TreeSectionTrigger
                              label={section.label}
                              subtitle={section.subtitle}
                              open={open}
                              onToggle={() =>
                                setCollapsedTreeSections((current) => ({
                                  ...current,
                                  [section.id]: !current[section.id],
                                }))
                              }
                              assetCount={section.assetCount}
                              entityCount={section.entityCount}
                            />
                            {open ? (
                              <div className="space-y-1 px-2 pb-2">
                                {section.assets.length > 0 ? (
                                  <div className="space-y-1 rounded-[12px] border border-white/6 bg-black/10 p-1.5">
                                    <p className="px-2 text-[10px] uppercase tracking-[0.22em] text-white/34">
                                      资产
                                    </p>
                                    {section.assets.map((asset) => (
                                      <PanelMenuButton
                                        key={asset.id}
                                        active={selectedStaticAssetId === asset.id}
                                        title={asset.name}
                                        className="pl-7"
                                        onClick={() => selectStaticAsset(asset.id)}
                                      >
                                        <Factory className="mt-0.5 size-4 shrink-0" />
                                        <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                                          <span className="truncate font-medium">{asset.name}</span>
                                          <span className="line-clamp-1 text-[11px] text-white/46">
                                            {getStaticAssetKindLabel(asset.assetKind)}
                                            {asset.variant ? ` · ${asset.variant}` : ''}
                                          </span>
                                        </div>
                                      </PanelMenuButton>
                                    ))}
                                  </div>
                                ) : null}

                                {section.entities.length > 0 ? (
                                  <div className="space-y-1 rounded-[12px] border border-white/6 bg-black/10 p-1.5">
                                    <p className="px-2 text-[10px] uppercase tracking-[0.22em] text-white/34">
                                      实体
                                    </p>
                                    {section.entities.map((entity) => (
                                      <PanelMenuButton
                                        key={entity.id}
                                        active={selectedEntityId === entity.id}
                                        title={entity.name}
                                        className="pl-7"
                                        onClick={() => selectEntity(entity.id)}
                                      >
                                        <Box className="mt-0.5 size-4 shrink-0" />
                                        <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                                          <span className="truncate font-medium">{entity.name}</span>
                                          <span className="line-clamp-1 text-[11px] text-white/46">
                                            {ENTITY_TYPE_LABELS[entity.type] ?? entity.type} · {entity.status}
                                          </span>
                                        </div>
                                      </PanelMenuButton>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <div className="mt-2 editor-empty">当前筛选下没有可显示的场景树节点。</div>
                  )}
                </section>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
      </div>
    </aside>
  )
}
