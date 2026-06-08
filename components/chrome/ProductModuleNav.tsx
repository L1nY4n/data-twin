'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

function resolveViewerHref(pathname: string) {
  const workspaceMatch = pathname.match(/^\/workspaces\/([^/]+)/)
  if (workspaceMatch) {
    return `/workspaces/${workspaceMatch[1]}`
  }

  return '/'
}

export function ProductModuleNav({ className }: { className?: string }) {
  const pathname = usePathname()
  const productModules = [
    {
      href: resolveViewerHref(pathname),
      label: 'Viewer',
      match: (currentPathname: string) =>
        currentPathname === '/' ||
        /^\/workspaces\/[^/]+$/.test(currentPathname) ||
        currentPathname.startsWith('/workspace/'),
    },
    {
      href: '/admin/workspaces',
      label: 'Console',
      match: (currentPathname: string) => currentPathname.startsWith('/admin'),
    },
    {
      href: '/benchmark',
      label: 'Benchmark',
      match: (currentPathname: string) => currentPathname.startsWith('/benchmark'),
    },
  ]

  return (
    <nav
      className={cn(
        'product-module-nav flex max-w-full items-center gap-2 overflow-x-auto pb-1',
        className
      )}
      aria-label="Product Modules"
    >
      {productModules.map((module) => {
        const active = module.match(pathname)

        return (
          <Link
            key={module.href}
            href={module.href}
            className={cn(
              'product-module-nav__link shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition',
              active && 'product-module-nav__link--active',
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
