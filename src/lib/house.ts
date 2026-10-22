/**
 * Monta uma casa a partir de vários scans do RoomPlan (cada um num sistema de coordenadas próprio).
 *
 * Cada ligação diz "a porta X do cômodo A é a mesma passagem que a porta Y do cômodo B". O cômodo B é
 * girado para que as faces das duas paredes fiquem de costas uma para a outra (normais opostas),
 * deslizado para alinhar o centro das portas e afastado pela espessura da parede.
 * Depois: paredes vizinhas ganham metade da folga real como espessura, a porta duplicada vira só
 * um recorte do outro lado, e scans com mais de um ambiente (ex.: cozinha + corredor) são divididos.
 */
import { clipHalf, pointInPoly, polyArea, polyCentroid, rotLocal, wallDir, wallLength } from './geom'
import { parseRoomPlan, SECTION_NAMES } from './roomplan'
import type { Opening, Room, Space, Vec2, Wall } from './types'
import { round4 } from './util'
import { clearOpeningClashes } from './wallPlan'

export interface HouseRoomDef {
  /** Arquivo do scan (relativo à pasta da definição). */
  file: string
  /** Nome do cômodo (quando o scan tem um ambiente só). */
  name: string
  /** Nomes por rótulo de seção do RoomPlan, quando o scan tem mais de um ambiente. */
  spaceNames?: Record<string, string>
  /** Prefixos de ids de aberturas a ignorar (detecções que não existem). */
  exclude?: string[]
  /** Ajustes por abertura (prefixo do id): sentido de abertura, tipo de janela... */
  openingOverrides?: Record<string, Partial<Opening>>
}

export interface HouseConnection {
  /** Índice do cômodo já posicionado e prefixo do id da abertura nele. */
  a: number
  aOpening: string
  b: number
  bOpening: string
  /** Distância entre as faces internas das duas paredes (espessura real), em metros. */
  gap?: number
}

export interface HouseDef {
  app: 'planejador-casa'
  name: string
  /** Espessura desenhada das paredes externas. */
  exteriorWall?: number
  rooms: HouseRoomDef[]
  connections: HouseConnection[]
}

export const isHouseDef = (j: unknown): j is HouseDef => (j as HouseDef)?.app === 'planejador-casa'

/**
 * Sobe quando a geometria gerada muda (junções, espessuras...). Projetos salvos com versão menor
 * têm as paredes refeitas a partir dos scans, preservando o que o usuário editou.
 * 3: quinas em meia-esquadria, fachadas alinhadas, trechos compartilhados até as pontas.
 * 4: portas/janelas que invadiam parede vizinha são aparadas na face dela.
 * 5: portas entre cômodos que entravam na quina deslizam (com o recorte) até ficar livres.
 */
export const HOUSE_GEOMETRY_VERSION = 5

interface Part {
  room: Room
  def: HouseRoomDef
  placed: boolean
}

function transformRoom(r: Room, th: number, t: Vec2) {
  const P = (p: Vec2): Vec2 => {
    const q = rotLocal(p[0], p[1], th)
    return [q[0] + t[0], q[1] + t[1]]
  }
  for (const w of r.walls) {
    w.a = P(w.a)
    w.b = P(w.b)
    w.normal = rotLocal(w.normal[0], w.normal[1], th)
  }
  r.floor = r.floor.map(P)
  for (const o of r.scanned) {
    const [x, z] = P([o.position[0], o.position[2]])
    o.position = [x, o.position[1], z]
    o.rotation += th
  }
  r.sections = (r.sections ?? []).map((s) => ({ ...s, center: P(s.center) }))
}

const findOpening = (r: Room, prefix: string) => {
  const o = r.openings.find((x) => x.id.startsWith(prefix))
  if (!o) throw new Error(`Abertura ${prefix} não encontrada`)
  return o
}

const openingCenter = (r: Room, o: Opening): Vec2 => {
  const w = r.walls.find((x) => x.id === o.wallId)!
  const u = wallDir(w)
  return [w.a[0] + u[0] * o.offset, w.a[1] + u[1] * o.offset]
}

