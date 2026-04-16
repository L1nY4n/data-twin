import { notFound } from 'next/navigation'
import { AdminConsole } from '@/components/admin/AdminConsole'
import { ADMIN_SECTIONS, type AdminSection } from '@/lib/digital-twin/admin'
import { fetchWorkspaceById } from '@/lib/digital-twin/bootstrap-client'

export default async function AdminWorkspaceSectionPage({
  params,
}: {
  params: Promise<{ workspaceId: string; section: string }>
}) {
  const { workspaceId, section } = await params

  if (!ADMIN_SECTIONS.includes(section as AdminSection) || section === 'workspaces') {
    notFound()
  }

  let workspace

  try {
    workspace = await fetchWorkspaceById(workspaceId)
  } catch {
    notFound()
  }

  return (
    <AdminConsole
      section={section as AdminSection}
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
    />
  )
}
