import { redirect } from 'next/navigation'
import { BackendUnavailableState } from '@/components/viewer-admin/BackendUnavailableState'
import { fetchHomeWorkspace } from '@/lib/digital-twin/bootstrap-client'
import { buildEditorHref } from '@/lib/digital-twin/editor-routing'
import { hasFrontendAccess } from '@/lib/digital-twin/frontend-access-server'

export default async function EditorPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>
}) {
  const query = (await searchParams) ?? {}
  const editorHref = buildEditorHref(query.returnTo)

  if (!(await hasFrontendAccess())) {
    redirect(`/access?next=${encodeURIComponent(editorHref)}`)
  }

  let workspace

  try {
    workspace = await fetchHomeWorkspace()
  } catch (error) {
    return <BackendUnavailableState error={error} retryHref="/editor" />
  }

  redirect(buildEditorHref(workspace.slug, query.returnTo))
}
