import { notFound, redirect } from 'next/navigation'
import { EditorShell } from '@/components/editor/EditorShell'
import { fetchWorkspaceBySlug } from '@/lib/digital-twin/bootstrap-client'
import { buildEditorHref } from '@/lib/digital-twin/editor-routing'
import { hasFrontendAccess } from '@/lib/digital-twin/frontend-access-server'

export const dynamic = 'force-dynamic'

export default async function WorkspaceEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>
  searchParams?: Promise<{ returnTo?: string }>
}) {
  const routeParams = await params
  const query = (await searchParams) ?? {}
  const editorHref = buildEditorHref(routeParams.workspaceSlug, query.returnTo)
  if (!(await hasFrontendAccess())) {
    redirect(`/access?next=${encodeURIComponent(editorHref)}`)
  }

  let workspace

  try {
    workspace = await fetchWorkspaceBySlug(routeParams.workspaceSlug)
  } catch {
    notFound()
  }

  return (
    <EditorShell
      workspaceId={workspace.id}
      returnHref={query.returnTo}
    />
  )
}
