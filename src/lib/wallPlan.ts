/**
 * Forma da parede em planta, com quinas em meia-esquadria (miter).
 *
 * Coordenadas locais da parede: u ao longo dela (0 em wall.a, L em wall.b) e k para fora do cômodo
 * (0 na face interna, t na externa). A face interna termina exatamente no canto; a face externa
 * vai até encontrar a face externa da parede vizinha. Assim a junção fecha sem sobrar nem atravessar,
 * em qualquer ângulo (inclusive a parede diagonal da cozinha).
 */
import { clipHalf, polyArea, wallDir, wallLength, wallThicknessAt } from './geom'
import type { Opening, Room, Vec2, Wall } from './types'
import { round4 } from './util'

export interface WallJoints {
  /** Quanto a face externa avança (positivo) ou recua (negativo) além de cada ponta [a, b]. */
  outer: [number, number]
  /** Há parede vizinha nesta ponta (senão, corte reto). */
  joined: [boolean, boolean]
}

export function wallJoints(room: Room, w: Wall): WallJoints {
  const u = wallDir(w)
  const L = wallLength(w)
  const res: WallJoints = { outer: [0, 0], joined: [false, false] }
  for (const k of [0, 1] as const) {
    const E = k === 0 ? w.a : w.b
    const d: Vec2 = k === 0 ? [-u[0], -u[1]] : u
    let best: { o: Wall; atA: boolean; sin: number } | null = null
    for (const o of room.walls) {
      if (o.id === w.id) continue
      const da = Math.hypot(o.a[0] - E[0], o.a[1] - E[1])
      const db = Math.hypot(o.b[0] - E[0], o.b[1] - E[1])
      if (Math.min(da, db) > 0.06) continue
      const ou = wallDir(o)
      const sin = Math.abs(u[0] * ou[1] - u[1] * ou[0])
      if (sin < 0.2) continue
      if (!best || sin > best.sin + 1e-6) best = { o, atA: da <= db, sin }
    }
    if (!best) continue
    const o = best.o
    const tA = wallThicknessAt(room, w, k === 0 ? 0 : L)
    const tB = wallThicknessAt(room, o, best.atA ? 0 : wallLength(o))
    const outA: Vec2 = [-w.normal[0], -w.normal[1]]
    const outB: Vec2 = [-o.normal[0], -o.normal[1]]
    const dB = wallDir(o)
    // E + outA·tA + d·s = E + outB·tB + dB·r  →  d·s − dB·r = outB·tB − outA·tA
    const rhs: Vec2 = [outB[0] * tB - outA[0] * tA, outB[1] * tB - outA[1] * tA]
    const b: Vec2 = [-dB[0], -dB[1]]
    const den = d[0] * b[1] - d[1] * b[0]
    if (Math.abs(den) < 1e-6) continue
    const s = (rhs[0] * b[1] - rhs[1] * b[0]) / den
    res.outer[k] = Math.max(-1, Math.min(1, s))
    res.joined[k] = true
  }
  return res
}

export interface WallPiece {
  /** Trecho ao longo da parede (para recortes de portas/janelas). */
  a: number
  b: number
  /** Polígono convexo em (u, k). */
  poly: Vec2[]
}

/**
 * Pedaços da parede em planta, já com as pontas em meia-esquadria.
 * `cuts`: trechos [u0, u1] onde não há parede (vãos), quando a planta deve mostrá-los abertos.
 * `splits`: posições onde o pedaço deve ser dividido sem remover nada (bordas de portas/janelas,
 * para o corpo 3D recortar cada vão só no trecho dele).
 */
