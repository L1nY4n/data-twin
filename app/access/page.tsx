import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
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
    return <div className="p-6 text-sm">Access is not configured.</div>
  }

  const query = (await searchParams) ?? {}
  const nextPath = safeNextPath(query.next)
  if (typeof query.token === 'string') {
    redirect(`/access?next=${encodeURIComponent(nextPath)}&error=invalid`)
  }
  const invalid = query.error === 'invalid'

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <form action={unlockFrontendAccess} className="grid w-full max-w-sm gap-4 rounded-xl border border-white/10 bg-white/8 p-5">
        <div>
          <h1 className="text-base font-semibold">Access required</h1>
          {invalid ? (
            <p className="mt-2 text-sm text-rose-200">Access token is invalid.</p>
          ) : null}
        </div>
        <input type="hidden" name="next" value={nextPath} />
        <label className="grid gap-2 text-sm">
          Token
          <input
            name="token"
            type="password"
            autoComplete="current-password"
            className="rounded-md border border-white/15 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-300"
            required
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400"
        >
          Continue
        </button>
      </form>
    </main>
  )
}
