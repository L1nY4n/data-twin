import { redirect } from 'next/navigation'
import { fetchHomeWorkspace } from '@/lib/digital-twin/bootstrap-client'

export default async function AdminPage() {
  const workspace = await fetchHomeWorkspace()
  redirect(`/admin/workspaces?workspaceId=${encodeURIComponent(workspace.id)}`)
}
