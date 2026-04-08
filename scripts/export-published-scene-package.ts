#!/usr/bin/env bun

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  createPublishedCampusScenePackage,
  PUBLISHED_STATIC_ASSET_BASE_URL,
  resolvePublishedStaticAssetManifestUrl,
  type PublishedSceneProfile,
} from '../lib/digital-twin/publish'

async function main() {
  const outputDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(process.cwd(), 'tmp', 'published-scenes')
  const profile =
    process.argv[3] === 'production' ? ('production' as PublishedSceneProfile) : 'default'
  const baseUrlFlagIndex = process.argv.indexOf('--base-url')
  const baseUrl =
    baseUrlFlagIndex >= 0 && process.argv[baseUrlFlagIndex + 1]
      ? process.argv[baseUrlFlagIndex + 1]
      : PUBLISHED_STATIC_ASSET_BASE_URL
  const outputPath = path.join(outputDir, 'published-scene-package.json')

  await mkdir(outputDir, { recursive: true })

  const pkg = createPublishedCampusScenePackage(profile, {
    staticAssetManifestUrl: resolvePublishedStaticAssetManifestUrl(baseUrl),
  })
  await writeFile(outputPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')

  process.stdout.write(`${outputPath}\n`)
}

void main()
