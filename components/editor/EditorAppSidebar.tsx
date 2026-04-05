'use client'

import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import {
  Box,
  Boxes,
  Factory,
  Layers3,
  Search,
  TowerControl,
  Workflow,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EDITOR_CATALOG_TRANSFER_MIME } from '@/lib/digital-twin/editor-dnd'
import {
  isEditorEntityEditable,
  useEditorDigitalTwinStore,
} from '@/lib/digital-twin/editor-store'
import {
  type StaticAssetCatalogItem,
  listStaticAssetCatalog,
} from '@/lib/digital-twin/static-asset-catalog'
import { cn } from '@/lib/utils'

type ResourceTab = 'catalog' | 'scene'
type CatalogFilter =
  | 'all'
  | 'process-train'
  | 'pipe-rack'
  | 'vertical-tank'
  | 'sphere-tank'
  | 'pump-manifold'
  | 'service-building'
type SceneLayerFilter = 'all' | 'static-assets' | 'runtime-entities'

type EditorAppSidebarProps = {
  className?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const CATALOG_FILTERS: Array<{ key: CatalogFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'process-train', label: '塔器装置' },
  { key: 'pipe-rack', label: '桥架 / 管廊' },
  { key: 'vertical-tank', label: '立罐' },
  { key: 'sphere-tank', label: '球罐' },
  { key: 'pump-manifold', label: '设备模块' },
  { key: 'service-building', label: '建筑' },
]

