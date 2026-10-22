/** Miniaturas do catálogo renderizadas a partir dos próprios modelos paramétricos. */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { ALL_ENTRIES, buildItemGroup, entryToItem } from './catalog'
import { disposeObject } from './parts'

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(176, 176)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  scene = new THREE.Scene()
  const pm = new THREE.PMREMGenerator(renderer)
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.6
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9c2b8', 1.3))
  const dl = new THREE.DirectionalLight('#ffffff', 1.8)
  dl.position.set(2, 5, 3)
  scene.add(dl)
  camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100)
}

export function renderThumb(obj: THREE.Object3D): string {
  if (!renderer) init()
  scene.add(obj)
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj)
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const dir = new THREE.Vector3(0.7, 0.62, 1).normalize()
  const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.0
  camera.position.copy(sphere.center).addScaledVector(dir, dist)
  camera.lookAt(sphere.center)
  camera.near = dist / 100
  camera.far = dist * 10
  camera.updateProjectionMatrix()
  renderer!.render(scene, camera)
  const url = renderer!.domElement.toDataURL('image/png')
  scene.remove(obj)
  return url
}

const idle = (fn: () => void) =>
  'requestIdleCallback' in window ? (window as Window).requestIdleCallback(fn, { timeout: 200 }) : setTimeout(fn, 16)

export function generateCatalogThumbs(setThumb: (key: string, url: string) => void) {
  const queue = ALL_ENTRIES.slice()
  const step = () => {
    const e = queue.shift()
    if (!e) return
    try {
      const g = buildItemGroup(entryToItem(e))
      setThumb(e.key, renderThumb(g))
      disposeObject(g)
    } catch (err) {
      console.warn('thumb', e.key, err)
    }
    idle(step)
  }
  idle(step)
}
