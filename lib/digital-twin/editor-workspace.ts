export const DEFAULT_EDITOR_WORKSPACE_ID = 'factory-demo-scene'

export function buildEditorWorkspaceHref(
  workspaceId: string,
  returnTo?: string | null
) {
  const normalizedWorkspaceId = encodeURIComponent(
    workspaceId || DEFAULT_EDITOR_WORKSPACE_ID
  )
  const params = new URLSearchParams()

  if (returnTo) {
    params.set('returnTo', returnTo)
  }

  const query = params.toString()
  return query
    ? `/editor/${normalizedWorkspaceId}?${query}`
    : `/editor/${normalizedWorkspaceId}`
}
