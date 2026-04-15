'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, RefreshCw, Save } from 'lucide-react'
import { AdvancedJsonEditor } from '@/components/admin/AdvancedJsonEditor'
import { AdminSectionFrame, SectionPanel } from '@/components/admin/admin-surface'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useStructuredDraft } from '@/hooks/use-structured-draft'
import { buildEditorWorkspaceHref } from '@/lib/digital-twin/editor-workspace'
import { fetchAdminScene, updateAdminScene } from '@/lib/digital-twin/bootstrap-client'
import { cloneSceneDraft } from '@/lib/digital-twin/admin-view-models'
import type { SceneConfig } from '@/lib/digital-twin/types'

export function SceneSection() {
  const [sceneVersion, setSceneVersion] = useState(0)
  const [sceneSource, setSceneSource] = useState<SceneConfig | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const draft = useStructuredDraft(sceneSource, cloneSceneDraft)

  const loadScene = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetchAdminScene()
      setSceneVersion(response.sceneVersion)
      setSceneSource(response.sceneConfig)
      setStatusMessage('已同步场景配置')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载场景配置失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

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
      const response = await updateAdminScene(payload)
      setSceneVersion(response.sceneVersion)
      setSceneSource(response.sceneConfig)
      setStatusMessage('场景配置已保存')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存场景配置失败')
    }
  }, [draft])

  const sceneDraft = draft.draft

  return (
    <AdminSectionFrame
      section="scene"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {sceneDraft?.id ? (
            <Button asChild variant="secondary">
              <Link href={buildEditorWorkspaceHref(sceneDraft.id, '/admin/scene')}>
                <ArrowUpRight className="mr-1 h-4 w-4" />
                进入工作区
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void loadScene()} disabled={isLoading}>
            <RefreshCw className="mr-1 h-4 w-4" />
            刷新场景
          </Button>
        </div>
      }
      metrics={[
        {
          label: 'Scene Version',
          value: sceneVersion || '--',
          detail: '保存成功后版本号会在这里上升。',
        },
        {
          label: 'Grid Size',
          value: sceneDraft?.gridSize ?? '--',
          detail: `Grid Divisions ${sceneDraft?.gridDivisions ?? '--'}`,
        },
        {
          label: '显示状态',
          value: sceneDraft?.showGrid ? 'Grid On' : 'Grid Off',
          detail: sceneDraft?.showAxes ? '坐标轴显示中' : '坐标轴已隐藏',
        },
        {
          label: '环境光',
          value: sceneDraft?.ambientLightIntensity ?? '--',
          detail: '场景基础氛围与可读性基准。',
        },
      ]}
      railCards={[
        {
          title: '编辑目标',
          value: '基础环境参数',
          detail: '这里适合维护视角、网格、背景和基础渲染配置，不承载复杂业务规则。',
        },
        {
          title: '变更习惯',
          value: '先调参数，再看运行态',
          detail: '场景类配置最好小步保存，每次修改后去首页确认显示效果。',
        },
      ]}
    >
      <SectionPanel
        eyebrow="Scene Controls"
        title="场景基础配置"
        description="把环境、网格、视角集中在一个编辑工作区，不再拆成零碎卡片。"
      >
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
                <Button onClick={() => void saveScene()}>
                  <Save className="mr-1 h-4 w-4" />
                  保存场景配置
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">暂无场景配置。</p>
          )}
        </div>
      </SectionPanel>
    </AdminSectionFrame>
  )
}
