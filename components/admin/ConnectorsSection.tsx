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
import { cn } from '@/lib/utils'

export function ConnectorsSection() {
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
      const loaded = await listDataConnectors()
      setConnectors(loaded)
      setSelectedConnectorId((current) => current ?? loaded[0]?.id ?? null)
      setStatusMessage('已同步连接器配置')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载连接器失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

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
        await updateDataConnector(payload.id, payload)
        setStatusMessage('连接器已更新')
      } else {
        await createDataConnector(payload)
        setStatusMessage('连接器已创建')
      }
      await loadConnectors()
      setSelectedConnectorId(payload.id)
      setDraftSeed(null)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存连接器失败')
    }
  }, [connectors, draft, loadConnectors])

  const removeConnector = useCallback(async () => {
    if (!selectedConnectorId || !selectedConnector) {
      setStatusMessage('请先选择已存在的连接器')
      return
    }

    try {
      await deleteDataConnector(selectedConnectorId)
      setStatusMessage('连接器已删除')
      setSelectedConnectorId(null)
      setDraftSeed(null)
      await loadConnectors()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '删除连接器失败')
    }
  }, [loadConnectors, selectedConnector, selectedConnectorId])

  const enabledConnectorCount = connectors.filter((connector) => connector.enabled).length

  return (
    <AdminSectionFrame
      section="connectors"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadConnectors()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新连接器
        </Button>
      }
      metrics={[
        {
          label: '连接器总数',
          value: connectors.length,
          detail: `${enabledConnectorCount} 个处于启用状态`,
        },
        {
          label: '当前对象',
          value: selectedConnector?.name ?? draft.draft?.name ?? '--',
          detail: selectedConnector?.protocol ?? draft.draft?.protocol ?? '尚未选择连接器',
        },
        {
          label: '接入形态',
          value: 'Protocol / Endpoint / Auth',
          detail: '把接入协议、endpoint 与复杂认证配置拆层管理。',
        },
      ]}
      railCards={[
        {
          title: '模块职责',
          value: '接入抽象层',
          detail: '连接器页维护的是接入描述，不是实体映射；映射关系留在 bindings。',
        },
        {
          title: '编辑路径',
          value: '清单选择 → 详情修改',
          detail: '左侧控制资产范围，右侧处理协议与连接细节。',
        },
      ]}
    >
      <div className="grid gap-4 2xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="Connector Inventory"
          title="连接器列表"
          description="把接入对象先视为资产清单，再进入协议详情。"
        >
          <div className="space-y-3">
            <Button
              variant="outline"
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
            </Button>

            {connectors.length > 0 ? (
              <ScrollArea className="h-[520px]">
                <div className="space-y-2 pr-3">
                  {connectors.map((connector) => (
                    <button
                      key={connector.id}
                      type="button"
                      className={cn(
                        'w-full rounded-2xl border px-3 py-3 text-left text-sm transition',
                        selectedConnectorId === connector.id && draftSeed === null
                          ? 'border-primary bg-primary/10 shadow-[0_20px_50px_-42px_rgba(14,165,233,0.8)]'
                          : 'viewer-admin-soft-card'
                      )}
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
                    </button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <WorkspaceEmptyState
                eyebrow="Connector Bootstrap"
                title="先定义接入资产，再补协议细节"
                description="接入页的空态应该告诉你下一步怎么建模，而不是留出一整块未命名空白。"
                cues={[
                  {
                    title: '1. 建立接入对象',
                    detail: '先把连接器当成资产条目维护，再决定它属于哪种协议或系统。',
                  },
                  {
                    title: '2. 填 endpoint 与认证',
                    detail: '把协议字段、endpoint 和 authConfig 作为同一份接入描述统一管理。',
                  },
                  {
                    title: '3. 再去 bindings 绑定实体',
                    detail: '连接器页不承担实体映射，避免职责再次混在一起。',
                  },
                ]}
                asideTitle="工作顺序"
                asideDetail="先定义 source system，再让 bindings 去消费它，后台层级才不会重新塌平。"
              />
            )}
          </div>
        </SectionPanel>

        <SectionPanel
          eyebrow="Connector Editor"
          title={draft.draft ? `${draft.draft.name} 配置` : '连接器详情'}
          description="保持常用字段可视化，复杂认证和扩展配置走 JSON。"
        >
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

                <p className="text-xs text-muted-foreground">
                  `authConfig` 等复杂字段请通过高级 JSON 维护。
                </p>

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
                  <Button variant="destructive" onClick={() => void removeConnector()}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除连接器
                  </Button>
                  <Button onClick={() => void saveConnector()}>
                    <Save className="mr-1 h-4 w-4" />
                    保存连接器
                  </Button>
                </div>
              </>
            ) : (
              <WorkspaceEmptyState
                eyebrow="Protocol Workspace"
                title="协议编辑区待命中"
                description="先从左侧选择一个连接器，右侧才进入协议、endpoint 与认证配置的深度编辑。"
                cues={[
                  {
                    title: '协议字段',
                    detail: '把通用参数留在结构化表单里，让高频维护更稳定。',
                  },
                  {
                    title: '认证扩展',
                    detail: '复杂的 authConfig 和高级参数继续走 JSON，不把表单做成万能抽屉。',
                  },
                  {
                    title: '运行态影响',
                    detail: '保存连接器后，接入层配置会直接变化，所以这里必须是一个专注工作区。',
                  },
                ]}
                asideTitle="编辑原则"
                asideDetail="先锁定对象，再改协议细节，避免后台回到“每页一堆重复表单”的老问题。"
              />
            )}
          </div>
        </SectionPanel>
      </div>
    </AdminSectionFrame>
  )
}
