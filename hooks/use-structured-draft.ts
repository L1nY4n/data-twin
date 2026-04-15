import { useCallback, useEffect, useState } from 'react'
import { formatAdminJson, parseAdminJson } from '@/lib/digital-twin/admin-view-models'

export function useStructuredDraft<T>(initialValue: T | null, clone: (value: T) => T) {
  const [draft, setDraft] = useState<T | null>(initialValue)
  const [draftText, setDraftText] = useState(
    initialValue === null ? '' : formatAdminJson(initialValue)
  )

  useEffect(() => {
    if (initialValue === null) {
      setDraft(null)
      setDraftText('')
      return
    }

    const next = clone(initialValue)
    setDraft(next)
    setDraftText(formatAdminJson(next))
  }, [clone, initialValue])

  const replaceDraft = useCallback(
    (value: T | null) => {
      if (value === null) {
        setDraft(null)
        setDraftText('')
        return
      }

      const next = clone(value)
      setDraft(next)
      setDraftText(formatAdminJson(next))
    },
    [clone]
  )

  const updateDraft = useCallback((updater: (current: T) => T) => {
    setDraft((current) => {
      if (current === null) {
        return current
      }

      const next = updater(current)
      setDraftText(formatAdminJson(next))
      return next
    })
  }, [])

  const applyDraftText = useCallback(() => {
    const parsed = parseAdminJson<T | null>(draftText, null)
    if (parsed === null) {
      return null
    }

    const next = clone(parsed)
    setDraft(next)
    setDraftText(formatAdminJson(next))
    return next
  }, [clone, draftText])

  return {
    draft,
    draftText,
    setDraftText,
    replaceDraft,
    updateDraft,
    applyDraftText,
  }
}
