import { redirect } from 'next/navigation'
import { AdminConsole } from '@/components/admin/AdminConsole'
import { fetchHomeWorkspace } from '@/lib/digital-twin/bootstrap-client'

export default async function AdminWorkspacesPage({
  searchParams,
}: {
  searchParams?: Promise<{ workspaceId?: string }>
}) {
  const query = (await searchParams) ?? {}
  if (!query.workspaceId) {
    const workspace = await fetchHomeWorkspace()
    redirect(`/admin/workspaces?workspaceId=${encodeURIComponent(workspace.id)}`)
  }

  return <AdminConsole section="workspaces" />
}
