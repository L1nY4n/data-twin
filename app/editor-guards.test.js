import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('editor guards', () => {
  test('editor should live on a separate route with its own shell and local panel layout', () => {
    const page = readFileSync(join(process.cwd(), 'app/editor/page.tsx'), 'utf8')
    const canonicalEditorPage = readFileSync(
      join(process.cwd(), 'app/workspaces/[workspaceSlug]/editor/page.tsx'),
      'utf8'
    )
    const workspacePage = readFileSync(
      join(process.cwd(), 'app/editor/[workspaceId]/page.tsx'),
      'utf8'
    )
    const editorRouting = readFileSync(
      join(process.cwd(), 'lib/digital-twin/editor-routing.ts'),
      'utf8'
    )
    const shell = readFileSync(
      join(process.cwd(), 'components/editor/EditorShell.tsx'),
      'utf8'
    )
    const toolbar = readFileSync(
      join(process.cwd(), 'components/editor/EditorToolbar.tsx'),
      'utf8'
    )
    const sidebar = readFileSync(
      join(process.cwd(), 'components/editor/EditorAppSidebar.tsx'),
      'utf8'
    )

    expect(page.includes('fetchHomeWorkspace')).toBe(true)
    expect(page.includes('redirect(buildEditorHref(workspace.slug, query.returnTo))')).toBe(true)
    expect(canonicalEditorPage.includes('EditorShell')).toBe(true)
    expect(canonicalEditorPage.includes('fetchWorkspaceBySlug')).toBe(true)
    expect(canonicalEditorPage.includes('workspaceId={workspace.id}')).toBe(true)
    expect(workspacePage.includes('fetchWorkspaceById')).toBe(true)
    expect(workspacePage.includes('redirect(buildEditorHref(workspace.slug, query.returnTo))')).toBe(true)
    expect(editorRouting.includes('export function buildEditorHref')).toBe(true)
    expect(editorRouting.includes("const basePath = workspaceSlug")).toBe(true)
    expect(editorRouting.includes("'/editor'")).toBe(true)
    expect(shell.includes('SidebarProvider')).toBe(false)
    expect(shell.includes('EditorAppSidebar')).toBe(true)
    expect(shell.includes('EditorToolbar')).toBe(true)
    expect(shell.includes('场景建模与发布工作台')).toBe(false)
    expect(shell.includes('在统一工作区内完成资源摆放、属性编辑与发布协同')).toBe(false)
    expect(toolbar.includes('ProductModuleNav')).toBe(false)
    expect(toolbar.includes('模型编辑器')).toBe(true)
    expect(toolbar.includes('退出编辑')).toBe(false)
    expect(toolbar.includes('sceneConfig.id')).toBe(true)
    expect(toolbar.includes('workspaceHint')).toBe(false)
    expect(toolbar.includes('returnHref')).toBe(false)
    expect(toolbar.includes('resolvedReturnHref')).toBe(false)
    expect(shell.includes('EditorCanvas')).toBe(true)
    expect(shell.includes('resourcesPanelOpen')).toBe(true)
    expect(sidebar.includes('资源库 / 场景')).toBe(true)
    expect(sidebar.includes('退出编辑')).toBe(true)
    expect(sidebar.includes('resolvedReturnHref')).toBe(true)
    expect(sidebar.includes('拖放到画布，或从场景区回选对象')).toBe(false)
    expect(sidebar.includes('/admin/overview')).toBe(false)
    expect(sidebar.includes('搜索墙体、门、摄像头、传感器、温控器')).toBe(true)
    expect(sidebar.includes('EDITOR_CATALOG_TRANSFER_MIME')).toBe(true)
    expect(sidebar.includes('buildEditorSceneTree')).toBe(true)
    expect(sidebar.includes('未分区 / 场景根')).toBe(true)
    expect(sidebar.includes("from '@/components/ui/sidebar'")).toBe(false)
  })

  test('viewer should remain on the live runtime path and not import editor state', () => {
    const viewerPage = readFileSync(
      join(process.cwd(), 'components/digital-twin/DigitalTwinViewerPage.tsx'),
      'utf8'
    )

    expect(viewerPage.includes('useLiveDigitalTwin')).toBe(true)
    expect(viewerPage.includes('EditorShell')).toBe(false)
    expect(viewerPage.includes('editor-store')).toBe(false)
  })

  test('editor should use transform controls with dedicated bootstrap, save flow, and explicit publish flow', () => {
    const canvas = readFileSync(
      join(process.cwd(), 'components/editor/EditorCanvas.tsx'),
      'utf8'
    )
    const shell = readFileSync(
      join(process.cwd(), 'components/editor/EditorShell.tsx'),
      'utf8'
    )
    const gizmo = readFileSync(
      join(process.cwd(), 'components/editor/scene/EditorTransformGizmo.tsx'),
      'utf8'
    )
    const picking = readFileSync(
      join(process.cwd(), 'components/editor/scene/EditorScenePicking.tsx'),
      'utf8'
    )
    const hook = readFileSync(
      join(process.cwd(), 'hooks/use-editor-digital-twin.ts'),
      'utf8'
    )
    const entityLayer = readFileSync(
      join(process.cwd(), 'components/editor/scene/EditorEntityLayer.tsx'),
      'utf8'
    )
    const authoredStaticAssetLayer = readFileSync(
      join(process.cwd(), 'components/editor/scene/EditorAuthoredStaticAssetLayer.tsx'),
      'utf8'
    )
    const inspector = readFileSync(
      join(process.cwd(), 'components/editor/EditorInspector.tsx'),
      'utf8'
    )
    const store = readFileSync(
      join(process.cwd(), 'lib/digital-twin/editor-store.ts'),
      'utf8'
    )

    expect(gizmo.includes('TransformControls')).toBe(true)
    expect(gizmo.includes('useEditorSceneStore')).toBe(true)
    expect(gizmo.includes('useEditorUiStore')).toBe(true)
    expect(gizmo.includes('const isTransformDragging = useEditorUiStore((state) => state.isTransformDragging)')).toBe(true)
    expect(gizmo.includes('if (!draftTarget || !targetRef.current || isTransformDragging) return')).toBe(true)
    expect(gizmo.includes('position={[draftTarget.position.x')).toBe(false)
    expect(gizmo.includes('setEditorCanvasControlsEnabled(orbitControlsRef.current, false)')).toBe(true)
    expect(gizmo.includes('setEditorCanvasControlsEnabled(orbitControlsRef.current, true)')).toBe(true)
    expect(canvas.includes('orbitControlsRef={controlsRef}')).toBe(true)
    expect(canvas.includes('resolveEditorOrbitMouseButtons')).toBe(false)
    expect(canvas.includes('shouldLockEditorCameraDuringTransform')).toBe(false)
    expect(canvas.includes('lockedCameraPoseRef')).toBe(true)
    expect(canvas.includes('mouseButtons={DEFAULT_ORBIT_MOUSE_BUTTONS}')).toBe(true)
    expect(canvas.includes('const hasActiveTransformTarget = Boolean(draftStaticAsset ?? draftEntity)')).toBe(true)
    expect(canvas.includes('makeDefault')).toBe(true)
    expect(canvas.includes('set({ controls })')).toBe(true)
    expect(canvas.includes('useEditorSceneStore')).toBe(true)
    expect(canvas.includes('useEditorViewerStore')).toBe(true)
    expect(canvas.includes('useEditorUiStore')).toBe(true)
    expect(picking.includes('event.shiftKey')).toBe(true)
    expect(picking.includes('stopImmediatePropagation')).toBe(true)
    expect(picking.includes('suppressClickRef')).toBe(true)
    expect(picking.includes('resolveEditorMarqueeTarget')).toBe(true)
    expect(picking.includes('const transformPreview = useEditorUiStore((state) => state.transformPreview)')).toBe(true)
    expect(picking.includes('useEditorSceneStore')).toBe(true)
    expect(picking.includes('useEditorViewerStore')).toBe(true)
    expect(picking.includes('useEditorUiStore')).toBe(true)
    expect(entityLayer.includes('const transformPreview = useEditorUiStore((state) => state.transformPreview)')).toBe(true)
    expect(entityLayer.includes('if (!isTransformDragging || !transformPreview) return draftEntity')).toBe(true)
    expect(authoredStaticAssetLayer.includes('const transformPreview = useEditorUiStore((state) => state.transformPreview)')).toBe(true)
    expect(authoredStaticAssetLayer.includes('const renderedDraftStaticAsset =')).toBe(true)
    expect(hook.includes('fetchEditorBootstrap')).toBe(true)
    expect(hook.includes('fetchAdminPublishStatus')).toBe(true)
    expect(hook.includes('triggerAdminPublish')).toBe(true)
    expect(hook.includes('saveAdminEditorDrafts')).toBe(true)
    expect(hook.includes('updateAdminScene')).toBe(false)
    expect(hook.includes('createAdminEntity')).toBe(false)
    expect(hook.includes('deleteAdminEntity')).toBe(true)
    expect(hook.includes('updateAdminEntity')).toBe(false)
    expect(hook.includes('updateAdminStaticAsset')).toBe(false)
    expect(hook.includes('createEditorSaveRequest')).toBe(true)
    expect(hook.includes('createEditorSceneSavePayload')).toBe(true)
    expect(hook.includes('restoreSelectionAfterReload')).toBe(true)
    expect(hook.includes('getEditorSceneState')).toBe(true)
    expect(hook.includes('getEditorViewerState')).toBe(true)
    expect(hook.includes('getEditorUiState')).toBe(true)
    expect(hook.includes('error.status === 409')).toBe(true)
    expect(hook.includes('const hasSceneChanges = store.hasSceneChanges')).toBe(true)
    expect(hook.includes('activityStatus')).toBe(true)
    expect(hook.includes('createStandardRoomStaticAssets')).toBe(true)
    expect(hook.includes('createStandardRoom')).toBe(true)
    expect(shell.includes('onCreateStandardRoom={() => void createStandardRoom()}')).toBe(true)
    expect(inspector.includes('创建标准房间')).toBe(true)
    expect(store.includes('undo')).toBe(true)
    expect(store.includes('redo')).toBe(true)
    expect(store.includes('resetDraft')).toBe(true)
    expect(store.includes('duplicateSelection')).toBe(true)
    expect(store.includes('hasSceneChanges')).toBe(true)
    expect(store.includes('hasSelectionChanges')).toBe(true)
    expect(store.includes('buildEditorSceneSavePayload')).toBe(true)
    expect(store.includes('savedSceneConfig')).toBe(true)
    expect(store.includes('setEditorCameraPose')).toBe(true)
    expect(store.includes('editorCameraPosition')).toBe(true)
    expect(store.includes('editorCameraTarget')).toBe(true)
    expect(store.includes('updateDraftMetadata')).toBe(true)
    expect(store.includes('focusCameraDirection')).toBe(true)
    expect(store.includes('hydrateFromBootstrap')).toBe(true)
    expect(store.includes('if (!hasSnapshotChanged(currentSnapshot, snapshot)) {')).toBe(true)
    expect(store.includes('export type EditorSceneStoreSlice')).toBe(true)
    expect(store.includes('export type EditorViewerStoreSlice')).toBe(true)
    expect(store.includes('export type EditorUiStoreSlice')).toBe(true)
    expect(store.includes('export function useEditorSceneStore')).toBe(true)
    expect(store.includes('export function useEditorViewerStore')).toBe(true)
    expect(store.includes('export function useEditorUiStore')).toBe(true)
  })

  test('editor canvas should avoid continuous idle rendering while preserving camera focus animation', () => {
    const canvas = readFileSync(
      join(process.cwd(), 'components/editor/EditorCanvas.tsx'),
      'utf8'
    )

    expect(canvas.includes("import { Canvas, useFrame, useThree } from '@react-three/fiber'")).toBe(
      true
    )
    expect(canvas.includes("import { OrbitControls as OrbitControlsImpl } from 'three-stdlib'")).toBe(
      true
    )
    expect(canvas.includes("const invalidate = useThree((state) => state.invalidate)")).toBe(true)
    expect(canvas.includes('frameloop="demand"')).toBe(true)
    expect(canvas.includes('focusAnimationRef.current = {')).toBe(true)
    expect(canvas.includes('clearCameraFocusRequest()')).toBe(true)
    expect(canvas.includes('invalidate()')).toBe(true)
    expect(canvas.includes('new OrbitControlsImpl(camera, gl.domElement)')).toBe(true)
    expect(canvas.includes('const settleRequestedRef = useRef(false)')).toBe(true)
    expect(canvas.includes('const finishSettledInteraction = () => {')).toBe(true)
    expect(canvas.includes('settleRequestedRef.current = true')).toBe(true)
    expect(canvas.includes('onRestRef.current()')).toBe(true)
    expect(canvas.includes('window.requestAnimationFrame(stepControls)')).toBe(true)
    expect(canvas.includes("controls.addEventListener('start', handleStart)")).toBe(true)
    expect(canvas.includes("controls.addEventListener('end', handleEnd)")).toBe(true)
    expect(canvas.includes('const persistCameraPose = useCallback(() => {')).toBe(true)
    expect(canvas.includes('const setEditorCameraPose = useEditorViewerStore((state) => state.setEditorCameraPose)')).toBe(true)
    expect(canvas.includes('editorCameraPosition.x')).toBe(true)
    expect(canvas.includes('editorCameraTarget.x')).toBe(true)
    expect(canvas.includes('resolveEditorCanvasHintCopy')).toBe(true)
    expect(canvas.includes('enabled={!isTransformDragging && !isMarqueeSelecting}')).toBe(true)
    expect(canvas.includes('const lockedPose = lockedCameraPoseRef.current')).toBe(true)
    expect(canvas.includes('TransformControls claims, so pin the pose for the active gizmo drag.')).toBe(true)
    expect(canvas.includes("powerPreference: 'low-power'")).toBe(true)
  })

  test('top viewport shortcut should only refocus the camera and must not lock orbit controls', () => {
    const canvas = readFileSync(
      join(process.cwd(), 'components/editor/EditorCanvas.tsx'),
      'utf8'
    )
    const store = readFileSync(
      join(process.cwd(), 'lib/digital-twin/editor-store.ts'),
      'utf8'
    )

    expect(canvas.includes("maxPolarAngle={Math.PI / 2.05}")).toBe(true)
    expect(canvas.includes("viewMode === 'topdown'")).toBe(false)
    expect(store.includes("viewMode: direction === 'top' ? 'topdown' : 'orbit'")).toBe(false)
    expect(store.includes("focusCameraDirection: (direction) =>")).toBe(true)
    expect(store.includes('cameraFocusRequest: focusRequest')).toBe(true)
  })

  test('viewer should only refresh from publish-scoped config changes or descriptor swaps', () => {
    const hook = readFileSync(
      join(process.cwd(), 'hooks/use-live-digital-twin.ts'),
      'utf8'
    )

    expect(hook.includes("configChanged.scope === 'publish'")).toBe(true)
    expect(hook.includes('hasPublishedSceneUpdate')).toBe(true)
    expect(hook.includes('hasSceneVersionUpdate')).toBe(false)
  })
})