/** Posiciona o cômodo B encostando a porta dele na porta do cômodo A. */
function connect(A: Room, oaId: string, B: Room, obId: string, gap: number) {
  const oa = findOpening(A, oaId)
  const ob = findOpening(B, obId)
  const wa = A.walls.find((w) => w.id === oa.wallId)!
  const wb = B.walls.find((w) => w.id === ob.wallId)!
  const nA = wa.normal
  const nB = wb.normal
  // rotLocal gira um vetor por -θ: queremos R(θ)·nB = -nA
  let th = Math.atan2(nB[1], nB[0]) - Math.atan2(-nA[1], -nA[0])
  const q = Math.round(th / (Math.PI / 2)) * (Math.PI / 2)
  if (Math.abs(th - q) < 0.035) th = q
  const cA = openingCenter(A, oa)
  const cBl = openingCenter(B, ob)
  const cB = rotLocal(cBl[0], cBl[1], th)
  const target: Vec2 = [cA[0] - nA[0] * gap, cA[1] - nA[1] * gap]
  transformRoom(B, th, [target[0] - cB[0], target[1] - cB[1]])
}

/** Divide o piso por "paredes virtuais" (parede inteira ocupada por um vão) e nomeia pelos rótulos do RoomPlan. */
function splitSpaces(r: Room, def: HouseRoomDef, idx: number): Space[] {
  const virtual = r.walls.filter((w) => r.openings.some((o) => o.wallId === w.id && o.width >= 0.9 * wallLength(w)))
  let polys: Vec2[][] = [r.floor]
  for (const w of virtual) {
    const next: Vec2[][] = []
    for (const poly of polys) {
      const A = clipHalf(poly, w.a, w.normal)
      const B = clipHalf(poly, w.a, [-w.normal[0], -w.normal[1]])
      if (A.length >= 3 && B.length >= 3 && polyArea(A) > 0.3 && polyArea(B) > 0.3) next.push(A, B)
      else next.push(poly)
    }
    polys = next
  }
  const sections = r.sections ?? []
  return polys.map((floor, k) => {
    let label = sections.find((s) => pointInPoly(s.center, floor))?.label
    if (!label && sections.length) {
      const c = polyCentroid(floor)
      label = sections.reduce((best, s) => (Math.hypot(s.center[0] - c[0], s.center[1] - c[1]) < Math.hypot(best.center[0] - c[0], best.center[1] - c[1]) ? s : best)).label
    }
    label = label ?? 'unidentified'
    const name = polys.length > 1 ? (def.spaceNames?.[label] ?? SECTION_NAMES[label] ?? def.name) : def.name
    const hasKitchen = sections.some((x) => x.label === 'kitchen')
    const floorType = label === 'bathroom' ? 'ceramic' : label === 'kitchen' || (hasKitchen && polys.length > 1) ? 'porcelain' : 'wood'
    return { id: `s${idx}-${k}`, name, kind: label, floorType, floor: floor.map(([x, z]) => [round4(x), round4(z)] as Vec2), ceilingHeight: r.ceilingHeight }
  })
}

/** Até onde um trecho de parede compartilhada é estendido até a ponta / para cobrir uma brecha curta. */
const SPAN_SNAP = 0.25

/**
 * Trechos compartilhados: estende até a ponta quando falta pouco (a sobra é a junção com a parede
 * perpendicular, não uma parede externa) e preenche brechas curtas com o trecho mais grosso vizinho.
 */
function tidySpans(spans: [number, number, number][], L: number): [number, number, number][] {
  const s = spans.map((x) => [...x] as [number, number, number]).sort((a, b) => a[0] - b[0])
  // sobreposições: mantém o mais fino onde dois trechos se cruzam
  const out: [number, number, number][] = []
  for (const sp of s) {
    const last = out[out.length - 1]
    if (last && sp[0] < last[1]) {
      if (Math.abs(sp[2] - last[2]) < 0.002) last[1] = Math.max(last[1], sp[1])
      else if (sp[2] < last[2]) {
        last[1] = sp[0]
        out.push(sp)
      } else if (sp[1] > last[1]) out.push([last[1], sp[1], sp[2]])
      continue
    }
    if (last && sp[0] - last[1] <= SPAN_SNAP) {
      // brecha curta: o mais grosso dos dois cobre
      if (last[2] >= sp[2]) last[1] = sp[0]
      else sp[0] = last[1]
    }
    out.push(sp)
  }
  if (out.length) {
    if (out[0][0] <= SPAN_SNAP) out[0][0] = 0
    if (L - out[out.length - 1][1] <= SPAN_SNAP) out[out.length - 1][1] = L
  }
  return out.filter((x) => x[1] - x[0] > 1e-4).map(([a, b, t]) => [round4(a), round4(b), t])
}

