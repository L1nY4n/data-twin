'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Edge, Node } from '@xyflow/react'
import {
  ArrowUpRight,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import {
  createRule,
  deleteRule,
  fetchAdminOverview,
  listAdminAlarms,
  listAdminAuditEvents,
  listAdminEntities,
  listDataConnectors,
  listEntityBindings,
  listRules,
  replaceEntityBindings,
  updateRule,
  validateRule,
} from '@/lib/digital-twin/bootstrap-client'
import { AdvancedJsonEditor } from '@/components/admin/AdvancedJsonEditor'
import { ArchetypesSection } from '@/components/admin/ArchetypesSection'
import { ConnectorsSection } from '@/components/admin/ConnectorsSection'
import { EntitiesSection } from '@/components/admin/EntitiesSection'
import { SceneSection } from '@/components/admin/SceneSection'
import { WorkspacesSection } from '@/components/admin/WorkspacesSection'
import { useStructuredDraft } from '@/hooks/use-structured-draft'
import {
  cloneBindingsDraft,
  cloneRuleDraft,
  createBindingTemplate,
  createRuleTemplate,
  formatAdminJson,
  parseAdminJson,
} from '@/lib/digital-twin/admin-view-models'
import type {
  AdminOverview,
  AdminSection,
  AuditEventRecord,
} from '@/lib/digital-twin/admin'
import {
  ADMIN_NAV_GROUPS,
  buildAdminHref,
  getAdminNavGroupDisplayTitle,
} from '@/components/admin/admin-meta'
import {
  AdminButton,
  AdminInsetBlock,
  AdminSectionFrame,
  AdminSelectableCard,
  SectionPanel,
} from '@/components/admin/admin-surface'
import type {
  Alarm,
  DataConnector,
  Entity,
  EntityBinding,
  RuleConfig,
} from '@/lib/digital-twin/types'
import { RuleEditor } from '@/components/digital-twin/rules/RuleEditor'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  ViewerAdminSoftCard,
} from '@/components/viewer-admin/primitives'

