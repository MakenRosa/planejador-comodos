/**
 * Importador do formato JSON do Apple RoomPlan (CapturedRoom Codable, version 2).
 *
 * As matrizes `transform` são simd_float4x4 em ordem column-major. As dimensões de
 * paredes/portas/janelas são [largura, altura, 0]; de objetos são [largura, altura, profundidade],
 * com o transform no centro da caixa.
 *
 * O cômodo é normalizado: piso em y = 0, paredes alinhadas aos eixos X/Z (girando pela parede
 * mais longa) e origem no canto mínimo — assim as coordenadas viram "distância da parede".
 */
import type { Opening, OpeningKind, Room, ScannedObject, Vec2, Wall } from './types'
import { pointInPoly, pointSegDist, wallDir, wallLength } from './geom'
import { round4 } from './util'

type M = number[]
interface RPSurface {
  identifier: string
  parentIdentifier?: string | null
  dimensions: number[]
  transform: M
  polygonCorners?: number[][]
  category?: Record<string, Record<string, unknown>>
  confidence?: Record<string, unknown>
  attributes?: Record<string, string>
}
interface RPJson {
  walls: RPSurface[]
  doors?: RPSurface[]
  windows?: RPSurface[]
  openings?: RPSurface[]
  floors?: RPSurface[]
  objects?: RPSurface[]
  sections?: { label?: string; center?: number[] }[]
}

const yawOf = (m: M) => Math.atan2(-m[2], m[0])

function apply(m: M, x: number, y: number, z: number) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

export const SECTION_NAMES: Record<string, string> = {
  bedroom: 'Quarto',
  livingRoom: 'Sala de estar',
  diningRoom: 'Sala de jantar',
  kitchen: 'Cozinha',
  bathroom: 'Banheiro',
  office: 'Escritório',
}

export function isRoomPlan(json: unknown): json is RPJson {
  const j = json as RPJson
  return !!j && Array.isArray(j.walls) && j.walls.length > 0 && Array.isArray(j.walls[0].transform)
}

