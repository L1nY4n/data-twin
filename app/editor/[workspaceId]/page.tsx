import { notFound, redirect } from 'next/navigation'
import { fetchWorkspaceById } from '@/lib/digital-twin/bootstrap-client'
import { buildEditorHref } from '@/lib/digital-twin/editor-routing'

export default async function LegacyEditorWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams?: Promise<{ returnTo?: string }>
}) {
  const routeParams = await params
  const query = (await searchParams) ?? {}

  try {
    const workspace = await fetchWorkspaceById(routeParams.workspaceId)
    redirect(buildEditorHref(workspace.slug, query.returnTo))
  } catch {
    notFound()
  }
}
