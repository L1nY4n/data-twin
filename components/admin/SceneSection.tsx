'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, RefreshCw, Save } from 'lucide-react'
import { AdvancedJsonEditor } from '@/components/admin/AdvancedJsonEditor'
import {
  ADMIN_VALUE_PENDING,
  ADMIN_VALUE_UNSET,
  adminDisplayValue,
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminInput,
  AdminRecordCard,
  AdminSectionFrame,
  AdminSelect,
  SectionPanel,
} from '@/components/admin/admin-surface'
import { Label } from '@/components/ui/label'
import { ViewerAdminKicker } from '@/components/viewer-admin/primitives'
import { useStructuredDraft } from '@/hooks/use-structured-draft'
import { buildEditorHref } from '@/lib/digital-twin/editor-routing'
import { fetchAdminScene, updateAdminScene } from '@/lib/digital-twin/bootstrap-client'
import { cloneSceneDraft } from '@/lib/digital-twin/admin-view-models'
import { selectQuickCameraPresets } from '@/lib/digital-twin/camera-presets'
import type { SceneConfig } from '@/lib/digital-twin/types'

export function SceneSection({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId?: string
  workspaceSlug?: string
}) {
  const [sceneVersion, setSceneVersion] = useState(0)
  const [sceneSource, setSceneSource] = useState<SceneConfig | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const draft = useStructuredDraft(sceneSource, cloneSceneDraft)

  const loadScene = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetchAdminScene(workspaceId)
      setSceneVersion(response.sceneVersion)
      setSceneSource(response.sceneConfig)
      setStatusMessage('已同步场景配置')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载场景配置失败')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void loadScene()
  }, [loadScene])

  const saveScene = useCallback(async () => {
    const payload = draft.applyDraftText()
    if (!payload) {
      setStatusMessage('场景 JSON 无法解析')
      return
    }

    try {
      const response = workspaceId
        ? await updateAdminScene(workspaceId, payload)
        : await updateAdminScene(payload)
      setSceneVersion(response.sceneVersion)
      setSceneSource(response.sceneConfig)
      setStatusMessage('场景配置已保存')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存场景配置失败')
    }
  }, [draft, workspaceId])

  const sceneDraft = draft.draft
  const cameraPresets = sceneDraft?.cameraPresets ?? []
  const quickCameraPresets = selectQuickCameraPresets(cameraPresets)
  const quickCameraPresetIndex = new Map(
    quickCameraPresets.map((preset, index) => [preset.id, index])
  )

  return (
    <AdminSectionFrame
      section="scene"
      statusMessage={statusMessage}
      isLoading={isLoading}
      showSummaryCards={false}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {sceneDraft?.id ? (
            <AdminButton asChild tone="primary">
              <Link
                href={buildEditorHref(
                  workspaceSlug,
                  workspaceId ? `/admin/workspaces/${workspaceId}/scene` : '/admin/scene'
                )}
              >
                <ArrowUpRight className="mr-1 h-4 w-4" />
                进入编辑器
              </Link>
            </AdminButton>
          ) : null}
          <AdminButton onClick={() => void loadScene()} disabled={isLoading}>
            <RefreshCw className="mr-1 h-4 w-4" />
            刷新场景
          </AdminButton>
        </div>
      }
      metrics={[
        {
          label: '场景版本',
          value: sceneVersion > 0 ? sceneVersion : ADMIN_VALUE_PENDING,
        },
        {
          label: '网格尺寸',
          value:
            sceneDraft != null
              ? `${sceneDraft.gridSize} / ${sceneDraft.gridDivisions}`
              : ADMIN_VALUE_PENDING,
        },
        {
          label: '显示状态',
          value:
            sceneDraft != null
              ? `${sceneDraft.showGrid ? '网格开' : '网格关'} / ${sceneDraft.showAxes ? '坐标轴开' : '坐标轴关'}`
              : ADMIN_VALUE_PENDING,
        },
        {
          label: '环境光',
          value: sceneDraft?.ambientLightIntensity ?? ADMIN_VALUE_PENDING,
        },
        {
          label: '相机预设',
          value: sceneDraft != null ? cameraPresets.length : ADMIN_VALUE_PENDING,
        },
      ]}
      railCards={[
        {
          title: '背景',
          value: adminDisplayValue(sceneDraft?.backgroundColor, ADMIN_VALUE_PENDING),
        },
        {
          title: '快捷视角',
          value: quickCameraPresets.length
            ? quickCameraPresets.map((preset) => preset.name).join(' / ')
            : ADMIN_VALUE_UNSET,
        },
      ]}
    >
      <SectionPanel eyebrow="场景" title="场景基础配置">
        <div className="space-y-4">
          {sceneDraft ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>场景名称</Label>
                  <AdminInput
                    value={sceneDraft.name}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>背景色</Label>
                  <AdminInput
                    value={sceneDraft.backgroundColor}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        backgroundColor: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Grid Size</Label>
                  <AdminInput
                    type="number"
                    value={sceneDraft.gridSize}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        gridSize: Number(event.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Grid Divisions</Label>
                  <AdminInput
                    type="number"
                    value={sceneDraft.gridDivisions}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        gridDivisions: Number(event.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>环境光</Label>
                  <AdminInput
                    type="number"
                    step="0.1"
                    value={sceneDraft.ambientLightIntensity}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        ambientLightIntensity: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>显示坐标轴</Label>
                  <AdminSelect
                    value={sceneDraft.showAxes ? 'true' : 'false'}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        showAxes: event.target.value === 'true',
                      }))
                    }
                  >
                    <option value="true">显示</option>
                    <option value="false">隐藏</option>
                  </AdminSelect>
                </div>
                <div className="space-y-2">
                  <Label>显示网格</Label>
                  <AdminSelect
                    value={sceneDraft.showGrid ? 'true' : 'false'}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        showGrid: event.target.value === 'true',
                      }))
                    }
                  >
                    <option value="true">显示</option>
                    <option value="false">隐藏</option>
                  </AdminSelect>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>相机位置</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <AdminInput
                        key={axis}
                        type="number"
                        step="0.1"
                        value={sceneDraft.cameraPosition[axis]}
                        onChange={(event) =>
                          draft.updateDraft((current) => ({
                            ...current,
                            cameraPosition: {
                              ...current.cameraPosition,
                              [axis]: Number(event.target.value),
                            },
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>相机目标</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <AdminInput
                        key={axis}
                        type="number"
                        step="0.1"
                        value={sceneDraft.cameraTarget[axis]}
                        onChange={(event) =>
                          draft.updateDraft((current) => ({
                            ...current,
                            cameraTarget: {
                              ...current.cameraTarget,
                              [axis]: Number(event.target.value),
                            },
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              <AdvancedJsonEditor
                value={draft.draftText}
                onChange={draft.setDraftText}
                onApply={() => {
                  if (!draft.applyDraftText()) {
                    setStatusMessage('场景 JSON 无法解析')
                    return
                  }
                  setStatusMessage('已从 JSON 应用场景配置')
                }}
              />

              <div className="space-y-3">
                <div>
                  <ViewerAdminKicker className="block">相机</ViewerAdminKicker>
                  <h3 className="mt-1 text-base font-semibold">相机预设</h3>
                </div>
                {cameraPresets.length ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {cameraPresets.map((preset) => {
                      const quickIndex = quickCameraPresetIndex.get(preset.id)

                      return (
                        <AdminRecordCard
                          key={preset.id}
                          title={preset.name}
                          meta={preset.id}
                          density="comfortable"
                          titleClassName="truncate text-sm"
                          metaClassName="truncate font-mono text-[11px]"
                          bodyClassName="text-xs text-muted-foreground"
                          trailing={
                            <AdminBadge variant={quickIndex == null ? 'outline' : 'secondary'}>
                              {quickIndex == null ? 'Menu' : `C${quickIndex + 1}`}
                            </AdminBadge>
                          }
                        >
                          <dl className="grid gap-2">
                            <div className="flex justify-between gap-3">
                              <dt>Position</dt>
                              <dd className="text-right text-foreground">
                                {preset.position.x}, {preset.position.y}, {preset.position.z}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>Target</dt>
                              <dd className="text-right text-foreground">
                                {preset.target.x}, {preset.target.y}, {preset.target.z}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>FOV</dt>
                              <dd className="text-right text-foreground">{preset.fov}</dd>
                            </div>
                          </dl>
                        </AdminRecordCard>
                      )
                    })}
                  </div>
                ) : (
                  <AdminEmptyState title="暂无相机预设" />
                )}
              </div>

              <div className="flex justify-end">
                <AdminButton tone="primary" onClick={() => void saveScene()}>
                  <Save className="mr-1 h-4 w-4" />
                  保存场景配置
                </AdminButton>
              </div>
            </>
          ) : (
            <AdminEmptyState title="暂无场景配置" />
          )}
        </div>
      </SectionPanel>
    </AdminSectionFrame>
  )
}