function OverviewSection({ workspaceId }: { workspaceId?: string }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [overviewPayload, alarmPayload, auditPayload] = await Promise.all([
        fetchAdminOverview(workspaceId),
        listAdminAlarms(workspaceId),
        listAdminAuditEvents(workspaceId),
      ])
      setOverview(overviewPayload)
      setAlarms(alarmPayload)
      setAuditEvents(auditPayload)
      setStatusMessage('总览数据已更新')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载总览失败')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const quickLinks = ADMIN_NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      groupTitle: getAdminNavGroupDisplayTitle(group.title),
    }))
  ).filter((item) => item.section !== 'overview')
  const latestAuditEvent = auditEvents[0]

  return (
    <AdminSectionFrame
      section="overview"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <AdminButton onClick={() => void loadData()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新总览
        </AdminButton>
      }
      metrics={[
        {
          label: '场景版本',
          value: overview?.sceneVersion ?? '--',
        },
        {
          label: '实体规模',
          value: overview?.entityCount ?? '--',
        },
        {
          label: '待处理告警',
          value: overview?.unacknowledgedAlarmCount ?? '--',
        },
        {
          label: '最近变更',
          value:
            overview?.recentChangeAt != null
              ? new Date(overview.recentChangeAt).toLocaleDateString('zh-CN')
              : '--',
        },
      ]}
      railCards={[
        {
          title: '告警',
          value: `${overview?.unacknowledgedAlarmCount ?? 0}`,
        },
        {
          title: '审计',
          value: latestAuditEvent?.actor ?? '--',
        },
      ]}
    >
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.95fr)_260px]">
        <SectionPanel
          eyebrow="告警"
          title="当前告警"
          className="h-full"
        >
          <div className="grid gap-3 xl:grid-cols-2">
            {alarms.length === 0 ? (
              <p className="text-sm text-muted-foreground xl:col-span-2">--</p>
            ) : (
              alarms.slice(0, 6).map((alarm) => (
                <ViewerAdminSoftCard key={alarm.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium leading-6">{alarm.message}</span>
                    <Badge
                      variant={alarm.acknowledged ? 'outline' : 'destructive'}
                      className="shrink-0"
                    >
                      {alarm.acknowledged ? '已确认' : '待处理'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(alarm.timestamp).toLocaleString('zh-CN')} · {alarm.level}
                  </p>
                </ViewerAdminSoftCard>
              ))
            )}
          </div>
        </SectionPanel>

        <SectionPanel
          eyebrow="审计"
          title="最近变更"
          className="h-full"
        >
          <div className="space-y-3">
            {auditEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">--</p>
            ) : (
              auditEvents.slice(0, 6).map((event) => (
                <ViewerAdminSoftCard key={event.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium leading-6">{event.action}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.actor} · {event.resourceId}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {event.resourceType}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString('zh-CN')}
                  </p>
                </ViewerAdminSoftCard>
              ))
            )}
          </div>
        </SectionPanel>

        <div className="space-y-4 2xl:sticky 2xl:top-24 2xl:self-start">
          <SectionPanel
            eyebrow="导航"
            title="模块入口"
          >
            <div className="space-y-3">
              {quickLinks.map((item) => (
                <Link
                  key={item.href}
                  href={buildAdminHref(item.section, workspaceId)}
                  className="viewer-admin-link-card group flex items-start justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      {item.groupTitle}
                    </p>
                    <p className="font-medium text-foreground">{item.title}</p>
                  </div>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          </SectionPanel>
        </div>
      </div>
    </AdminSectionFrame>
  )
}
function BindingsSection({ workspaceId }: { workspaceId?: string }) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [connectors, setConnectors] = useState<DataConnector[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [bindingsSource, setBindingsSource] = useState<EntityBinding[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const draft = useStructuredDraft(bindingsSource, cloneBindingsDraft)

  const loadData = useCallback(async (entityId?: string) => {
    setIsLoading(true)
    try {
      const [loadedEntities, loadedConnectors] = await Promise.all([
        listAdminEntities(workspaceId),
        listDataConnectors(workspaceId),
      ])
      const nextEntityId = entityId ?? selectedEntityId ?? loadedEntities[0]?.id ?? ''
      const nextBindings = nextEntityId
        ? workspaceId
          ? await listEntityBindings(workspaceId, nextEntityId)
          : await listEntityBindings(nextEntityId)
        : []

      setEntities(loadedEntities)
      setConnectors(loadedConnectors)
      setSelectedEntityId(nextEntityId)
      setBindingsSource(nextBindings)
      setStatusMessage('已同步绑定配置')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载绑定失败')
    } finally {
      setIsLoading(false)
    }
  }, [selectedEntityId, workspaceId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const saveBindings = useCallback(async () => {
    if (!selectedEntityId) {
      setStatusMessage('请选择实体后再保存绑定')
      return
    }

    const payload = draft.applyDraftText()
    if (!payload) {
      setStatusMessage('绑定 JSON 无法解析')
      return
    }

    try {
      if (workspaceId) {
        await replaceEntityBindings(workspaceId, selectedEntityId, payload)
      } else {
        await replaceEntityBindings(selectedEntityId, payload)
      }
      setStatusMessage('绑定已保存')
      await loadData(selectedEntityId)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存绑定失败')
    }
  }, [draft, loadData, selectedEntityId, workspaceId])

  const bindingCount = draft.draft?.length ?? bindingsSource.length

  return (
    <AdminSectionFrame
      section="bindings"
      statusMessage={statusMessage}
      isLoading={isLoading}
      showSummaryCards={false}
      actions={
        <AdminButton onClick={() => void loadData()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新绑定
        </AdminButton>
      }
      metrics={[
        {
          label: '目标实体',
          value: entities.find((entity) => entity.id === selectedEntityId)?.name ?? '--',
        },
        {
          label: '绑定条目',
          value: bindingCount,
        },
        {
          label: '编辑方式',
          value: 'Structured + JSON',
        },
      ]}
      railCards={[
        {
          title: '连接器',
          value: `${connectors.length}`,
        },
        {
          title: '实体',
          value: selectedEntityId || '--',
        },
      ]}
    >
      <SectionPanel
        eyebrow="绑定"
        title="绑定编辑器"
        action={
          <Badge variant="outline" className="rounded-full px-2.5 text-[10px]">
            共 {bindingCount} 条
          </Badge>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>选择实体</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={selectedEntityId}
                onChange={(event) => {
                  setSelectedEntityId(event.target.value)
                  void loadData(event.target.value)
                }}
              >
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name} ({entity.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>连接器概览</Label>
              <AdminInsetBlock className="px-3 py-2 text-sm text-muted-foreground">
                已接入 {connectors.length} 个连接器
              </AdminInsetBlock>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>结构化绑定表单</Label>
              <AdminButton
                size="sm"
                disabled={!selectedEntityId}
                onClick={() => {
                  draft.updateDraft((current) => [
                    ...current,
                    createBindingTemplate(selectedEntityId, connectors[0]?.id ?? ''),
                  ])
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                新增绑定
              </AdminButton>
            </div>

            {draft.draft && draft.draft.length > 0 ? (
              draft.draft.map((binding, index) => (
                <AdminInsetBlock key={binding.bindingId} className="space-y-3 p-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>连接器</Label>
                      <select
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={binding.connectorId}
                        onChange={(event) =>
                          draft.updateDraft((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, connectorId: event.target.value }
                                : item
                            )
                          )
                        }
                      >
                        {connectors.map((connector) => (
                          <option key={connector.id} value={connector.id}>
                            {connector.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>源路径</Label>
                      <Input
                        value={binding.sourcePath}
                        onChange={(event) =>
                          draft.updateDraft((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, sourcePath: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                      <Label>映射 JSON</Label>
                      <Textarea
                        defaultValue={formatAdminJson(binding.mapping)}
                        className="min-h-[110px] font-mono text-xs"
                        onBlur={(event) => {
                          const nextMapping = parseAdminJson(event.target.value, binding.mapping)
                          draft.updateDraft((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, mapping: nextMapping }
                                : item
                            )
                          )
                        }}
                      />
                    </div>
                    <div className="flex flex-col justify-between gap-2">
                      <div className="space-y-2">
                        <Label>启用状态</Label>
                        <select
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                          value={binding.enabled ? 'true' : 'false'}
                          onChange={(event) =>
                            draft.updateDraft((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, enabled: event.target.value === 'true' }
                                  : item
                              )
                            )
                          }
                        >
                          <option value="true">启用</option>
                          <option value="false">停用</option>
                        </select>
                      </div>
                      <AdminButton
                        tone="danger"
                        size="sm"
                        onClick={() =>
                          draft.updateDraft((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index)
                          )
                        }
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        删除
                      </AdminButton>
                    </div>
                  </div>
                </AdminInsetBlock>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">--</p>
            )}
          </div>

          <AdvancedJsonEditor
            value={draft.draftText}
            onChange={draft.setDraftText}
            onApply={() => {
              if (!draft.applyDraftText()) {
                setStatusMessage('绑定 JSON 无法解析')
                return
              }
              setStatusMessage('已从 JSON 应用绑定草稿')
            }}
          />

          <div className="flex justify-end">
            <AdminButton tone="primary" onClick={() => void saveBindings()}>
              <Save className="mr-1 h-4 w-4" />
              保存绑定
            </AdminButton>
          </div>
        </div>
      </SectionPanel>
    </AdminSectionFrame>
  )
}

function RulesSection({ workspaceId }: { workspaceId?: string }) {
  const [rules, setRules] = useState<RuleConfig[]>([])
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [draftSeed, setDraftSeed] = useState<RuleConfig | null>(null)
  const [ruleValidation, setRuleValidation] = useState<string[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const selectedRule = useMemo(
    () => rules.find((rule) => rule.id === selectedRuleId) ?? null,
    [rules, selectedRuleId]
  )
  const draft = useStructuredDraft(draftSeed ?? selectedRule, cloneRuleDraft)

  const loadRulesData = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listRules(workspaceId)
      setRules(loaded)
      setSelectedRuleId((current) => current ?? loaded[0]?.id ?? null)
      setStatusMessage('已同步规则配置')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载规则失败')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void loadRulesData()
  }, [loadRulesData])

  const saveRule = useCallback(
    async (nodes?: Node[], edges?: Edge[]) => {
      const payload = draft.applyDraftText() ?? draft.draft
      if (!payload) {
        setStatusMessage('规则 JSON 无法解析')
        return
      }

      const nextRule: RuleConfig = {
        ...payload,
        nodes: (nodes as RuleConfig['nodes'] | undefined) ?? payload.nodes,
        edges: (edges as RuleConfig['edges'] | undefined) ?? payload.edges,
        updatedAt: Date.now(),
      }

      try {
        if (rules.some((rule) => rule.id === nextRule.id)) {
          if (workspaceId) {
            await updateRule(workspaceId, nextRule.id, nextRule)
          } else {
            await updateRule(nextRule.id, nextRule)
          }
          setStatusMessage('规则已更新')
        } else {
          if (workspaceId) {
            await createRule(workspaceId, nextRule)
          } else {
            await createRule(nextRule)
          }
          setStatusMessage('规则已创建')
        }
        setDraftSeed(null)
        setSelectedRuleId(nextRule.id)
        await loadRulesData()
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '保存规则失败')
      }
    },
    [draft, loadRulesData, rules, workspaceId]
  )

  const removeRule = useCallback(async () => {
    if (!selectedRuleId || !selectedRule) {
      setStatusMessage('请先选择已存在的规则')
      return
    }

    try {
      if (workspaceId) {
        await deleteRule(workspaceId, selectedRuleId)
      } else {
        await deleteRule(selectedRuleId)
      }
      setStatusMessage('规则已删除')
      setSelectedRuleId(null)
      setDraftSeed(null)
      setRuleValidation([])
      await loadRulesData()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '删除规则失败')
    }
  }, [loadRulesData, selectedRule, selectedRuleId, workspaceId])

  const runRuleValidation = useCallback(async () => {
    const payload = draft.applyDraftText() ?? draft.draft
    if (!payload) {
      setStatusMessage('规则 JSON 无法解析')
      return
    }

    try {
      const result = workspaceId
        ? await validateRule(workspaceId, payload.id, payload)
        : await validateRule(payload.id, payload)
      setRuleValidation(result.errors)
      setStatusMessage(result.valid ? '规则校验通过' : '规则校验未通过')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '规则校验失败')
    }
  }, [draft, workspaceId])

  return (
    <AdminSectionFrame
      section="rules"
      statusMessage={statusMessage}
      isLoading={isLoading}
      showSummaryCards={false}
      actions={
        <AdminButton onClick={() => void loadRulesData()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新规则
        </AdminButton>
      }
      metrics={[
        {
          label: '规则总数',
          value: rules.length,
        },
        {
          label: '当前规则',
          value: draft.draft?.name ?? selectedRule?.name ?? '--',
        },
        {
          label: '校验结果',
          value: ruleValidation.length > 0 ? `${ruleValidation.length} 条问题` : 'Ready',
        },
      ]}
      railCards={[
        {
          title: '画布',
          value: 'List + Canvas',
        },
        {
          title: '校验',
          value: ruleValidation.length > 0 ? `${ruleValidation.length}` : '0',
        },
      ]}
    >
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="规则"
          title="规则列表"
          action={
            <Badge variant="outline" className="rounded-full px-2.5 text-[10px]">
              共 {rules.length} 条
            </Badge>
          }
        >
          <div className="space-y-3">
            <AdminButton
              className="w-full"
              onClick={() => {
                const template = createRuleTemplate()
                setDraftSeed(template)
                setSelectedRuleId(null)
                draft.replaceDraft(template)
                setRuleValidation([])
                setStatusMessage('已创建规则模板草稿')
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              新建规则
            </AdminButton>

            <ScrollArea className="h-[520px]">
              <div className="space-y-2 pr-3">
                {rules.map((rule) => (
                  <AdminSelectableCard
                    key={rule.id}
                    active={selectedRuleId === rule.id && draftSeed === null}
                    className="px-3 py-3"
                    onClick={() => {
                      setDraftSeed(null)
                      setSelectedRuleId(rule.id)
                      setRuleValidation([])
                    }}
                  >
                    <div className="font-medium text-foreground">{rule.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {rule.enabled ? '启用' : '停用'} · version {rule.version ?? 1}
                    </div>
                  </AdminSelectableCard>
                ))}
              </div>
            </ScrollArea>
          </div>
        </SectionPanel>

        <SectionPanel eyebrow="编辑器" title={draft.draft ? draft.draft.name : '规则详情'}>
          <div className="space-y-4">
            {draft.draft ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>规则名称</Label>
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
                </div>

                <div className="space-y-2">
                  <Label>描述</Label>
                  <Textarea
                    className="min-h-[90px]"
                    value={draft.draft.description}
                    onChange={(event) =>
                      draft.updateDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>

                <AdminInsetBlock className="h-[480px] overflow-hidden p-0">
                  <RuleEditor
                    ruleId={draft.draft.id}
                    ruleName={draft.draft.name}
                    initialNodes={draft.draft.nodes as unknown as Node[]}
                    initialEdges={draft.draft.edges as unknown as Edge[]}
                    onSave={(nodes, edges) => {
                      draft.updateDraft((current) => ({
                        ...current,
                        nodes: nodes as unknown as RuleConfig['nodes'],
                        edges: edges as unknown as RuleConfig['edges'],
                      }))
                      void saveRule(nodes, edges)
                    }}
                  />
                </AdminInsetBlock>

                {ruleValidation.length > 0 ? (
                  <AdminInsetBlock tone="warning" className="text-xs">
                    {ruleValidation.join('；')}
                  </AdminInsetBlock>
                ) : null}

                <AdvancedJsonEditor
                  value={draft.draftText}
                  onChange={draft.setDraftText}
                  onApply={() => {
                    if (!draft.applyDraftText()) {
                      setStatusMessage('规则 JSON 无法解析')
                      return
                    }
                    setStatusMessage('已从 JSON 应用规则草稿')
                  }}
                />

                <div className="flex flex-wrap justify-end gap-2">
                  <AdminButton onClick={() => void runRuleValidation()}>
                    校验规则
                  </AdminButton>
                  <AdminButton tone="danger" onClick={() => void removeRule()}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除规则
                  </AdminButton>
                  <AdminButton tone="primary" onClick={() => void saveRule()}>
                    <Save className="mr-1 h-4 w-4" />
                    保存规则
                  </AdminButton>
                </div>
              </>
              ) : (
                <p className="text-sm text-muted-foreground">--</p>
              )}
          </div>
        </SectionPanel>
      </div>
    </AdminSectionFrame>
  )
}

function AlarmsSection({ workspaceId }: { workspaceId?: string }) {
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const loadAlarms = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listAdminAlarms(workspaceId)
      setAlarms(loaded)
      setStatusMessage('已同步告警中心数据')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载告警失败')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void loadAlarms()
  }, [loadAlarms])

  const unacknowledgedCount = alarms.filter((alarm) => !alarm.acknowledged).length

  return (
    <AdminSectionFrame
      section="alarms"
      statusMessage={statusMessage}
      isLoading={isLoading}
      showSummaryCards={false}
      actions={
        <AdminButton onClick={() => void loadAlarms()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新告警
        </AdminButton>
      }
      metrics={[
        {
          label: '告警总数',
          value: alarms.length,
        },
        {
          label: '模式',
          value: 'Read Only',
        },
      ]}
      railCards={[
        {
          title: '待确认',
          value: `${unacknowledgedCount}`,
        },
        {
          title: '总数',
          value: `${alarms.length}`,
        },
      ]}
      showLiveWarning={false}
    >
      <SectionPanel
        eyebrow="告警"
        title="当前告警列表"
        action={
          <Badge variant="outline" className="rounded-full px-2.5 text-[10px]">
            共 {alarms.length} 条
          </Badge>
        }
      >
        <div className="space-y-3">
          {alarms.length === 0 ? (
            <p className="text-sm text-muted-foreground">--</p>
          ) : (
            alarms.map((alarm) => (
              <div
                key={alarm.id}
                className="viewer-admin-soft-card p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{alarm.message}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(alarm.timestamp).toLocaleString('zh-CN')} · level {alarm.level}
                    </div>
                  </div>
                  <Badge variant={alarm.acknowledged ? 'outline' : 'destructive'}>
                    {alarm.acknowledged ? '已确认' : '待确认'}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionPanel>
    </AdminSectionFrame>
  )
}

function AuditSection({ workspaceId }: { workspaceId?: string }) {
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const loadAudit = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listAdminAuditEvents(workspaceId)
      setAuditEvents(loaded)
      setStatusMessage('已同步审计日志')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载审计日志失败')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void loadAudit()
  }, [loadAudit])

  return (
    <AdminSectionFrame
      section="audit"
      statusMessage={statusMessage}
      isLoading={isLoading}
      showSummaryCards={false}
      actions={
        <AdminButton onClick={() => void loadAudit()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新审计
        </AdminButton>
      }
      metrics={[
        {
          label: '事件数',
          value: auditEvents.length,
        },
        {
          label: '最近操作者',
          value: auditEvents[0]?.actor ?? '--',
        },
      ]}
      railCards={[
        {
          title: '最新事件',
          value: auditEvents[0]?.action ?? '--',
        },
        {
          title: '操作者',
          value: auditEvents[0]?.actor ?? '--',
        },
      ]}
      showLiveWarning={false}
    >
      <SectionPanel
        eyebrow="审计"
        title="最近审计事件"
        action={
          <Badge variant="outline" className="rounded-full px-2.5 text-[10px]">
            共 {auditEvents.length} 条
          </Badge>
        }
      >
        <div className="space-y-3">
          {auditEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">--</p>
          ) : (
            auditEvents.map((event) => (
              <div
                key={event.id}
                className="viewer-admin-soft-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{event.action}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {event.actor} · {event.resourceType} · {event.resourceId}
                    </div>
                  </div>
                  <Badge variant="outline">
                    {new Date(event.createdAt).toLocaleString('zh-CN')}
                  </Badge>
                </div>
                <pre className="mt-3 overflow-x-auto rounded bg-muted p-2 text-[11px] text-muted-foreground">
                  {formatAdminJson(event.payload)}
                </pre>
              </div>
            ))
          )}
        </div>
      </SectionPanel>
    </AdminSectionFrame>
  )
}

export function AdminConsole({
  section,
  workspaceId,
  workspaceSlug,
}: {
  section: AdminSection
  workspaceId?: string
  workspaceSlug?: string
}) {
  switch (section) {
    case 'overview':
      return <OverviewSection workspaceId={workspaceId} />
    case 'workspaces':
      return <WorkspacesSection />
    case 'scene':
      return <SceneSection workspaceId={workspaceId} workspaceSlug={workspaceSlug} />
    case 'entities':
      return <EntitiesSection workspaceId={workspaceId} />
    case 'archetypes':
      return <ArchetypesSection />
    case 'connectors':
      return <ConnectorsSection workspaceId={workspaceId} />
    case 'bindings':
      return <BindingsSection workspaceId={workspaceId} />
    case 'rules':
      return <RulesSection workspaceId={workspaceId} />
    case 'alarms':
      return <AlarmsSection workspaceId={workspaceId} />
    case 'audit':
      return <AuditSection workspaceId={workspaceId} />
    default:
      return (
        <Card>
          <CardHeader>
            <CardTitle>未知后台模块</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              请返回<Link href="/admin/overview" className="text-primary underline">总览</Link>。
            </p>
          </CardContent>
        </Card>
      )
  }
}
