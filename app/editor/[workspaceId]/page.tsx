import { notFound, redirect } from 'next/navigation'
import { fetchWorkspaceById } from '@/lib/digital-twin/bootstrap-client'
import { buildEditorHref } from '@/lib/digital-twin/editor-routing'
import { hasFrontendAccess } from '@/lib/digital-twin/frontend-access-server'

function buildLegacyEditorHref(workspaceId: string, returnTo?: string) {
  const params = new URLSearchParams()
  if (returnTo) {
    params.set('returnTo', returnTo)
  }

  const query = params.toString()
  const path = `/editor/${encodeURIComponent(workspaceId)}`
  return query ? `${path}?${query}` : path
}

export default async function LegacyEditorWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams?: Promise<{ returnTo?: string }>
}) {
  const routeParams = await params
  const query = (await searchParams) ?? {}
  if (!(await hasFrontendAccess())) {
    redirect(
      `/access?next=${encodeURIComponent(
        buildLegacyEditorHref(routeParams.workspaceId, query.returnTo)
      )}`
    )
  }

  try {
    const workspace = await fetchWorkspaceById(routeParams.workspaceId)
    redirect(buildEditorHref(workspace.slug, query.returnTo))
  } catch {
    notFound()
  }
}
