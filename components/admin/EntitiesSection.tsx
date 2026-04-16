'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { AdvancedJsonEditor } from '@/components/admin/AdvancedJsonEditor'
import {
  AdminButton,
  AdminSectionFrame,
  AdminSelectableCard,
  SectionPanel,
  WorkspaceEmptyState,
} from '@/components/admin/admin-surface'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
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

export function EntitiesSection({ workspaceId }: { workspaceId?: string }) {
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
        listAdminEntities(workspaceId),
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
  }, [workspaceId])

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
        if (workspaceId) {
          await updateAdminEntity(workspaceId, payload.id, payload)
        } else {
          await updateAdminEntity(payload.id, payload)
        }
        setStatusMessage('实体已更新')
      } else {
        if (workspaceId) {
          await createAdminEntity(workspaceId, payload)
        } else {
          await createAdminEntity(payload)
        }
        setStatusMessage('实体已创建')
      }
      await loadEntities()
      setSelectedEntityId(payload.id)
      setDraftSeed(null)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存实体失败')
    }
  }, [draft, entities, loadEntities, workspaceId])

  const removeEntity = useCallback(async () => {
    if (!selectedEntityId || !selectedEntity) {
      setStatusMessage('请先选择已存在的实体')
      return
    }

    try {
      if (workspaceId) {
        await deleteAdminEntity(workspaceId, selectedEntityId)
      } else {
        await deleteAdminEntity(selectedEntityId)
      }
      setStatusMessage('实体已删除')
      setSelectedEntityId(null)
      setDraftSeed(null)
      await loadEntities()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '删除实体失败')
    }
  }, [loadEntities, selectedEntity, selectedEntityId, workspaceId])

  return (
    <AdminSectionFrame
      section="entities"
      statusMessage={statusMessage}
      isLoading={isLoading}
      showSummaryCards={false}
      actions={
        <AdminButton onClick={() => void loadEntities()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新实体
        </AdminButton>
      }
      metrics={[
        {
          label: '实体总数',
          value: `${entities.length}`,
        },
        {
          label: '当前选中',
          value: selectedEntity?.name ?? draft.draft?.name ?? '--',
        },
        {
          label: '草稿模式',
          value: draftSeed ? '模板草稿' : '编辑已有',
        },
        {
          label: '结构化编辑',
          value: 'Form + JSON',
        },
      ]}
      railCards={[
        {
          title: '列表',
          value: entities.length.toString(),
        },
        {
          title: '类型',
          value: newEntityType,
        },
      ]}
    >
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="实体"
          title="实体清单"
          action={
            <Badge variant="outline" className="rounded-full px-2.5 text-[10px]">
              共 {entities.length} 个
            </Badge>
          }
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
              <AdminButton
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
              </AdminButton>
            </div>

            {entities.length > 0 ? (
              <ScrollArea className="h-[520px]">
                <div className="space-y-2 pr-3">
                  {entities.map((entity) => (
                    <AdminSelectableCard
                      key={entity.id}
                      active={selectedEntityId === entity.id && draftSeed === null}
                      className="px-3 py-3"
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
                    </AdminSelectableCard>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <WorkspaceEmptyState
                eyebrow="实体"
                title="暂无实体"
                items={['类型', '模板', '状态']}
              />
            )}
          </div>
        </SectionPanel>

        <div className="space-y-4">
          <SectionPanel
            eyebrow="编辑器"
            title={draft.draft ? `${draft.draft.name || '实体草稿'} 配置` : '实体详情'}
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
                    <AdminButton tone="danger" onClick={() => void removeEntity()}>
                      <Trash2 className="mr-1 h-4 w-4" />
                      删除实体
                    </AdminButton>
                    <AdminButton tone="primary" onClick={() => void saveEntity()}>
                      <Save className="mr-1 h-4 w-4" />
                      保存实体
                    </AdminButton>
                  </div>
                </>
              ) : (
                <WorkspaceEmptyState
                  eyebrow="编辑器"
                  title="选择一个实体"
                  items={['字段', 'JSON', '保存']}
                />
              )}
            </div>
          </SectionPanel>
        </div>
      </div>
    </AdminSectionFrame>
  )
}
