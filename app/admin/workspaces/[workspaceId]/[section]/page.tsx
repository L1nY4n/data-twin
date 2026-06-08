import { notFound } from 'next/navigation'
import { AdminConsole } from '@/components/admin/AdminConsole'
import { BackendUnavailableState } from '@/components/viewer-admin/BackendUnavailableState'
import type { AdminSection } from '@/lib/digital-twin/admin'
import { hasAdminPageRegistration } from '@/components/admin/admin-meta'
import { fetchWorkspaceById, isAdminApiError } from '@/lib/digital-twin/bootstrap-client'

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
  } catch (error) {
    if (isAdminApiError(error) && error.status === 0) {
      return (
        <BackendUnavailableState
          error={error}
          retryHref={`/admin/workspaces/${encodeURIComponent(workspaceId)}/${encodeURIComponent(section)}`}
        />
      )
    }

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
