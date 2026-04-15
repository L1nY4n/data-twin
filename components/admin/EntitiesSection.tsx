'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { AdvancedJsonEditor } from '@/components/admin/AdvancedJsonEditor'
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
import {
  ViewerAdminEmptyCard,
  ViewerAdminSoftCard,
} from '@/components/viewer-admin/primitives'
import { useStructuredDraft } from '@/hooks/use-structured-draft'
import {
  cloneEntityDraft,
  createDynamicEntityTemplate,
  createEntityTemplate,
} from '@/lib/digital-twin/admin-view-models'
import {
  createAdminEntity,
  deleteAdminEntity,
  listAdminEntities,
  listEntityArchetypes,
  updateAdminEntity,
} from '@/lib/digital-twin/bootstrap-client'
import type {
  CameraEntity,
  CameraType,
  Entity,
  EntityArchetype,
  EntityStatus,
  SensorEntity,
  SensorType,
} from '@/lib/digital-twin/types'
import { cn } from '@/lib/utils'

const ENTITY_STATUSES: EntityStatus[] = ['active', 'inactive', 'warning', 'error']
const SENSOR_TYPES: SensorType[] = [
  'temperature',
  'pressure',
  'flow',
  'gas',
  'level',
  'humidity',
  'other',
]
const CAMERA_TYPES: CameraType[] = ['fixed', 'dome', 'ptz', 'thermal']

