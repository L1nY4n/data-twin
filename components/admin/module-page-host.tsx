'use client'

import { ViewerAdminEmptyCard } from '@/components/viewer-admin/primitives'
import type { AdminSection } from '@/lib/digital-twin/admin'

export function ModulePageHost({
  section,
  workspaceId,
  workspaceSlug,
}: {
  section: AdminSection
  workspaceId?: string
  workspaceSlug?: string
}) {
  return (
    <ViewerAdminEmptyCard className="border-dashed p-6 text-sm text-muted-foreground">
      <div className="space-y-2">
        <p className="font-medium text-foreground">模块页面入口已预留</p>
        <p>
          当前 section <span className="font-mono">{section}</span> 尚未挂载实际页面组件。
        </p>
        <p className="text-xs text-muted-foreground">
          workspaceId: {workspaceId ?? '--'} · workspaceSlug: {workspaceSlug ?? '--'}
        </p>
      </div>
    </ViewerAdminEmptyCard>
  )
}
