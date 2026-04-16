'use client'

import { AdminButton } from '@/components/admin/admin-surface'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'

interface AdvancedJsonEditorProps {
  value: string
  onChange: (value: string) => void
  onApply: () => void
}

export function AdvancedJsonEditor({
  value,
  onChange,
  onApply,
}: AdvancedJsonEditorProps) {
  return (
    <Collapsible className="admin-inset-block overflow-hidden p-0">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium">
        <span>高级 JSON</span>
        <span className="text-xs text-muted-foreground">专家模式</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t p-3">
        <Textarea
          className="min-h-[220px] font-mono text-xs"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="flex justify-end">
          <AdminButton size="sm" onClick={onApply}>
            应用 JSON
          </AdminButton>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
