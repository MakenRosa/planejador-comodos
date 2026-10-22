/**
 * "Ver só um cômodo": recorte da casa num único cômodo (paredes, portas/janelas, piso) e dos móveis
 * e medições que estão nele. Os recortes são memorizados por referência — a geometria das paredes
 * depende da identidade dos arrays, então o mesmo estado precisa devolver o mesmo objeto.
 */
import { pointInPoly, pointSegDist } from './geom'
import type { FurnitureItem, Measurement, Room, Space, Vec2 } from './types'

/** Cômodo que contém o ponto; fora de todos (ex.: dentro da espessura da parede), o mais próximo. */
export function spaceOfPoint(room: Room, p: Vec2): Space | null {
  const spaces = room.spaces ?? []
  const inside = spaces.find((s) => pointInPoly(p, s.floor))
  if (inside) return inside
  let best: Space | null = null
  let bd = Infinity
  for (const s of spaces) {
    for (let i = 0; i < s.floor.length; i++) {
      const d = pointSegDist(p, s.floor[i], s.floor[(i + 1) % s.floor.length])
      if (d < bd) {
        bd = d
        best = s
      }
    }
  }
  return best
}

const validFocus = (room: Room | null, id: string | null): id is string => !!id && !!room?.spaces?.some((s) => s.id === id)

let roomCache: { room: Room; id: string; out: Room } | null = null

/** A casa inteira, ou só o cômodo em foco (como se fosse um projeto de um cômodo só). */
export function focusRoom<R extends Room | null>(room: R, id: string | null): R {
  if (!room || !validFocus(room, id)) return room
  if (roomCache && roomCache.room === room && roomCache.id === id) return roomCache.out as R
  const sp = room.spaces!.find((s) => s.id === id)!
  const walls = room.walls.filter((w) => w.spaceId === id)
  const ids = new Set(walls.map((w) => w.id))
  const out: Room = {
    ...room,
    walls,
    openings: room.openings.filter((o) => ids.has(o.wallId)),
    spaces: [sp],
    floor: sp.floor,
    ceilingHeight: sp.ceilingHeight || room.ceilingHeight,
  }
  roomCache = { room, id, out }
  return out as R
}

let itemCache: { items: FurnitureItem[]; room: Room; id: string; out: FurnitureItem[] } | null = null

export function focusItems(items: FurnitureItem[], room: Room | null, id: string | null): FurnitureItem[] {
  if (!room || !validFocus(room, id)) return items
  if (itemCache && itemCache.items === items && itemCache.room === room && itemCache.id === id) return itemCache.out
  const out = items.filter((it) => spaceOfPoint(room, [it.x, it.z])?.id === id)
  itemCache = { items, room, id, out }
  return out
}

let measCache: { ms: Measurement[]; room: Room; id: string; out: Measurement[] } | null = null

export function focusMeasurements(ms: Measurement[], room: Room | null, id: string | null): Measurement[] {
  if (!room || !validFocus(room, id)) return ms
  if (measCache && measCache.ms === ms && measCache.room === room && measCache.id === id) return measCache.out
  const out = ms.filter((m) => spaceOfPoint(room, [(m.a[0] + m.b[0]) / 2, (m.a[2] + m.b[2]) / 2])?.id === id)
  measCache = { ms, room, id, out }
  return out
}
