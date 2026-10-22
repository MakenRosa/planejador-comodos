/**
 * Correção de paredes pela medida da trena. A operação básica é "a parede X anda N metros ao longo da
 * normal dela":
 * - as paredes do mesmo cômodo que encostam nela esticam ou encolhem — portas, janelas, azulejos e
 *   trechos de espessura delas ficam onde estão no mundo (o que ia até a quina continua indo);
 * - o piso do cômodo acompanha;
 * - a parede do vizinho de costas para ela (e as emendadas na mesma linha) anda junto, então a espessura
 *   não muda e o vizinho também muda de tamanho;
 * - móveis encostados na parede vão junto, e os que vão de parede a parede (box, bancada entre paredes)
 *   esticam.
 * As correções ficam em room.wallEdits e são reaplicadas quando a casa é refeita a partir dos scans —
 * o scan original não é alterado.
 */
import { TYPES } from '../furniture/catalog'
import { footprint, pointSegDist, rotLocal, wallDir, wallLeftIsA, wallLength } from './geom'
import type { FurnitureItem, Opening, Room, Space, Vec2, Wall, WallEdit, WallPanel } from './types'
import { round4 } from './util'

export interface WallMove {
  wallId: string
  /** Deslocamento aplicado à parede (mundo). */
  v: Vec2
}

export interface MoveResult {
  room: Room
  /** Paredes que andaram (a escolhida e as de costas para ela). */
  moved: WallMove[]
  /** Paredes que esticaram/encolheram: comprimento antes e depois. */
  stretched: { wallId: string; from: number; to: number }[]
  /** Portas/janelas que não cabem mais na parede encurtada. */
  overflow: Opening[]
}

const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1]
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]]
const r2 = (p: Vec2): Vec2 => [round4(p[0]), round4(p[1])]
/** Distância (com sinal, pela normal) do ponto à linha da parede. */
const lineDist = (p: Vec2, w: Wall) => dot(sub(p, w.a), w.normal)

/** Interseção da reta (p0 + t·d) com a reta da parede deslocada (q0 + s·u); null se paralelas. */
function intersect(p0: Vec2, d: Vec2, q0: Vec2, u: Vec2): Vec2 | null {
  const den = d[0] * u[1] - d[1] * u[0]
  if (Math.abs(den) < 1e-9) return null
  const t = ((q0[0] - p0[0]) * u[1] - (q0[1] - p0[1]) * u[0]) / den
  return [p0[0] + d[0] * t, p0[1] + d[1] * t]
}

/** As duas paredes estão de costas (vizinhos separados só pela espessura) e se sobrepõem ao longo? */
function backToBack(w: Wall, o: Wall) {
  if (dot(w.normal, o.normal) > -0.99) return false
  const gap = dot(sub(o.a, w.a), [-w.normal[0], -w.normal[1]])
  if (gap <= 0.01 || gap > 0.35) return false
  const u = wallDir(w)
  const s = [o.a, o.b].map((p) => dot(sub(p, w.a), u)).sort((x, y) => x - y)
  return Math.min(wallLength(w), s[1]) - Math.max(0, s[0]) >= 0.05
}

/** Mesma linha e mesma face, emendadas ponta com ponta (parede do scan dividida em dois trechos). */
function continues(w: Wall, o: Wall) {
  if (dot(w.normal, o.normal) < 0.999 || Math.abs(lineDist(o.a, w)) > 0.01) return false
  return [o.a, o.b].some((p) => [w.a, w.b].some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.02))
}

/** Paredes do mesmo cômodo (sem cômodos: todas). */
const sameSpace = (w: Wall, o: Wall) => (w.spaceId ?? null) === (o.spaceId ?? null)

/** As paredes do cômodo que encostam em cada ponta de `w` (a quina em a e a quina em b). */
export function endWalls(room: Room, w: Wall): { a: Wall | null; b: Wall | null } {
  const u = wallDir(w)
  const at = (p: Vec2) =>
    room.walls.find((o) => o.id !== w.id && sameSpace(w, o) && Math.abs(dot(wallDir(o), u)) < 0.99 && pointSegDist(p, o.a, o.b) < 0.03) ?? null
  return { a: at(w.a), b: at(w.b) }
}

/** Parede de costas para `w` em outro cômodo (o vizinho), se houver. */
export const neighborOf = (room: Room, w: Wall) => room.walls.find((o) => o.id !== w.id && backToBack(w, o)) ?? null

/** Ajusta coordenadas "ao longo da parede" quando a ponta a anda `sa` e o comprimento vira L2. */
function remapPanels(w: Wall, panels: WallPanel[] | undefined, L: number, sa: number, L2: number, movedA: boolean, movedB: boolean) {
  if (!panels?.length) return panels
  const leftIsA = wallLeftIsA(w)
  return panels.map((p) => {
    // [s0,s1] a partir de a, no comprimento antigo
    let s0 = leftIsA ? p.left : L - p.left - p.width
    let s1 = s0 + p.width
    const toA = s0 <= 0.003
    const toB = s1 >= L - 0.003
    s0 -= sa
    s1 -= sa
    // o que ia até a quina que andou continua indo até ela
    if (toA && movedA) s0 = 0
    if (toB && movedB) s1 = L2
    s0 = Math.max(0, s0)
    s1 = Math.min(L2, s1)
    if (s1 - s0 < 0.01) return null
    return { ...p, left: round4(leftIsA ? s0 : L2 - s1), width: round4(s1 - s0) }
  }).filter((p): p is WallPanel => !!p)
}