const ASSET_KIND_LABELS: Record<string, string> = {
  'process-train': '塔器装置',
  'pipe-rack': '桥架 / 管廊',
  'vertical-tank': '立罐',
  'sphere-tank': '球罐',
  'pump-manifold': '设备模块',
  'service-building': '建筑',
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  person: '人员',
  vehicle: '车辆',
  equipment: '设备',
  sensor: '传感器',
  camera: '摄像头',
  zone: '区域',
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
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
  return filter === 'all' || item.assetKind === filter
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

export function EditorAppSidebar({
  className,
  collapsed = false,
  onToggleCollapse,
}: EditorAppSidebarProps) {
  const entities = useEditorDigitalTwinStore((state) => state.entities)
  const staticAssets = useEditorDigitalTwinStore((state) => state.staticAssets)
  const draftStaticAsset = useEditorDigitalTwinStore((state) => state.draftStaticAsset)
  const selectedEntityId = useEditorDigitalTwinStore((state) => state.selectedEntityId)
  const selectedStaticAssetId = useEditorDigitalTwinStore(
    (state) => state.selectedStaticAssetId
  )
  const placementCatalogId = useEditorDigitalTwinStore((state) => state.placementCatalogId)
  const selectEntity = useEditorDigitalTwinStore((state) => state.selectEntity)
  const selectStaticAsset = useEditorDigitalTwinStore((state) => state.selectStaticAsset)
  const armStaticAssetPlacement = useEditorDigitalTwinStore(
    (state) => state.armStaticAssetPlacement
  )
  const isLoading = useEditorDigitalTwinStore((state) => state.isLoading)
  const [resourceTab, setResourceTab] = useState<ResourceTab>('catalog')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [sceneSearch, setSceneSearch] = useState('')
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all')
  const [sceneLayerFilter, setSceneLayerFilter] = useState<SceneLayerFilter>('all')
  const [sceneGroupFilter, setSceneGroupFilter] = useState('all')

  const catalogItems = listStaticAssetCatalog()

  const editableEntities = useMemo(
    () =>
      [...entities.values()]
        .filter((entity) => entity.visible && isEditorEntityEditable(entity))
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
      return normalizeText(`${item.name} ${item.description} ${item.assetKind}`).includes(keyword)
    })
  }, [catalogFilter, catalogItems, catalogSearch])

  const filteredAuthoredStaticAssets = useMemo(() => {
    const keyword = normalizeText(sceneSearch)
    return authoredStaticAssets.filter((asset) => {
      if (sceneLayerFilter === 'runtime-entities') return false
      if (!matchesSceneGroup(sceneGroupFilter, 'asset', asset.assetKind)) return false
      if (!keyword) return true
      return normalizeText(`${asset.name} ${asset.assetKind} ${asset.variant ?? ''}`).includes(
        keyword
      )
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

  const sceneGroupOptions = useMemo(() => {
    const assetGroups = new Map<string, { label: string; count: number }>()
    const entityGroups = new Map<string, { label: string; count: number }>()

    for (const asset of authoredStaticAssets) {
      const current = assetGroups.get(asset.assetKind) ?? {
        label: ASSET_KIND_LABELS[asset.assetKind] ?? asset.assetKind,
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
            className="editor-control editor-header-icon size-8 rounded-[12px]"
          >
            <Boxes className="size-4" />
          </Button>
        </div>
      </aside>
    )
  }

  return (
    <aside className={cn('h-full w-full min-w-0', className)}>
      <div className="editor-side-shell editor-panel editor-panel--soft flex h-full min-h-0 flex-col overflow-hidden px-2 py-2 text-white">
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="editor-panel editor-panel--accent px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-2.5 rounded-[14px] text-white">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={collapseLabel}
                title={collapseLabel}
                onClick={onToggleCollapse}
                className="editor-control editor-header-icon size-8 rounded-[12px]"
              >
                <Boxes className="size-4" />
              </Button>
              <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                <span className="truncate text-[13px] font-semibold">资源库 / 场景</span>
                <span className="truncate text-[11px] text-white/54">
                  拖放到画布，或从场景区回选对象
                </span>
              </div>
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
              <Badge className="editor-pill">Dock</Badge>
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
                <div className="editor-group p-1.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/36" />
                    <Input
                      value={catalogSearch}
                      onChange={(event) => setCatalogSearch(event.target.value)}
                      placeholder="搜索塔、桥架、罐体、模块..."
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
                          <TowerControl className="mt-0.5 size-4 shrink-0" />
                          <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{item.name}</span>
                              <span className="editor-mini-pill">拖入</span>
                            </div>
                            <span className="line-clamp-1 text-[11px] text-white/46">
                              {item.description}
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
                      <Factory className="size-4 text-white/44" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/38">
                        已摆放对象
                      </span>
                    </div>
                    <span className="editor-mini-pill">{filteredAuthoredStaticAssets.length}</span>
                  </div>
                  {filteredAuthoredStaticAssets.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1">
                      {filteredAuthoredStaticAssets.map((asset) => (
                        <li key={asset.id}>
                          <PanelMenuButton
                            active={selectedStaticAssetId === asset.id}
                            title={asset.name}
                            onClick={() => selectStaticAsset(asset.id)}
                          >
                            <Factory className="mt-0.5 size-4 shrink-0" />
                            <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                              <span className="truncate font-medium">{asset.name}</span>
                              <span className="line-clamp-1 text-[11px] text-white/46">
                                {ASSET_KIND_LABELS[asset.assetKind] ?? asset.assetKind}
                                {asset.variant ? ` · ${asset.variant}` : ''}
                              </span>
                            </div>
                          </PanelMenuButton>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-2 editor-empty">当前筛选下没有已摆放对象。</div>
                  )}
                </section>

                <section className="editor-group p-1.5">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <Box className="size-4 text-white/44" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/38">
                        运行实体
                      </span>
                    </div>
                    <span className="editor-mini-pill">{filteredEditableEntities.length}</span>
                  </div>
                  {filteredEditableEntities.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1">
                      {filteredEditableEntities.map((entity) => (
                        <li key={entity.id}>
                          <PanelMenuButton
                            active={selectedEntityId === entity.id}
                            title={entity.name}
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
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-2 editor-empty">当前筛选下没有运行实体。</div>
                  )}
                </section>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </aside>
  )
}