/**
 * Paredes externas de cômodos vizinhos que deveriam formar uma fachada contínua (paralelas, quase
 * alinhadas, lado a lado): alinha as faces externas pela mais de fora, engrossando a outra.
 */
function alignExteriorFaces(walls: Wall[], wallPart: Map<string, number>, ext: number) {
  const exterior = walls.filter((w) => !w.thicknessSpans?.length && (w.thickness ?? ext) >= ext - 1e-6)
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (const wi of exterior) {
      for (const wj of exterior) {
        if (wi === wj || wallPart.get(wi.id) === wallPart.get(wj.id)) continue
        if (wi.normal[0] * wj.normal[0] + wi.normal[1] * wj.normal[1] < 0.995) continue
        const n = wi.normal
        const ui = wallDir(wi)
        const ti = wi.thickness ?? ext
        const tj = wj.thickness ?? ext
        // posições ao longo da normal (face interna de wi = 0)
        const dn = (wj.a[0] - wi.a[0]) * n[0] + (wj.a[1] - wi.a[1]) * n[1]
        const oi = -ti
        const oj = dn - tj
        if (Math.abs(oi - oj) < 0.001 || Math.abs(oi - oj) > 0.12) continue
        // lado a lado ao longo da parede (separadas só por uma divisória)
        const pi = [0, wallLength(wi)]
        const pj = [wj.a, wj.b].map((p) => (p[0] - wi.a[0]) * ui[0] + (p[1] - wi.a[1]) * ui[1]).sort((a, b) => a - b)
        const gap = Math.max(pj[0] - pi[1], pi[0] - pj[1])
        if (gap > 0.4 || gap < -0.05) continue
        const common = Math.min(oi, oj)
        wi.thickness = round4(-common)
        wj.thickness = round4(dn - common)
        changed = true
      }
    }
    if (!changed) break
  }
}

