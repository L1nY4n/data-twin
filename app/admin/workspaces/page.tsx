import { redirect } from 'next/navigation'
import { AdminConsole } from '@/components/admin/AdminConsole'
import { BackendUnavailableState } from '@/components/viewer-admin/BackendUnavailableState'
import { fetchHomeWorkspace } from '@/lib/digital-twin/bootstrap-client'

export default async function AdminWorkspacesPage({
  searchParams,
}: {
  searchParams?: Promise<{ workspaceId?: string }>
}) {
  const query = (await searchParams) ?? {}
  if (!query.workspaceId) {
    let workspace

    try {
      workspace = await fetchHomeWorkspace()
    } catch (error) {
      return <BackendUnavailableState error={error} retryHref="/admin/workspaces" />
    }

    redirect(`/admin/workspaces?workspaceId=${encodeURIComponent(workspace.id)}`)
  }

  return <AdminConsole section="workspaces" />
}
