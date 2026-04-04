import { notFound } from 'next/navigation'
import { AdminConsole } from '@/components/admin/AdminConsole'
import { ADMIN_SECTIONS, type AdminSection } from '@/lib/digital-twin/admin'

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = await params

  if (!ADMIN_SECTIONS.includes(section as AdminSection)) {
    notFound()
  }

  return <AdminConsole section={section as AdminSection} />
}
