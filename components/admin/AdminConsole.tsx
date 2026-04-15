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
} from '@/components/admin/admin-meta'
import {
  AdminSectionFrame,
  MetricCard,
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  ViewerAdminSoftCard,
} from '@/components/viewer-admin/primitives'
import { cn } from '@/lib/utils'

function OverviewSection() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [overviewPayload, alarmPayload, auditPayload] = await Promise.all([
        fetchAdminOverview(),
        listAdminAlarms(),
        listAdminAuditEvents(),
      ])
      setOverview(overviewPayload)
      setAlarms(alarmPayload)
      setAuditEvents(auditPayload)
      setStatusMessage('已同步后台总览与治理信息')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载总览失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const quickLinks = ADMIN_NAV_GROUPS.flatMap((group) => group.items).filter(
    (item) => item.section !== 'overview'
  )

  return (
    <AdminSectionFrame
      section="overview"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadData()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新总览
        </Button>
      }
      metrics={[
        {
          label: 'Scene Version',
          value: overview?.sceneVersion ?? '--',
          detail: '当前运行态引用的场景版本。',
        },
        {
          label: '实体规模',
          value: overview?.entityCount ?? '--',
          detail: `规则 ${overview?.ruleCount ?? '--'} / 连接器 ${overview?.connectorCount ?? '--'}`,
        },
        {
          label: '待处理告警',
          value: overview?.unacknowledgedAlarmCount ?? '--',
          detail: alarms.length > 0 ? `已同步 ${alarms.length} 条告警` : '当前无告警快照',
        },
        {
          label: '最近变更',
          value:
            overview?.recentChangeAt != null
              ? new Date(overview.recentChangeAt).toLocaleDateString('zh-CN')
              : '--',
          detail:
            overview?.recentChangeAt != null
              ? new Date(overview.recentChangeAt).toLocaleTimeString('zh-CN')
              : '暂无变更记录',
        },
      ]}
      railCards={[
        {
          title: '告警概况',
          value: alarms.some((alarm) => !alarm.acknowledged) ? '存在待处理项' : '当前稳定',
          detail: `${overview?.unacknowledgedAlarmCount ?? 0} 条未确认告警`,
        },
        {
          title: '变更概况',
          value:
            overview?.recentChangeAt != null
              ? new Date(overview.recentChangeAt).toLocaleDateString('zh-CN')
              : '暂无记录',
          detail: auditEvents.length > 0 ? `${auditEvents.length} 条最近审计事件` : '当前无审计事件',
        },
      ]}
    >
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Scene Version" value={overview?.sceneVersion ?? '--'} />
        <MetricCard label="实体总数" value={overview?.entityCount ?? '--'} />
        <MetricCard label="规则数" value={overview?.ruleCount ?? '--'} />
        <MetricCard label="连接器数" value={overview?.connectorCount ?? '--'} />
        <MetricCard label="绑定数" value={overview?.bindingCount ?? '--'} />
        <MetricCard
          label="未确认告警"
          value={overview?.unacknowledgedAlarmCount ?? '--'}
          hint={
            overview?.recentChangeAt
              ? `最近变更 ${new Date(overview.recentChangeAt).toLocaleString('zh-CN')}`
              : '暂无变更记录'
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="Governance Feed"
          title="当前告警"
          description="把最需要被响应的事项放在工作台首屏。"
        >
          <div className="space-y-3">
            {alarms.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前无持久化告警。</p>
            ) : (
              alarms.slice(0, 8).map((alarm) => (
                <ViewerAdminSoftCard key={alarm.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{alarm.message}</span>
                    <Badge variant={alarm.acknowledged ? 'outline' : 'destructive'}>
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
          eyebrow="Change Radar"
          title="最近变更审计"
          description="在进入场景或规则编辑前先看最近谁改过什么。"
        >
          <div className="space-y-3">
            {auditEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前暂无审计事件。</p>
            ) : (
              auditEvents.slice(0, 8).map((event) => (
                <ViewerAdminSoftCard key={event.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{event.action}</span>
                    <Badge variant="outline">{event.resourceType}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {event.actor} · {event.resourceId} ·{' '}
                    {new Date(event.createdAt).toLocaleString('zh-CN')}
                  </p>
                </ViewerAdminSoftCard>
              ))
            )}
          </div>
        </SectionPanel>
      </div>

      <div className="grid gap-4">
        <SectionPanel
          eyebrow="Quick Routes"
          title="模块入口"
          description="常用后台模块的直接入口。"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {quickLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="viewer-admin-link-card group p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </SectionPanel>
      </div>
    </AdminSectionFrame>
  )
}
function BindingsSection() {
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
        listAdminEntities(),
        listDataConnectors(),
      ])
      const nextEntityId = entityId ?? selectedEntityId ?? loadedEntities[0]?.id ?? ''
      const nextBindings = nextEntityId ? await listEntityBindings(nextEntityId) : []

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
  }, [selectedEntityId])

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
      await replaceEntityBindings(selectedEntityId, payload)
      setStatusMessage('绑定已保存')
      await loadData(selectedEntityId)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存绑定失败')
    }
  }, [draft, loadData, selectedEntityId])

  const bindingCount = draft.draft?.length ?? bindingsSource.length

  return (
    <AdminSectionFrame
      section="bindings"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadData()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新绑定
        </Button>
      }
      metrics={[
        {
          label: '目标实体',
          value: entities.find((entity) => entity.id === selectedEntityId)?.name ?? '--',
          detail: selectedEntityId || '先选择一个实体',
        },
        {
          label: '绑定条目',
          value: bindingCount,
          detail: `连接器池 ${connectors.length} 个`,
        },
        {
          label: '编辑方式',
          value: 'Structured + JSON',
          detail: '既保留点位映射表单，也允许整批 JSON 直接覆盖。',
        },
      ]}
      railCards={[
        {
          title: '模块位置',
          value: '实体与连接器之间',
          detail: 'bindings 是中间层，负责把业务对象接到实时点位，不承担源系统定义。',
        },
        {
          title: '操作建议',
          value: '一边选实体，一边维护映射',
          detail: '先切实体，再按条目编辑 sourcePath 和 mapping，避免上下文混乱。',
        },
      ]}
    >
      <SectionPanel
        eyebrow="Binding Workspace"
        title="绑定编辑器"
        description="把选择实体、查看连接器池和编辑绑定条目放进同一工作区。"
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
              <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                已接入 {connectors.length} 个连接器
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>结构化绑定表单</Label>
              <Button
                variant="outline"
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
              </Button>
            </div>

            {draft.draft && draft.draft.length > 0 ? (
              draft.draft.map((binding, index) => (
                <div key={binding.bindingId} className="space-y-3 rounded-lg border p-3">
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
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          draft.updateDraft((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index)
                          )
                        }
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">当前实体暂无绑定，可直接新增。</p>
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
            <Button onClick={() => void saveBindings()}>
              <Save className="mr-1 h-4 w-4" />
              保存绑定
            </Button>
          </div>
        </div>
      </SectionPanel>
    </AdminSectionFrame>
  )
}

function RulesSection() {
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
      const loaded = await listRules()
      setRules(loaded)
      setSelectedRuleId((current) => current ?? loaded[0]?.id ?? null)
      setStatusMessage('已同步规则配置')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载规则失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

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
          await updateRule(nextRule.id, nextRule)
          setStatusMessage('规则已更新')
        } else {
          await createRule(nextRule)
          setStatusMessage('规则已创建')
        }
        setDraftSeed(null)
        setSelectedRuleId(nextRule.id)
        await loadRulesData()
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '保存规则失败')
      }
    },
    [draft, loadRulesData, rules]
  )

  const removeRule = useCallback(async () => {
    if (!selectedRuleId || !selectedRule) {
      setStatusMessage('请先选择已存在的规则')
      return
    }

    try {
      await deleteRule(selectedRuleId)
      setStatusMessage('规则已删除')
      setSelectedRuleId(null)
      setDraftSeed(null)
      setRuleValidation([])
      await loadRulesData()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '删除规则失败')
    }
  }, [loadRulesData, selectedRule, selectedRuleId])

  const runRuleValidation = useCallback(async () => {
    const payload = draft.applyDraftText() ?? draft.draft
    if (!payload) {
      setStatusMessage('规则 JSON 无法解析')
      return
    }

    try {
      const result = await validateRule(payload.id, payload)
      setRuleValidation(result.errors)
      setStatusMessage(result.valid ? '规则校验通过' : '规则校验未通过')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '规则校验失败')
    }
  }, [draft])

  const enabledRuleCount = rules.filter((rule) => rule.enabled).length

  return (
    <AdminSectionFrame
      section="rules"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadRulesData()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新规则
        </Button>
      }
      metrics={[
        {
          label: '规则总数',
          value: rules.length,
          detail: `${enabledRuleCount} 条当前启用`,
        },
        {
          label: '当前规则',
          value: draft.draft?.name ?? selectedRule?.name ?? '--',
          detail: draft.draft?.enabled ? '启用中' : '未启用或未选择',
        },
        {
          label: '校验结果',
          value: ruleValidation.length > 0 ? `${ruleValidation.length} 条问题` : 'Ready',
          detail: '规则图保存前建议至少跑一次后端校验。',
        },
      ]}
      railCards={[
        {
          title: '编排模式',
          value: 'List + Canvas',
          detail: '左侧挑选规则，右侧在图画布和描述区内完成编辑。',
        },
        {
          title: '安全边界',
          value: '先校验，再保存',
          detail: '规则错误的破坏面比普通配置大，后台需要给出更强的验证反馈。',
        },
      ]}
    >
      <div className="grid gap-4 2xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionPanel
          eyebrow="Rule Inventory"
          title="规则列表"
          description="把规则作为一组可编排资产管理，而不是孤立的 JSON 文本。"
        >
          <div className="space-y-3">
            <Button
              variant="outline"
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
            </Button>

            <ScrollArea className="h-[520px]">
              <div className="space-y-2 pr-3">
                {rules.map((rule) => (
                  <button
                    key={rule.id}
                    type="button"
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      selectedRuleId === rule.id && draftSeed === null
                        ? 'border-primary bg-primary/10'
                        : ''
                    }`}
                    onClick={() => {
                      setDraftSeed(null)
                      setSelectedRuleId(rule.id)
                      setRuleValidation([])
                    }}
                  >
                    <div className="font-medium">{rule.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {rule.enabled ? '启用' : '停用'} · version {rule.version ?? 1}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </SectionPanel>

        <SectionPanel
          eyebrow="Rule Workspace"
          title={draft.draft ? draft.draft.name : '规则详情'}
          description="描述、启停、图编排与校验结果都应该聚合在同一个编辑工作区。"
        >
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

                <div className="h-[480px] overflow-hidden rounded-lg border">
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
                </div>

                {ruleValidation.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    {ruleValidation.join('；')}
                  </div>
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
                  <Button variant="outline" onClick={() => void runRuleValidation()}>
                    校验规则
                  </Button>
                  <Button variant="destructive" onClick={() => void removeRule()}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除规则
                  </Button>
                  <Button onClick={() => void saveRule()}>
                    <Save className="mr-1 h-4 w-4" />
                    保存规则
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">请选择规则或创建新模板。</p>
            )}
          </div>
        </SectionPanel>
      </div>
    </AdminSectionFrame>
  )
}

function AlarmsSection() {
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const loadAlarms = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listAdminAlarms()
      setAlarms(loaded)
      setStatusMessage('已同步告警中心数据')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载告警失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAlarms()
  }, [loadAlarms])

  const unacknowledgedCount = alarms.filter((alarm) => !alarm.acknowledged).length

  return (
    <AdminSectionFrame
      section="alarms"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadAlarms()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新告警
        </Button>
      }
      metrics={[
        {
          label: '告警总数',
          value: alarms.length,
          detail: `${unacknowledgedCount} 条待确认`,
        },
        {
          label: '治理阶段',
          value: 'Read Only',
          detail: '首期以观测和排查为主，处置流留到后续阶段。',
        },
      ]}
      railCards={[
        {
          title: '当前能力',
          value: '观察与聚焦',
          detail: '告警中心先承担态势展示职责，后续再承接完整处置动作。',
        },
        {
          title: '阅读方式',
          value: '先看待确认，再看时间线',
          detail: '后台页需要让高优先级告警天然浮到上面。',
        },
      ]}
      showLiveWarning={false}
    >
      <SectionPanel
        eyebrow="Alarm Feed"
        title="当前告警列表"
        description="把告警做成治理 feed，而不是普通列表。"
      >
        <div className="space-y-3">
          {alarms.length === 0 ? (
            <p className="text-sm text-muted-foreground">当前没有持久化告警记录。</p>
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

function AuditSection() {
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const loadAudit = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listAdminAuditEvents()
      setAuditEvents(loaded)
      setStatusMessage('已同步审计日志')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '加载审计日志失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAudit()
  }, [loadAudit])

  return (
    <AdminSectionFrame
      section="audit"
      statusMessage={statusMessage}
      isLoading={isLoading}
      actions={
        <Button variant="outline" onClick={() => void loadAudit()} disabled={isLoading}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新审计
        </Button>
      }
      metrics={[
        {
          label: '事件数',
          value: auditEvents.length,
          detail: '用于追踪后台配置行为和生效时间。',
        },
        {
          label: '最近操作者',
          value: auditEvents[0]?.actor ?? '--',
          detail: auditEvents[0]?.resourceType ?? '暂无审计记录',
        },
      ]}
      railCards={[
        {
          title: '模块定位',
          value: '变更时间线',
          detail: '审计页是后台责任链，不该只是普通文本列表。',
        },
        {
          title: '使用方式',
          value: '改完即回看',
          detail: '每次修改后回到审计页，确认 actor、resource 和 payload 是否正确落库。',
        },
      ]}
      showLiveWarning={false}
    >
      <SectionPanel
        eyebrow="Audit Timeline"
        title="最近审计事件"
        description="突出变更责任和 payload，而不是让日志淹没在统一卡片里。"
      >
        <div className="space-y-3">
          {auditEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">当前暂无审计记录。</p>
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

export function AdminConsole({ section }: { section: AdminSection }) {
  switch (section) {
    case 'overview':
      return <OverviewSection />
    case 'workspaces':
      return <WorkspacesSection />
    case 'scene':
      return <SceneSection />
    case 'entities':
      return <EntitiesSection />
    case 'archetypes':
      return <ArchetypesSection />
    case 'connectors':
      return <ConnectorsSection />
    case 'bindings':
      return <BindingsSection />
    case 'rules':
      return <RulesSection />
    case 'alarms':
      return <AlarmsSection />
    case 'audit':
      return <AuditSection />
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
