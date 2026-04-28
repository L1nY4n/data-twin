import { notFound, redirect } from 'next/navigation'
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

  const workspace = await fetchHomeWorkspace()
  redirect(buildAdminHref(section as AdminSection, workspace.id))
}
