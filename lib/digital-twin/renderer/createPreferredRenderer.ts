import * as THREE from 'three'

export type PreferredRendererMode = 'auto' | 'webgpu' | 'webgl2'
export type PreferredRendererBackend = 'webgpu' | 'webgl2'
export type PreferredRendererPowerPreference = 'default' | 'high-performance' | 'low-power'
export type PreferredRendererFallbackReason =
  | 'webgpu-insecure-context'
  | 'navigator-gpu-unavailable'
  | 'html-canvas-required'
  | 'webgpu-renderer-missing'
  | 'webgpu-init-failed'
  | 'webgl-init-failed'

export interface PreferredRendererDiagnostics {
  requestedMode: PreferredRendererMode
  backend: PreferredRendererBackend
  webgpuAvailable: boolean
  fallbackReason: PreferredRendererFallbackReason | null
  message: string | null
}

interface CreatePreferredRendererOptions {
  mode: PreferredRendererMode
  antialias: boolean
  alpha: boolean
  powerPreference?: PreferredRendererPowerPreference
}

interface GLDefaults {
  canvas: HTMLCanvasElement | OffscreenCanvas
}

type AnyRenderer = THREE.WebGLRenderer & {
  __backend?: PreferredRendererBackend
  __diagnostics?: PreferredRendererDiagnostics
}

interface WebGpuRendererAttempt {
  renderer: AnyRenderer | null
  diagnostics: PreferredRendererDiagnostics
}

const WEBGPU_INIT_TIMEOUT_MS = 2500

function describeRendererError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function withRendererTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeoutId)
        reject(error)
      }
    )
  })
}

function isWebGpuSecureContext() {
  return typeof window === 'undefined' || window.isSecureContext
}

function createDiagnostics(
  options: CreatePreferredRendererOptions,
  backend: PreferredRendererBackend,
  fallbackReason: PreferredRendererFallbackReason | null,
  message: string | null = null
): PreferredRendererDiagnostics {
  return {
    requestedMode: options.mode,
    backend,
    webgpuAvailable: typeof navigator !== 'undefined' && 'gpu' in navigator,
    fallbackReason,
    message,
  }
}

function attachRendererDiagnostics(
  renderer: AnyRenderer,
  diagnostics: PreferredRendererDiagnostics
) {
  renderer.__backend = diagnostics.backend
  renderer.__diagnostics = diagnostics
  return renderer
}

async function tryCreateWebGpuRenderer(
  defaults: GLDefaults,
  options: CreatePreferredRendererOptions
): Promise<WebGpuRendererAttempt> {
  if (!isWebGpuSecureContext()) {
    return {
      renderer: null,
      diagnostics: createDiagnostics(
        options,
        'webgl2',
        'webgpu-insecure-context',
        'WebGPU requires HTTPS or a secure localhost context.'
      ),
    }
  }

  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return {
      renderer: null,
      diagnostics: createDiagnostics(options, 'webgl2', 'navigator-gpu-unavailable'),
    }
  }

  let renderer: AnyRenderer | null = null

  try {
    if (!(defaults.canvas instanceof HTMLCanvasElement)) {
      return {
        renderer: null,
        diagnostics: createDiagnostics(options, 'webgl2', 'html-canvas-required'),
      }
    }

    const webgpuModule = await import('three/webgpu')
    const WebGPURenderer = (webgpuModule as Record<string, unknown>).WebGPURenderer as
      | (new (params: { canvas: HTMLCanvasElement; antialias: boolean; alpha: boolean }) => AnyRenderer)
      | undefined

    if (!WebGPURenderer) {
      return {
        renderer: null,
        diagnostics: createDiagnostics(options, 'webgl2', 'webgpu-renderer-missing'),
      }
    }

    renderer = new WebGPURenderer({
      canvas: defaults.canvas,
      antialias: options.antialias,
      alpha: options.alpha,
    })

    const maybeInit = renderer as unknown as { init?: () => Promise<void> }
    if (typeof maybeInit.init === 'function') {
      await withRendererTimeout(
        maybeInit.init(),
        WEBGPU_INIT_TIMEOUT_MS,
        `WebGPU renderer init timed out after ${WEBGPU_INIT_TIMEOUT_MS}ms.`
      )
    }

    ;(renderer as unknown as { outputColorSpace?: THREE.ColorSpace }).outputColorSpace = THREE.SRGBColorSpace
    ;(renderer as unknown as { toneMapping?: THREE.ToneMapping }).toneMapping = THREE.ACESFilmicToneMapping
    return {
      renderer: attachRendererDiagnostics(
        renderer,
        createDiagnostics(options, 'webgpu', null)
      ),
      diagnostics: createDiagnostics(options, 'webgpu', null),
    }
  } catch (error) {
    renderer?.dispose()
    return {
      renderer: null,
      diagnostics: createDiagnostics(
        options,
        'webgl2',
        'webgpu-init-failed',
        describeRendererError(error)
      ),
    }
  }
}

function configureWebGlRenderer(
  renderer: AnyRenderer,
  diagnostics: PreferredRendererDiagnostics
) {
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  return attachRendererDiagnostics(renderer, diagnostics)
}

function createWebGlRenderer(
  defaults: GLDefaults,
  options: CreatePreferredRendererOptions,
  fallbackDiagnostics?: PreferredRendererDiagnostics
): AnyRenderer {
  const diagnostics =
    fallbackDiagnostics ?? createDiagnostics(options, 'webgl2', null)
  try {
    return configureWebGlRenderer(
      new THREE.WebGLRenderer({
        canvas: defaults.canvas,
        antialias: options.antialias,
        alpha: options.alpha,
        powerPreference: options.powerPreference ?? 'high-performance',
      }) as AnyRenderer,
      diagnostics
    )
  } catch (error) {
    return configureWebGlRenderer(
      new THREE.WebGLRenderer({
        canvas: defaults.canvas,
        antialias: false,
        alpha: options.alpha,
        powerPreference: 'default',
      }) as AnyRenderer,
      {
        ...diagnostics,
        fallbackReason: 'webgl-init-failed',
        message: describeRendererError(error),
      }
    )
  }
}

export async function createPreferredRenderer(
  defaults: GLDefaults,
  options: CreatePreferredRendererOptions
): Promise<AnyRenderer> {
  if (options.mode === 'webgpu') {
    const webGpuAttempt = await tryCreateWebGpuRenderer(defaults, options)
    if (webGpuAttempt.renderer) return webGpuAttempt.renderer
    return createWebGlRenderer(defaults, options, webGpuAttempt.diagnostics)
  }

  return createWebGlRenderer(defaults, options)
}
