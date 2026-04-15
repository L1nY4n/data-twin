import { EditorShell } from '@/components/editor/EditorShell'

export default async function EditorWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams?: Promise<{ returnTo?: string }>
}) {
  const routeParams = await params
  const query = (await searchParams) ?? {}

  return (
    <EditorShell
      workspaceHint={routeParams.workspaceId}
      returnHref={query.returnTo}
    />
  )
}
