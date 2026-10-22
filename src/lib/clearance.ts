import { isSolid } from './analysis'
import { footprint, itemAabb, overlapDepth, raySeg, rotLocal } from './geom'
import { hasSolids, solidsDistance, worldSolids } from './solids'
import type { FurnitureItem, Room, Vec2 } from './types'

export interface Clearance {
  /** Origem no meio da face do móvel. */
  o: Vec2
  /** Direção (unitária) para fora da face. */
  d: Vec2
  dist: number
  target: 'wall' | 'item'
  targetName?: string
  targetId?: string
  wallId?: string
  /** Eixo local do móvel (x: largura, z: profundidade) e lado (+1/−1). */
  axis: 'x' | 'z'
  side: 1 | -1
}

/**
 * Distância livre de cada face do móvel até a parede ou móvel mais próximo. `touching`: inclui as faces
 * encostadas (distância ~0), para somar a folga de um eixo inteiro.
 */
export function computeClearances(item: FurnitureItem, room: Room, items: FurnitureItem[], max = 8, touching = false): Clearance[] {
  const segs: { a: Vec2; b: Vec2; kind: 'wall' | 'item'; name?: string; id?: string; wallId?: string }[] = room.walls.map((w) => ({ a: w.a, b: w.b, kind: 'wall', wallId: w.id }))
  const own = footprint(item)
  const mine = worldSolids(item)
  for (const o of items) {
    if (o.id === item.id || !isSolid(o)) continue
    const v = Math.min(item.elevation + item.height, o.elevation + o.height) - Math.max(item.elevation, o.elevation)
    if (v <= 0.002) continue
    // móvel de várias partes: só as partes na altura deste e fora da planta dele (a cadeira sob a mesa
    // não mede até o fundo do tampo)
    const polys = hasSolids(o) || hasSolids(item)
      ? worldSolids(o)
          .filter((q) => mine.some((p) => Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) > 0.002) && overlapDepth(own, q.poly) <= 0.002)
          .map((q) => q.poly)
      : [footprint(o)]
    for (const fp of polys) for (let i = 0; i < 4; i++) segs.push({ a: fp[i], b: fp[(i + 1) % 4], kind: 'item', name: o.name, id: o.id })
  }
  const out: Clearance[] = []
  for (const [lx, lz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const d = rotLocal(lx, lz, item.rotation)
    const off = rotLocal((lx * item.width) / 2, (lz * item.depth) / 2, item.rotation)
    const o: Vec2 = [item.x + off[0], item.z + off[1]]
    let best = Infinity
    let hit: (typeof segs)[number] | null = null
    for (const s of segs) {
      const t = raySeg(o, d, s.a, s.b)
      if (t !== null && t > (touching ? -0.01 : -0.0005) && t < best) {
        best = t
        hit = s
      }
    }
    if (hit && best < max && (best > 0.002 || touching))
      out.push({ o, d, dist: Math.max(0, best), target: hit.kind, targetName: hit.name, targetId: hit.id, wallId: hit.wallId, axis: lx ? 'x' : 'z', side: (lx || lz) > 0 ? 1 : -1 })
  }
  return out
}

/** Distância livre a partir da face da caixa (alinhada aos eixos) na direção de um eixo do cômodo. */
export function distanceAlong(item: FurnitureItem, dir: Vec2, room: Room, items: FurnitureItem[]): number | null {
  const b = itemAabb(item)
  const samples: Vec2[] = []
  if (dir[0] !== 0) {
    const x = dir[0] > 0 ? b.maxX : b.minX
    for (const z of [b.minZ + 0.002, (b.minZ + b.maxZ) / 2, b.maxZ - 0.002]) samples.push([x, z])
  } else {
    const z = dir[1] > 0 ? b.maxZ : b.minZ
    for (const x of [b.minX + 0.002, (b.minX + b.maxX) / 2, b.maxX - 0.002]) samples.push([x, z])
  }
  // parede com rodapé: para quem está na altura dele, o limite é a face do rodapé — e quem já está
  // por cima do rodapé pode voltar (distância negativa, até a espessura dele)
  const segs: [Vec2, Vec2, number][] = room.walls.map((w) => {
    const t = w.baseboard && item.elevation < w.baseboard.height - 0.002 ? w.baseboard.thickness : 0
    return [[w.a[0] + w.normal[0] * t, w.a[1] + w.normal[1] * t], [w.b[0] + w.normal[0] * t, w.b[1] + w.normal[1] * t], t ? t + 0.002 : 0.0005]
  })
  let best = Infinity
  const mine = worldSolids(item)
  for (const o of items) {
    if (o.id === item.id || !isSolid(o)) continue
    const v = Math.min(item.elevation + item.height, o.elevation + o.height) - Math.max(item.elevation, o.elevation)
    if (v <= 0.002) continue
    if (hasSolids(o) || hasSolids(item)) {
      const t = solidsDistance(mine, worldSolids(o), dir)
      if (t !== null && t < best) best = t
      continue
    }
    const fp = footprint(o)
    for (let i = 0; i < 4; i++) segs.push([fp[i], fp[(i + 1) % 4], 0.0005])
  }
  for (const s of samples) {
    for (const [a, c, back] of segs) {
      const t = raySeg(s, dir, a, c)
      if (t !== null && t > -back && t < best) best = t
    }
  }
  return Number.isFinite(best) ? (best < 0 && best > -0.0005 ? 0 : best) : null
}
