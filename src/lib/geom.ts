import type { FurnitureItem, Opening, Room, Vec2, Wall } from './types'

/** Converte um vetor local (x, z) do móvel para o mundo, dada a rotação Y (convenção three.js). */
export function rotLocal(lx: number, lz: number, r: number): Vec2 {
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [lx * c + lz * s, -lx * s + lz * c]
}

/** Inverso de rotLocal. */
export function toLocal(wx: number, wz: number, r: number): Vec2 {
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [wx * c - wz * s, wx * s + wz * c]
}

type Footprintable = Pick<FurnitureItem, 'x' | 'z' | 'width' | 'depth' | 'rotation'>

export function footprint(it: Footprintable, grow = 0): Vec2[] {
  const hw = it.width / 2 + grow
  const hd = it.depth / 2 + grow
  const pts: Vec2[] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ]
  return pts.map(([lx, lz]) => {
    const [dx, dz] = rotLocal(lx, lz, it.rotation)
    return [it.x + dx, it.z + dz]
  })
}

/** Meia-extensão da caixa alinhada aos eixos do retângulo rotacionado. */
export function aabbHalf(w: number, d: number, r: number): Vec2 {
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  return [(c * w) / 2 + (s * d) / 2, (s * w) / 2 + (c * d) / 2]
}

export function itemAabb(it: Footprintable) {
  const [hx, hz] = aabbHalf(it.width, it.depth, it.rotation)
  return { minX: it.x - hx, maxX: it.x + hx, minZ: it.z - hz, maxZ: it.z + hz, hx, hz }
}

/** SAT para polígonos convexos. Retorna a menor penetração (<= 0 significa separados). */
export function overlapDepth(a: Vec2[], b: Vec2[]): number {
  let min = Infinity
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      let nx = -(q[1] - p[1])
      let nz = q[0] - p[0]
      const len = Math.hypot(nx, nz)
      if (len < 1e-9) continue
      nx /= len
      nz /= len
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity
      for (const v of a) {
        const d = v[0] * nx + v[1] * nz
        if (d < aMin) aMin = d
        if (d > aMax) aMax = d
      }
      for (const v of b) {
        const d = v[0] * nx + v[1] * nz
        if (d < bMin) bMin = d
        if (d > bMax) bMax = d
      }
      const o = Math.min(aMax, bMax) - Math.max(aMin, bMin)
      if (o <= 0) return o
      if (o < min) min = o
    }
  }
  return min
}

export function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1]
    const xj = poly[j][0], zj = poly[j][1]
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

export function polyArea(poly: Vec2[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    s += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(s) / 2
}

/** Interseção de raio (o + t·d) com segmento [a, b]. Retorna t ou null. */
export function raySeg(o: Vec2, d: Vec2, a: Vec2, b: Vec2): number | null {
  const ex = b[0] - a[0]
  const ez = b[1] - a[1]
  const den = d[0] * ez - d[1] * ex
  if (Math.abs(den) < 1e-12) return null
  const ax = a[0] - o[0]
  const az = a[1] - o[1]
  const t = (ax * ez - az * ex) / den
  const u = (ax * d[1] - az * d[0]) / den
  if (u < -1e-6 || u > 1 + 1e-6) return null
  return t
}

export function pointSegDist(p: Vec2, a: Vec2, b: Vec2): number {
  const ex = b[0] - a[0]
  const ez = b[1] - a[1]
  const L2 = ex * ex + ez * ez
  let t = L2 > 0 ? ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * ex), p[1] - (a[1] + t * ez))
}

export const wallLength = (w: Wall) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])
export function wallDir(w: Wall): Vec2 {
  const L = wallLength(w) || 1
  return [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L]
}

/** Polígonos de piso: um por cômodo (casa) ou o piso único. */
export function floorPolys(room: Room): Vec2[][] {
  return room.spaces?.length ? room.spaces.map((s) => s.floor) : [room.floor]
}

export const inFloor = (p: Vec2, room: Room) => floorPolys(room).some((poly) => pointInPoly(p, poly))

