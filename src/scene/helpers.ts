import { useFrame } from '@react-three/fiber'
import { type RefObject, useRef, useState } from 'react'
import * as THREE from 'three'
import { focusItems, focusMeasurements, focusRoom } from '../lib/focus'
import type { FurnitureItem, Vec2 } from '../lib/types'
import { useStore } from '../store'

export const COLORS = {
  accent: '#2563eb',
  hover: '#60a5fa',
  error: '#ef4444',
  warn: '#f59e0b',
  clearance: '#0284c7',
  measure: '#ea580c',
  guide: '#d946ef',
  dim: '#64748b',
}

/** Tamanho em metros de 1 pixel na tela, no ponto dado. */
export function worldPerPixel(camera: THREE.Camera, size: { height: number }, at: THREE.Vector3): number {
  const o = camera as THREE.OrthographicCamera
  if (o.isOrthographicCamera) return (o.top - o.bottom) / o.zoom / size.height
  const p = camera as THREE.PerspectiveCamera
  const dist = p.position.distanceTo(at)
  return (2 * Math.tan(THREE.MathUtils.degToRad(p.fov) / 2) * dist) / size.height
}

export function rayAtY(ray: THREE.Ray, y: number): THREE.Vector3 | null {
  if (Math.abs(ray.direction.y) < 1e-6) return null
  const t = (y - ray.origin.y) / ray.direction.y
  if (t < 0) return null
  return ray.at(t, new THREE.Vector3())
}

const tmp = new THREE.Vector3()
/** Mantém o objeto com tamanho constante em pixels. */
export function useScreenScale(ref: RefObject<THREE.Object3D | null>, px: number) {
  useFrame(({ camera, size }) => {
    const o = ref.current
    if (!o) return
    o.getWorldPosition(tmp)
    o.scale.setScalar(worldPerPixel(camera, size, tmp) * px)
  })
}

export const noRaycast = () => null

export function isHelper(o: THREE.Object3D | null): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData?.helper) return true
  return false
}

/** Funções expostas pelo Canvas para a UI (fora do contexto R3F). */
export const viewportApi: {
  screenToFloor?: (clientX: number, clientY: number) => Vec2 | null
  capture?: () => string | null
  /** Pose de um item do catálogo solto neste ponto da tela (null fora da vista). */
  dropPose?: (base: FurnitureItem, clientX: number, clientY: number) => FurnitureItem | null
  /** Arrasta um móvel a partir de um gesto que começou fora da cena (ex.: sobre um rótulo). */
  dragItem?: (id: string, startX: number, startY: number, ev: PointerEvent) => void
  /** Móvel que está neste ponto da tela (o de verdade na frente; a área invisível só se não houver outro). */
  itemAt?: (clientX: number, clientY: number) => string | null
  /** Posição do mouse sobre a cena (coordenadas da janela); null quando está fora dela. */
  pointer?: [number, number] | null
} = {}

export type ControlsLike = { enabled: boolean } | null

/**
 * Pixels por metro na tela (em faixas), para esconder rótulos quando a vista está afastada.
 * Só re-renderiza quando muda de faixa.
 */
export function usePxPerMeter(step = 10) {
  const [bucket, setBucket] = useState(100)
  const last = useRef(100)
  useFrame(({ camera, size, controls }) => {
    let ppm: number
    const o = camera as THREE.OrthographicCamera
    if (o.isOrthographicCamera) ppm = o.zoom
    else {
      const p = camera as THREE.PerspectiveCamera
      const target = (controls as unknown as { target?: THREE.Vector3 } | null)?.target ?? new THREE.Vector3()
      const dist = p.position.distanceTo(target)
      ppm = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(p.fov) / 2) * Math.max(dist, 0.1))
    }
    const b = Math.round(ppm / step) * step
    if (b !== last.current) {
      last.current = b
      setBucket(b)
    }
  })
  return bucket
}

/** Casa inteira ou só o cômodo em foco ("ver só este cômodo"). */
export function useViewRoom() {
  const room = useStore((s) => s.room)
  const focus = useStore((s) => s.focusSpace)
  return focusRoom(room, focus)
}

export function useViewItems() {
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  const focus = useStore((s) => s.focusSpace)
  return focusItems(items, room, focus)
}

export function useViewMeasurements() {
  const room = useStore((s) => s.room)
  const ms = useStore((s) => s.measurements)
  const focus = useStore((s) => s.focusSpace)
  return focusMeasurements(ms, room, focus)
}
