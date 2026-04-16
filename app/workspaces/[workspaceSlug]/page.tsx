import { notFound } from 'next/navigation'
import { DigitalTwinViewerPage } from '@/components/digital-twin/DigitalTwinViewerPage'
import { fetchWorkspaceBySlug } from '@/lib/digital-twin/bootstrap-client'

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
  } catch {
    notFound()
  }

  return (
    <DigitalTwinViewerPage
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
    />
  )
}
