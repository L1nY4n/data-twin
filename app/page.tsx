import { redirect } from 'next/navigation'
import { BackendUnavailableState } from '@/components/viewer-admin/BackendUnavailableState'
import { fetchHomeWorkspace } from '@/lib/digital-twin/bootstrap-client'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  let workspace

  try {
    workspace = await fetchHomeWorkspace()
  } catch (error) {
    return <BackendUnavailableState error={error} retryHref="/" />
  }

  redirect(`/workspaces/${encodeURIComponent(workspace.slug)}`)
}
