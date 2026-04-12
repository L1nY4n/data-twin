import { Box3, Group, Mesh } from 'three'

export const FORKLIFT_MODEL_URL = '/assets/3d/Fork_Lift.fbx'

// Source FBX includes a presentation floor and faces +X in authoring space.
// Removing the floor, rotating -90° around Y, and scaling to 0.101 yields an
// in-scene footprint of roughly 1.10w x 2.00h x 3.49d, which fits the campus lanes.
export const FORKLIFT_MODEL_SCALE = 0.101
export const FORKLIFT_MODEL_ROTATION_Y = -Math.PI / 2

function stripForkliftFloor(root: Group) {
  const removable: Mesh[] = []
  root.traverse((object) => {
    if (object instanceof Mesh && object.name === 'Render_Floor') {
      removable.push(object)
    }
  })
  removable.forEach((mesh) => {
    mesh.parent?.remove(mesh)
  })
}

export function normalizeForkliftScene(root: Group) {
  const clone = root.clone(true)
  stripForkliftFloor(clone)
  clone.rotation.set(0, FORKLIFT_MODEL_ROTATION_Y, 0)
  clone.scale.setScalar(FORKLIFT_MODEL_SCALE)
  clone.updateMatrixWorld(true)

  const box = new Box3().setFromObject(clone)
  const centerX = (box.min.x + box.max.x) / 2
  const centerZ = (box.min.z + box.max.z) / 2
  const bottomY = box.min.y

  clone.position.set(-centerX, -bottomY, -centerZ)
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
  })
  clone.updateMatrixWorld(true)

  return clone
}

export function inferForkliftFrontAxis(root: Group): 'positive-z' | 'negative-z' {
  let forkCenterZ = Number.NEGATIVE_INFINITY
  let bodyCenterZ = 0

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const box = new Box3().setFromObject(object)
    const centerZ = (box.min.z + box.max.z) / 2

    if (object.name === 'Fork_Lift_Body') {
      bodyCenterZ = centerZ
      return
    }

    if (object.name.includes('Fork')) {
      forkCenterZ = Math.max(forkCenterZ, centerZ)
    }
  })

  return forkCenterZ >= bodyCenterZ ? 'positive-z' : 'negative-z'
}
