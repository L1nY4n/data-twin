'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'

interface LogicNodeData {
  label: string
  logicType: 'and' | 'or' | 'not'
}

export const LogicNode = memo(function LogicNode({ 
  data, 
  selected 
}: NodeProps) {
  const nodeData = data as LogicNodeData

  return (
    <div
      className={cn(
        'flex h-14 w-14 items-center justify-center rounded-full border-2 bg-background shadow-md transition-all',
        selected ? 'border-purple-500 shadow-purple-500/20' : 'border-purple-500/50'
      )}
    >
      {/* 输入连接点 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-purple-500 !bg-background"
      />

      {/* 逻辑符号 */}
      <span className="text-sm font-bold text-purple-500">
        {nodeData.logicType.toUpperCase()}
      </span>

      {/* 输出连接点 */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-purple-500 !bg-background"
      />
    </div>
  )
})