export function spaceAt(room: Room, p: Vec2) {
  return room.spaces?.find((s) => pointInPoly(p, s.floor)) ?? null
}

export function floorArea(room: Room) {
  return floorPolys(room).reduce((a, poly) => a + polyArea(poly), 0)
}

/** Espessura desenhada da parede no ponto s (distância a partir de wall.a). */
export function wallThicknessAt(room: Room, w: Wall, s: number) {
  for (const [s0, s1, t] of w.thicknessSpans ?? []) if (s >= s0 - 1e-6 && s <= s1 + 1e-6) return t
  return w.thickness ?? room.wallThickness
}

/** Centroide (por área) de um polígono simples. */
export function polyCentroid(poly: Vec2[]): Vec2 {
  let a = 0, cx = 0, cz = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const c = p[0] * q[1] - q[0] * p[1]
    a += c
    cx += (p[0] + q[0]) * c
    cz += (p[1] + q[1]) * c
  }
  if (Math.abs(a) < 1e-9) return poly[0] ?? [0, 0]
  return [cx / (3 * a), cz / (3 * a)]
}

/** Recorte de polígono por semiplano (mantém (p - p0)·n >= 0). */
export function clipHalf(poly: Vec2[], p0: Vec2, n: Vec2): Vec2[] {
  const out: Vec2[] = []
  const d = (p: Vec2) => (p[0] - p0[0]) * n[0] + (p[1] - p0[1]) * n[1]
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const dp = d(p)
    const dq = d(q)
    if (dp >= -1e-9) out.push(p)
    if ((dp >= -1e-9) !== (dq >= -1e-9)) {
      const t = dp / (dp - dq)
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return cleanPoly(out)
}

/** Remove pontos repetidos e colineares (inclusive "espinhos" de ida e volta). */
export function cleanPoly(poly: Vec2[]): Vec2[] {
  let pts = poly.slice()
  let changed = true
  while (changed && pts.length > 3) {
    changed = false
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length]
      const b = pts[i]
      const c = pts[(i + 1) % pts.length]
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6 || Math.abs(cross) < 1e-7) {
        pts.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return pts
}

export function roomBounds(room: Room) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  const pts: Vec2[] = [...floorPolys(room).flat(), ...room.walls.flatMap((w) => [w.a, w.b])]
  for (const [x, z] of pts) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 4, minZ: 0, maxZ: 3, cx: 2, cz: 1.5, w: 4, d: 3 }
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ }
}

/** Geometria 2D da abertura da porta (para arco de giro e checagem de bloqueio). */
export function doorSwing(room: Room, op: Opening) {
  const wall = room.walls.find((w) => w.id === op.wallId)
  if (!wall) return null
  const u = wallDir(wall)
  const n = wall.normal
  const hingeOff = op.hingeAtEnd ? op.offset + op.width / 2 : op.offset - op.width / 2
  const hinge: Vec2 = [wall.a[0] + u[0] * hingeOff, wall.a[1] + u[1] * hingeOff]
  const closedDir: Vec2 = op.hingeAtEnd ? [-u[0], -u[1]] : [u[0], u[1]]
  const openDir: Vec2 = op.swingOut ? [-n[0], -n[1]] : [n[0], n[1]]
  return { wall, hinge, closedDir, openDir, radius: op.width }
}

export function swingPolygon(room: Room, op: Opening, steps = 14): Vec2[] | null {
  const s = doorSwing(room, op)
  if (!s) return null
  const pts: Vec2[] = [s.hinge]
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2)
    const dx = s.closedDir[0] * Math.cos(a) + s.openDir[0] * Math.sin(a)
    const dz = s.closedDir[1] * Math.cos(a) + s.openDir[1] * Math.sin(a)
    pts.push([s.hinge[0] + dx * s.radius, s.hinge[1] + dz * s.radius])
  }
  return pts
}

