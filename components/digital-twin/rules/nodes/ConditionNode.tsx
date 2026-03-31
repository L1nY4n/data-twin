'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Gauge, Clock, User, Map } from 'lucide-react'
import { cn } from '@/lib/utils'

const CONDITION_ICONS = {
  threshold: Gauge,
  time: Clock,
  role: User,
  spatial: Map,
}

interface ConditionNodeData {
  label: string
  conditionType: keyof typeof CONDITION_ICONS
  config?: Record<string, unknown>
}

export const ConditionNode = memo(function ConditionNode({ 
  data, 
  selected 
}: NodeProps) {
  const nodeData = data as ConditionNodeData
  const Icon = CONDITION_ICONS[nodeData.conditionType] || Gauge

  return (
    <div
      className={cn(
        'min-w-[140px] rounded-lg border-2 bg-background shadow-md transition-all',
        selected ? 'border-blue-500 shadow-blue-500/20' : 'border-blue-500/50'
      )}
    >
      {/* 输入连接点 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-blue-500 !bg-background"
      />

      {/* 标题栏 */}
      <div className="flex items-center gap-2 rounded-t-md bg-blue-500/10 px-3 py-1.5">
        <Icon className="h-4 w-4 text-blue-500" />
        <span className="text-xs font-medium text-blue-500">条件</span>
      </div>

      {/* 内容 */}
      <div className="px-3 py-2">
        <p className="text-sm font-medium">{nodeData.label}</p>
        {nodeData.config && (
          <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
            {Object.entries(nodeData.config).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span>{key}:</span>
                <span className="font-medium">{String(value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 输出连接点 */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-blue-500 !bg-background"
      />
    </div>
  )
})
