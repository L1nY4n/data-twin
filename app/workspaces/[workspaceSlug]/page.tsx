import { notFound } from 'next/navigation'
import { DigitalTwinViewerPage } from '@/components/digital-twin/DigitalTwinViewerPage'
import { BackendUnavailableState } from '@/components/viewer-admin/BackendUnavailableState'
import { fetchWorkspaceBySlug, isAdminApiError } from '@/lib/digital-twin/bootstrap-client'

export const dynamic = 'force-dynamic'

export default async function WorkspaceRuntimePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const routeParams = await params
  let workspace

  try {
    workspace = await fetchWorkspaceBySlug(routeParams.workspaceSlug)
  } catch (error) {
    if (isAdminApiError(error) && error.status === 0) {
      return (
        <BackendUnavailableState
          error={error}
          retryHref={`/workspaces/${encodeURIComponent(routeParams.workspaceSlug)}`}
        />
      )
    }

    notFound()
  }

  return (
    <DigitalTwinViewerPage
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
    />
  )
}
