'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { MapPin, Cpu, Clock, Hand } from 'lucide-react'
import { cn } from '@/lib/utils'

const TRIGGER_ICONS = {
  location: MapPin,
  device: Cpu,
  time: Clock,
  manual: Hand,
}

interface TriggerNodeData {
  label: string
  triggerType: keyof typeof TRIGGER_ICONS
  config?: Record<string, unknown>
}

export const TriggerNode = memo(function TriggerNode({ 
  data, 
  selected 
}: NodeProps) {
  const nodeData = data as TriggerNodeData
  const Icon = TRIGGER_ICONS[nodeData.triggerType] || MapPin

  return (
    <div
      className={cn(
        'min-w-[140px] rounded-lg border-2 bg-background shadow-md transition-all',
        selected ? 'border-amber-500 shadow-amber-500/20' : 'border-amber-500/50'
      )}
    >
      {/* 标题栏 */}
      <div className="flex items-center gap-2 rounded-t-md bg-amber-500/10 px-3 py-1.5">
        <Icon className="h-4 w-4 text-amber-500" />
        <span className="text-xs font-medium text-amber-500">触发器</span>
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
        className="!h-3 !w-3 !border-2 !border-amber-500 !bg-background"
      />
    </div>
  )
})
