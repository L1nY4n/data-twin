import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { resolveEditorPickTargetFromObject } from './EditorScenePicking'

describe('editor scene picking', () => {
  test('walks up parent nodes to resolve entity id from mesh hit targets', () => {
    const root = new THREE.Group()
    root.userData.entityId = 'entity-1'

    const child = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))

    root.add(child)
    child.add(mesh)

    expect(resolveEditorPickTargetFromObject(mesh)).toEqual({
      kind: 'entity',
      id: 'entity-1',
    })
  })

  test('walks up parent nodes to resolve static asset id from mesh hit targets', () => {
    const root = new THREE.Group()
    root.userData.staticAssetId = 'static-asset-1'

    const child = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))

    root.add(child)
    child.add(mesh)

    expect(resolveEditorPickTargetFromObject(mesh)).toEqual({
      kind: 'static-asset',
      id: 'static-asset-1',
    })
  })

  test('returns null when no ancestor carries a pick target id', () => {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))

    root.add(mesh)

    expect(resolveEditorPickTargetFromObject(mesh)).toBeNull()
  })
})