function remapSpans(spans: Wall['thicknessSpans'], L: number, sa: number, L2: number, movedA: boolean, movedB: boolean) {
  if (!spans?.length) return spans
  const out = spans
    .map(([s0, s1, t]): [number, number, number] => {
      let a = s0 - sa
      let b = s1 - sa
      if (s0 <= 0.003 && movedA) a = 0
      if (s1 >= L - 0.003 && movedB) b = L2
      return [round4(Math.max(0, a)), round4(Math.min(L2, b)), t]
    })
    .filter(([a, b]) => b - a > 1e-4)
  return out
}

/** Move os vértices do piso que estão na linha de `w` para a linha deslocada (deslizando pelas arestas vizinhas). */
function moveFloor(poly: Vec2[], w: Wall, v: Vec2): Vec2[] {
  const u = wallDir(w)
  const L = wallLength(w)
  const on = poly.map((p) => Math.abs(lineDist(p, w)) < 0.01 && dot(sub(p, w.a), u) > -0.05 && dot(sub(p, w.a), u) < L + 0.05)
  if (!on.some(Boolean)) return poly
  const q0 = add(w.a, v)
  return poly.map((p, i) => {
    if (!on[i]) return p
    const n = poly.length
    const nb = [poly[(i + n - 1) % n], poly[(i + 1) % n]].find((_, k) => !on[k === 0 ? (i + n - 1) % n : (i + 1) % n])
    const hit = nb ? intersect(nb, sub(p, nb), q0, u) : null
    return r2(hit ?? add(p, v))
  })
}

/**
 * Anda a parede `wallId` `delta` metros ao longo da normal dela (positivo = para dentro do cômodo, que
 * diminui; negativo = para fora, que aumenta). Função pura: devolve a planta nova e o que mudou.
 */
export function moveWall(room: Room, wallId: string, delta: number): MoveResult | null {
  const W = room.walls.find((w) => w.id === wallId)
  if (!W || Math.abs(delta) < 1e-6) return null
  const v: Vec2 = [W.normal[0] * delta, W.normal[1] * delta]
  // paredes que andam juntas: a escolhida, as de costas para ela e as emendadas na mesma linha
  const moving = new Map<string, Wall>([[W.id, W]])
  const queue = [W]
  while (queue.length) {
    const w = queue.pop()!
    for (const o of room.walls) {
      if (moving.has(o.id)) continue
      if (backToBack(w, o) || (sameSpace(w, o) && continues(w, o))) {
        moving.set(o.id, o)
        queue.push(o)
      }
    }
  }
  const walls = new Map(room.walls.map((w) => [w.id, { ...w }]))
  const openings = room.openings.map((o) => ({ ...o }))
  const stretched: MoveResult['stretched'] = []
  const overflow: Opening[] = []
  // pontas das paredes vizinhas (do mesmo cômodo) que encostam em cada parede que anda
  const ends = new Map<string, { a?: Vec2; b?: Vec2 }>()
  for (const M of moving.values()) {
    const u = wallDir(M)
    const q0 = add(M.a, v)
    for (const A of room.walls) {
      if (moving.has(A.id) || !sameSpace(M, A) || Math.abs(dot(wallDir(A), u)) > 0.99) continue
      for (const k of ['a', 'b'] as const) {
        const p = A[k]
        if (pointSegDist(p, M.a, M.b) > 0.03) continue
        const other = k === 'a' ? A.b : A.a
        const hit = intersect(other, sub(p, other), q0, u)
        if (hit) ends.set(A.id, { ...ends.get(A.id), [k]: r2(hit) })
      }
    }
  }
  for (const M of moving.values()) Object.assign(walls.get(M.id)!, { a: r2(add(M.a, v)), b: r2(add(M.b, v)) })
  for (const [id, e] of ends) {
    const A = room.walls.find((w) => w.id === id)!
    const u = wallDir(A)
    const L = wallLength(A)
    const na = e.a ?? A.a
    const nb = e.b ?? A.b
    const sa = dot(sub(na, A.a), u)
    const L2 = Math.hypot(nb[0] - na[0], nb[1] - na[1])
    const nw = walls.get(id)!
    nw.a = na
    nw.b = nb
    nw.panels = remapPanels(A, A.panels, L, sa, L2, !!e.a, !!e.b)
    nw.thicknessSpans = remapSpans(A.thicknessSpans, L, sa, L2, !!e.a, !!e.b)
    for (const o of openings) {
      if (o.wallId !== id) continue
      o.offset = round4(o.offset - sa)
      if (o.offset - o.width / 2 < -0.001 || o.offset + o.width / 2 > L2 + 0.001) overflow.push(o)
    }
    stretched.push({ wallId: id, from: L, to: L2 })
  }
  // pisos dos cômodos das paredes que andaram
  const spaces: Space[] | undefined = room.spaces?.map((s) => {
    let floor = s.floor
    for (const M of moving.values()) if (M.spaceId === s.id) floor = moveFloor(floor, M, v)
    return floor === s.floor ? s : { ...s, floor }
  })
  let floor = room.floor
  if (spaces?.length) floor = spaces[0].floor
  else for (const M of moving.values()) floor = moveFloor(floor, M, v)
  return {
    room: { ...room, walls: room.walls.map((w) => walls.get(w.id)!), openings, spaces, floor },
    moved: [...moving.values()].map((M) => ({ wallId: M.id, v })),
    stretched,
    overflow,
  }
}

