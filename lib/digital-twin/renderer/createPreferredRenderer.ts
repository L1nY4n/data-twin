import * as THREE from 'three'

export type PreferredRendererMode = 'auto' | 'webgpu' | 'webgl2'
export type PreferredRendererBackend = 'webgpu' | 'webgl2'

interface CreatePreferredRendererOptions {
  mode: PreferredRendererMode
  antialias: boolean
  alpha: boolean
}

interface GLDefaults {
  canvas: HTMLCanvasElement | OffscreenCanvas
}

type AnyRenderer = THREE.WebGLRenderer & { __backend?: PreferredRendererBackend }

async function tryCreateWebGpuRenderer(
  defaults: GLDefaults,
  options: CreatePreferredRendererOptions
): Promise<AnyRenderer | null> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return null

  try {
    if (!(defaults.canvas instanceof HTMLCanvasElement)) return null

    const webgpuModule = await import('three/webgpu')
    const WebGPURenderer = (webgpuModule as Record<string, unknown>).WebGPURenderer as
      | (new (params: { canvas: HTMLCanvasElement; antialias: boolean; alpha: boolean }) => AnyRenderer)
      | undefined

    if (!WebGPURenderer) return null

    const renderer = new WebGPURenderer({
      canvas: defaults.canvas,
      antialias: options.antialias,
      alpha: options.alpha,
    })

    const maybeInit = renderer as unknown as { init?: () => Promise<void> }
    if (typeof maybeInit.init === 'function') {
      await maybeInit.init()
    }

    ;(renderer as unknown as { outputColorSpace?: THREE.ColorSpace }).outputColorSpace = THREE.SRGBColorSpace
    ;(renderer as unknown as { toneMapping?: THREE.ToneMapping }).toneMapping = THREE.ACESFilmicToneMapping
    renderer.__backend = 'webgpu'
    return renderer
  } catch {
    return null
  }
}

function createWebGlRenderer(defaults: GLDefaults, options: CreatePreferredRendererOptions): AnyRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas: defaults.canvas,
    antialias: options.antialias,
    alpha: options.alpha,
    powerPreference: 'high-performance',
  }) as AnyRenderer

  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.__backend = 'webgl2'
  return renderer
}

export async function createPreferredRenderer(
  defaults: GLDefaults,
  options: CreatePreferredRendererOptions
): Promise<AnyRenderer> {
  if (options.mode !== 'webgl2') {
    const webGpuRenderer = await tryCreateWebGpuRenderer(defaults, options)
    if (webGpuRenderer) return webGpuRenderer
  }

  return createWebGlRenderer(defaults, options)
}