export function wallPieces(room: Room, w: Wall, cuts: [number, number][] = [], splits: number[] = []): WallPiece[] {
  const L = wallLength(w)
  const j = wallJoints(room, w)
  const t0 = wallThicknessAt(room, w, 0)
  const t1 = wallThicknessAt(room, w, L)
  // ponta solta: avança a própria espessura do lado de fora? não — corte reto na ponta
  const e0 = j.joined[0] ? j.outer[0] : 0
  const e1 = j.joined[1] ? j.outer[1] : 0
  const umin = Math.min(0, -e0)
  const umax = Math.max(L, L + e1)
  const breaks = (w.thicknessSpans ?? []).flatMap(([s0, s1]) => [s0, s1]).filter((x) => x > 0 && x < L)
  const extra = [...cuts.flat(), ...splits].filter((x) => x > umin && x < umax)
  const xs = Array.from(new Set([umin, umax, 0, L, ...breaks, ...extra])).sort((p, q) => p - q)
  const out: WallPiece[] = []
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i]
    const b = xs[i + 1]
    if (b - a < 1e-5) continue
    const mid = (a + b) / 2
    if (cuts.some(([c0, c1]) => c0 <= mid && mid <= c1)) continue
    const t = wallThicknessAt(room, w, Math.min(L, Math.max(0, mid)))
    let poly: Vec2[] = [
      [a, 0],
      [b, 0],
      [b, t],
      [a, t],
    ]
    // meia-esquadria: linha do canto interno (0 ou L) até o ponto externo
    const keep: Vec2 = [L / 2, Math.min(t0, t1) / 2]
    const slant = (p1: Vec2, p2: Vec2) => {
      let n: Vec2 = [-(p2[1] - p1[1]), p2[0] - p1[0]]
      if (n[0] * (keep[0] - p1[0]) + n[1] * (keep[1] - p1[1]) < 0) n = [-n[0], -n[1]]
      poly = clipHalf(poly, p1, n)
    }
    slant([0, 0], [-e0, t0])
    if (poly.length >= 3) slant([L, 0], [L + e1, t1])
    if (poly.length >= 3 && polyArea(poly) > 1e-7) out.push({ a, b, poly })
  }
  return out
}

export interface WallHole {
  u0: number
  u1: number
  v0: number
  v1: number
}

export interface WallSolid {
  poly: Vec2[]
  /** Faixa ao longo da parede deste sólido. */
  a: number
  b: number
  v0: number
  v1: number
}

/** Sólidos 3D da parede: cada pedaço vira faixas de altura, descontando os vãos que o cobrem. */
export function wallSolids(pieces: WallPiece[], H: number, holes: WallHole[]): WallSolid[] {
  const out: WallSolid[] = []
  for (const pc of pieces) {
    const mid = (pc.a + pc.b) / 2
    const cover = holes.filter((h) => h.u0 <= mid && mid <= h.u1).sort((p, q) => p.v0 - q.v0)
    let v = 0
    for (const c of cover) {
      const top = Math.min(c.v0, H)
      if (top - v > 1e-4) out.push({ poly: pc.poly, a: pc.a, b: pc.b, v0: v, v1: top })
      v = Math.max(v, c.v1)
    }
    if (H - v > 1e-4) out.push({ poly: pc.poly, a: pc.a, b: pc.b, v0: v, v1: H })
  }
  return out
}

/**
 * Portas/janelas que o scan deixou entrando na espessura de uma parede de outro cômodo
 * (ex.: porta da cozinha encostada na quina do quarto — o RoomPlan mede o vão com batente/erro de
 * encaixe entre scans): o lado que invade a parede é aparado até a face dela, e o outro batente fica
 * onde o scan mediu. Só corrige invasões pequenas (até `maxTrim` no total); portas de ligação entre
 * cômodos (pairId) definem a montagem e não são tocadas.
 */
export function clearOpeningClashes(room: Room, maxTrim = 0.25): Opening[] {
  return shiftPairedDoors(room, trimOpenings(room, maxTrim))
}

