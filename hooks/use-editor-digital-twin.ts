'use client'

import { useCallback, useEffect } from 'react'
import {
  createAdminStaticAsset,
  deleteAdminStaticAsset,
  fetchBootstrap,
  updateAdminEntity,
  updateAdminStaticAsset,
} from '@/lib/digital-twin/bootstrap-client'
import {
  getEditorSelectionKind,
  useEditorDigitalTwinStore,
} from '@/lib/digital-twin/editor-store'
import {
  DEFAULT_PUBLISHED_SCENE_PACKAGE,
  loadPublishedScenePackage,
  withVersionedPublishedScenePackage,
} from '@/lib/digital-twin/publish'
import type { PublishedSceneRuntimeDescriptor } from '@/lib/digital-twin/types'

async function resolvePublishedScenePackage(
  publishedScene?: PublishedSceneRuntimeDescriptor | null
) {
  if (!publishedScene) return DEFAULT_PUBLISHED_SCENE_PACKAGE

  const pkg = await loadPublishedScenePackage(
    publishedScene.packageUrl,
    publishedScene.packageVersion
  )

  return (
    pkg ??
    withVersionedPublishedScenePackage(
      DEFAULT_PUBLISHED_SCENE_PACKAGE,
      publishedScene.packageVersion
    )
  )
}

export function useEditorDigitalTwin() {
  const selectedEntityId = useEditorDigitalTwinStore((state) => state.selectedEntityId)
  const selectedStaticAssetId = useEditorDigitalTwinStore(
    (state) => state.selectedStaticAssetId
  )
  const draftEntity = useEditorDigitalTwinStore((state) => state.draftEntity)
  const draftStaticAsset = useEditorDigitalTwinStore((state) => state.draftStaticAsset)
  const savedStaticAsset = useEditorDigitalTwinStore((state) => state.savedStaticAsset)

  const reload = useCallback(async () => {
    const store = useEditorDigitalTwinStore.getState()
    store.setLoading(true)

    try {
      const payload = await fetchBootstrap()
      const publishedScenePackage = await resolvePublishedScenePackage(payload.publishedScene)
      useEditorDigitalTwinStore.getState().hydrateFromBootstrap(payload, publishedScenePackage)
      useEditorDigitalTwinStore.getState().setError(null)
    } catch (error) {
      useEditorDigitalTwinStore
        .getState()
        .setError(error instanceof Error ? error.message : '加载 3D 编辑器数据失败')
    } finally {
      useEditorDigitalTwinStore.getState().setLoading(false)
    }
  }, [])

  const saveSelection = useCallback(async () => {
    const store = useEditorDigitalTwinStore.getState()
    const selectionKind = getEditorSelectionKind(store)
    if (!selectionKind) return false
    store.setSaving(true)

    try {
      if (selectionKind === 'entity') {
        if (!selectedEntityId || !draftEntity) return false
        await updateAdminEntity(selectedEntityId, draftEntity)
      } else {
        if (!selectedStaticAssetId || !draftStaticAsset) return false
        if (savedStaticAsset) {
          await updateAdminStaticAsset(selectedStaticAssetId, draftStaticAsset)
        } else {
          await createAdminStaticAsset(draftStaticAsset)
        }
      }
      await reload()
      if (selectionKind === 'entity' && selectedEntityId) {
        useEditorDigitalTwinStore.getState().selectEntity(selectedEntityId)
      }
      if (selectionKind === 'static-asset' && selectedStaticAssetId) {
        useEditorDigitalTwinStore.getState().selectStaticAsset(selectedStaticAssetId)
      }
      return true
    } catch (error) {
      useEditorDigitalTwinStore
        .getState()
        .setError(error instanceof Error ? error.message : '保存编辑内容失败')
      return false
    } finally {
      useEditorDigitalTwinStore.getState().setSaving(false)
    }
  }, [
    draftEntity,
    draftStaticAsset,
    reload,
    savedStaticAsset,
    selectedEntityId,
    selectedStaticAssetId,
  ])

  const deleteSelection = useCallback(async () => {
    if (!selectedStaticAssetId) return false

    const store = useEditorDigitalTwinStore.getState()
    if (!store.savedStaticAsset) {
      store.resetDraft()
      return true
    }

    store.setSaving(true)

    try {
      await deleteAdminStaticAsset(selectedStaticAssetId)
      await reload()
      return true
    } catch (error) {
      useEditorDigitalTwinStore
        .getState()
        .setError(error instanceof Error ? error.message : '删除静态资产失败')
      return false
    } finally {
      useEditorDigitalTwinStore.getState().setSaving(false)
    }
  }, [reload, selectedStaticAssetId])

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    reload,
    saveSelection,
    deleteSelection,
  }
}
