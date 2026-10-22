/** Modelos .glb importados pelo usuário (IKEA, Sketchfab, Poly Haven, etc.). */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { idbGet } from './persist'
import type { FurnitureItem, Vec3 } from './types'

const templates = new Map<string, Promise<THREE.Object3D | null>>()

export async function parseGlb(data: ArrayBuffer): Promise<{ obj: THREE.Object3D; size: Vec3 }> {
  const gltf = await new GLTFLoader().parseAsync(data.slice(0), '')
  const model = gltf.scene
  let box = new THREE.Box3().setFromObject(model)
  const raw = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(raw.x, raw.y, raw.z)
  // Heurística de unidade: arquivos em mm ou cm
  const k = maxDim > 200 ? 0.001 : maxDim > 20 ? 0.01 : 1
  model.scale.multiplyScalar(k)
  model.updateMatrixWorld(true)
  box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z))
  model.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })
  const wrap = new THREE.Group()
  wrap.add(model)
  const s: Vec3 = [Math.max(size.x, 0.01), Math.max(size.y, 0.01), Math.max(size.z, 0.01)]
  wrap.userData.size = s
  return { obj: wrap, size: s }
}

export function getTemplate(id: string): Promise<THREE.Object3D | null> {
  let p = templates.get(id)
  if (!p) {
    p = idbGet(id)
      .then((buf) => (buf ? parseGlb(buf).then((r) => r.obj) : null))
      .catch(() => null)
    templates.set(id, p)
  }
  return p
}

export function setTemplate(id: string, obj: THREE.Object3D) {
  templates.set(id, Promise.resolve(obj))
}

/** Instância escalada para as dimensões do móvel (compartilha geometria com o template). */
export function instantiate(tpl: THREE.Object3D, it: Pick<FurnitureItem, 'width' | 'height' | 'depth'>) {
  const size = tpl.userData.size as Vec3
  const g = new THREE.Group()
  const c = tpl.clone(true)
  c.scale.set(it.width / size[0], it.height / size[1], it.depth / size[2])
  g.add(c)
  g.userData.shared = true
  return g
}
