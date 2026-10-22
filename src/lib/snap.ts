import { aabbHalf, itemAabb, wallDir } from './geom'
import type { FurnitureItem, Room } from './types'
import { snapTo } from './util'

export interface Guide {
  axis: 'x' | 'z'
  value: number
  from: number
  to: number
}

interface Line {
  v: number
  lo: number
  hi: number
  kind: 'wall' | 'edge' | 'center'
}

/**
 * Linhas do ímã. `elevation`: altura da base do móvel que está sendo movido — se ele fica na altura do
 * rodapé, a linha da parede passa para a face do rodapé (o móvel encosta nele, não atravessa).
 */
export function collectLines(room: Room | null, items: FurnitureItem[], excludeId: string, elevation = 0) {
  const xs: Line[] = []
  const zs: Line[] = []
  for (const w of room?.walls ?? []) {
    const d = wallDir(w)
    const bb = w.baseboard && elevation < w.baseboard.height - 0.002 ? w.baseboard.thickness : 0
    if (Math.abs(d[1]) < 0.03) {
      zs.push({ v: (w.a[1] + w.b[1]) / 2 + w.normal[1] * bb, lo: Math.min(w.a[0], w.b[0]), hi: Math.max(w.a[0], w.b[0]), kind: 'wall' })
    } else if (Math.abs(d[0]) < 0.03) {
      xs.push({ v: (w.a[0] + w.b[0]) / 2 + w.normal[0] * bb, lo: Math.min(w.a[1], w.b[1]), hi: Math.max(w.a[1], w.b[1]), kind: 'wall' })
    }
  }
  for (const it of items) {
    if (it.id === excludeId) continue
    const b = itemAabb(it)
    xs.push({ v: b.minX, lo: b.minZ, hi: b.maxZ, kind: 'edge' }, { v: b.maxX, lo: b.minZ, hi: b.maxZ, kind: 'edge' }, { v: it.x, lo: b.minZ, hi: b.maxZ, kind: 'center' })
    zs.push({ v: b.minZ, lo: b.minX, hi: b.maxX, kind: 'edge' }, { v: b.maxZ, lo: b.minX, hi: b.maxX, kind: 'edge' }, { v: it.z, lo: b.minX, hi: b.maxX, kind: 'center' })
  }
  return { xs, zs }
}

function best(edges: number[], center: number | null, lines: Line[], thr: number) {
  let res: { delta: number; line: Line } | null = null
  for (const l of lines) {
    const cands = l.kind === 'center' ? (center === null ? [] : [l.v - center]) : edges.map((e) => l.v - e)
    for (const d of cands) {
      if (Math.abs(d) > thr) continue
      const better =
        !res ||
        Math.abs(d) < Math.abs(res.delta) - 1e-6 ||
        (Math.abs(Math.abs(d) - Math.abs(res.delta)) <= 1e-6 && l.kind === 'wall' && res.line.kind !== 'wall')
      if (better) res = { delta: d, line: l }
    }
  }
  return res
}

export interface SnapOpts {
  thr: number
  step: number
  magnet: boolean
}

/** Ajusta a posição (centro) do móvel: ímã em paredes/bordas de móveis e, sem ímã, grade. */
export function snapPosition(item: FurnitureItem, cx: number, cz: number, room: Room | null, items: FurnitureItem[], o: SnapOpts) {
  const [hx, hz] = aabbHalf(item.width, item.depth, item.rotation)
  let x = cx
  let z = cz
  const guides: Guide[] = []
  let sx = false
  let sz = false
  if (o.magnet) {
    const { xs, zs } = collectLines(room, items, item.id, item.elevation)
    const rx = best([cx - hx, cx + hx], cx, xs, o.thr)
    if (rx) {
      x = cx + rx.delta
      sx = true
      guides.push({ axis: 'x', value: rx.line.v, from: Math.min(rx.line.lo, cz - hz), to: Math.max(rx.line.hi, cz + hz) })
    }
    const rz = best([cz - hz, cz + hz], cz, zs, o.thr)
    if (rz) {
      z = cz + rz.delta
      sz = true
      guides.push({ axis: 'z', value: rz.line.v, from: Math.min(rz.line.lo, cx - hx), to: Math.max(rz.line.hi, cx + hx) })
    }
  }
  if (!sx && o.step > 0) x = snapTo(cx - hx, o.step) + hx
  if (!sz && o.step > 0) z = snapTo(cz - hz, o.step) + hz
  return { x, z, guides }
}

/** Ímã para uma borda isolada (usado ao redimensionar). */
export function snapEdge(value: number, axis: 'x' | 'z', room: Room | null, items: FurnitureItem[], excludeId: string, thr: number, elevation = 0) {
  const { xs, zs } = collectLines(room, items, excludeId, elevation)
  const r = best([value], null, axis === 'x' ? xs : zs, thr)
  if (!r) return null
  return { value: r.line.v, line: r.line }
}
