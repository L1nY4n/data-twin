import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const NEXT_PACKAGE_PATH = path.join('node_modules', 'next', 'package.json')

function resolveTurbopackRoot(startDir) {
  let currentDir = startDir

  while (true) {
    if (fs.existsSync(path.join(currentDir, NEXT_PACKAGE_PATH))) {
      return currentDir
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      return startDir
    }

    currentDir = parentDir
  }
}

const turbopackRoot = resolveTurbopackRoot(projectRoot)

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  images: {
    unoptimized: true,
  },
  outputFileTracingRoot: turbopackRoot,
  turbopack: {
    root: turbopackRoot,
  },
}

export default nextConfig
