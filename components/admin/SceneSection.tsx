'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, RefreshCw, Save } from 'lucide-react'
import { AdvancedJsonEditor } from '@/components/admin/AdvancedJsonEditor'
import { AdminButton, AdminSectionFrame, SectionPanel } from '@/components/admin/admin-surface'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useStructuredDraft } from '@/hooks/use-structured-draft'
import { buildEditorHref } from '@/lib/digital-twin/editor-routing'
import { fetchAdminScene, updateAdminScene } from '@/lib/digital-twin/bootstrap-client'
import { cloneSceneDraft } from '@/lib/digital-twin/admin-view-models'
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
          value: sceneVersion || '--',
        },
        {
          label: '网格尺寸',
          value:
            sceneDraft != null
              ? `${sceneDraft.gridSize} / ${sceneDraft.gridDivisions}`
              : '--',
        },
        {
          label: '显示状态',
          value:
            sceneDraft != null
              ? `${sceneDraft.showGrid ? '网格开' : '网格关'} / ${sceneDraft.showAxes ? '坐标轴开' : '坐标轴关'}`
              : '--',
        },
        {
          label: '环境光',
          value: sceneDraft?.ambientLightIntensity ?? '--',
        },
      ]}
      railCards={[
        {
          title: '背景',
          value: sceneDraft?.backgroundColor ?? '--',
        },
        {
          title: '相机',
          value: sceneDraft?.cameraPosition ? '已配置' : '--',
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
                  <Input
                    value={sceneDraft.name}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>背景色</Label>
                  <Input
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
                  <Input
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
                  <Input
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
                  <Input
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
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
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
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>显示网格</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
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
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>相机位置</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <Input
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
                      <Input
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

              <div className="flex justify-end">
                <AdminButton tone="primary" onClick={() => void saveScene()}>
                  <Save className="mr-1 h-4 w-4" />
                  保存场景配置
                </AdminButton>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">--</p>
          )}
        </div>
      </SectionPanel>
    </AdminSectionFrame>
  )
}