/** Polígono 2D (no piso) da área de uma abertura sobre a parede, com profundidade `depth` para dentro. */
export function openingZone(room: Room, op: Opening, depth: number): Vec2[] | null {
  const wall = room.walls.find((w) => w.id === op.wallId)
  if (!wall) return null
  const u = wallDir(wall)
  const n = wall.normal
  const s0 = op.offset - op.width / 2
  const s1 = op.offset + op.width / 2
  const p0: Vec2 = [wall.a[0] + u[0] * s0, wall.a[1] + u[1] * s0]
  const p1: Vec2 = [wall.a[0] + u[0] * s1, wall.a[1] + u[1] * s1]
  return [p0, p1, [p1[0] + n[0] * depth, p1[1] + n[1] * depth], [p0[0] + n[0] * depth, p0[1] + n[1] * depth]]
}

/** Porta de correr aparente (folha sobre a parede, pendurada num trilho em cima). */
export const isSliding = (op: Opening) => op.kind === 'door' && op.doorType === 'sliding'

/**
 * Da face interna da parede até a face do outro lado do vão. Porta entre cômodos: as duas paredes
 * (a desta abertura e a do recorte do outro lado) somadas.
 */
export function openingDepth(room: Room, op: Opening): number {
  const w = room.walls.find((x) => x.id === op.wallId)
  if (!w) return room.wallThickness
  const t = wallThicknessAt(room, w, op.offset)
  const g = op.pairId ? room.openings.find((o) => o.id === op.pairId) : undefined
  const gw = g && room.walls.find((x) => x.id === g.wallId)
  if (!gw) return t
  const d = Math.abs((gw.a[0] - w.a[0]) * w.normal[0] + (gw.a[1] - w.a[1]) * w.normal[1])
  return d > t - 0.005 && d < 0.6 ? d : t
}

/**
 * Porta de correr, ao longo da parede (u): a folha passa 4 cm de cada lado do vão; aberta, corre
 * para o lado `side` até liberar o vão. O trilho cobre os dois lugares da folha.
 */
export function slidingLayout(op: Opening) {
  const side = op.hingeAtEnd ? 1 : -1
  const lw = op.width + 0.08
  const shift = op.width + 0.06
  const center = op.offset + (op.isOpen ? side * shift : 0)
  const r0 = op.offset - side * (lw / 2 + 0.02)
  const r1 = op.offset + side * (shift + lw / 2 + 0.02)
  return { side, lw, shift, center, rail: [Math.min(r0, r1), Math.max(r0, r1)] as Vec2 }
}

/** Faixa no piso por onde a folha de correr passa (vão + onde ela fica aberta), na face do trilho. */
export function slidingZone(room: Room, op: Opening, depth?: number): Vec2[] | null {
  const wall = room.walls.find((w) => w.id === op.wallId)
  if (!wall) return null
  // trilho + folha (profundidade informada ou padrão) e mais uns 5 cm do puxador
  depth ??= (op.railDepth ?? 0.024 + (op.glass ? 0.01 : 0.035)) + 0.05
  const u = wallDir(wall)
  const n = wall.normal
  const { rail } = slidingLayout(op)
  const k0 = op.swingOut ? -openingDepth(room, op) : 0
  const k1 = k0 + (op.swingOut ? -depth : depth)
  const P = (sv: number, k: number): Vec2 => [wall.a[0] + u[0] * sv + n[0] * k, wall.a[1] + u[1] * sv + n[1] * k]
  return [P(rail[0], k0), P(rail[1], k0), P(rail[1], k1), P(rail[0], k1)]
}

/** Área do piso que precisa ficar livre; com `below`, só para o que começa abaixo dessa altura. */
export interface Clearance {
  poly: Vec2[]
  below?: number
}

/** O que precisa ficar livre para usar a porta: o giro da folha ou, na de correr, a passagem, a folha e o puxador. */
export function doorClearance(room: Room, op: Opening): Clearance[] {
  if (isSliding(op)) {
    const dep = openingDepth(room, op)
    const leaf = op.railDepth ?? 0.024 + (op.glass ? 0.01 : 0.035)
    // o puxador só ocupa a faixa de altura dele
    const hy = op.bottom + Math.min(1.0, (op.height + 0.03) * 0.47)
    const half = op.handle === 'puxador-longo' ? 0.5 : op.handle === 'concha' ? 0.08 : 0.2
    // passagem: o miolo do vão (um balcão que avança uns centímetros na borda não fecha a porta)
    const mid = { ...op, width: Math.max(0.3, op.width - 0.2) }
    const out: Clearance[] = []
    const add = (poly: Vec2[] | null, below?: number) => poly && out.push({ poly, below })
    add(slidingZone(room, op, leaf + 0.005))
    add(slidingZone(room, op, leaf + 0.05), hy + half)
    add(openingZone(room, mid, 0.45))
    add(openingZone(room, mid, -(dep + 0.45)))
    return out
  }
  const poly = swingPolygon(room, op)
  return poly ? [{ poly }] : []
}

