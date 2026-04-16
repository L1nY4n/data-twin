export function buildEditorHref(
  workspaceSlugOrReturnTo?: string | null,
  returnTo?: string | null
) {
  const workspaceSlug =
    returnTo === undefined ? '' : workspaceSlugOrReturnTo?.trim() ?? ''
  const normalizedReturnTo =
    returnTo === undefined ? workspaceSlugOrReturnTo?.trim() : returnTo?.trim()
  const params = new URLSearchParams()

  if (normalizedReturnTo) {
    params.set('returnTo', normalizedReturnTo)
  }

  const query = params.toString()
  const basePath = workspaceSlug
    ? `/workspaces/${encodeURIComponent(workspaceSlug)}/editor`
    : '/editor'
  return query ? `${basePath}?${query}` : basePath
}
