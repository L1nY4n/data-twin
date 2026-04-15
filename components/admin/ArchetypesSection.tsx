'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { AdvancedJsonEditor } from '@/components/admin/AdvancedJsonEditor'
import { ArchetypeModelPreview } from '@/components/admin/ArchetypeModelPreview'
import {
  AdminSectionFrame,
  SectionPanel,
  WorkspaceEmptyState,
} from '@/components/admin/admin-surface'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'

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
      actions={
        <Button variant="outline" onClick={() => void loadRegistry()} disabled={isLoading || isUploading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新原型管理
        </Button>
      }
      metrics={[
        {
          label: '实体大类',
          value: categories.length,
          detail: '业务分类 registry',
        },
        {
          label: '实体原型',
          value: archetypes.length,
          detail: `${archetypes.filter((item) => item.capabilities.hasModel).length} 个已绑定模型`,
        },
        {
          label: '当前大类',
          value: selectedCategory?.displayName ?? categoryDraft.draft?.displayName ?? '--',
          detail: selectedCategory?.key ?? categoryDraft.draft?.key ?? '未选择',
        },
        {
          label: '当前原型',
          value: selectedArchetype?.displayName ?? archetypeDraft.draft?.displayName ?? '--',
          detail: selectedArchetype?.categoryKey ?? archetypeDraft.draft?.categoryKey ?? '未选择',
        },
      ]}
      railCards={[
        {
          title: 'Registry',
          value: 'Category → Archetype',
          detail: '大类负责业务分组，原型负责模型与默认能力。',
        },
        {
          title: '模型工作流',
          value: '上传 → 预览 → 校准',
          detail: '先确认尺寸与朝向，再让实例引用原型。',
        },
      ]}
    >
      <div className="grid gap-4 2xl:grid-cols-[280px_320px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="Category Registry"
          title="实体大类"
          description="业务分类与展示元信息。"
        >
          <div className="space-y-3">
            <Button
              variant="outline"
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
            </Button>

            <ScrollArea className="h-[520px]">
              <div className="space-y-2 pr-3">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={cn(
                      'w-full rounded-2xl border px-3 py-3 text-left text-sm transition',
                      selectedCategoryId === category.id && categoryDraftSeed === null
                        ? 'border-primary bg-primary/10'
                        : 'viewer-admin-soft-card'
                    )}
                    onClick={() => {
                      setCategoryDraftSeed(null)
                      setSelectedCategoryId(category.id)
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">{category.displayName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{category.key}</div>
                      </div>
                      <Badge variant="outline">{category.sortOrder}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </SectionPanel>

        <SectionPanel
          eyebrow="Prototype Registry"
          title="实体原型"
          description="原型承载模型、默认能力和校准参数。"
        >
          <div className="space-y-3">
            <Button
              variant="outline"
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
            </Button>

            <ScrollArea className="h-[520px]">
              <div className="space-y-2 pr-3">
                {archetypes.map((archetype) => (
                  <button
                    key={archetype.id}
                    type="button"
                    className={cn(
                      'w-full rounded-2xl border px-3 py-3 text-left text-sm transition',
                      selectedArchetypeId === archetype.id && archetypeDraftSeed === null
                        ? 'border-primary bg-primary/10'
                        : 'viewer-admin-soft-card'
                    )}
                    onClick={() => {
                      setArchetypeDraftSeed(null)
                      setSelectedArchetypeId(archetype.id)
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">{archetype.displayName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {archetype.categoryKey} · {archetype.key}
                        </div>
                      </div>
                      <Badge variant={archetype.capabilities.hasModel ? 'default' : 'outline'}>
                        {archetype.capabilities.hasModel ? '有模型' : '无模型'}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </SectionPanel>

        <div className="space-y-4">
          <SectionPanel
            eyebrow="Category Editor"
            title={categoryDraft.draft ? `${categoryDraft.draft.displayName || '实体大类草稿'} 配置` : '实体大类编辑器'}
            description="维护 key、显示名称和展示元信息。"
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
                  <Button variant="destructive" onClick={() => void removeCategory()}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除实体大类
                  </Button>
                  <Button onClick={() => void saveCategory()}>
                    <Save className="mr-1 h-4 w-4" />
                    保存实体大类
                  </Button>
                </div>
              </div>
            ) : (
              <WorkspaceEmptyState
                eyebrow="Category Standby"
                title="先选择或新建一个实体大类"
                description="业务分类作为 registry 第一层，决定后续原型和实例的分组语义。"
                cues={[
                  { title: 'Key 稳定', detail: '后续原型与实例会引用它。' },
                  { title: '显示分离', detail: '图标与颜色属于展示层。' },
                  { title: '先分组再建模', detail: '避免直接把实例当模板维护。' },
                ]}
                asideTitle="Category"
                asideDetail="先定义业务分类，再往下维护原型和模型，结构会更稳定。"
              />
            )}
          </SectionPanel>

          <SectionPanel
            eyebrow="Archetype Editor"
            title={archetypeDraft.draft ? `${archetypeDraft.draft.displayName || '实体原型草稿'} 配置` : '实体原型编辑器'}
            description="模型、能力与默认展示字段。"
          >
            {archetypeDraft.draft ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>所属大类</Label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
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
                    </select>
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
                    <label key={key} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
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

                <div className="space-y-3 rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">模型上传与预览</div>
                      <div className="text-xs text-muted-foreground">
                        先上传模型，再在预览器中检查朝向和尺寸。
                      </div>
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
                  <Button variant="destructive" onClick={() => void removeArchetype()}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除实体原型
                  </Button>
                  <Button onClick={() => void saveArchetype()}>
                    <Save className="mr-1 h-4 w-4" />
                    保存实体原型
                  </Button>
                </div>
              </div>
            ) : (
              <WorkspaceEmptyState
                eyebrow="Archetype Standby"
                title="先选择或新建一个实体原型"
                description="原型承载模型、默认能力和后续实例的共享基线。"
                cues={[
                  { title: '模型', detail: '上传并校准尺寸与朝向。' },
                  { title: '能力', detail: '声明 movable / bindable 等能力。' },
                  { title: '复用', detail: '实例只引用原型，不重复维护模型。' },
                ]}
                asideTitle="Archetype"
                asideDetail="原型层负责复用和一致性，实例层只保留场景位置和状态。"
              />
            )}
          </SectionPanel>
        </div>
      </div>
    </AdminSectionFrame>
  )
}
