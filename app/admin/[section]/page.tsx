import { notFound, redirect } from 'next/navigation'
import { BackendUnavailableState } from '@/components/viewer-admin/BackendUnavailableState'
import { fetchHomeWorkspace } from '@/lib/digital-twin/bootstrap-client'
import type { AdminSection } from '@/lib/digital-twin/admin'
import { buildAdminHref, hasAdminPageRegistration } from '@/components/admin/admin-meta'

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = await params

  if (!hasAdminPageRegistration(section) && !section.startsWith('module:')) {
    notFound()
  }

  if (section === 'workspaces') {
    redirect('/admin/workspaces')
  }

  let workspace

  try {
    workspace = await fetchHomeWorkspace()
  } catch (error) {
    return <BackendUnavailableState error={error} retryHref={`/admin/${section}`} />
  }

  redirect(buildAdminHref(section as AdminSection, workspace.id))
}
