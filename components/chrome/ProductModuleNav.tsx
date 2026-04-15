'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const PRODUCT_MODULES = [
  { href: '/', label: 'Viewer', match: (pathname: string) => pathname === '/' },
  { href: '/admin/overview', label: 'Console', match: (pathname: string) => pathname.startsWith('/admin') },
  { href: '/benchmark', label: 'Benchmark', match: (pathname: string) => pathname.startsWith('/benchmark') },
]

export function ProductModuleNav({ className }: { className?: string }) {
  const pathname = usePathname()

  return (
    <nav
      className={cn(
        'flex max-w-full items-center gap-2 overflow-x-auto pb-1',
        className
      )}
      aria-label="Product Modules"
    >
      {PRODUCT_MODULES.map((module) => {
        const active = module.match(pathname)

        return (
          <Link
            key={module.href}
            href={module.href}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.08em] transition',
              active
                ? 'border-white/18 bg-white/12 text-white'
                : 'border-white/10 bg-white/4 text-white/65 hover:border-white/16 hover:bg-white/8 hover:text-white'
            )}
          >
            {module.label}
          </Link>
        )
      })}
    </nav>
  )
}
