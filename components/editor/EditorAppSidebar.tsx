'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Box,
  Command,
  Eye,
  Factory,
  PencilRuler,
  Settings2,
  Sparkles,
  TowerControl,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  isEditorEntityEditable,
  useEditorDigitalTwinStore,
} from '@/lib/digital-twin/editor-store'
import { listStaticAssetCatalog } from '@/lib/digital-twin/static-asset-catalog'

const WORKSPACE_LINKS = [
  {
    href: '/',
    title: 'Runtime Viewer',
    description: 'Published read-only scene',
    icon: Eye,
  },
  {
    href: '/editor',
    title: '3D Editor',
    description: 'Authoring surface for entities and map assets',
    icon: PencilRuler,
  },
  {
    href: '/admin/overview',
    title: 'Admin Console',
    description: 'Structured governance and configuration',
    icon: Settings2,
  },
]

type ResourceTab = 'catalog' | 'scene'

export function EditorAppSidebar() {
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

  const catalogItems = listStaticAssetCatalog()

  const editableEntities = [...entities.values()]
    .filter((entity) => entity.visible && isEditorEntityEditable(entity))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))

  const authoredStaticAssets = useMemo(() => {
    const items = [...staticAssets.values()]

    if (
      draftStaticAsset &&
      !items.some((asset) => asset.id === draftStaticAsset.id)
    ) {
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

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className="editor-sidebar"
      style={
        {
          '--sidebar-width': '20.75rem',
          '--sidebar-width-icon': '4.5rem',
        } as CSSProperties
      }
    >
      <SidebarHeader className="gap-3 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="editor-panel editor-panel--accent h-auto px-3 py-3 text-white"
            >
              <Link href="/editor">
                <div className="flex size-10 items-center justify-center rounded-[18px] border border-white/12 bg-[#7da7ff]/16 text-[#d3e2ff]">
                  <Command className="size-4" />
                </div>
                <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">Digital Twin Editor</span>
                  <span className="truncate text-xs text-white/54">
                    Floating authoring surface
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="editor-panel editor-panel--soft p-4 text-white group-data-[collapsible=icon]:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="editor-kicker">Session</p>
              <p className="mt-2 text-sm font-semibold">
                {isLoading
                  ? 'Syncing editor state'
                  : `${authoredStaticAssets.length} authored assets / ${editableEntities.length} editable entities`}
              </p>
            </div>
            <Badge className="editor-pill">
              /editor
            </Badge>
          </div>
          <p className="mt-3 text-xs leading-5 text-white/58">
            Select from the catalog, place on canvas, adjust with gizmos, then commit
            explicitly.
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-3 px-3 pb-3">
        <SidebarGroup className="editor-group p-2">
          <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.28em] text-white/38">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {WORKSPACE_LINKS.map((item) => {
                const Icon = item.icon
                const isCurrent = item.href === '/editor'

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={isCurrent}
                      className="editor-menu-button h-auto px-3 py-3 group-data-[collapsible=icon]:rounded-2xl group-data-[collapsible=icon]:px-2.5"
                    >
                      <Link href={item.href}>
                        <Icon className="size-4" />
                        <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                          <span className="truncate font-medium">{item.title}</span>
                          <span className="line-clamp-2 text-xs text-white/46 group-data-[collapsible=icon]:hidden">
                            {item.description}
                          </span>
                        </div>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Tabs
          value={resourceTab}
          onValueChange={(value) => setResourceTab(value as ResourceTab)}
          className="gap-3"
        >
          <div className="editor-panel editor-panel--soft p-2 group-data-[collapsible=icon]:hidden">
            <TabsList className="editor-tab-list grid grid-cols-2">
              <TabsTrigger value="catalog" className="editor-tab-trigger">
                Catalog
              </TabsTrigger>
              <TabsTrigger value="scene" className="editor-tab-trigger">
                Scene
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="catalog" className="space-y-3">
            <SidebarGroup className="editor-group p-2">
              <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.28em] text-white/38">
                Map Catalog
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {catalogItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={placementCatalogId === item.id}
                        tooltip={item.name}
                        className="editor-menu-button h-auto px-3 py-3 group-data-[collapsible=icon]:rounded-2xl group-data-[collapsible=icon]:px-2.5"
                        onClick={() =>
                          armStaticAssetPlacement(
                            placementCatalogId === item.id ? null : item.id
                          )
                        }
                      >
                        <TowerControl className="size-4" />
                        <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{item.name}</span>
                            <span className="editor-mini-pill group-data-[collapsible=icon]:hidden">
                              Arm
                            </span>
                          </div>
                          <span className="line-clamp-2 text-xs text-white/46 group-data-[collapsible=icon]:hidden">
                            {item.description}
                          </span>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <div className="editor-panel editor-panel--soft p-4 text-white group-data-[collapsible=icon]:hidden">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="editor-kicker">Placement Flow</p>
                  <p className="mt-2 text-sm font-semibold">
                    {placementCatalogId ? 'Catalog item armed' : 'Choose from catalog first'}
                  </p>
                </div>
                <Badge className="editor-pill">
                  {catalogItems.length} items
                </Badge>
              </div>
              <p className="mt-3 text-xs leading-5 text-white/56">
                {placementCatalogId
                  ? 'Go to the canvas and click the ground plane to create a new authored overlay draft.'
                  : 'Catalog is separated from placed objects so the left rail reads more like authoring inventory than a flat admin list.'}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="scene" className="space-y-3">
            <SidebarGroup className="editor-group p-2">
              <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.28em] text-white/38">
                Authored Assets
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {authoredStaticAssets.length > 0 ? (
                    authoredStaticAssets.map((asset) => (
                      <SidebarMenuItem key={asset.id}>
                        <SidebarMenuButton
                          isActive={selectedStaticAssetId === asset.id}
                          tooltip={asset.name}
                          className="editor-menu-button h-auto px-3 py-3 group-data-[collapsible=icon]:rounded-2xl group-data-[collapsible=icon]:px-2.5"
                          onClick={() => selectStaticAsset(asset.id)}
                        >
                          <Factory className="size-4" />
                          <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                            <span className="truncate font-medium">{asset.name}</span>
                            <span className="line-clamp-1 text-xs text-white/46 group-data-[collapsible=icon]:hidden">
                              {asset.assetKind}
                              {asset.variant ? ` · ${asset.variant}` : ''}
                            </span>
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))
                  ) : (
                    <div className="editor-empty group-data-[collapsible=icon]:hidden">
                      No authored static assets yet. Arm a catalog item and place it on
                      the canvas.
                    </div>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="editor-group p-2">
              <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.28em] text-white/38">
                Entities
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {editableEntities.length > 0 ? (
                    editableEntities.map((entity) => (
                      <SidebarMenuItem key={entity.id}>
                        <SidebarMenuButton
                          isActive={selectedEntityId === entity.id}
                          tooltip={entity.name}
                          className="editor-menu-button h-auto px-3 py-3 group-data-[collapsible=icon]:rounded-2xl group-data-[collapsible=icon]:px-2.5"
                          onClick={() => selectEntity(entity.id)}
                        >
                          <Box className="size-4" />
                          <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                            <span className="truncate font-medium">{entity.name}</span>
                            <span className="line-clamp-1 text-xs text-white/46 group-data-[collapsible=icon]:hidden">
                              {entity.type} · {entity.status}
                            </span>
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))
                  ) : (
                    <div className="editor-empty group-data-[collapsible=icon]:hidden">
                      No editable runtime entities are available in the current bootstrap.
                    </div>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </TabsContent>
        </Tabs>
      </SidebarContent>

      <SidebarFooter className="p-3 pt-0">
        <div className="editor-panel editor-panel--soft p-4 text-white group-data-[collapsible=icon]:hidden">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Authoring Notes</p>
            <div className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/56">
              <Sparkles className="size-4" />
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-white/56">
            This page is intentionally distinct from the runtime viewer. Treat it as a
            staging surface for spatial edits, not a dashboard.
          </p>
        </div>
      </SidebarFooter>

      <SidebarRail className="after:bg-white/10 hover:after:bg-white/20" />
    </Sidebar>
  )
}
