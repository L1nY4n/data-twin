import { redirect } from 'next/navigation'
import { fetchHomeWorkspace } from '@/lib/digital-twin/bootstrap-client'
import { buildEditorHref } from '@/lib/digital-twin/editor-routing'

export default async function EditorPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>
}) {
  const workspace = await fetchHomeWorkspace()
  const query = (await searchParams) ?? {}

  redirect(buildEditorHref(workspace.slug, query.returnTo))
}
