import { notFound, redirect } from 'next/navigation'
import { BackendUnavailableState } from '@/components/viewer-admin/BackendUnavailableState'
import { fetchWorkspaceById, isAdminApiError } from '@/lib/digital-twin/bootstrap-client'

export default async function LegacyWorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const routeParams = await params

  let workspace

  try {
    workspace = await fetchWorkspaceById(routeParams.workspaceId)
  } catch (error) {
    if (isAdminApiError(error) && error.status === 0) {
      return (
        <BackendUnavailableState
          error={error}
          retryHref={`/workspace/${encodeURIComponent(routeParams.workspaceId)}`}
        />
      )
    }

    notFound()
  }

  redirect(`/workspaces/${encodeURIComponent(workspace.slug)}`)
}