/** A ponta esquerda da parede (vista de dentro do cômodo) é wall.a? */
export function wallLeftIsA(w: Wall): boolean {
  const u = wallDir(w)
  // direita de quem olha para a parede = (nz, -nx)
  return u[0] * w.normal[1] - u[1] * w.normal[0] > 0
}

/** Converte [esquerda, esquerda+largura] (vista de dentro) para distâncias a partir de wall.a. */
export function panelSpan(w: Wall, left: number, width: number): [number, number] {
  const L = wallLength(w)
  return wallLeftIsA(w) ? [left, left + width] : [L - left - width, L - left]
}

/** Nome amigável pela posição na planta (+ o que há nela). */
export function wallName(room: Room, w: Wall): string {
  const [nx, nz] = w.normal
  let pos = `${room.walls.indexOf(w) + 1}`
  if (Math.abs(nz) > 0.9) pos = nz > 0 ? 'de cima' : 'de baixo'
  else if (Math.abs(nx) > 0.9) pos = nx > 0 ? 'da esquerda' : 'da direita'
  else pos = 'diagonal'
  const space = room.spaces?.find((s) => s.id === w.spaceId)
  const kinds = [
    ...new Set(
      room.openings.filter((o) => o.wallId === w.id && !o.ghost).map((o) => (o.kind === 'door' ? 'porta' : o.kind === 'window' ? 'janela' : 'vão')),
    ),
  ]
  const doorsTo = room.openings.filter((o) => o.wallId === w.id && o.ghost).length
  if (doorsTo && !kinds.includes('porta')) kinds.unshift('porta')
  return `Parede ${pos}${space ? ` — ${space.name}` : ' (planta)'}${kinds.length ? ` · com ${kinds.join(' e ')}` : ''}`
}

/** Recorta o segmento [a,b] por um polígono convexo (Cyrus–Beck). Retorna o intervalo [t0,t1] em 0..1 ou null. */
export function clipSegToConvex(a: Vec2, b: Vec2, poly: Vec2[]): [number, number] | null {
  const c = polyCentroid(poly)
  let t0 = 0
  let t1 = 1
  const d: Vec2 = [b[0] - a[0], b[1] - a[1]]
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    let nx = -(q[1] - p[1])
    let nz = q[0] - p[0]
    if (nx * (c[0] - p[0]) + nz * (c[1] - p[1]) < 0) {
      nx = -nx
      nz = -nz
    }
    const num = nx * (a[0] - p[0]) + nz * (a[1] - p[1])
    const den = nx * d[0] + nz * d[1]
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return null
      continue
    }
    const t = -num / den
    if (den > 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return null
  }
  return [t0, t1]
}

/** O retângulo (encolhido) do móvel atravessa alguma parede fora de portas/vãos? */
export function crossesWall(room: Room, fp: Vec2[], bottom: number, top: number): Wall | null {
  for (const w of room.walls) {
    if (bottom >= w.height) continue
    const hit = clipSegToConvex(w.a, w.b, fp)
    if (!hit) continue
    const L = wallLength(w)
    const s0 = hit[0] * L
    const s1 = hit[1] * L
    if (s1 - s0 < 0.003) continue
    const through = room.openings.some(
      (o) => o.wallId === w.id && o.offset - o.width / 2 <= s0 + 1e-3 && o.offset + o.width / 2 >= s1 - 1e-3 && o.bottom <= bottom + 1e-3 && o.bottom + o.height >= top - 1e-3,
    )
    if (!through) return w
  }
  return null
}