export function assembleHouse(def: HouseDef, scans: unknown[]): Room {
  const parts: Part[] = def.rooms.map((rd, i) => {
    const room = parseRoomPlan(scans[i] as Parameters<typeof parseRoomPlan>[0])
    room.openings = room.openings
      .filter((o) => !rd.exclude?.some((p) => o.id.startsWith(p)))
      .map((o) => {
        const ov = Object.entries(rd.openingOverrides ?? {}).find(([k]) => o.id.startsWith(k))
        return ov ? { ...o, ...ov[1] } : o
      })
    return { room, def: rd, placed: i === 0 }
  })

  // Posiciona por ligações (em qualquer ordem, até todos estarem no lugar)
  let progress = true
  while (progress) {
    progress = false
    for (const c of def.connections) {
      const A = parts[c.a]
      const B = parts[c.b]
      if (A.placed && !B.placed) {
        connect(A.room, c.aOpening, B.room, c.bOpening, c.gap ?? 0.12)
        B.placed = true
        progress = true
      } else if (B.placed && !A.placed) {
        connect(B.room, c.bOpening, A.room, c.aOpening, c.gap ?? 0.12)
        A.placed = true
        progress = true
      }
    }
  }

  const ext = def.exteriorWall ?? 0.15
  const walls: Wall[] = []
  const openings: Opening[] = []
  const spaces: Space[] = []
  const wallPart = new Map<string, number>()
  parts.forEach((p, i) => {
    if (!p.placed) return
    const sp = splitSpaces(p.room, p.def, i)
    spaces.push(...sp)
    for (const w of p.room.walls) {
      const m: Vec2 = [(w.a[0] + w.b[0]) / 2 + w.normal[0] * 0.15, (w.a[1] + w.b[1]) / 2 + w.normal[1] * 0.15]
      const spaceId = (sp.find((s) => pointInPoly(m, s.floor)) ?? sp[0]).id
      // "Parede" toda ocupada por um vão (passagem entre ambientes): só a verga, fina
      const isPassage = p.room.openings.some((o) => o.wallId === w.id && o.width >= 0.9 * wallLength(w))
      walls.push({ ...w, thickness: isPassage ? 0.06 : ext, spaceId })
      wallPart.set(w.id, i)
    }
    openings.push(...p.room.openings)
  })

  // Paredes vizinhas de cômodos diferentes: cada uma desenha metade da folga real
  for (const wi of walls) {
    const spans: [number, number, number][] = []
    const Li = wallLength(wi)
    const ui = wallDir(wi)
    for (const wj of walls) {
      if (wallPart.get(wj.id) === wallPart.get(wi.id)) continue
      if (wi.normal[0] * wj.normal[0] + wi.normal[1] * wj.normal[1] > -0.99) continue
      const gap = (wj.a[0] - wi.a[0]) * -wi.normal[0] + (wj.a[1] - wi.a[1]) * -wi.normal[1]
      if (gap <= 0.01 || gap > 0.35) continue
      const s = [wj.a, wj.b].map((p) => (p[0] - wi.a[0]) * ui[0] + (p[1] - wi.a[1]) * ui[1]).sort((x, y) => x - y)
      const s0 = Math.max(0, s[0])
      const s1 = Math.min(Li, s[1])
      if (s1 - s0 < 0.05) continue
      spans.push([round4(s0), round4(s1), round4(gap / 2)])
    }
    if (spans.length) wi.thicknessSpans = tidySpans(spans, Li)
  }

  alignExteriorFaces(walls, wallPart, ext)

  // Porta duplicada (um lado de cada scan): mantém uma, o outro lado vira só recorte
  for (const c of def.connections) {
    const oa = openings.find((o) => o.id.startsWith(c.aOpening))
    const ob = openings.find((o) => o.id.startsWith(c.bOpening))
    if (!oa || !ob) continue
    const primary = oa.kind === 'door' || ob.kind !== 'door' ? oa : ob
    const ghost = primary === oa ? ob : oa
    const gw = walls.find((w) => w.id === ghost.wallId)!
    const pc = (() => {
      const pw = walls.find((w) => w.id === primary.wallId)!
      const u = wallDir(pw)
      return [pw.a[0] + u[0] * primary.offset, pw.a[1] + u[1] * primary.offset] as Vec2
    })()
    const gu = wallDir(gw)
    Object.assign(ghost, {
      ghost: true,
      pairId: primary.id,
      kind: primary.kind,
      width: primary.width,
      height: primary.height,
      bottom: primary.bottom,
      offset: round4((pc[0] - gw.a[0]) * gu[0] + (pc[1] - gw.a[1]) * gu[1]),
    })
    Object.assign(primary, {
      pairId: ghost.id,
      kind: 'door',
      // a porta abre para o cômodo do outro lado (normalmente para dentro do quarto/banheiro)
      swingOut: true,
      isOpen: true,
    })
  }

  // Normaliza: origem no canto mínimo
  const pts = [...walls.flatMap((w) => [w.a, w.b]), ...spaces.flatMap((s) => s.floor)]
  const ox = Math.min(...pts.map((p) => p[0])) - ext
  const oz = Math.min(...pts.map((p) => p[1])) - ext
  const T = (p: Vec2): Vec2 => [round4(p[0] - ox), round4(p[1] - oz)]
  for (const w of walls) {
    w.a = T(w.a)
    w.b = T(w.b)
    w.normal = [round4(w.normal[0]), round4(w.normal[1])]
  }
  for (const s of spaces) s.floor = s.floor.map(T)

  const scanned = parts.flatMap((p) =>
    p.room.scanned.map((o) => {
      const [x, z] = T([o.position[0], o.position[2]])
      const sp = spaces.find((s) => pointInPoly([x, z], s.floor))
      return { ...o, position: [x, o.position[1], z] as [number, number, number], spaceKind: sp?.kind }
    }),
  )

  const house: Room = {
    name: def.name,
    walls,
    openings,
    floor: spaces[0]?.floor ?? [],
    spaces,
    ceilingHeight: Math.max(...parts.map((p) => p.room.ceilingHeight)),
    wallThickness: ext,
    scanned,
    houseVersion: HOUSE_GEOMETRY_VERSION,
  }
  house.openings = clearOpeningClashes(house)
  return house
}