/** Polígonos (no piso) de cada parede, para testar invasões. */
function worldPieces(room: Room) {
  const world = new Map<string, Vec2[][]>()
  for (const x of room.walls) {
    const u = wallDir(x)
    const n = x.normal
    world.set(
      x.id,
      wallPieces(room, x).map((pc) => pc.poly.map(([a, k]) => [x.a[0] + u[0] * a - n[0] * k, x.a[1] + u[1] * a - n[1] * k] as Vec2)),
    )
  }
  return world
}

/** Trechos [min, max] (ao longo de `w`) que outras paredes ocupam dentro de [u0, u1] × espessura. */
function blocksIn(room: Room, world: Map<string, Vec2[][]>, w: Wall, u0: number, u1: number, t: number, skip: Set<string>) {
  const u = wallDir(w)
  const n = w.normal
  const local = (p: Vec2): Vec2 => {
    const dx = p[0] - w.a[0]
    const dz = p[1] - w.a[1]
    return [dx * u[0] + dz * u[1], -(dx * n[0] + dz * n[1])]
  }
  const blocks: [number, number][] = []
  for (const x of room.walls) {
    if (skip.has(x.id)) continue
    for (const wp of world.get(x.id)!) {
      let p = wp.map(local)
      p = clipHalf(p, [u0, 0], [1, 0])
      if (p.length >= 3) p = clipHalf(p, [u1, 0], [-1, 0])
      if (p.length >= 3) p = clipHalf(p, [0, 0.002], [0, 1])
      if (p.length >= 3) p = clipHalf(p, [0, t - 0.002], [0, -1])
      if (p.length < 3 || polyArea(p) < 1e-5) continue
      blocks.push([Math.min(...p.map((q) => q[0])), Math.max(...p.map((q) => q[0]))])
    }
  }
  return blocks
}

/**
 * Porta entre cômodos que o scan deixou entrando na quina de uma parede (de um lado ou do outro):
 * desliza a porta e o recorte do outro lado juntos, até ficar 3 cm livre da parede — senão, aberta,
 * a folha fica dentro da parede vizinha. Só corrige deslocamentos pequenos (até `maxShift`).
 */
function shiftPairedDoors(room: Room, openings: Opening[], maxShift = 0.15): Opening[] {
  const world = worldPieces(room)
  const out = openings.slice()
  const margin = 0.03
  for (let i = 0; i < out.length; i++) {
    const o = out[i]
    if (!o.pairId || o.ghost) continue
    const gi = out.findIndex((x) => x.id === o.pairId)
    const w = room.walls.find((x) => x.id === o.wallId)
    const g = out[gi]
    const gw = g && room.walls.find((x) => x.id === g.wallId)
    if (!w || !g || !gw) continue
    const uw = wallDir(w)
    const ug = wallDir(gw)
    const s = uw[0] * ug[0] + uw[1] * ug[1] < 0 ? -1 : 1
    // posição ao longo da parede da porta ↔ ao longo da parede do recorte
    const fromG = (v: number) => o.offset + s * (v - g.offset)
    const skip = new Set([w.id, gw.id])
    const reach = o.width / 2 + maxShift + margin
    const blocks: [number, number][] = blocksIn(room, world, w, o.offset - reach, o.offset + reach, wallThicknessAt(room, w, o.offset), skip)
    for (const [b0, b1] of blocksIn(room, world, gw, g.offset - reach, g.offset + reach, wallThicknessAt(room, gw, g.offset), skip)) {
      const a = fromG(b0)
      const b = fromG(b1)
      blocks.push([Math.min(a, b), Math.max(a, b)])
    }
    // as pontas da parede do recorte também limitam (depois dela começa a quina), a não ser que
    // ela continue reta em outra parede
    for (const v of [0, wallLength(gw)]) {
      const E = v === 0 ? gw.a : gw.b
      const straight = room.walls.some((x) => {
        if (x.id === gw.id) return false
        const ux = wallDir(x)
        if (Math.abs(ux[0] * ug[0] + ux[1] * ug[1]) < 0.999) return false
        return [x.a, x.b].some((q) => Math.hypot(q[0] - E[0], q[1] - E[1]) < 0.01)
      })
      if (straight) continue
      const p = fromG(v)
      blocks.push(v === 0 ? (s > 0 ? [p - 1, p] : [p, p + 1]) : s > 0 ? [p, p + 1] : [p - 1, p])
    }
    let lo = -Infinity
    let hi = Infinity
    let inside = false
    for (const [b0, b1] of blocks) {
      if ((b0 + b1) / 2 < o.offset) lo = Math.max(lo, b1)
      else hi = Math.min(hi, b0)
      if (b0 > o.offset - o.width / 2 + 0.005 && b1 < o.offset + o.width / 2 - 0.005) inside = true
    }
    if (inside) continue
    const half = o.width / 2
    let c = o.offset
    if (c - half < lo + margin) c = lo + margin + half
    if (c + half > hi - margin) c = hi - margin - half
    if (c - half < lo + margin - 1e-6 || Math.abs(c - o.offset) < 0.002 || Math.abs(c - o.offset) > maxShift) continue
    const gc = g.offset + s * (c - o.offset)
    out[i] = { ...o, offset: round4(c) }
    out[gi] = { ...g, offset: round4(gc) }
  }
  return out
}

