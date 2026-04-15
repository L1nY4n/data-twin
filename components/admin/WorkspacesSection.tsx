'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
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
import { useStructuredDraft } from '@/hooks/use-structured-draft'
import {
  cloneWorkspaceDraft,
  createWorkspaceTemplate,
} from '@/lib/digital-twin/admin-view-models'
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  updateWorkspace,
} from '@/lib/digital-twin/bootstrap-client'
import { buildEditorWorkspaceHref } from '@/lib/digital-twin/editor-workspace'
import type { WorkspaceRecord } from '@/lib/digital-twin/types'
import { cn } from '@/lib/utils'

export function WorkspacesSection() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [draftSeed, setDraftSeed] = useState<WorkspaceRecord | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [workspaces, selectedWorkspaceId]
  )
  const draft = useStructuredDraft(draftSeed ?? selectedWorkspace, cloneWorkspaceDraft)

  const loadWorkspaces = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listWorkspaces()
      setWorkspaces(loaded)
      setSelectedWorkspaceId((current) => current ?? loaded[0]?.id ?? null)
      setStatusMessage('已同步工作区目录')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载工作区失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWorkspaces()
  }, [loadWorkspaces])

  const saveWorkspace = useCallback(async () => {
    const payload = draft.applyDraftText()
    if (!payload) {
      setStatusMessage('工作区 JSON 无法解析')
      return
    }

    try {
      if (workspaces.some((workspace) => workspace.id === payload.id)) {
        await updateWorkspace(payload.id, payload)
        setStatusMessage('工作区已更新')
      } else {
        await createWorkspace(payload)
        setStatusMessage('工作区已创建')
      }
      await loadWorkspaces()
      setSelectedWorkspaceId(payload.id)
      setDraftSeed(null)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存工作区失败')
    }
  }, [draft, loadWorkspaces, workspaces])

  const removeWorkspace = useCallback(async () => {
    if (!selectedWorkspaceId) return

    try {
      await deleteWorkspace(selectedWorkspaceId)
      setStatusMessage('工作区已删除')
      setSelectedWorkspaceId(null)
      setDraftSeed(null)
      await loadWorkspaces()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '删除工作区失败')
    }
  }, [loadWorkspaces, selectedWorkspaceId])

  return (
    <AdminSectionFrame
      section="workspaces"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadWorkspaces()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新工作区
        </Button>
      }
      metrics={[
        {
          label: '工作区总数',
          value: workspaces.length,
          detail: `${workspaces.filter((item) => item.isHomepage).length} 个首页工作区`,
        },
        {
          label: '当前选择',
          value: selectedWorkspace?.name ?? draft.draft?.name ?? '--',
          detail: selectedWorkspace?.slug ?? draft.draft?.slug ?? '未选择',
        },
      ]}
      railCards={[
        {
          title: '首页映射',
          value: '指定工作区',
          detail: '标记为首页的工作区用于 `/` 的默认进入目标。',
        },
        {
          title: '编辑入口',
          value: '进入工作区',
          detail: 'viewer 和 scene 模块都应跳入具体工作区，而不是抽象 editor。',
        },
      ]}
    >
      <div className="grid gap-4 2xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="Workspace Directory"
          title="工作区列表"
          description="管理多个模型工作区及其首页映射。"
        >
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                const template = createWorkspaceTemplate()
                setDraftSeed(template)
                setSelectedWorkspaceId(null)
                draft.replaceDraft(template)
                setStatusMessage('已创建工作区草稿')
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              新建工作区
            </Button>

            {workspaces.length > 0 ? (
              <ScrollArea className="h-[520px]">
                <div className="space-y-2 pr-3">
                  {workspaces.map((workspace) => (
                    <button
                      key={workspace.id}
                      type="button"
                      className={cn(
                        'w-full rounded-2xl border px-3 py-3 text-left text-sm transition',
                        selectedWorkspaceId === workspace.id && draftSeed === null
                          ? 'border-primary bg-primary/10'
                          : 'viewer-admin-soft-card'
                      )}
                      onClick={() => {
                        setDraftSeed(null)
                        setSelectedWorkspaceId(workspace.id)
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">{workspace.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{workspace.slug}</div>
                        </div>
                        {workspace.isHomepage ? (
                          <Badge variant="default">首页</Badge>
                        ) : (
                          <Badge variant="outline">普通</Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <WorkspaceEmptyState
                eyebrow="Workspace Bootstrap"
                title="先建立工作区目录"
                description="工作区是 viewer、editor 和首页映射的统一入口。"
                cues={[
                  { title: '目录化', detail: '每个工作区维护自己的名称与 slug。' },
                  { title: '首页映射', detail: '一个工作区可被指定为首页默认目标。' },
                  { title: '进入编辑', detail: '编辑器应以工作区为入口。' },
                ]}
                asideTitle="Workspace"
                asideDetail="先有工作区目录，后续内容隔离和首页映射才有稳定锚点。"
              />
            )}
          </div>
        </SectionPanel>

        <SectionPanel
          eyebrow="Workspace Editor"
          title={draft.draft ? `${draft.draft.name} 配置` : '工作区详情'}
          description="维护工作区名称、slug、首页状态与进入链接。"
        >
          {draft.draft ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>ID</Label>
                  <Input
                    value={draft.draft.id}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({ ...current, id: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>名称</Label>
                  <Input
                    value={draft.draft.name}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input
                    value={draft.draft.slug}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({ ...current, slug: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>首页工作区</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={draft.draft.isHomepage ? 'true' : 'false'}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        isHomepage: event.target.value === 'true',
                      }))
                    }
                  >
                    <option value="false">否</option>
                    <option value="true">是</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>说明</Label>
                <Input
                  value={draft.draft.description ?? ''}
                  onChange={(event) =>
                    draft.updateDraft((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </div>

              <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>工作区入口</span>
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildEditorWorkspaceHref(draft.draft.id, '/admin/workspaces')}>
                      <ArrowUpRight className="mr-1 h-4 w-4" />
                      进入工作区
                    </Link>
                  </Button>
                </div>
              </div>

              <AdvancedJsonEditor
                value={draft.draftText}
                onChange={draft.setDraftText}
                onApply={() => {
                  if (!draft.applyDraftText()) {
                    setStatusMessage('工作区 JSON 无法解析')
                    return
                  }
                  setStatusMessage('已从 JSON 应用工作区草稿')
                }}
              />

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="destructive" onClick={() => void removeWorkspace()}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  删除工作区
                </Button>
                <Button onClick={() => void saveWorkspace()}>
                  <Save className="mr-1 h-4 w-4" />
                  保存工作区
                </Button>
              </div>
            </div>
          ) : null}
        </SectionPanel>
      </div>
    </AdminSectionFrame>
  )
}
