import { redirect } from 'next/navigation'
import { fetchHomeWorkspace } from '@/lib/digital-twin/bootstrap-client'
import { buildEditorHref } from '@/lib/digital-twin/editor-routing'
import { hasFrontendAccess } from '@/lib/digital-twin/frontend-access-server'

export default async function EditorPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>
}) {
  if (!(await hasFrontendAccess())) {
    redirect('/access?next=/editor')
  }

  const workspace = await fetchHomeWorkspace()
  const query = (await searchParams) ?? {}

  redirect(buildEditorHref(workspace.slug, query.returnTo))
}
