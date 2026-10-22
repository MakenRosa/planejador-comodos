/**
 * Medidas conferidas com trena: cada parede, porta/janela e pé-direito fica "do scan" (sem registro),
 * "a conferir" ou "conferida". Com a margem de erro do scan, aponta os encaixes justos — móvel de
 * parede a parede com folga menor que a margem — que ainda dependem de parede não conferida.
 */
import { computeClearances, type Clearance } from './clearance'
import { wallLength, wallName } from './geom'
import { endWalls } from './wallEdit'
import type { FurnitureItem, MeasureCheck, Opening, Room, Selection, Wall } from './types'
import { fmtCm, fmtCmShort } from './util'

export const DEFAULT_TOLERANCE = 0.02
export const tolerance = (room: Room) => room.checkTolerance ?? DEFAULT_TOLERANCE

export const wallKey = (id: string) => `wall:${id}`
export const heightKey = (spaceId: string | undefined) => `height:${spaceId ?? 'casa'}`
/** Porta entre cômodos são duas aberturas (uma de cada lado): a conferência fica na principal. */
export const openingKey = (op: Opening) => `opening:${op.ghost && op.pairId ? op.pairId : op.id}`

export const isChecked = (room: Room, key: string) => room.checks?.[key]?.state === 'conferida'

export const CHECK_LABEL = { scan: 'Do scan', 'a-conferir': 'A conferir', conferida: 'Conferida' } as const
export type CheckState = keyof typeof CHECK_LABEL
export const stateOf = (c: MeasureCheck | undefined): CheckState => c?.state ?? 'scan'

const KIND = { door: 'Porta', window: 'Janela', opening: 'Vão' } as const
/** Nome curto da parede (sem "· com porta…"). */
export const shortWallName = (room: Room, w: Wall) => wallName(room, w).replace(/ · com .*$/, '')

export interface CheckEntry {
  key: string
  kind: 'wall' | 'opening' | 'height'
  name: string
  /** A medida, para conferir com a trena. */
  value: string
  spaceId?: string
  /** Porta entre cômodos: o cômodo do outro lado (ela aparece nos dois). */
  alsoIn?: string
  select: NonNullable<Selection> | null
  check?: MeasureCheck
}

/** É deste cômodo (porta entre cômodos vale para os dois lados)? */
export const inSpace = (e: CheckEntry, spaceId: string) => e.spaceId === spaceId || e.alsoIn === spaceId

/** Tudo o que dá para conferir na casa, por cômodo: paredes, portas e janelas, pé-direito. */
export function listChecks(room: Room): CheckEntry[] {
  const out: CheckEntry[] = []
  const spaces = room.spaces?.length ? room.spaces : [undefined]
  for (const sp of spaces) {
    const walls = room.walls.filter((w) => (sp ? w.spaceId === sp.id : true))
    for (const w of walls) {
      const key = wallKey(w.id)
      out.push({ key, kind: 'wall', name: shortWallName(room, w).replace(sp ? ` — ${sp.name}` : ' (planta)', ''), value: fmtCm(wallLength(w)), spaceId: sp?.id, select: { kind: 'wall', id: w.id }, check: room.checks?.[key] })
    }
    for (const op of room.openings) {
      const w = walls.find((x) => x.id === op.wallId)
      if (!w || op.ghost) continue
      const key = openingKey(op)
      const where = shortWallName(room, w).replace(/^Parede /, '').replace(sp ? ` — ${sp.name}` : ' (planta)', '')
      const pair = op.pairId ? room.openings.find((o) => o.id === op.pairId) : undefined
      const other = pair && room.spaces?.find((s) => s.id === room.walls.find((x) => x.id === pair.wallId)?.spaceId)
      out.push({
        key,
        kind: 'opening',
        name: other && sp ? `${KIND[op.kind]} entre ${sp.name} e ${other.name}` : `${KIND[op.kind]} · parede ${where}`,
        alsoIn: other?.id,
        value: `${fmtCmShort(op.width)} × ${fmtCmShort(op.height)} cm${op.kind === 'window' ? ` · peitoril ${fmtCmShort(op.bottom)}` : ''}`,
        spaceId: sp?.id,
        select: { kind: 'opening', id: op.id },
        check: room.checks?.[key],
      })
    }
    const key = heightKey(sp?.id)
    out.push({ key, kind: 'height', name: 'Pé-direito', value: fmtCm(sp ? sp.ceilingHeight : room.ceilingHeight), spaceId: sp?.id, select: sp ? { kind: 'space', id: sp.id } : null, check: room.checks?.[key] })
  }
  return out
}

/** Face do móvel até o fim da fileira: atravessa os móveis encostados nesta direção (até 4). */
function reach(item: FurnitureItem, d: [number, number], room: Room, items: FurnitureItem[], depth = 0): { gap: number; end: Clearance; via: string[] } | null {
  const r = computeClearances(item, room, items, 8, true).find((c) => c.d[0] * d[0] + c.d[1] * d[1] > 0.99)
  if (!r) return null
  const next = r.target === 'item' && r.dist < 0.005 && depth < 4 ? items.find((o) => o.id === r.targetId) : undefined
  if (next) {
    const more = reach(next, d, room, items, depth + 1)
    if (more) return { gap: r.dist + more.gap, end: more.end, via: [next.name, ...more.via] }
  }
  return { gap: r.dist, end: r, via: [] }
}

export interface FitIssue {
  /** Eixo do móvel: x = largura, z = profundidade. */
  axis: 'x' | 'z'
  /** Folga somada dos dois lados (até as paredes). */
  slack: number
  /**
   * O que medir com trena: as paredes que vão de uma ponta à outra (o comprimento delas, de quina a
   * quina, é o vão — basta conferir uma) ou, sem parede assim, as duas paredes das pontas.
   */
  walls: string[]
  span: boolean
  /** Móveis encostados no meio da fileira. */
  via: string[]
}

/**
 * Encaixes justos do móvel: de parede a parede (direto ou com outros móveis encostados no meio), com
 * folga menor que a margem do scan, enquanto o vão entre essas paredes não foi conferido com trena.
 */
export function fitIssues(item: FurnitureItem, room: Room, items: FurnitureItem[]): FitIssue[] {
  const tol = tolerance(room)
  const out: FitIssue[] = []
  for (const axis of ['x', 'z'] as const) {
    const rays = computeClearances(item, room, items, 8, true).filter((c) => c.axis === axis)
    const ends = rays.map((r) => reach(item, r.d, room, items))
    if (ends.length !== 2 || ends.some((e) => !e || e.end.target !== 'wall')) continue
    const slack = ends[0]!.gap + ends[1]!.gap
    if (slack >= tol) continue
    const [A, B] = ends.map((e) => e!.end.wallId!)
    if (A === B) continue
    const via = [...ends[0]!.via, ...ends[1]!.via]
    // o vão entre A e B é o comprimento da parede que liga as duas
    const spans = room.walls.filter((w) => {
      const e = endWalls(room, w)
      return (e.a?.id === A && e.b?.id === B) || (e.a?.id === B && e.b?.id === A)
    })
    if (spans.length) {
      if (!spans.some((w) => isChecked(room, wallKey(w.id)))) out.push({ axis, slack, walls: spans.map((w) => w.id), span: true, via })
    } else {
      const walls = [A, B].filter((id) => !isChecked(room, wallKey(id)))
      if (walls.length) out.push({ axis, slack, walls, span: false, via })
    }
  }
  return out
}
