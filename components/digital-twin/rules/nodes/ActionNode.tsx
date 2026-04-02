'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Bell, Send, Cog, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACTION_ICONS = {
  alert: Bell,
  notify: Send,
  control: Cog,
  dispatch: Truck,
}

interface ActionNodeData {
  label: string
  actionType: keyof typeof ACTION_ICONS
  config?: Record<string, unknown>
}

export const ActionNode = memo(function ActionNode({ 
  data, 
  selected 
}: NodeProps) {
  const nodeData = data as unknown as ActionNodeData
  const Icon = ACTION_ICONS[nodeData.actionType] || Bell

  return (
    <div
      className={cn(
        'min-w-[140px] rounded-lg border-2 bg-background shadow-md transition-all',
        selected ? 'border-green-500 shadow-green-500/20' : 'border-green-500/50'
      )}
    >
      {/* 输入连接点 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-green-500 !bg-background"
      />

      {/* 标题栏 */}
      <div className="flex items-center gap-2 rounded-t-md bg-green-500/10 px-3 py-1.5">
        <Icon className="h-4 w-4 text-green-500" />
        <span className="text-xs font-medium text-green-500">动作</span>
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
    </div>
  )
})