export function parseRoomPlan(json: RPJson): Room {
  const walls = json.walls
  const floorY =
    json.floors?.[0]?.transform != null
      ? json.floors[0].transform[13]
      : Math.min(...walls.map((w) => w.transform[13] - w.dimensions[1] / 2))

  // Ângulo de referência: parede mais longa, reduzido a [-45°, 45°]
  const longest = walls.reduce((a, b) => (b.dimensions[0] > a.dimensions[0] ? b : a))
  let alpha = yawOf(longest.transform)
  alpha -= Math.round(alpha / (Math.PI / 2)) * (Math.PI / 2)
  const c = Math.cos(-alpha)
  const s = Math.sin(-alpha)
  const rot = (x: number, z: number): Vec2 => [x * c + z * s, -x * s + z * c]

  const rawWalls = walls.map((w) => {
    const m = w.transform
    const L = w.dimensions[0]
    const n = Math.hypot(m[0], m[2]) || 1
    const ux = m[0] / n
    const uz = m[2] / n
    return {
      id: w.identifier,
      a: rot(m[12] - (ux * L) / 2, m[14] - (uz * L) / 2),
      b: rot(m[12] + (ux * L) / 2, m[14] + (uz * L) / 2),
      top: m[13] + w.dimensions[1] / 2 - floorY,
    }
  })

  const xs = rawWalls.flatMap((w) => [w.a[0], w.b[0]])
  const zs = rawWalls.flatMap((w) => [w.a[1], w.b[1]])
  const ox = Math.min(...xs)
  const oz = Math.min(...zs)
  const T = (p: Vec2): Vec2 => [round4(p[0] - ox), round4(p[1] - oz)]
  const world = (x: number, z: number) => T(rot(x, z))

  const mids = rawWalls.map((w) => T([(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]))
  const centroid: Vec2 = [
    mids.reduce((s, p) => s + p[0], 0) / mids.length,
    mids.reduce((s, p) => s + p[1], 0) / mids.length,
  ]

  const ceilingHeight = Math.max(...rawWalls.map((w) => w.top))

  let floor: Vec2[] = []
  const f = json.floors?.[0]
  if (f?.polygonCorners && f.polygonCorners.length >= 3) {
    floor = f.polygonCorners.map(([x, y, z]) => {
      const w = apply(f.transform, x, y, z ?? 0)
      return world(w[0], w[2])
    })
  }

  const outWalls: Wall[] = rawWalls.map((w, i) => {
    const a = T(w.a)
    const b = T(w.b)
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    let n: Vec2 = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]
    const mid = mids[i]
    // Lado interno: o que cai dentro do piso (funciona em cômodos em L); sem piso, aponta para o centroide
    const inside = floor.length >= 3 ? pointInPoly([mid[0] + n[0] * 0.08, mid[1] + n[1] * 0.08], floor) : n[0] * (centroid[0] - mid[0]) + n[1] * (centroid[1] - mid[1]) >= 0
    if (!inside) n = [-n[0], -n[1]]
    return { id: w.id, a, b, height: round4(w.top), normal: [round4(n[0]), round4(n[1])] }
  })

  const openings: Opening[] = []
  const addOpenings = (list: RPSurface[] | undefined, kind: OpeningKind) => {
    for (const o of list ?? []) {
      const m = o.transform
      const p = world(m[12], m[14])
      let wall = outWalls.find((w) => w.id === o.parentIdentifier)
      if (!wall) {
        wall = outWalls.reduce((best, w) => (pointSegDist(p, w.a, w.b) < pointSegDist(p, best.a, best.b) ? w : best))
      }
      const u = wallDir(wall)
      const L = wallLength(wall)
      const width = o.dimensions[0]
      const height = o.dimensions[1]
      let offset = (p[0] - wall.a[0]) * u[0] + (p[1] - wall.a[1]) * u[1]
      offset = Math.max(width / 2, Math.min(L - width / 2, offset))
      let bottom = m[13] - height / 2 - floorY
      if (bottom < 0.03) bottom = 0
      const doorCat = o.category?.door as { isOpen?: boolean } | undefined
      openings.push({
        id: o.identifier,
        wallId: wall.id,
        kind,
        offset: round4(offset),
        width: round4(width),
        height: round4(height),
        bottom: round4(bottom),
        isOpen: !!doorCat?.isOpen,
        hingeAtEnd: false,
        swingOut: false,
      })
    }
  }
  addOpenings(json.doors, 'door')
  addOpenings(json.windows, 'window')
  addOpenings(json.openings, 'opening')

  if (floor.length < 3) {
    const pts = outWalls.flatMap((w) => [w.a, w.b])
    floor = pts
      .map((p) => ({ p, ang: Math.atan2(p[1] - centroid[1], p[0] - centroid[0]) }))
      .sort((a, b) => a.ang - b.ang)
      .map((x) => x.p)
  }

  const scanned: ScannedObject[] = (json.objects ?? []).map((o) => {
    const m = o.transform
    const [w, h, d] = o.dimensions
    const p = world(m[12], m[14])
    let bottom = m[13] - h / 2 - floorY
    if (bottom < 0.03) bottom = 0
    return {
      id: o.identifier,
      category: Object.keys(o.category ?? { object: {} })[0] ?? 'object',
      attributes: o.attributes ?? {},
      position: [p[0], round4(bottom), p[1]],
      size: [round4(w), round4(h), round4(d)],
      rotation: yawOf(m) - alpha,
      confidence: Object.keys(o.confidence ?? {})[0] ?? '',
    }
  })

  const label = json.sections?.[0]?.label ?? ''
  const sections = (json.sections ?? [])
    .filter((x) => x.center && x.center.length >= 3)
    .map((x) => ({ label: x.label ?? 'unidentified', center: world(x.center![0], x.center![2]) }))
  return {
    name: SECTION_NAMES[label] ?? 'Cômodo',
    walls: outWalls,
    openings,
    floor,
    ceilingHeight: round4(ceilingHeight),
    wallThickness: 0.12,
    scanned,
    sections,
  }
}

/** Cômodo retangular simples, para começar sem scan. */
export function rectangularRoom(w: number, d: number, h: number, name = 'Cômodo'): Room {
  const corners: Vec2[] = [
    [0, 0],
    [w, 0],
    [w, d],
    [0, d],
  ]
  const normals: Vec2[] = [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ]
  const walls: Wall[] = corners.map((a, i) => ({
    id: `wall-${i}`,
    a,
    b: corners[(i + 1) % 4],
    height: h,
    normal: normals[i],
  }))
  return { name, walls, openings: [], floor: corners, ceilingHeight: h, wallThickness: 0.12, scanned: [] }
}
