import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin/AdminShell'
import { hasFrontendAccess } from '@/lib/digital-twin/frontend-access-server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasFrontendAccess())) {
    redirect('/access?next=/admin/workspaces')
  }

  return <Suspense fallback={null}><AdminShell>{children}</AdminShell></Suspense>
}