function EntityFields({
  draft,
  updateDraft,
}: {
  draft: Entity
  updateDraft: (updater: (current: Entity) => Entity) => void
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>ID</Label>
          <Input
            value={draft.id}
            onChange={(event) =>
              updateDraft((current) => ({ ...current, id: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>名称</Label>
          <Input
            value={draft.name}
            onChange={(event) =>
              updateDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>类型</Label>
          <Input value={draft.type} disabled />
        </div>
        <div className="space-y-2">
          <Label>状态</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={draft.status}
            onChange={(event) =>
              updateDraft((current) => ({
                ...current,
                status: event.target.value as EntityStatus,
              }))
            }
          >
            {ENTITY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>可见性</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={draft.visible ? 'true' : 'false'}
            onChange={(event) =>
              updateDraft((current) => ({
                ...current,
                visible: event.target.value === 'true',
              }))
            }
          >
            <option value="true">显示</option>
            <option value="false">隐藏</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <div key={axis} className="space-y-2">
            <Label>位置 {axis.toUpperCase()}</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.position[axis]}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  position: {
                    ...current.position,
                    [axis]: Number(event.target.value),
                  },
                }))
              }
            />
          </div>
        ))}
      </div>

      {draft.type === 'person' ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>角色</Label>
            <Input
              value={draft.role}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'person'
                    ? { ...current, role: event.target.value }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>部门</Label>
            <Input
              value={draft.department}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'person'
                    ? { ...current, department: event.target.value }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>当前活动</Label>
            <Input
              value={draft.currentActivity ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'person'
                    ? { ...current, currentActivity: event.target.value }
                    : current
                )
              }
            />
          </div>
        </div>
      ) : null}

      {draft.type === 'vehicle' ? (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>车牌号</Label>
            <Input
              value={draft.plateNumber}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'vehicle'
                    ? { ...current, plateNumber: event.target.value }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>车辆类型</Label>
            <Input
              value={draft.vehicleType}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'vehicle'
                    ? { ...current, vehicleType: event.target.value as typeof current.vehicleType }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>速度</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.speed}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'vehicle'
                    ? { ...current, speed: Number(event.target.value) }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>航向</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.heading}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'vehicle'
                    ? { ...current, heading: Number(event.target.value) }
                    : current
                )
              }
            />
          </div>
        </div>
      ) : null}

      {draft.type === 'equipment' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>模型 ID</Label>
            <Input
              value={draft.modelId ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'equipment'
                    ? { ...current, modelId: event.target.value }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>模型 URL</Label>
            <Input
              value={draft.modelUrl ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'equipment'
                    ? { ...current, modelUrl: event.target.value }
                    : current
                )
              }
            />
          </div>
        </div>
      ) : null}

      {draft.type === 'sensor' ? (
        <div className="grid gap-4 md:grid-cols-5">
          <div className="space-y-2">
            <Label>传感器类型</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={draft.sensorType}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'sensor'
                    ? {
                        ...current,
                        sensorType: event.target.value as SensorEntity['sensorType'],
                      }
                    : current
                )
              }
            >
              {SENSOR_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>单位</Label>
            <Input
              value={draft.unit}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'sensor' ? { ...current, unit: event.target.value } : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>当前读数</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.reading}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'sensor'
                    ? { ...current, reading: Number(event.target.value) }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>最小阈值</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.thresholdMin ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'sensor'
                    ? {
                        ...current,
                        thresholdMin:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>最大阈值</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.thresholdMax ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'sensor'
                    ? {
                        ...current,
                        thresholdMax:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      }
                    : current
                )
              }
            />
          </div>
        </div>
      ) : null}

      {draft.type === 'camera' ? (
        <div className="grid gap-4 md:grid-cols-5">
          <div className="space-y-2">
            <Label>摄像头类型</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={draft.cameraType}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'camera'
                    ? {
                        ...current,
                        cameraType: event.target.value as CameraEntity['cameraType'],
                      }
                    : current
                )
              }
            >
              {CAMERA_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>流地址</Label>
            <Input
              value={draft.streamUrl ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'camera'
                    ? { ...current, streamUrl: event.target.value }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>FOV</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.fov}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'camera'
                    ? { ...current, fov: Number(event.target.value) }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>航向</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.heading}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'camera'
                    ? { ...current, heading: Number(event.target.value) }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>覆盖距离</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.range ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'camera'
                    ? {
                        ...current,
                        range: event.target.value === '' ? undefined : Number(event.target.value),
                      }
                    : current
                )
              }
            />
          </div>
        </div>
      ) : null}

      {draft.type === 'zone' ? (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>区域类型</Label>
            <Input
              value={draft.zoneType}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'zone'
                    ? { ...current, zoneType: event.target.value as typeof current.zoneType }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>颜色</Label>
            <Input
              value={draft.color}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'zone' ? { ...current, color: event.target.value } : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>容量</Label>
            <Input
              type="number"
              value={draft.capacity ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'zone'
                    ? {
                        ...current,
                        capacity:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>当前占用</Label>
            <Input
              type="number"
              value={draft.currentOccupancy ?? ''}
              onChange={(event) =>
                updateDraft((current) =>
                  current.type === 'zone'
                    ? {
                        ...current,
                        currentOccupancy:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      }
                    : current
                )
              }
            />
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        复杂嵌套字段如 `metadata`、`parameters`、`boundary`、`accessRules`、`alarms`
        可通过下方高级 JSON 直接编辑。
      </p>
    </>
  )
}

export function EntitiesSection() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [entityArchetypes, setEntityArchetypes] = useState<EntityArchetype[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [newEntityType, setNewEntityType] = useState<Entity['type']>('person')
  const [newDynamicArchetypeId, setNewDynamicArchetypeId] = useState('')
  const [draftSeed, setDraftSeed] = useState<Entity | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const selectedEntity = useMemo(
    () => entities.find((entity) => entity.id === selectedEntityId) ?? null,
    [entities, selectedEntityId]
  )
  const draft = useStructuredDraft(draftSeed ?? selectedEntity, cloneEntityDraft)

  const loadEntities = useCallback(async () => {
    setIsLoading(true)
    try {
      const [loadedEntities, loadedArchetypes] = await Promise.all([
        listAdminEntities(),
        listEntityArchetypes(),
      ])
      setEntities(loadedEntities)
      setEntityArchetypes(loadedArchetypes)
      setSelectedEntityId((current) => current ?? loadedEntities[0]?.id ?? null)
      setNewDynamicArchetypeId((current) => current || loadedArchetypes[0]?.id || '')
      setStatusMessage('已同步实体清单')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载实体失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadEntities()
  }, [loadEntities])

  const saveEntity = useCallback(async () => {
    const payload = draft.applyDraftText()
    if (!payload) {
      setStatusMessage('实体 JSON 无法解析')
      return
    }

    try {
      if (entities.some((entity) => entity.id === payload.id)) {
        await updateAdminEntity(payload.id, payload)
        setStatusMessage('实体已更新')
      } else {
        await createAdminEntity(payload)
        setStatusMessage('实体已创建')
      }
      await loadEntities()
      setSelectedEntityId(payload.id)
      setDraftSeed(null)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存实体失败')
    }
  }, [draft, entities, loadEntities])

  const removeEntity = useCallback(async () => {
    if (!selectedEntityId || !selectedEntity) {
      setStatusMessage('请先选择已存在的实体')
      return
    }

    try {
      await deleteAdminEntity(selectedEntityId)
      setStatusMessage('实体已删除')
      setSelectedEntityId(null)
      setDraftSeed(null)
      await loadEntities()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '删除实体失败')
    }
  }, [loadEntities, selectedEntity, selectedEntityId])

  const activeEntityCount = entities.filter((entity) => entity.status === 'active').length
  const visibleEntityCount = entities.filter((entity) => entity.visible).length
  const typeSummary = Object.entries(
    entities.reduce<Record<string, number>>((accumulator, entity) => {
      accumulator[entity.type] = (accumulator[entity.type] ?? 0) + 1
      return accumulator
    }, {})
  )

  return (
    <AdminSectionFrame
      section="entities"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadEntities()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新实体
        </Button>
      }
      metrics={[
        {
          label: '实体总数',
          value: entities.length,
          detail: `${activeEntityCount} 个 active / ${visibleEntityCount} 个可见`,
        },
        {
          label: '当前选中',
          value: selectedEntity?.name ?? draft.draft?.name ?? '--',
          detail: selectedEntity?.type ?? draft.draft?.type ?? '未选择实体',
        },
        {
          label: '草稿模式',
          value: draftSeed ? 'Template Draft' : 'Edit Existing',
          detail: draftSeed ? '当前正在从模板新建实体。' : '当前在编辑既有实体。',
        },
        {
          label: '结构化编辑',
          value: 'Form + JSON',
          detail: '先用结构化表单处理高频字段，复杂字段再用高级 JSON。',
        },
      ]}
      railCards={[
        {
          title: '清单职责',
          value: 'Roster → Editor',
          detail: '左侧是 roster，右侧是编辑器，不再把所有信息堆成一列。',
        },
        {
          title: '操作建议',
          value: '先筛类型，再改细节',
          detail: '实体多起来后，先通过列表上下文确定对象，再进入右侧深度编辑。',
        },
      ]}
    >
      <div className="grid gap-4 2xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="Entity Roster"
          title="实体清单"
          description="先从 roster 选对象，再把右侧作为唯一编辑上下文。"
        >
          <div className="space-y-3">
            <div className="grid gap-2">
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={newEntityType}
                onChange={(event) => setNewEntityType(event.target.value as Entity['type'])}
              >
                <option value="person">人员</option>
                <option value="vehicle">车辆</option>
                <option value="equipment">设备</option>
                <option value="sensor">传感器</option>
                <option value="camera">摄像头</option>
                <option value="zone">区域</option>
                <option value="dynamic">动态实体</option>
              </select>
              {newEntityType === 'dynamic' ? (
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={newDynamicArchetypeId}
                  onChange={(event) => setNewDynamicArchetypeId(event.target.value)}
                >
                  <option value="">请选择实体原型</option>
                  {entityArchetypes.map((archetype) => (
                    <option key={archetype.id} value={archetype.id}>
                      {archetype.categoryKey} · {archetype.displayName}
                    </option>
                  ))}
                </select>
              ) : null}
              <Button
                variant="outline"
                onClick={() => {
                  const template =
                    newEntityType === 'dynamic'
                      ? (() => {
                          const archetype =
                            entityArchetypes.find((item) => item.id === newDynamicArchetypeId) ??
                            entityArchetypes[0]
                          return archetype ? createDynamicEntityTemplate(archetype) : null
                        })()
                      : createEntityTemplate(newEntityType)
                  if (!template) {
                    setStatusMessage('请先在原型管理中创建一个实体原型')
                    return
                  }
                  setDraftSeed(template)
                  setSelectedEntityId(null)
                  draft.replaceDraft(template)
                  setStatusMessage(`已创建 ${newEntityType} 模板草稿`)
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                新建实体模板
              </Button>
            </div>

            {entities.length > 0 ? (
              <ScrollArea className="h-[520px]">
                <div className="space-y-2 pr-3">
                  {entities.map((entity) => (
                    <button
                      key={entity.id}
                      type="button"
                      className={cn(
                        'w-full rounded-2xl border px-3 py-3 text-left text-sm transition',
                        selectedEntityId === entity.id && draftSeed === null
                          ? 'border-primary bg-primary/10 shadow-[0_20px_50px_-42px_rgba(14,165,233,0.8)]'
                          : 'viewer-admin-soft-card'
                      )}
                      onClick={() => {
                        setDraftSeed(null)
                        setSelectedEntityId(entity.id)
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">{entity.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{entity.id}</div>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {entity.type}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{entity.visible ? '可见于场景' : '隐藏于场景'}</span>
                        <span>{entity.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <WorkspaceEmptyState
                eyebrow="Entity Bootstrap"
                title="先建立第一批实体模板"
                description="空 roster 不该只剩一块白板。先决定对象类型，再把右侧编辑器切成单一上下文。"
                cues={[
                  {
                    title: '1. 选实体类型',
                    detail: '先分清人员、设备、车辆或传感器，避免从一堆通用字段起手。',
                  },
                  {
                    title: '2. 生成模板草稿',
                    detail: '从模板进入编辑，比先写整段 JSON 更适合后台持续维护。',
                  },
                  {
                    title: '3. 在右侧补全细节',
                    detail: '把可视字段、状态和高级 JSON 收到唯一编辑面板里。',
                  },
                ]}
                asideTitle="当前策略"
                asideDetail="即使后端暂时不可达，也可以先把实体结构和字段约定整理成草稿。"
              />
            )}
          </div>
        </SectionPanel>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {typeSummary.length > 0 ? (
              typeSummary.map(([type, count]) => (
                <ViewerAdminSoftCard key={type} className="p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {type}
                  </p>
                  <div className="mt-2 text-2xl font-semibold">{count}</div>
                </ViewerAdminSoftCard>
              ))
            ) : (
              <ViewerAdminEmptyCard className="border-dashed p-4 text-sm text-muted-foreground">
                当前实体列表为空，先从左侧创建模板。
              </ViewerAdminEmptyCard>
            )}
          </div>

          <SectionPanel
            eyebrow="Entity Editor"
            title={draft.draft ? `${draft.draft.name || '实体草稿'} 配置` : '实体详情'}
            description="高频字段走结构化表单，复杂字段继续交给 JSON。"
          >
            <div className="space-y-4">
              {draft.draft ? (
                <>
                  <EntityFields draft={draft.draft} updateDraft={draft.updateDraft} />
                  <AdvancedJsonEditor
                    value={draft.draftText}
                    onChange={draft.setDraftText}
                    onApply={() => {
                      if (!draft.applyDraftText()) {
                        setStatusMessage('实体 JSON 无法解析')
                        return
                      }
                      setStatusMessage('已从 JSON 应用实体草稿')
                    }}
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="destructive" onClick={() => void removeEntity()}>
                      <Trash2 className="mr-1 h-4 w-4" />
                      删除实体
                    </Button>
                    <Button onClick={() => void saveEntity()}>
                      <Save className="mr-1 h-4 w-4" />
                      保存实体
                    </Button>
                  </div>
                </>
              ) : (
                <WorkspaceEmptyState
                  eyebrow="Editor Standby"
                  title="编辑器正在等待唯一上下文"
                  description="先从左侧选中实体，或直接创建模板。右侧不再同时摊开多个编辑块。"
                  cues={[
                    {
                      title: '结构化字段',
                      detail: '高频业务字段走表单，减少直接操作 JSON 的负担。',
                    },
                    {
                      title: '高级 JSON',
                      detail: '复杂扩展字段仍然保留专家模式，不牺牲表达能力。',
                    },
                    {
                      title: '保存即生效',
                      detail: '确认字段和状态后再保存，避免把运行态配置改成试验场。',
                    },
                  ]}
                  asideTitle="为什么这样做"
                  asideDetail="后台编辑器应该只服务一个当前对象，这样切换、保存和回溯都更稳定。"
                />
              )}
            </div>
          </SectionPanel>
        </div>
      </div>
    </AdminSectionFrame>
  )
}
