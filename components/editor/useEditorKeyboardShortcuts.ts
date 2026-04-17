'use client'

import { useEffect, useEffectEvent } from 'react'
import { useEditorDigitalTwinStore } from '@/lib/digital-twin/editor-store'

interface EditorKeyboardShortcutsOptions {
  deleteSelection: () => Promise<boolean> | boolean
  duplicateSelection: () => unknown
}

function isShortcutTargetEditable(target: EventTarget | null) {
  const element =
    target instanceof HTMLElement
      ? target
      : target instanceof Node
        ? target.parentElement
        : null

  if (!element) return false
  if (element.isContentEditable) return true

  return Boolean(
    element.closest('input, textarea, select, [contenteditable="true"]')
  )
}

export function useEditorKeyboardShortcuts({
  deleteSelection,
  duplicateSelection,
}: EditorKeyboardShortcutsOptions) {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || isShortcutTargetEditable(event.target)) {
      return
    }

    const state = useEditorDigitalTwinStore.getState()
    if (
      state.isLoading ||
      state.isSaving ||
      state.isTransformDragging ||
      state.isMarqueeSelecting
    ) {
      return
    }

    const key = event.key.toLowerCase()
    const hasSelection = Boolean(state.selectedEntityId || state.selectedStaticAssetId)
    const hasDraftSelection = Boolean(state.draftEntity || state.draftStaticAsset)
    const hasCommandModifier = event.metaKey || event.ctrlKey

    if (hasCommandModifier && !event.altKey && !event.shiftKey && key === 'd') {
      if (!hasSelection) return
      event.preventDefault()
      void duplicateSelection()
      return
    }

    if (!hasCommandModifier && !event.altKey && key === 'escape') {
      if (state.placementCatalogId) {
        event.preventDefault()
        state.armStaticAssetPlacement(null)
        return
      }

      if (!hasSelection) return
      event.preventDefault()
      state.selectEntity(null)
      state.selectStaticAsset(null)
      return
    }

    if (!hasCommandModifier && !event.altKey && !event.shiftKey) {
      if ((key === 'delete' || key === 'backspace') && hasSelection) {
        event.preventDefault()
        void deleteSelection()
        return
      }

      if (!hasDraftSelection) return

      if (key === 'g') {
        event.preventDefault()
        state.setTransformMode('translate')
        return
      }

      if (key === 'r') {
        event.preventDefault()
        state.setTransformMode('rotate')
        return
      }

      if (key === 's') {
        event.preventDefault()
        state.setTransformMode('scale')
      }

      return
    }

    if (!hasCommandModifier && !event.altKey && event.shiftKey && key === 'g') {
      event.preventDefault()
      state.setSceneConfig({ showGrid: !state.sceneConfig.showGrid })
      return
    }

    if (!hasCommandModifier && !event.altKey && event.shiftKey && key === 's') {
      event.preventDefault()
      state.setSnapEnabled(!state.snapEnabled)
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])
}