/** Reaplica as correções guardadas (na ordem) — usado quando a casa é refeita a partir dos scans. */
export function applyWallEdits(room: Room, edits: WallEdit[] | undefined): Room {
  let r = room
  for (const e of edits ?? []) r = moveWall(r, e.wallId, e.delta)?.room ?? r
  return r
}

/** Guarda a correção (somando com a última, se for a mesma parede). */
export function withEdit(edits: WallEdit[] | undefined, e: WallEdit): WallEdit[] {
  const list = [...(edits ?? [])]
  const last = list[list.length - 1]
  if (last && last.wallId === e.wallId) list[list.length - 1] = { ...last, delta: round4(last.delta + e.delta) }
  else list.push({ ...e, delta: round4(e.delta) })
  return list.filter((x) => Math.abs(x.delta) > 1e-5)
}

/**
 * Móveis afetados pelas paredes que andaram: os encostados vão junto; os que vão de parede a parede
 * (alinhados com ela) esticam. Devolve o patch de cada um.
 */
export function itemsWithWalls(items: FurnitureItem[], before: Room, moved: WallMove[]): Map<string, Partial<FurnitureItem>> {
  const out = new Map<string, Partial<FurnitureItem>>()
  for (const { wallId, v } of moved) {
    const W = before.walls.find((w) => w.id === wallId)!
    const u = wallDir(W)
    const L = wallLength(W)
    const len = Math.hypot(v[0], v[1])
    const outward = dot(v, W.normal) < 0
    // paredes do mesmo cômodo de frente para esta (para saber se o móvel vai de uma à outra)
    const facing = before.walls.filter((o) => o.id !== W.id && sameSpace(W, o) && dot(o.normal, W.normal) < -0.99)
    for (const it of items) {
      if (out.has(it.id) || it.attachedTo) continue
      const fp = footprint(it)
      const ds = fp.map((p) => lineDist(p, W))
      const near = Math.min(...ds)
      if (near < -0.02 || near > 0.03) continue
      const along = fp.map((p) => dot(sub(p, W.a), u))
      if (Math.max(...along) < 0.02 || Math.min(...along) > L - 0.02) continue
      if (TYPES[it.type]?.noCollide && it.elevation < 0.02) continue
      // vai até a parede da frente? (alinhado com a parede, ±3°)
      const far = Math.max(...ds)
      const lx = rotLocal(1, 0, it.rotation)
      const ax = Math.abs(dot(lx, W.normal))
      const aligned = ax > 0.9986 || ax < 0.0523
      const spans = aligned && facing.some((o) => Math.abs(far - lineDist(o.a, W)) < 0.03)
      if (spans) {
        const grow = outward ? len : -len
        const dim = ax > 0.5 ? 'width' : 'depth'
        out.set(it.id, { [dim]: round4(Math.max(0.05, it[dim] + grow)), x: round4(it.x + v[0] / 2), z: round4(it.z + v[1] / 2) })
      } else out.set(it.id, { x: round4(it.x + v[0]), z: round4(it.z + v[1]) })
    }
  }
  return out
}

export interface MeasurePlan {
  /** Parede da quina escolhida (a que anda). */
  endWall: Wall
  edit: WallEdit
  result: MoveResult
  items: Map<string, Partial<FurnitureItem>>
}

/**
 * "Esta parede mede `measured` por dentro, de quina a quina": anda a parede da ponta `end` (a da quina
 * em w.a ou em w.b) o quanto for preciso, ao longo da normal dela.
 */
export function planMeasuredLength(room: Room, items: FurnitureItem[], w: Wall, measured: number, end: 'a' | 'b'): MeasurePlan | null {
  const E = endWalls(room, w)[end]
  if (!E) return null
  const diff = measured - wallLength(w)
  const P = w[end]
  const Q = end === 'a' ? w.b : w.a
  const L = Math.hypot(P[0] - Q[0], P[1] - Q[1])
  const uOut: Vec2 = [(P[0] - Q[0]) / L, (P[1] - Q[1]) / L]
  const k = dot(uOut, E.normal)
  if (Math.abs(k) < 0.2) return null
  const delta = diff * k
  const result = moveWall(room, E.id, delta)
  if (!result) return null
  return { endWall: E, edit: { wallId: E.id, delta }, result, items: itemsWithWalls(items, room, result.moved) }
}
