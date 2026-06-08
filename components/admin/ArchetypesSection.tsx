'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { AdvancedJsonEditor } from '@/components/admin/AdvancedJsonEditor'
import { ArchetypeModelPreview } from '@/components/admin/ArchetypeModelPreview'
import {
  ADMIN_VALUE_UNSELECTED,
  adminDisplayValue,
  AdminButton,
  AdminSelect,
  AdminSelectableRecordCard,
  AdminSectionFrame,
  SectionPanel,
  WorkspaceEmptyState,
} from '@/components/admin/admin-surface'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStructuredDraft } from '@/hooks/use-structured-draft'
import {
  cloneEntityArchetypeDraft,
  cloneEntityCategoryDraft,
  createEntityArchetypeTemplate,
  createEntityCategoryTemplate,
} from '@/lib/digital-twin/admin-view-models'
import {
  createEntityArchetype,
  createEntityCategory,
  deleteEntityArchetype,
  deleteEntityCategory,
  listEntityArchetypes,
  listEntityCategories,
  updateEntityArchetype,
  updateEntityCategory,
  uploadArchetypeModel,
} from '@/lib/digital-twin/bootstrap-client'
import type {
  ArchetypeModelBounds,
  EntityArchetype,
  EntityCategory,
} from '@/lib/digital-twin/types'

