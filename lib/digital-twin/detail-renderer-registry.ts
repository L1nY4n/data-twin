import type * as React from 'react'

export interface DetailRendererRegistration<Target extends string, Context> {
  target: Target
  moduleKey: string
  render: (context: Context) => React.ReactNode
}

export interface DetailRendererRegistry<Target extends string, Context> {
  registrations: Map<Target, DetailRendererRegistration<Target, Context>>
  resolve: (target: Target) => DetailRendererRegistration<Target, Context> | null
}

export function createDetailRendererRegistry<Target extends string, Context>(
  registrations: DetailRendererRegistration<Target, Context>[]
): DetailRendererRegistry<Target, Context> {
  const next = new Map<Target, DetailRendererRegistration<Target, Context>>()

  for (const registration of registrations) {
    if (next.has(registration.target)) {
      throw new Error(`Duplicate detail renderer registration for ${registration.target}`)
    }
    next.set(registration.target, registration)
  }

  return {
    registrations: next,
    resolve: (target) => next.get(target) ?? null,
  }
}
