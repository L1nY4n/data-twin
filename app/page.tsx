import { redirect } from 'next/navigation'
import { fetchHomeWorkspace } from '@/lib/digital-twin/bootstrap-client'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const workspace = await fetchHomeWorkspace()
  redirect(`/workspaces/${encodeURIComponent(workspace.slug)}`)
}
