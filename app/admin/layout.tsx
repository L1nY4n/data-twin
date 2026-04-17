import { Suspense } from 'react'
import { AdminShell } from '@/components/admin/AdminShell'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}><AdminShell>{children}</AdminShell></Suspense>
}
