import { TYPES } from '../furniture/catalog'
import { crossesWall, doorClearance, footprint, inFloor, openingZone, overlapDepth, pointInPoly, wallDir, wallLength } from './geom'
import { baseboardRuns } from './baseboard'
import { hasSolids, solidsCollide, worldSolids, type WorldSolid } from './solids'
import type { FurnitureItem, Room, Vec2 } from './types'
import { fmtCm } from './util'

export interface Warning {
  itemId: string
  level: 'error' | 'warn'
  message: string
}

export interface Analysis {
  warnings: Warning[]
  colliding: Set<string>
  flagged: Set<string>
}

const EPS = 0.004

export const isSolid = (it: FurnitureItem) => !TYPES[it.type]?.noCollide && it.height >= 0.03
const vOverlap = (a: FurnitureItem, b: { elevation: number; height: number }) =>
  Math.min(a.elevation + a.height, b.elevation + b.height) - Math.max(a.elevation, b.elevation)

/** `it` está inteiro dentro do vão de `box` (um nicho)? */
function insideContainer(it: FurnitureItem, box: FurnitureItem, fps: Map<string, Vec2[]>) {
  if (!TYPES[box.type]?.container) return false
  if (it.elevation < box.elevation - EPS || it.elevation + it.height > box.elevation + box.height + EPS) return false
  const poly = fps.get(box.id)!
  return fps.get(it.id)!.every((p) => pointInPoly(p, poly))
}

export function analyze(room: Room | null, items: FurnitureItem[]): Analysis {
  const warnings: Warning[] = []
  const colliding = new Set<string>()
  const flagged = new Set<string>()
  if (!room) return { warnings, colliding, flagged }

  const fps = new Map<string, Vec2[]>(items.map((it) => [it.id, footprint(it)]))
  const solid = items.filter(isSolid)
  // móveis de várias partes (cadeira, mesa): só colide se alguma parte invadir outra — a cadeira entra
  // com o assento e os braços sob o tampo
  const parts = new Map<string, WorldSolid[]>()
  const partsOf = (it: FurnitureItem) => {
    let p = parts.get(it.id)
    if (!p) parts.set(it.id, (p = worldSolids(it)))
    return p
  }

  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i]
      const b = solid[j]
      if (vOverlap(a, b) <= EPS) continue
      // coisa guardada dentro de um nicho não é colisão
      if (insideContainer(b, a, fps) || insideContainer(a, b, fps)) continue
      if (overlapDepth(fps.get(a.id)!, fps.get(b.id)!) > EPS && (!(hasSolids(a) || hasSolids(b)) || solidsCollide(partsOf(a), partsOf(b), EPS))) {
        colliding.add(a.id)
        colliding.add(b.id)
        warnings.push({ itemId: a.id, level: 'error', message: `${a.name} colide com ${b.name}` })
      }
    }
  }

  for (const it of items) {
    const inner = footprint(it, -EPS)
    if (!inner.every((p) => inFloor(p, room)) || (isSolid(it) && crossesWall(room, footprint(it, -0.01), it.elevation, it.elevation + it.height))) {
      colliding.add(it.id)
      warnings.push({ itemId: it.id, level: 'error', message: `${it.name} atravessa a parede` })
    }
    if (it.elevation + it.height > room.ceilingHeight + EPS) {
      colliding.add(it.id)
      warnings.push({ itemId: it.id, level: 'error', message: `${it.name} é mais alto que o pé-direito` })
    }
  }

  for (const op of room.openings) {
    if (op.ghost) continue
    if (op.kind === 'door') {
      const polys = doorClearance(room, op)
      if (!polys.length) continue
      for (const it of solid) {
        if (it.elevation >= op.bottom + op.height) continue
        if (polys.some((c) => (c.below === undefined || it.elevation < c.below) && overlapDepth(fps.get(it.id)!, c.poly) > EPS)) {
          flagged.add(it.id)
          warnings.push({ itemId: it.id, level: 'warn', message: `${it.name} bloqueia a abertura da porta de ${fmtCm(op.width)}` })
        }
      }
    } else {
      const zone = openingZone(room, op, op.kind === 'window' ? 0.25 : 0.6)
      if (!zone) continue
      for (const it of solid) {
        if (it.elevation >= op.bottom + op.height) continue
        if (it.elevation + it.height <= op.bottom + 0.02) continue
        if (overlapDepth(fps.get(it.id)!, zone) > EPS) {
          flagged.add(it.id)
          warnings.push({
            itemId: it.id,
            level: 'warn',
            message: op.kind === 'window' ? `${it.name} fica na frente da janela` : `${it.name} bloqueia a passagem`,
          })
        }
      }
    }
  }
  // rodapé: móvel baixo encostado "dentro" dele (o rodapé fica entre a parede e o móvel)
  const overBaseboard = new Map<string, number>()
  for (const w of room.walls) {
    const b = w.baseboard
    if (!b) continue
    const L = wallLength(w)
    const u = wallDir(w)
    const n = w.normal
    const ops = room.openings.filter((o) => o.wallId === w.id)
    for (const [s0, s1] of baseboardRuns(L, ops, b.height)) {
      const P = (s: number, k: number): Vec2 => [w.a[0] + u[0] * s + n[0] * k, w.a[1] + u[1] * s + n[1] * k]
      const strip = [P(s0, 0), P(s1, 0), P(s1, b.thickness), P(s0, b.thickness)]
      for (const it of solid) {
        if (it.elevation >= b.height - 0.002 || colliding.has(it.id)) continue
        const d = overlapDepth(fps.get(it.id)!, strip)
        if (d > 0.002) overBaseboard.set(it.id, Math.max(overBaseboard.get(it.id) ?? 0, Math.min(d, b.thickness)))
      }
    }
  }
  for (const [id, d] of overBaseboard) {
    const it = items.find((i) => i.id === id)!
    flagged.add(id)
    warnings.push({ itemId: id, level: 'warn', message: `${it.name} invade o rodapé — afaste ${fmtCm(d)} da parede` })
  }
  for (const id of colliding) flagged.delete(id)
  return { warnings, colliding, flagged }
}
