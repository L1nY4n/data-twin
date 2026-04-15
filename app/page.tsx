import { redirect } from 'next/navigation'
import { getBackendHttpBaseUrl } from '@/lib/digital-twin/backend-config'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const response = await fetch(`${getBackendHttpBaseUrl()}/api/v1/site/home-workspace`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    redirect('/workspace/factory-demo-scene')
  }

  const workspace = (await response.json()) as { id: string }
  redirect(`/workspace/${encodeURIComponent(workspace.id || 'factory-demo-scene')}`)
}
