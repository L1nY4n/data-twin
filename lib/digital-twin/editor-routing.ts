export function buildEditorHref(
  workspaceSlugOrReturnTo?: string | null,
  returnTo?: string | null
) {
  const hasWorkspaceSlug = arguments.length >= 2
  const workspaceSlug =
    hasWorkspaceSlug ? workspaceSlugOrReturnTo?.trim() ?? '' : ''
  const normalizedReturnTo =
    hasWorkspaceSlug ? returnTo?.trim() : workspaceSlugOrReturnTo?.trim()
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
