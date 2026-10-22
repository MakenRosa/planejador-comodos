/**
 * Rodapé de poliestireno: perfil (corte) com frisos e topo reto, chanfrado ou boleado, extrudado ao
 * longo da face interna da parede. Para nas portas (no alisar) e nas passagens que chegam ao piso.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Baseboard, BaseboardTop, Opening } from './types'

export const DEFAULT_BASEBOARD: Baseboard = { height: 0.1, thickness: 0.015, color: '#f4f4f2', grooves: 2, groovePos: 'topo', top: 'reto' }

/** Alturas comuns de rodapé de poliestireno (m). */
export const BASEBOARD_HEIGHTS = [0.05, 0.07, 0.1, 0.12, 0.15, 0.2]

export const BASEBOARD_TOPS: { value: BaseboardTop; label: string }[] = [
  { value: 'reto', label: 'Reto' },
  { value: 'chanfrado', label: 'Chanfrado' },
  { value: 'boleado', label: 'Boleado (arredondado)' },
]

export const BASEBOARD_COLORS = [
  { name: 'Branco', hex: '#f4f4f2' },
  { name: 'Branco gelo', hex: '#ece8df' },
  { name: 'Off-white', hex: '#e4ddd0' },
  { name: 'Cinza claro', hex: '#cfd1d3' },
  { name: 'Cinza', hex: '#8d9094' },
  { name: 'Grafite', hex: '#4a4c50' },
  { name: 'Preto', hex: '#26272a' },
  { name: 'Madeira clara', hex: '#c9a477' },
  { name: 'Madeira escura', hex: '#6b4a33' },
]

/** Alturas (centro) dos frisos, de baixo para cima. */
export function grooveHeights(b: Baseboard): number[] {
  const n = Math.max(0, Math.min(6, Math.round(b.grooves)))
  if (!n) return []
  const h = b.height
  const topMargin = h * (b.top === 'reto' ? 0.13 : 0.2) + 0.003
  if (b.groovePos === 'distribuidos') {
    const lo = h * 0.22
    const hi = h - topMargin
    return Array.from({ length: n }, (_, i) => (n === 1 ? (lo + hi) / 2 : lo + (i * (hi - lo)) / (n - 1)))
  }
  // frisado clássico: os sulcos juntos logo abaixo do topo
  const gap = Math.min(0.012, Math.max(0.006, h * 0.075))
  return Array.from({ length: n }, (_, i) => h - topMargin - i * gap).reverse()
}

/** Corte do rodapé: x = distância da parede (0 … espessura), y = altura. */
export function baseboardShape(b: Baseboard): THREE.Shape {
  const h = Math.max(0.02, b.height)
  const t = Math.max(0.004, b.thickness)
  const gh = Math.min(0.0032, h * 0.045)
  const gd = Math.min(t * 0.3, 0.0022)
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.lineTo(t, 0)
  // frisos em "V" na frente
  for (const y of grooveHeights(b)) {
    s.lineTo(t, y - gh / 2)
    s.lineTo(t - gd, y)
    s.lineTo(t, y + gh / 2)
  }
  if (b.top === 'chanfrado') {
    const c = Math.min(t * 0.8, h * 0.18)
    s.lineTo(t, h - c)
    s.lineTo(t - c, h)
  } else if (b.top === 'boleado') {
    const r = Math.min(t * 0.9, h * 0.25)
    s.lineTo(t, h - r)
    s.absarc(t - r, h - r, r, 0, Math.PI / 2, false)
  } else s.lineTo(t, h)
  s.lineTo(0, h)
  s.lineTo(0, 0)
  return s
}

/** Trechos [início, fim] da parede (comprimento L) que recebem rodapé, sem as portas e passagens. */
export function baseboardRuns(L: number, ops: Opening[], height: number): [number, number][] {
  let runs: [number, number][] = [[0, L]]
  for (const o of ops) {
    if (o.bottom >= height - 0.005) continue
    // a porta tem alisar dos dois lados (7 cm, ou o da porta); o rodapé encosta nele
    const casing = o.kind === 'door' ? (o.casing ?? 0.07) : 0
    const c0 = o.offset - o.width / 2 - casing
    const c1 = o.offset + o.width / 2 + casing
    runs = runs.flatMap(([a, b]): [number, number][] => {
      if (c1 <= a || c0 >= b) return [[a, b]]
      const out: [number, number][] = []
      if (c0 > a) out.push([a, c0])
      if (c1 < b) out.push([c1, b])
      return out
    })
  }
  return runs.filter(([a, b]) => b - a > 0.015)
}

/**
 * Geometria do rodapé de uma parede no sistema local dela (x ao longo da parede, z = 0 na face
 * interna, +z·inward para dentro do cômodo).
 */
export function baseboardGeometry(b: Baseboard, L: number, ops: Opening[], inward: number): THREE.BufferGeometry | null {
  const shape = baseboardShape(b)
  const parts = baseboardRuns(L, ops, b.height).map(([s0, s1]) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: s1 - s0, bevelEnabled: false, curveSegments: 6 })
    if (inward >= 0) {
      g.rotateY(-Math.PI / 2)
      g.translate(s1, 0, 0)
    } else {
      g.rotateY(Math.PI / 2)
      g.translate(s0, 0, 0)
    }
    return g
  })
  if (!parts.length) return null
  const merged = mergeGeometries(parts)
  parts.forEach((g) => g.dispose())
  return merged
}

const mats = new Map<string, THREE.MeshStandardMaterial>()
/** Poliestireno pintado: acetinado. */
export function baseboardMaterial(color: string) {
  let m = mats.get(color)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0 })
    mats.set(color, m)
  }
  return m
}
