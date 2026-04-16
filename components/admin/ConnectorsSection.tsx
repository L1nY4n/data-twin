'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { AdvancedJsonEditor } from '@/components/admin/AdvancedJsonEditor'
import {
  AdminButton,
  AdminSelectableCard,
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
  cloneConnectorDraft,
  createConnectorTemplate,
} from '@/lib/digital-twin/admin-view-models'
import {
  createDataConnector,
  deleteDataConnector,
  listDataConnectors,
  updateDataConnector,
} from '@/lib/digital-twin/bootstrap-client'
import type { DataConnector } from '@/lib/digital-twin/types'

export function ConnectorsSection({ workspaceId }: { workspaceId?: string }) {
  const [connectors, setConnectors] = useState<DataConnector[]>([])
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null)
  const [draftSeed, setDraftSeed] = useState<DataConnector | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const selectedConnector = useMemo(
    () => connectors.find((connector) => connector.id === selectedConnectorId) ?? null,
    [connectors, selectedConnectorId]
  )
  const draft = useStructuredDraft(draftSeed ?? selectedConnector, cloneConnectorDraft)

  const loadConnectors = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listDataConnectors(workspaceId)
      setConnectors(loaded)
      setSelectedConnectorId((current) => current ?? loaded[0]?.id ?? null)
      setStatusMessage('已同步连接器配置')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载连接器失败')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void loadConnectors()
  }, [loadConnectors])

  const saveConnector = useCallback(async () => {
    const payload = draft.applyDraftText()
    if (!payload) {
      setStatusMessage('连接器 JSON 无法解析')
      return
    }

    try {
      if (connectors.some((connector) => connector.id === payload.id)) {
        if (workspaceId) {
          await updateDataConnector(workspaceId, payload.id, payload)
        } else {
          await updateDataConnector(payload.id, payload)
        }
        setStatusMessage('连接器已更新')
      } else {
        if (workspaceId) {
          await createDataConnector(workspaceId, payload)
        } else {
          await createDataConnector(payload)
        }
        setStatusMessage('连接器已创建')
      }
      await loadConnectors()
      setSelectedConnectorId(payload.id)
      setDraftSeed(null)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存连接器失败')
    }
  }, [connectors, draft, loadConnectors, workspaceId])

  const removeConnector = useCallback(async () => {
    if (!selectedConnectorId || !selectedConnector) {
      setStatusMessage('请先选择已存在的连接器')
      return
    }

    try {
      if (workspaceId) {
        await deleteDataConnector(workspaceId, selectedConnectorId)
      } else {
        await deleteDataConnector(selectedConnectorId)
      }
      setStatusMessage('连接器已删除')
      setSelectedConnectorId(null)
      setDraftSeed(null)
      await loadConnectors()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '删除连接器失败')
    }
  }, [loadConnectors, selectedConnector, selectedConnectorId, workspaceId])

  return (
    <AdminSectionFrame
      section="connectors"
      statusMessage={statusMessage}
      isLoading={isLoading}
      showSummaryCards={false}
      actions={
        <AdminButton onClick={() => void loadConnectors()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新连接器
        </AdminButton>
      }
      metrics={[
        {
          label: '连接器总数',
          value: connectors.length,
        },
        {
          label: '当前对象',
          value: selectedConnector?.name ?? draft.draft?.name ?? '--',
        },
        {
          label: '接入形态',
          value: 'Protocol / Endpoint / Auth',
        },
      ]}
      railCards={[
        {
          title: '协议',
          value: selectedConnector?.protocol ?? draft.draft?.protocol ?? '--',
        },
        {
          title: '状态',
          value: draft.draft?.enabled ? '启用' : '停用',
        },
      ]}
    >
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="连接器"
          title="连接器列表"
          action={
            <Badge variant="outline" className="rounded-full px-2.5 text-[10px]">
              共 {connectors.length} 个
            </Badge>
          }
        >
          <div className="space-y-3">
            <AdminButton
              className="w-full"
              onClick={() => {
                const template = createConnectorTemplate()
                setDraftSeed(template)
                setSelectedConnectorId(null)
                draft.replaceDraft(template)
                setStatusMessage('已创建连接器模板草稿')
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              新建连接器
            </AdminButton>

            {connectors.length > 0 ? (
              <ScrollArea className="h-[520px]">
                <div className="space-y-2 pr-3">
                  {connectors.map((connector) => (
                    <AdminSelectableCard
                      key={connector.id}
                      active={selectedConnectorId === connector.id && draftSeed === null}
                      className="px-3 py-3"
                      onClick={() => {
                        setDraftSeed(null)
                        setSelectedConnectorId(connector.id)
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">{connector.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{connector.id}</div>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {connector.protocol}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="truncate">{connector.endpoint}</span>
                        <span>{connector.enabled ? 'enabled' : 'disabled'}</span>
                      </div>
                    </AdminSelectableCard>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <WorkspaceEmptyState
                eyebrow="连接器"
                title="暂无连接器"
                items={['协议', 'Endpoint', '认证']}
              />
            )}
          </div>
        </SectionPanel>

        <SectionPanel eyebrow="编辑器" title={draft.draft ? `${draft.draft.name} 配置` : '连接器详情'}>
          <div className="space-y-4">
            {draft.draft ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>ID</Label>
                    <Input
                      value={draft.draft.id}
                      onChange={(event) =>
                        draft.updateDraft((current) => ({
                          ...current,
                          id: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>名称</Label>
                    <Input
                      value={draft.draft.name}
                      onChange={(event) =>
                        draft.updateDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>协议</Label>
                    <Input
                      value={draft.draft.protocol}
                      onChange={(event) =>
                        draft.updateDraft((current) => ({
                          ...current,
                          protocol: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Endpoint</Label>
                    <Input
                      value={draft.draft.endpoint}
                      onChange={(event) =>
                        draft.updateDraft((current) => ({
                          ...current,
                          endpoint: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>启用状态</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={draft.draft.enabled ? 'true' : 'false'}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        enabled: event.target.value === 'true',
                      }))
                    }
                  >
                    <option value="true">启用</option>
                    <option value="false">停用</option>
                  </select>
                </div>

                <AdvancedJsonEditor
                  value={draft.draftText}
                  onChange={draft.setDraftText}
                  onApply={() => {
                    if (!draft.applyDraftText()) {
                      setStatusMessage('连接器 JSON 无法解析')
                      return
                    }
                    setStatusMessage('已从 JSON 应用连接器草稿')
                  }}
                />

                <div className="flex flex-wrap justify-end gap-2">
                  <AdminButton tone="danger" onClick={() => void removeConnector()}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除连接器
                  </AdminButton>
                  <AdminButton tone="primary" onClick={() => void saveConnector()}>
                    <Save className="mr-1 h-4 w-4" />
                    保存连接器
                  </AdminButton>
                </div>
              </>
            ) : (
              <WorkspaceEmptyState
                eyebrow="编辑器"
                title="选择一个连接器"
                items={['协议', 'Endpoint', 'JSON']}
              />
            )}
          </div>
        </SectionPanel>
      </div>
    </AdminSectionFrame>
  )
}
