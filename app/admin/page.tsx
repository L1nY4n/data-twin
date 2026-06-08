import { redirect } from 'next/navigation'
import { BackendUnavailableState } from '@/components/viewer-admin/BackendUnavailableState'
import { fetchHomeWorkspace } from '@/lib/digital-twin/bootstrap-client'

export default async function AdminPage() {
  let workspace

  try {
    workspace = await fetchHomeWorkspace()
  } catch (error) {
    return <BackendUnavailableState error={error} retryHref="/admin" />
  }

  redirect(`/admin/workspaces?workspaceId=${encodeURIComponent(workspace.id)}`)
}
