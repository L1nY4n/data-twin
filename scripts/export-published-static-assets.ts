#!/usr/bin/env bun

import { execFile as execFileCallback } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { Group, Mesh, MeshStandardMaterial } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import {
  createPublishedCampusScenePackage,
  createPublishedStaticAssetManifest,
  encodePublishedStaticMaterialName,
  encodePublishedStaticMeshName,
  PUBLISHED_STATIC_ASSET_BASE_URL,
  resolvePublishedStaticAssetManifestUrl,
  type PublishedStaticAssetCompression,
  type PublishedStaticMaterialRef,
} from '../lib/digital-twin/publish'
import {
  buildPublishedStaticRenderBatches,
  disposePublishedStaticRenderBatches,
} from '../lib/digital-twin/runtime/static/render-batches'

const execFile = promisify(execFileCallback)

const EXPORT_PALETTE = {
  ground: '#0d1620',
  slab: '#1a2430',
  slabAlt: '#212c39',
  curb: '#4d5f73',
  steel: '#54789c',
  steelDark: '#29425b',
  vessel: '#97a9bb',
  pipe: '#72859a',
  road: '#293140',
  stripe: '#cbd5e1',
  canopy: '#2e5577',
  building: '#566170',
  water: '#24506b',
  warning: '#f59e0b',
  flare: '#f97316',
  power: '#cbd5e1',
} as const

interface ExportOptions {
  compression: PublishedStaticAssetCompression
}

class BunFileReader {
  static readonly EMPTY = 0
  static readonly LOADING = 1
  static readonly DONE = 2

  result: ArrayBuffer | null = null
  error: unknown = null
  onloadend: ((event: { target: BunFileReader }) => void) | null = null
  onerror: ((error: unknown) => void) | null = null

  readAsArrayBuffer(blob: Blob) {
    void blob
      .arrayBuffer()
      .then((result) => {
        this.result = result
        this.onloadend?.({ target: this })
      })
      .catch((error) => {
        this.error = error
        this.onerror?.(error)
        this.onloadend?.({ target: this })
      })
  }
}

if (!('FileReader' in globalThis)) {
  ;(globalThis as unknown as { FileReader?: typeof BunFileReader }).FileReader = BunFileReader
}

function resolveMaterialProps(material: PublishedStaticMaterialRef) {
  return {
    color: EXPORT_PALETTE[material.token],
    metalness: material.metalness,
    roughness: material.roughness,
    ...(material.emissiveToken ? { emissive: EXPORT_PALETTE[material.emissiveToken] } : {}),
    ...(typeof material.emissiveIntensity === 'number'
      ? { emissiveIntensity: material.emissiveIntensity }
      : {}),
    ...(typeof material.opacity === 'number' ? { opacity: material.opacity } : {}),
    ...(typeof material.transparent === 'boolean'
      ? { transparent: material.transparent }
      : typeof material.opacity === 'number' && material.opacity < 1
        ? { transparent: true }
        : {}),
  }
}

function urlToPublicPath(publicDir: string, url: string) {
  return path.join(publicDir, url.replace(/^\//, ''))
}

async function compressGlbInPlace(filePath: string) {
  await execFile('gltfpack', ['-i', filePath, '-o', filePath, '-cc'])
}

async function exportChunkVariant(
  outputPath: string,
  nodes: Parameters<typeof buildPublishedStaticRenderBatches>[0],
  options: ExportOptions
) {
  const batches = buildPublishedStaticRenderBatches(nodes)
  const root = new Group()
  root.name = path.basename(outputPath)
  const materials: MeshStandardMaterial[] = []

  for (const batch of batches) {
    const material = new MeshStandardMaterial(resolveMaterialProps(batch.material))
    material.name = encodePublishedStaticMaterialName(batch.material)
    materials.push(material)

    const mesh = new Mesh(batch.geometry, material)
    mesh.name = encodePublishedStaticMeshName({
      castShadow: batch.castShadow,
      receiveShadow: batch.receiveShadow,
    })
    mesh.castShadow = batch.castShadow
    mesh.receiveShadow = batch.receiveShadow
    mesh.matrixAutoUpdate = false
    mesh.matrixWorldAutoUpdate = false
    mesh.updateMatrix()
    root.add(mesh)
  }

  root.updateMatrixWorld(true)

  const exporter = new GLTFExporter()
  const exported = await exporter.parseAsync(root, { binary: true })
  const buffer = Buffer.from(exported as ArrayBuffer)

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, buffer)

  if (options.compression === 'meshopt') {
    await compressGlbInPlace(outputPath)
  }

  disposePublishedStaticRenderBatches(batches)
  materials.forEach((material) => material.dispose())
}

async function ensureMeshoptAvailable() {
  try {
    await execFile('gltfpack', ['--version'])
  } catch {
    throw new Error('meshopt export requested, but `gltfpack` was not found in PATH')
  }
}

async function main() {
  const publicDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(process.cwd(), 'public')
  const compression = process.argv.includes('--meshopt') ? 'meshopt' : 'none'
  const baseUrlFlagIndex = process.argv.indexOf('--base-url')
  const baseUrl =
    baseUrlFlagIndex >= 0 && process.argv[baseUrlFlagIndex + 1]
      ? process.argv[baseUrlFlagIndex + 1]
      : PUBLISHED_STATIC_ASSET_BASE_URL

  if (compression === 'meshopt') {
    await ensureMeshoptAvailable()
  }

  const pkg = createPublishedCampusScenePackage('default', {
    staticAssetManifestUrl: resolvePublishedStaticAssetManifestUrl(baseUrl),
  })
  const manifest = createPublishedStaticAssetManifest(
    pkg.sceneId,
    pkg.generatedAt,
    pkg.staticChunks,
    compression,
    baseUrl
  )

  for (const chunk of pkg.staticChunks) {
    const entry = manifest.chunks[chunk.id]
    await exportChunkVariant(
      urlToPublicPath(publicDir, entry.detailed.url),
      chunk.renderRecipe.detailed,
      { compression }
    )

    if (entry.proxy && chunk.renderRecipe.proxy) {
      await exportChunkVariant(
        urlToPublicPath(publicDir, entry.proxy.url),
        chunk.renderRecipe.proxy,
        { compression }
      )
    }
  }

  const manifestPath = urlToPublicPath(
    publicDir,
    resolvePublishedStaticAssetManifestUrl(baseUrl)
  )
  await mkdir(path.dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const packagePath = path.join(path.dirname(manifestPath), 'published-scene-package.json')
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')

  process.stdout.write(`${manifestPath}\n`)
}

void main()
