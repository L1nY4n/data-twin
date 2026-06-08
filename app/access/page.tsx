import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { ArrowRight, LockKeyhole, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ViewerAdminCenteredPanel,
  ViewerAdminNotice,
} from '@/components/viewer-admin/primitives'
import {
  getFrontendAccessCookieName,
  isFrontendAccessConfigured,
} from '@/lib/digital-twin/frontend-access'
import {
  createFrontendAccessSession,
  getFrontendAccessSessionMaxAgeSeconds,
  resolveFrontendAccessCookieSecure,
  verifyFrontendAccessToken,
} from '@/lib/digital-twin/frontend-access-server'

function safeNextPath(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/'
}

async function unlockFrontendAccess(formData: FormData) {
  'use server'

  if (!isFrontendAccessConfigured()) {
    redirect('/access?error=not-configured')
  }

  const nextPath = safeNextPath(formData.get('next'))
  if (!verifyFrontendAccessToken(formData.get('token'))) {
    redirect(`/access?next=${encodeURIComponent(nextPath)}&error=invalid`)
  }

  const cookieStore = await cookies()
  const headerStore = await headers()
  cookieStore.set(getFrontendAccessCookieName(), createFrontendAccessSession(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: resolveFrontendAccessCookieSecure({
      forwardedProto: headerStore.get('x-forwarded-proto'),
      forwarded: headerStore.get('forwarded'),
      forwardedSsl: headerStore.get('x-forwarded-ssl'),
    }),
    path: '/',
    maxAge: getFrontendAccessSessionMaxAgeSeconds(),
  })

  redirect(nextPath)
}

export default async function AccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; next?: string; token?: string }>
}) {
  if (!isFrontendAccessConfigured()) {
    return (
      <ViewerAdminCenteredPanel
        title="Access not configured"
        description="Frontend access token is missing."
        leading={<ShieldAlert className="h-4 w-4 text-amber-100" />}
        maxWidthClass="max-w-sm"
      />
    )
  }

  const query = (await searchParams) ?? {}
  const nextPath = safeNextPath(query.next)
  if (typeof query.token === 'string') {
    redirect(`/access?next=${encodeURIComponent(nextPath)}&error=invalid`)
  }
  const invalid = query.error === 'invalid'

  return (
    <ViewerAdminCenteredPanel
      title="Access required"
      description="输入访问令牌以继续进入工作台"
      leading={<LockKeyhole className="h-4 w-4" />}
      maxWidthClass="max-w-sm"
    >
      <form action={unlockFrontendAccess} className="space-y-4">
        {invalid ? (
          <ViewerAdminNotice tone="danger" className="py-2">
            Access token is invalid.
          </ViewerAdminNotice>
        ) : null}
        <input type="hidden" name="next" value={nextPath} />
        <label className="grid gap-2 text-sm font-medium text-white/80">
          Token
          <Input
            name="token"
            type="password"
            autoComplete="current-password"
            className="h-10"
            required
          />
        </label>
        <Button type="submit" className="w-full justify-between">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </ViewerAdminCenteredPanel>
  )
}
