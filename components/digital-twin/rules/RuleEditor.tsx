'use client'

import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, Save, Trash2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TriggerNode } from './nodes/TriggerNode'
import { ConditionNode } from './nodes/ConditionNode'
import { ActionNode } from './nodes/ActionNode'
import { LogicNode } from './nodes/LogicNode'

// 节点类型映射
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
  logic: LogicNode,
}

// 初始节点
const initialNodes: Node[] = [
  {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 100, y: 200 },
    data: { 
      label: '进入区域', 
      triggerType: 'location',
      config: { zone: '危险区', event: 'enter' }
    },
  },
  {
    id: 'condition-1',
    type: 'condition',
    position: { x: 350, y: 150 },
    data: { 
      label: '角色判断', 
      conditionType: 'role',
      config: { role: '访客', operator: 'equals' }
    },
  },
  {
    id: 'condition-2',
    type: 'condition',
    position: { x: 350, y: 280 },
    data: { 
      label: '时间判断', 
      conditionType: 'time',
      config: { start: '18:00', end: '06:00' }
    },
  },
  {
    id: 'logic-1',
    type: 'logic',
    position: { x: 550, y: 200 },
    data: { 
      label: 'AND', 
      logicType: 'and'
    },
  },
  {
    id: 'action-1',
    type: 'action',
    position: { x: 750, y: 150 },
    data: { 
      label: '发送告警', 
      actionType: 'alert',
      config: { level: 'warning', message: '访客进入危险区域' }
    },
  },
  {
    id: 'action-2',
    type: 'action',
    position: { x: 750, y: 280 },
    data: { 
      label: '通知安保', 
      actionType: 'notify',
      config: { target: 'security', method: 'sms' }
    },
  },
]

// 初始连线
const initialEdges: Edge[] = [
  { id: 'e1', source: 'trigger-1', target: 'condition-1', animated: true },
  { id: 'e2', source: 'trigger-1', target: 'condition-2', animated: true },
  { id: 'e3', source: 'condition-1', target: 'logic-1' },
  { id: 'e4', source: 'condition-2', target: 'logic-1' },
  { id: 'e5', source: 'logic-1', target: 'action-1', animated: true },
  { id: 'e6', source: 'logic-1', target: 'action-2', animated: true },
]

// 节点模板
const nodeTemplates = [
  { type: 'trigger', label: '触发器', variants: [
    { label: '位置触发', triggerType: 'location' },
    { label: '设备触发', triggerType: 'device' },
    { label: '时间触发', triggerType: 'time' },
    { label: '手动触发', triggerType: 'manual' },
  ]},
  { type: 'condition', label: '条件', variants: [
    { label: '阈值判断', conditionType: 'threshold' },
    { label: '时间窗口', conditionType: 'time' },
    { label: '角色判断', conditionType: 'role' },
    { label: '空间判断', conditionType: 'spatial' },
  ]},
  { type: 'logic', label: '逻辑', variants: [
    { label: 'AND', logicType: 'and' },
    { label: 'OR', logicType: 'or' },
    { label: 'NOT', logicType: 'not' },
  ]},
  { type: 'action', label: '动作', variants: [
    { label: '发送告警', actionType: 'alert' },
    { label: '通知人员', actionType: 'notify' },
    { label: '设备控制', actionType: 'control' },
    { label: '调度指令', actionType: 'dispatch' },
  ]},
]

interface RuleEditorProps {
  ruleId?: string
  ruleName?: string
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onSave?: (nodes: Node[], edges: Edge[]) => void
}

export function RuleEditor({
  ruleId,
  ruleName = '新建规则',
  initialNodes: initialNodesOverride,
  initialEdges: initialEdgesOverride,
  onSave,
}: RuleEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodesOverride ?? initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdgesOverride ?? initialEdges)

  useEffect(() => {
    setNodes(initialNodesOverride ?? initialNodes)
    setEdges(initialEdgesOverride ?? initialEdges)
  }, [initialNodesOverride, initialEdgesOverride, setEdges, setNodes])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  )

  const addNode = useCallback((type: string, data: Record<string, unknown>) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data,
    }
    setNodes((nds) => [...nds, newNode])
  }, [setNodes])

  const deleteSelectedNodes = useCallback(() => {
    setNodes((nds) => nds.filter((n) => !n.selected))
    setEdges((eds) => eds.filter((e) => !e.selected))
  }, [setNodes, setEdges])

  const handleSave = useCallback(() => {
    onSave?.(nodes, edges)
  }, [nodes, edges, onSave])

  const nodeCount = useMemo(() => ({
    trigger: nodes.filter(n => n.type === 'trigger').length,
    condition: nodes.filter(n => n.type === 'condition').length,
    logic: nodes.filter(n => n.type === 'logic').length,
    action: nodes.filter(n => n.type === 'action').length,
  }), [nodes])

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
        defaultEdgeOptions={{
          style: { strokeWidth: 2, stroke: '#64748b' },
          type: 'smoothstep',
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#333" />
        <Controls className="bg-background border rounded-lg" />
        <MiniMap 
          className="bg-background border rounded-lg"
          nodeColor={(node) => {
            switch (node.type) {
              case 'trigger': return '#f59e0b'
              case 'condition': return '#3b82f6'
              case 'logic': return '#8b5cf6'
              case 'action': return '#22c55e'
              default: return '#64748b'
            }
          }}
        />

        {/* 顶部工具栏 */}
        <Panel position="top-left" className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5">
            <span className="text-sm font-medium">{ruleName}</span>
            <Badge variant="outline" className="text-xs">
              {ruleId || '未保存'}
            </Badge>
          </div>
        </Panel>

        <Panel position="top-right" className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={deleteSelectedNodes}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            删除
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="mr-1.5 h-4 w-4" />
            保存
          </Button>
          <Button size="sm" variant="default">
            <Play className="mr-1.5 h-4 w-4" />
            测试
          </Button>
        </Panel>

        {/* 节点统计 */}
        <Panel position="bottom-left" className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-xs">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              触发 {nodeCount.trigger}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              条件 {nodeCount.condition}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              逻辑 {nodeCount.logic}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              动作 {nodeCount.action}
            </span>
          </div>
        </Panel>

        {/* 节点工具栏 */}
        <Panel position="bottom-right">
          <div className="rounded-lg border bg-background p-2">
            <div className="mb-2 text-xs font-medium text-muted-foreground">添加节点</div>
            <div className="grid grid-cols-4 gap-1">
              {nodeTemplates.map((template) => (
                <div key={template.type} className="space-y-1">
                  <div className="text-center text-[10px] text-muted-foreground">
                    {template.label}
                  </div>
                  {template.variants.map((variant) => (
                    <Button
                      key={variant.label}
                      variant="outline"
                      size="sm"
                      className="h-7 w-full text-[10px]"
                      onClick={() => addNode(template.type, { ...variant })}
                    >
                      <Plus className="mr-0.5 h-3 w-3" />
                      {variant.label}
                    </Button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  )
}
