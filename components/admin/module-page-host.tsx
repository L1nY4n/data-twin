'use client'

import { Construction } from 'lucide-react'
import { ViewerAdminEmptyState } from '@/components/viewer-admin/primitives'
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
    <ViewerAdminEmptyState
      title="模块页面入口已预留"
      icon={Construction}
      className="p-6"
    >
      <p className="text-xs text-muted-foreground">
        section: <span className="font-mono">{section}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        workspaceId: {workspaceId ?? '未绑定'} · workspaceSlug: {workspaceSlug ?? '未绑定'}
      </p>
    </ViewerAdminEmptyState>
  )
}
