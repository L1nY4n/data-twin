'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AdvancedJsonEditor } from '@/components/admin/AdvancedJsonEditor'
import {
  AdminButton,
  AdminInsetBlock,
  AdminSectionFrame,
  AdminSelectableCard,
  SectionPanel,
  WorkspaceEmptyState,
} from '@/components/admin/admin-surface'
import { Badge } from '@/components/ui/badge'
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
import { buildEditorHref } from '@/lib/digital-twin/editor-routing'
import type { WorkspaceRecord } from '@/lib/digital-twin/types'

export function WorkspacesSection() {
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const persistedWorkspaceForDraft = useMemo(
    () =>
      draft.draft
        ? workspaces.find((workspace) => workspace.id === draft.draft?.id) ?? null
        : null,
    [draft.draft, workspaces]
  )
  const selectedWorkspaceIdFromUrl = searchParams.get('workspaceId')
  const editorReturnHref = persistedWorkspaceForDraft
    ? `/admin/workspaces?workspaceId=${encodeURIComponent(persistedWorkspaceForDraft.id)}`
    : '/admin/workspaces'
  const editorHref = persistedWorkspaceForDraft
    ? buildEditorHref(persistedWorkspaceForDraft.slug, editorReturnHref)
    : null

  const loadWorkspaces = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listWorkspaces()
      const nextSelectedWorkspaceId =
        loaded.find((workspace) => workspace.id === selectedWorkspaceIdFromUrl)?.id ??
        loaded.find((workspace) => workspace.id === selectedWorkspaceId)?.id ??
        loaded[0]?.id ??
        null
      setWorkspaces(loaded)
      setSelectedWorkspaceId(nextSelectedWorkspaceId)
      if (nextSelectedWorkspaceId && nextSelectedWorkspaceId !== selectedWorkspaceIdFromUrl) {
        router.replace(`/admin/workspaces?workspaceId=${encodeURIComponent(nextSelectedWorkspaceId)}`, {
          scroll: false,
        })
      }
      setStatusMessage('已同步工作区目录')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载工作区失败')
    } finally {
      setIsLoading(false)
    }
  }, [router, selectedWorkspaceId, selectedWorkspaceIdFromUrl])

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
      router.replace(`/admin/workspaces?workspaceId=${encodeURIComponent(payload.id)}`, {
        scroll: false,
      })
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存工作区失败')
    }
  }, [draft, loadWorkspaces, router, workspaces])

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
      showSummaryCards={false}
      actions={
        <AdminButton onClick={() => void loadWorkspaces()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新工作区
        </AdminButton>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="工作区"
          title="工作区列表"
          action={
            <Badge variant="outline" className="rounded-full px-2.5 text-[10px]">
              共 {workspaces.length} 个
            </Badge>
          }
        >
          <div className="space-y-3">
            <AdminButton
              className="w-full"
              onClick={() => {
                const template = createWorkspaceTemplate()
                setDraftSeed(template)
                draft.replaceDraft(template)
                setStatusMessage('已创建工作区草稿')
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              新建工作区
            </AdminButton>

            {workspaces.length > 0 ? (
              <ScrollArea className="h-[520px]">
                <div className="space-y-2 pr-3">
                  {workspaces.map((workspace) => (
                    <AdminSelectableCard
                      key={workspace.id}
                      active={selectedWorkspaceId === workspace.id && draftSeed === null}
                      className="px-3 py-3"
                      onClick={() => {
                        setDraftSeed(null)
                        setSelectedWorkspaceId(workspace.id)
                        router.replace(`/admin/workspaces?workspaceId=${encodeURIComponent(workspace.id)}`, {
                          scroll: false,
                        })
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
                    </AdminSelectableCard>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <WorkspaceEmptyState
                eyebrow="工作区"
                title="暂无工作区"
                items={['名称', 'slug', '首页']}
              />
            )}
          </div>
        </SectionPanel>

        <SectionPanel eyebrow="编辑器" title={draft.draft ? `${draft.draft.name} 配置` : '工作区详情'}>
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

              <AdminInsetBlock className="text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>当前工作区编辑入口</span>
                  <AdminButton asChild disabled={!editorHref}>
                    <Link href={editorHref ?? '/admin/workspaces'}>
                      <ArrowUpRight className="mr-1 h-4 w-4" />
                      打开编辑器
                    </Link>
                  </AdminButton>
                </div>
              </AdminInsetBlock>

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
                <AdminButton tone="danger" onClick={() => void removeWorkspace()}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  删除工作区
                </AdminButton>
                <AdminButton tone="primary" onClick={() => void saveWorkspace()}>
                  <Save className="mr-1 h-4 w-4" />
                  保存工作区
                </AdminButton>
              </div>
            </div>
          ) : null}
        </SectionPanel>
      </div>
    </AdminSectionFrame>
  )
}