function trimOpenings(room: Room, maxTrim: number): Opening[] {
  const world = new Map<string, Vec2[][]>()
  for (const x of room.walls) {
    const u = wallDir(x)
    const n = x.normal
    world.set(
      x.id,
      wallPieces(room, x).map((pc) => pc.poly.map(([a, k]) => [x.a[0] + u[0] * a - n[0] * k, x.a[1] + u[1] * a - n[1] * k] as Vec2)),
    )
  }
  return room.openings.map((o) => {
    if (o.pairId || o.ghost) return o
    const w = room.walls.find((x) => x.id === o.wallId)
    if (!w) return o
    const u = wallDir(w)
    const n = w.normal
    const t = wallThicknessAt(room, w, o.offset)
    const u0 = o.offset - o.width / 2
    const u1 = o.offset + o.width / 2
    const local = (p: Vec2): Vec2 => {
      const dx = p[0] - w.a[0]
      const dz = p[1] - w.a[1]
      return [dx * u[0] + dz * u[1], -(dx * n[0] + dz * n[1])]
    }
    // trechos [min, max] ao longo da parede ocupados por outras paredes dentro do vão
    const blocks: [number, number][] = []
    for (const x of room.walls) {
      if (x.id === w.id) continue
      for (const wp of world.get(x.id)!) {
        let p = wp.map(local)
        p = clipHalf(p, [u0, 0], [1, 0])
        if (p.length >= 3) p = clipHalf(p, [u1, 0], [-1, 0])
        if (p.length >= 3) p = clipHalf(p, [0, 0], [0, 1])
        if (p.length >= 3) p = clipHalf(p, [0, t], [0, -1])
        if (p.length < 3 || polyArea(p) < 1e-4) continue
        blocks.push([Math.min(...p.map((q) => q[0])), Math.max(...p.map((q) => q[0]))])
      }
    }
    if (!blocks.length) return o
    const eps = 0.005
    let lo = -Infinity
    let hi = Infinity
    for (const [b0, b1] of blocks) {
      if (b0 <= u0 + eps) lo = Math.max(lo, b1)
      else if (b1 >= u1 - eps) hi = Math.min(hi, b0)
      else return o // parede no meio do vão: não é invasão de quina
    }
    const s0 = Math.max(u0, lo)
    const s1 = Math.min(u1, hi)
    const cut = s0 - u0 + (u1 - s1)
    if (cut < 1e-4 || cut > maxTrim || s1 - s0 < 0.4) return o
    return { ...o, offset: round4((s0 + s1) / 2), width: round4(s1 - s0) }
  })
}
