import { notFound, redirect } from 'next/navigation'
import { fetchWorkspaceById } from '@/lib/digital-twin/bootstrap-client'

export default async function LegacyWorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const routeParams = await params

  try {
    const workspace = await fetchWorkspaceById(routeParams.workspaceId)
    redirect(`/workspaces/${encodeURIComponent(workspace.slug)}`)
  } catch {
    notFound()
  }
}
