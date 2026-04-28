import { notFound } from 'next/navigation'
import { AdminConsole } from '@/components/admin/AdminConsole'
import type { AdminSection } from '@/lib/digital-twin/admin'
import { hasAdminPageRegistration } from '@/components/admin/admin-meta'
import { fetchWorkspaceById } from '@/lib/digital-twin/bootstrap-client'

export default async function AdminWorkspaceSectionPage({
  params,
}: {
  params: Promise<{ workspaceId: string; section: string }>
}) {
  const { workspaceId, section } = await params

  if ((!hasAdminPageRegistration(section) && !section.startsWith('module:')) || section === 'workspaces') {
    notFound()
  }

  let workspace

  try {
    workspace = await fetchWorkspaceById(workspaceId)
  } catch {
    notFound()
  }

  return (
    <AdminConsole
      section={section as AdminSection}
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
    />
  )
}