export function ArchetypesSection() {
  const [categories, setCategories] = useState<EntityCategory[]>([])
  const [archetypes, setArchetypes] = useState<EntityArchetype[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string | null>(null)
  const [categoryDraftSeed, setCategoryDraftSeed] = useState<EntityCategory | null>(null)
  const [archetypeDraftSeed, setArchetypeDraftSeed] = useState<EntityArchetype | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId]
  )
  const selectedArchetype = useMemo(
    () => archetypes.find((archetype) => archetype.id === selectedArchetypeId) ?? null,
    [archetypes, selectedArchetypeId]
  )

  const categoryDraft = useStructuredDraft(
    categoryDraftSeed ?? selectedCategory,
    cloneEntityCategoryDraft
  )
  const archetypeDraft = useStructuredDraft(
    archetypeDraftSeed ?? selectedArchetype,
    cloneEntityArchetypeDraft
  )

  const loadRegistry = useCallback(async () => {
    setIsLoading(true)
    try {
      const [loadedCategories, loadedArchetypes] = await Promise.all([
        listEntityCategories(),
        listEntityArchetypes(),
      ])
      setCategories(loadedCategories)
      setArchetypes(loadedArchetypes)
      setSelectedCategoryId((current) => current ?? loadedCategories[0]?.id ?? null)
      setSelectedArchetypeId((current) => current ?? loadedArchetypes[0]?.id ?? null)
      setStatusMessage('已同步实体大类与原型定义')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载原型管理失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRegistry()
  }, [loadRegistry])

  const saveCategory = useCallback(async () => {
    const payload = categoryDraft.applyDraftText()
    if (!payload) {
      setStatusMessage('实体大类 JSON 无法解析')
      return
    }

    try {
      if (categories.some((item) => item.id === payload.id)) {
        await updateEntityCategory(payload.id, payload)
        setStatusMessage('实体大类已更新')
      } else {
        await createEntityCategory(payload)
        setStatusMessage('实体大类已创建')
      }
      await loadRegistry()
      setSelectedCategoryId(payload.id)
      setCategoryDraftSeed(null)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存实体大类失败')
    }
  }, [categories, categoryDraft, loadRegistry])

  const saveArchetype = useCallback(async () => {
    const payload = archetypeDraft.applyDraftText()
    if (!payload) {
      setStatusMessage('实体原型 JSON 无法解析')
      return
    }

    try {
      if (archetypes.some((item) => item.id === payload.id)) {
        await updateEntityArchetype(payload.id, payload)
        setStatusMessage('实体原型已更新')
      } else {
        await createEntityArchetype(payload)
        setStatusMessage('实体原型已创建')
      }
      await loadRegistry()
      setSelectedArchetypeId(payload.id)
      setArchetypeDraftSeed(null)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存实体原型失败')
    }
  }, [archetypeDraft, archetypes, loadRegistry])

  const removeCategory = useCallback(async () => {
    if (!selectedCategoryId) return

    try {
      await deleteEntityCategory(selectedCategoryId)
      setStatusMessage('实体大类已删除')
      setSelectedCategoryId(null)
      setCategoryDraftSeed(null)
      await loadRegistry()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '删除实体大类失败')
    }
  }, [loadRegistry, selectedCategoryId])

  const removeArchetype = useCallback(async () => {
    if (!selectedArchetypeId) return

    try {
      await deleteEntityArchetype(selectedArchetypeId)
      setStatusMessage('实体原型已删除')
      setSelectedArchetypeId(null)
      setArchetypeDraftSeed(null)
      await loadRegistry()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '删除实体原型失败')
    }
  }, [loadRegistry, selectedArchetypeId])

  const uploadModel = useCallback(
    async (file: File) => {
      setIsUploading(true)
      try {
        const uploaded = await uploadArchetypeModel(file)
        archetypeDraft.updateDraft((current) => ({
          ...current,
          model: uploaded,
          capabilities: {
            ...current.capabilities,
            hasModel: true,
          },
        }))
        setStatusMessage(`模型 ${uploaded.fileName} 已上传`)
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '模型上传失败')
      } finally {
        setIsUploading(false)
      }
    },
    [archetypeDraft]
  )

  return (
    <AdminSectionFrame
      section="archetypes"
      statusMessage={statusMessage}
      isLoading={isLoading || isUploading}
      showSummaryCards={false}
      actions={
        <AdminButton onClick={() => void loadRegistry()} disabled={isLoading || isUploading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新原型管理
        </AdminButton>
      }
      metrics={[
        {
          label: '实体大类',
          value: categories.length,
        },
        {
          label: '实体原型',
          value: archetypes.length,
        },
        {
          label: '当前大类',
          value: adminDisplayValue(
            selectedCategory?.displayName ?? categoryDraft.draft?.displayName,
            ADMIN_VALUE_UNSELECTED
          ),
        },
        {
          label: '当前原型',
          value: adminDisplayValue(
            selectedArchetype?.displayName ?? archetypeDraft.draft?.displayName,
            ADMIN_VALUE_UNSELECTED
          ),
        },
      ]}
      railCards={[
        {
          title: '大类',
          value: `${categories.length}`,
        },
        {
          title: '模型',
          value: `${archetypes.filter((item) => item.capabilities.hasModel).length}`,
        },
      ]}
    >
      <div className="grid gap-4 xl:grid-cols-[260px_300px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="大类"
          title="实体大类"
          action={
            <Badge variant="outline" className="rounded-full px-2.5 text-[10px]">
              共 {categories.length} 个
            </Badge>
          }
        >
          <div className="space-y-3">
            <AdminButton
              className="w-full"
              onClick={() => {
                const template = createEntityCategoryTemplate()
                setCategoryDraftSeed(template)
                setSelectedCategoryId(null)
                categoryDraft.replaceDraft(template)
                setStatusMessage('已创建实体大类草稿')
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              新建实体大类
            </AdminButton>

            <ScrollArea className="h-[520px]">
              <div className="space-y-2 pr-3">
                {categories.map((category) => (
                  <AdminSelectableRecordCard
                    key={category.id}
                    active={selectedCategoryId === category.id && categoryDraftSeed === null}
                    onClick={() => {
                      setCategoryDraftSeed(null)
                      setSelectedCategoryId(category.id)
                    }}
                    title={category.displayName}
                    meta={category.key}
                    trailing={<Badge variant="outline">{category.sortOrder}</Badge>}
                  >
                  </AdminSelectableRecordCard>
                ))}
              </div>
            </ScrollArea>
          </div>
        </SectionPanel>

        <SectionPanel
          eyebrow="原型"
          title="实体原型"
          action={
            <Badge variant="outline" className="rounded-full px-2.5 text-[10px]">
              共 {archetypes.length} 个
            </Badge>
          }
        >
          <div className="space-y-3">
            <AdminButton
              className="w-full"
              onClick={() => {
                const template = createEntityArchetypeTemplate(selectedCategory)
                setArchetypeDraftSeed(template)
                setSelectedArchetypeId(null)
                archetypeDraft.replaceDraft(template)
                setStatusMessage('已创建实体原型草稿')
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              新建实体原型
            </AdminButton>

            <ScrollArea className="h-[520px]">
              <div className="space-y-2 pr-3">
                {archetypes.map((archetype) => (
                  <AdminSelectableRecordCard
                    key={archetype.id}
                    active={selectedArchetypeId === archetype.id && archetypeDraftSeed === null}
                    onClick={() => {
                      setArchetypeDraftSeed(null)
                      setSelectedArchetypeId(archetype.id)
                    }}
                    title={archetype.displayName}
                    meta={`${archetype.categoryKey} · ${archetype.key}`}
                    trailing={
                      <Badge variant={archetype.capabilities.hasModel ? 'default' : 'outline'}>
                        {archetype.capabilities.hasModel ? '有模型' : '无模型'}
                      </Badge>
                    }
                  >
                  </AdminSelectableRecordCard>
                ))}
              </div>
            </ScrollArea>
          </div>
        </SectionPanel>

        <div className="space-y-4">
          <SectionPanel
            eyebrow="编辑器"
            title={categoryDraft.draft ? `${categoryDraft.draft.displayName || '实体大类草稿'} 配置` : '实体大类编辑器'}
          >
            {categoryDraft.draft ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Key</Label>
                    <Input
                      value={categoryDraft.draft.key}
                      onChange={(event) =>
                        categoryDraft.updateDraft((current) => ({ ...current, key: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>显示名称</Label>
                    <Input
                      value={categoryDraft.draft.displayName}
                      onChange={(event) =>
                        categoryDraft.updateDraft((current) => ({ ...current, displayName: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>图标</Label>
                    <Input
                      value={categoryDraft.draft.icon ?? ''}
                      onChange={(event) =>
                        categoryDraft.updateDraft((current) => ({ ...current, icon: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>颜色</Label>
                    <Input
                      value={categoryDraft.draft.color ?? ''}
                      onChange={(event) =>
                        categoryDraft.updateDraft((current) => ({ ...current, color: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>排序</Label>
                    <Input
                      type="number"
                      value={categoryDraft.draft.sortOrder}
                      onChange={(event) =>
                        categoryDraft.updateDraft((current) => ({ ...current, sortOrder: Number(event.target.value || 0) }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>说明</Label>
                  <Input
                    value={categoryDraft.draft.description ?? ''}
                    onChange={(event) =>
                      categoryDraft.updateDraft((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                </div>

                <AdvancedJsonEditor
                  value={categoryDraft.draftText}
                  onChange={categoryDraft.setDraftText}
                  onApply={() => {
                    if (!categoryDraft.applyDraftText()) {
                      setStatusMessage('实体大类 JSON 无法解析')
                      return
                    }
                    setStatusMessage('已从 JSON 应用实体大类草稿')
                  }}
                />

                <div className="flex flex-wrap justify-end gap-2">
                  <AdminButton tone="danger" onClick={() => void removeCategory()}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除实体大类
                  </AdminButton>
                  <AdminButton tone="primary" onClick={() => void saveCategory()}>
                    <Save className="mr-1 h-4 w-4" />
                    保存实体大类
                  </AdminButton>
                </div>
              </div>
            ) : (
              <WorkspaceEmptyState
                eyebrow="大类"
                title="选择或新建实体大类"
                items={['Key', '显示名', '排序']}
              />
            )}
          </SectionPanel>

          <SectionPanel
            eyebrow="编辑器"
            title={archetypeDraft.draft ? `${archetypeDraft.draft.displayName || '实体原型草稿'} 配置` : '实体原型编辑器'}
          >
            {archetypeDraft.draft ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>所属大类</Label>
                    <AdminSelect
                      value={archetypeDraft.draft.categoryId}
                      onChange={(event) => {
                        const category = categories.find((item) => item.id === event.target.value) ?? null
                        archetypeDraft.updateDraft((current) => ({
                          ...current,
                          categoryId: category?.id ?? '',
                          categoryKey: category?.key ?? '',
                        }))
                      }}
                    >
                      <option value="">请选择实体大类</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.displayName}
                        </option>
                      ))}
                    </AdminSelect>
                  </div>
                  <div className="space-y-2">
                    <Label>Key</Label>
                    <Input
                      value={archetypeDraft.draft.key}
                      onChange={(event) =>
                        archetypeDraft.updateDraft((current) => ({ ...current, key: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>显示名称</Label>
                    <Input
                      value={archetypeDraft.draft.displayName}
                      onChange={(event) =>
                        archetypeDraft.updateDraft((current) => ({ ...current, displayName: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>说明</Label>
                    <Input
                      value={archetypeDraft.draft.description ?? ''}
                      onChange={(event) =>
                        archetypeDraft.updateDraft((current) => ({ ...current, description: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                  {[
                    ['hasModel', '有模型'],
                    ['movable', '可移动'],
                    ['bindable', '可绑定'],
                    ['statusBearing', '有状态'],
                    ['detailFieldsVisible', '详情可见'],
                  ].map(([key, label]) => (
                    <label key={key} className="admin-choice-chip flex items-center gap-2 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={
                          archetypeDraft.draft?.capabilities[
                            key as keyof EntityArchetype['capabilities']
                          ] ?? false
                        }
                        onChange={(event) =>
                          archetypeDraft.updateDraft((current) => ({
                            ...current,
                            capabilities: {
                              ...current.capabilities,
                              [key]: event.target.checked,
                            },
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <div className="admin-inset-block space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">模型上传与预览</div>
                    </div>
                    <Input
                      type="file"
                      accept=".glb,.fbx"
                      disabled={isUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) void uploadModel(file)
                      }}
                      className="max-w-xs"
                    />
                  </div>

                  <ArchetypeModelPreview
                    model={archetypeDraft.draft.model}
                    calibration={
                      archetypeDraft.draft.model?.calibration ?? {
                        scale: { x: 1, y: 1, z: 1 },
                        rotation: { x: 0, y: 0, z: 0 },
                        translation: { x: 0, y: 0, z: 0 },
                        floorOffset: 0,
                      }
                    }
                    onBoundsMeasured={(bounds: ArchetypeModelBounds) =>
                      archetypeDraft.updateDraft((current) => {
                        if (!current.model) return current
                        return {
                          ...current,
                          model: {
                            ...current.model,
                            calibration: {
                              ...current.model.calibration,
                              bounds,
                            },
                          },
                        }
                      })
                    }
                  />
                </div>

                <AdvancedJsonEditor
                  value={archetypeDraft.draftText}
                  onChange={archetypeDraft.setDraftText}
                  onApply={() => {
                    if (!archetypeDraft.applyDraftText()) {
                      setStatusMessage('实体原型 JSON 无法解析')
                      return
                    }
                    setStatusMessage('已从 JSON 应用实体原型草稿')
                  }}
                />

                <div className="flex flex-wrap justify-end gap-2">
                  <AdminButton tone="danger" onClick={() => void removeArchetype()}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除实体原型
                  </AdminButton>
                  <AdminButton tone="primary" onClick={() => void saveArchetype()}>
                    <Save className="mr-1 h-4 w-4" />
                    保存实体原型
                  </AdminButton>
                </div>
              </div>
            ) : (
              <WorkspaceEmptyState
                eyebrow="原型"
                title="选择或新建实体原型"
                items={['模型', '能力', '校准']}
              />
            )}
          </SectionPanel>
        </div>
      </div>
    </AdminSectionFrame>
  )
}
