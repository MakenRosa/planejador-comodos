/**
 * Partes sólidas dos móveis no mundo (para colisão e distâncias). Móveis com `solids` no tipo (cadeira,
 * mesa…) viram várias caixas — a cadeira entra com o assento e os braços sob o tampo e para quando o
 * encosto bate na borda; os outros são a caixa inteira.
 */
import { TYPES } from '../furniture/catalog'
import { footprint, overlapDepth, rotLocal } from './geom'
import type { FurnitureItem, Vec2 } from './types'

export interface WorldSolid {
  poly: Vec2[]
  y0: number
  y1: number
}

export const hasSolids = (it: FurnitureItem) => !!TYPES[it.type]?.solids

/** Partes sólidas no mundo (as do tipo, giradas e no lugar, ou a caixa inteira). */
export function worldSolids(it: FurnitureItem): WorldSolid[] {
  const parts = TYPES[it.type]?.solids?.(it)
  if (!parts?.length) return [{ poly: footprint(it), y0: it.elevation, y1: it.elevation + it.height }]
  return parts.map((s) => {
    const corners: Vec2[] = [
      [s.x0, s.z0],
      [s.x1, s.z0],
      [s.x1, s.z1],
      [s.x0, s.z1],
    ]
    return {
      poly: corners.map(([lx, lz]): Vec2 => {
        const [dx, dz] = rotLocal(lx, lz, it.rotation)
        return [it.x + dx, it.z + dz]
      }),
      y0: it.elevation + s.y0,
      y1: it.elevation + s.y1,
    }
  })
}

const vGap = (p: WorldSolid, q: WorldSolid) => Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0)

/** Alguma parte de `a` invade uma parte de `b` (em planta e na altura) mais que `eps`? */
export function solidsCollide(a: WorldSolid[], b: WorldSolid[], eps: number) {
  return a.some((p) => b.some((q) => vGap(p, q) > eps && overlapDepth(p.poly, q.poly) > eps))
}

/** Raio × segmento, ignorando os `margin` metros das pontas (passar raspando numa quina não é toque). */
function rayHit(o: Vec2, d: Vec2, a: Vec2, b: Vec2, margin: number): number | null {
  const ex = b[0] - a[0]
  const ez = b[1] - a[1]
  const den = d[0] * ez - d[1] * ex
  if (Math.abs(den) < 1e-12) return null
  const ax = a[0] - o[0]
  const az = a[1] - o[1]
  const u = (ax * d[1] - az * d[0]) / den
  const m = margin / Math.hypot(ex, ez)
  if (u < m || u > 1 - m) return null
  return (ax * ez - az * ex) / den
}

/**
 * Quanto `a` anda na direção `dir` até alguma parte dele tocar uma parte de `b` na mesma altura
 * (vértices de um lançados contra as arestas do outro, nos dois sentidos). null = não toca.
 */
export function solidsDistance(a: WorldSolid[], b: WorldSolid[], dir: Vec2, back = 0.0005): number | null {
  let best = Infinity
  const rev: Vec2 = [-dir[0], -dir[1]]
  const cast = (from: Vec2[], d: Vec2, to: Vec2[]) => {
    for (const v of from)
      for (let i = 0; i < to.length; i++) {
        const t = rayHit(v, d, to[i], to[(i + 1) % to.length], 0.002)
        if (t !== null && t > -back && t < best) best = t
      }
  }
  for (const p of a)
    for (const q of b) {
      if (vGap(p, q) <= 0.002) continue
      cast(p.poly, dir, q.poly)
      cast(q.poly, rev, p.poly)
    }
  return Number.isFinite(best) ? best : null
}
