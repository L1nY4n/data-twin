import { notFound } from 'next/navigation'
import { EditorShell } from '@/components/editor/EditorShell'
import { fetchWorkspaceBySlug } from '@/lib/digital-twin/bootstrap-client'

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
