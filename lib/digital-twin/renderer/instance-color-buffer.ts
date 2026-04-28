import * as THREE from 'three'

const DEFAULT_INSTANCE_COLOR = new THREE.Color('#ffffff')

export function ensureInstancedColorBuffer(
  mesh: THREE.InstancedMesh | null,
  color: THREE.Color = DEFAULT_INSTANCE_COLOR
) {
  if (!mesh || mesh.instanceColor) return

  const values = new Float32Array(mesh.count * 3)
  for (let index = 0; index < mesh.count; index += 1) {
    values[index * 3] = color.r
    values[index * 3 + 1] = color.g
    values[index * 3 + 2] = color.b
  }

  mesh.instanceColor = new THREE.InstancedBufferAttribute(values, 3)
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
  mesh.instanceColor.needsUpdate = true
}
