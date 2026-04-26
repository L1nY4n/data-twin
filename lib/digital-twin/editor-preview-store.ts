import { create } from 'zustand'
import type { EditorTransformSnapshot } from './editor-store'

interface EditorPreviewState {
  transformPreview: EditorTransformSnapshot | null
}

interface EditorPreviewActions {
  setTransformPreview: (preview: EditorTransformSnapshot | null) => void
  reset: () => void
}

type EditorPreviewStore = EditorPreviewState & EditorPreviewActions

function cloneVector(value: { x: number; y: number; z: number }) {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  }
}

export function cloneEditorTransformSnapshot(
  snapshot: EditorTransformSnapshot
): EditorTransformSnapshot {
  return {
    position: cloneVector(snapshot.position),
    rotation: cloneVector(snapshot.rotation),
    scale: cloneVector(snapshot.scale),
    routeTrack: snapshot.routeTrack
      ? JSON.parse(JSON.stringify(snapshot.routeTrack))
      : undefined,
    trackPosition: snapshot.trackPosition
      ? JSON.parse(JSON.stringify(snapshot.trackPosition))
      : undefined,
  }
}

const initialState: EditorPreviewState = {
  transformPreview: null,
}

export const useEditorPreviewStore = create<EditorPreviewStore>((set) => ({
  ...initialState,
  setTransformPreview: (transformPreview) =>
    set({
      transformPreview: transformPreview
        ? cloneEditorTransformSnapshot(transformPreview)
        : null,
    }),
  reset: () => set(initialState),
}))
