import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('editor shell layout and control affordances', () => {
  test('keeps toolbar, inspector, and dock as compact overlays inside the canvas frame', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/editor/EditorShell.tsx'),
      'utf8'
    )
    const editorPrimitivesSource = readFileSync(
      join(process.cwd(), 'components/editor/editor-primitives.tsx'),
      'utf8'
    )
    const toolbarSource = readFileSync(
      join(process.cwd(), 'components/editor/EditorToolbar.tsx'),
      'utf8'
    )

    expect(
      source.includes(
        'absolute left-3 z-30 transition-[height,opacity,transform] duration-200'
      )
    ).toBe(true)
    expect(source.includes('collapsed={!resourcesPanelOpen}')).toBe(true)
    expect(
      source.includes(
        'pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-14 md:px-16 lg:px-24'
      )
    ).toBe(true)
    expect(source.includes('flex w-full max-w-[60rem] flex-col items-center gap-1.5')).toBe(true)
    expect(toolbarSource.includes('ProductModuleNav')).toBe(false)
    expect(toolbarSource.includes('模型编辑器')).toBe(true)
    expect(toolbarSource.includes('退出编辑')).toBe(false)
    expect(source.includes('场景建模与发布工作台')).toBe(false)
    expect(
      source.includes(
        'absolute right-3 z-30 hidden transition-[height,opacity,transform] duration-200 lg:block'
      )
    ).toBe(true)
    expect(source.includes('collapsed={inspectorCollapsed}')).toBe(true)
    expect(source.includes('const RESIZE_EDGE_HIT_AREA = 10')).toBe(true)
    expect(source.includes('isPointerNearResizeEdge')).toBe(true)
    expect(source.includes("data-editor-resize-hover={hoveredResizeEdge === 'left'}")).toBe(true)
    expect(source.includes("data-editor-resize-hover={hoveredResizeEdge === 'right'}")).toBe(true)
    expect(source.includes('const [resourcesPanelWidth, setResourcesPanelWidth]')).toBe(true)
    expect(source.includes('const [inspectorPanelWidth, setInspectorPanelWidth]')).toBe(true)
    expect(source.includes('const chromeLeftInset = !isMobile')).toBe(true)
    expect(source.includes('const chromeRightInset = isLargeViewport')).toBe(true)
    expect(source.includes('const chromeOverlayStyle = isLargeViewport')).toBe(true)
    expect(source.includes('const shouldHideFloatingChromeForResources = isMobile && resourcesPanelOpen')).toBe(true)
    expect(source.includes('{!shouldHideFloatingChromeForResources ? (')).toBe(true)
    expect(source.includes('style={chromeOverlayStyle}')).toBe(true)
    expect(source.includes('const shouldShowBootstrapPlaceholder = !hasHydratedFromBootstrap')).toBe(true)
    expect(source.includes('EditorLoadingShell')).toBe(true)
    expect(source.includes('EditorLoadingCard')).toBe(true)
    expect(editorPrimitivesSource.includes('editor-canvas-loading-shell flex h-full w-full items-center justify-center')).toBe(true)
    expect(editorPrimitivesSource.includes('export function EditorInsetBlock')).toBe(true)
    expect(editorPrimitivesSource.includes('export function EditorTreeSectionCard')).toBe(true)
    expect(
      source.includes(
        'absolute inset-x-0 bottom-2.5 z-20 hidden justify-center px-2.5 md:flex'
      )
    ).toBe(true)
  })

  test('provides explicit labels for compact icon controls and operational recovery affordances', () => {
    const toolbarSource = readFileSync(
      join(process.cwd(), 'components/editor/EditorToolbar.tsx'),
      'utf8'
    )
    const previewSource = readFileSync(
      join(process.cwd(), 'components/editor/EditorCatalogRealtimePreview.tsx'),
      'utf8'
    )
    const canvasSource = readFileSync(
      join(process.cwd(), 'components/editor/EditorCanvas.tsx'),
      'utf8'
    )
    const dockSource = readFileSync(
      join(process.cwd(), 'components/editor/EditorViewportDock.tsx'),
      'utf8'
    )
    const chromeSource = readFileSync(
      join(process.cwd(), 'app/editor/editor-global.css'),
      'utf8'
    )
    const sidebarSource = readFileSync(
      join(process.cwd(), 'components/editor/EditorAppSidebar.tsx'),
      'utf8'
    )
    const inspectorSource = readFileSync(
      join(process.cwd(), 'components/editor/EditorInspector.tsx'),
      'utf8'
    )
    const shellSource = readFileSync(
      join(process.cwd(), 'components/editor/EditorShell.tsx'),
      'utf8'
    )

    expect(toolbarSource.includes('title="Switch tool to select"')).toBe(true)
    expect(toolbarSource.includes("from 'zustand/react/shallow'")).toBe(true)
    expect(toolbarSource.includes('useShallow((state) => ({')).toBe(true)
    expect(toolbarSource.includes('title="Switch tool to move"')).toBe(true)
    expect(toolbarSource.includes('title="Switch tool to scale"')).toBe(true)
    expect(toolbarSource.includes('editor-tool-control')).toBe(true)
    expect(toolbarSource.includes('EditorCatalogRealtimePreview')).toBe(true)
    expect(toolbarSource.includes('armedCatalogItem ?')).toBe(true)
    expect(toolbarSource.includes('title="Undo last change"')).toBe(true)
    expect(toolbarSource.includes('title="Redo last change"')).toBe(true)
    expect(toolbarSource.includes('title="Duplicate selected object"')).toBe(true)
    expect(toolbarSource.includes('title="Delete selected object"')).toBe(true)
    expect(toolbarSource.includes('data-editor-session-state={activityStatus.phase}')).toBe(true)
    expect(toolbarSource.includes("activityStatus.phase === 'loading'")).toBe(true)
    expect(toolbarSource.includes('Syncing')).toBe(true)
    expect(toolbarSource.includes('Session')).toBe(true)
    expect(dockSource.includes('title="Toggle grid"')).toBe(true)
    expect(dockSource.includes("from 'zustand/react/shallow'")).toBe(true)
    expect(dockSource.includes('title="Toggle axes"')).toBe(true)
    expect(dockSource.includes("title: 'Focus north view'")).toBe(true)
    expect(dockSource.includes('title="Adjust snap step"')).toBe(true)
    expect(dockSource.includes("label: 'TOP'")).toBe(true)
    expect(dockSource.includes('CAMERA_DIRECTION_CONTROLS.map')).toBe(true)
    expect(dockSource.includes("const DOCK_TEXT_CONTROL_CLASS = 'editor-control shrink-0 gap-1 px-2 text-[12px]'")).toBe(true)
    expect(dockSource.includes('const DOCK_DIRECTION_CONTROL_CLASS =')).toBe(true)
    expect(
      dockSource.includes(
        "'editor-control size-8 shrink-0 p-0 text-[10px] font-semibold leading-none'"
      )
    ).toBe(true)
    expect(dockSource.includes('const DOCK_DIRECTION_LABEL_CLASS =')).toBe(true)
    expect(dockSource.includes('const DOCK_READOUT_CONTROL_CLASS =')).toBe(true)
    expect(dockSource.includes("min-w-[7rem] shrink-0 justify-between gap-1.5 px-2 text-[12px]'")).toBe(true)
    expect(dockSource.includes('w-max max-w-full flex-nowrap')).toBe(true)
    expect(dockSource.includes('w-44 text-[12px]')).toBe(true)
    expect(sidebarSource.includes('Expand resources panel')).toBe(true)
    expect(sidebarSource.includes('Collapse resources panel')).toBe(true)
    expect(sidebarSource.includes('退出编辑')).toBe(true)
    expect(sidebarSource.includes('const STATIC_ASSET_CATALOG_ITEMS = listStaticAssetCatalog()')).toBe(true)
    expect(sidebarSource.includes('const deferredCatalogSearch = useDeferredValue(catalogSearch)')).toBe(true)
    expect(sidebarSource.includes('const deferredSceneSearch = useDeferredValue(sceneSearch)')).toBe(true)
    expect(sidebarSource.includes('startTransition(() => setCatalogSearch(event.target.value))')).toBe(true)
    expect(sidebarSource.includes('startTransition(() => setSceneSearch(event.target.value))')).toBe(true)
    expect(sidebarSource.includes('拖放到画布，或从场景区回选对象')).toBe(false)
    expect(sidebarSource.includes('editor-edge-toggle--left')).toBe(true)
    expect(sidebarSource.includes('editor-control editor-header-icon size-8 shrink-0 rounded-[12px]')).toBe(true)
    expect(sidebarSource.includes('editor-side-edge-control--left')).toBe(false)
    expect(sidebarSource.includes('editor-side-edge-button')).toBe(false)
    expect(sidebarSource.includes('CatalogPreviewTile')).toBe(true)
    expect(sidebarSource.includes('h-10 w-[3.1rem]')).toBe(true)
    expect(sidebarSource.includes('text-[11px] font-medium')).toBe(true)
    expect(sidebarSource.includes('EditorInsetBlock')).toBe(true)
    expect(sidebarSource.includes('EditorTreeSectionCard')).toBe(true)
    expect(sidebarSource.includes('rounded-[12px] border border-white/6 bg-black/10')).toBe(false)
    expect(sidebarSource.includes('rounded-[14px] border border-white/6 bg-white/[0.02]')).toBe(false)
    expect(sidebarSource.includes('拖入')).toBe(false)
    expect(sidebarSource.includes('item.thumbnailUrl')).toBe(true)
    expect(sidebarSource.includes('loading="lazy"')).toBe(true)
    expect(sidebarSource.includes('Math.round(item.dimensions.width)')).toBe(true)
    expect(sidebarSource.includes('场景树')).toBe(true)
    expect(sidebarSource.includes('未分区 / 场景根')).toBe(true)
    expect(inspectorSource.includes('Expand inspector panel')).toBe(true)
    expect(inspectorSource.includes("from 'zustand/react/shallow'")).toBe(true)
    expect(inspectorSource.includes('Collapse inspector panel')).toBe(true)
    expect(inspectorSource.includes('场景设置')).toBe(true)
    expect(inspectorSource.includes('未选中对象时，在此编辑当前工作区的场景参数')).toBe(true)
    expect(inspectorSource.includes('工作区场景')).toBe(true)
    expect(inspectorSource.includes("summaryBadge={isDirty ? '未保存' : '场景'}")).toBe(true)
    expect(inspectorSource.includes('editor-edge-toggle--right')).toBe(true)
    expect(inspectorSource.includes('editor-control editor-header-icon size-7 shrink-0 rounded-[8px]')).toBe(true)
    expect(inspectorSource.includes('editor-side-edge-control--right')).toBe(false)
    expect(inspectorSource.includes('editor-side-edge-button')).toBe(false)
    expect(inspectorSource.includes("label=\"Camera\"")).toBe(false)
    expect(inspectorSource.includes("label=\"Snap\"")).toBe(false)
    expect(inspectorSource.includes("label=\"Show Grid\"")).toBe(false)
    expect(inspectorSource.includes("label=\"Show Axes\"")).toBe(false)
    expect(inspectorSource.includes("label=\"Transform Snap\"")).toBe(false)
    expect(shellSource.includes('const canRetryCurrentOperation = Boolean(activityStatus.canRetry && activityStatus.retryAction)')).toBe(true)
    expect(shellSource.includes('void retryActivity()')).toBe(true)
    expect(shellSource.includes("title={activityStatus.retryLabel ?? '重试当前操作'}")).toBe(true)
    expect(shellSource.includes("aria-label={activityStatus.retryLabel ?? '重试当前操作'}")).toBe(true)
    expect(shellSource.includes('activityStatus={activityStatus}')).toBe(true)
    expect(shellSource.includes('pointer-events-auto w-full max-w-[21rem] self-end xl:mt-1')).toBe(true)
    expect(shellSource.includes('EditorStatusNotice')).toBe(true)
    expect(shellSource.includes('rounded-[16px] border px-3 py-2 backdrop-blur-xl')).toBe(false)
    expect(chromeSource.includes('.editor-surface .editor-status-notice')).toBe(true)
    expect(canvasSource.includes('absolute bottom-3 right-3')).toBe(true)
    expect(canvasSource.includes('EditorFloatingHintCard')).toBe(true)
    expect(canvasSource.includes('rounded-[16px] border border-white/10')).toBe(false)
    expect(canvasSource.includes("from 'zustand/react/shallow'")).toBe(true)
    expect(canvasSource.includes('Shift + 左键框选')).toBe(true)
    expect(canvasSource.includes('左键拖动画面')).toBe(true)
    expect(previewSource.includes('getPreviewCameraConfig')).toBe(true)
    expect(previewSource.includes('const [isAutoSpinning, setIsAutoSpinning] = useState(true)')).toBe(true)
    expect(previewSource.includes("const shouldAnimatePreview = !isPaused && (isHovered || isAutoSpinning)")).toBe(true)
    expect(previewSource.includes("frameloop={shouldAnimatePreview ? 'always' : 'demand'}")).toBe(true)
    expect(previewSource.includes('window.setTimeout(() => {')).toBe(true)
    expect(previewSource.includes('Pause preview rotation')).toBe(true)
    expect(previewSource.includes('Switch preview to wireframe mode')).toBe(true)
    expect(previewSource.includes('Canvas')).toBe(true)
    expect(previewSource.includes('useFrame')).toBe(true)
    expect(previewSource.includes('useThree')).toBe(true)
    expect(previewSource.includes('resolvePreviewFocusPoint')).toBe(true)
    expect(previewSource.includes('resolvePreviewFrameRadius')).toBe(true)
    expect(previewSource.includes('resolvePreviewScale')).toBe(true)
    expect(previewSource.includes('useLayoutEffect')).toBe(true)
    expect(previewSource.includes('const aspectRatio = size.width / Math.max(size.height, 1)')).toBe(true)
    expect(previewSource.includes('position: previewConfig.cameraPosition')).toBe(true)
    expect(previewSource.includes('fov: previewConfig.fov')).toBe(true)
    expect(previewSource.includes('new THREE.Box3().setFromObject(contentRef.current)')).toBe(true)
    expect(previewSource.includes('camera.lookAt(0, 0, 0)')).toBe(true)
    expect(previewSource.includes('powerPreference')).toBe(true)
    expect(previewSource.includes('EditorRealtimePreviewFrame')).toBe(true)
    expect(previewSource.includes('rounded-[16px] border border-[#7da7ff]/18')).toBe(false)
    expect(chromeSource.includes('.editor-surface .editor-realtime-preview-frame')).toBe(true)
    expect(chromeSource.includes('.editor-surface .editor-dock {')).toBe(true)
    expect(chromeSource.includes('min-height: 48px;')).toBe(true)
    expect(chromeSource.includes('width: max-content;')).toBe(true)
    expect(chromeSource.includes('backdrop-filter: blur(6px);')).toBe(true)
    expect(chromeSource.includes('scrollbar-width: none;')).toBe(true)
    expect(chromeSource.includes('.editor-surface .editor-dock-group + .editor-dock-group {')).toBe(true)
    expect(chromeSource.includes('.editor-surface .editor-dock .editor-control {')).toBe(true)
    expect(chromeSource.includes('height: 32px;')).toBe(true)
    expect(chromeSource.includes('font-size: 12px;')).toBe(true)
  })
})
