import { FLOATING_MIN, TYPES } from '../furniture/catalog'
import { isSolid } from './analysis'
import { aabbHalf, crossesWall, footprint, inFloor, itemAabb, openingZone, overlapDepth, pointInPoly, pointSegDist, roomBounds, rotLocal, toLocal, doorClearance, wallDir, wallLength } from './geom'
import type { FurnitureItem, Opening, Room, ScannedObject, Vec2 } from './types'
import { clamp, normAngle, uid } from './util'

/** O móvel cabe nesta posição (dentro do cômodo, sem colidir, sem bloquear portas)? */
export function fits(c: FurnitureItem, room: Room, items: FurnitureItem[], avoidWindows = false): boolean {
  const fp = footprint(c, -0.002)
  if (!fp.every((p) => inFloor(p, room))) return false
  if (!isSolid(c)) return true
  if (crossesWall(room, footprint(c, -0.01), c.elevation, c.elevation + c.height)) return false
  for (const o of items) {
    if (o.id === c.id || !isSolid(o)) continue
    const v = Math.min(c.elevation + c.height, o.elevation + o.height) - Math.max(c.elevation, o.elevation)
    if (v <= 0.002) continue
    if (overlapDepth(fp, footprint(o)) > 0.002) return false
  }
  for (const op of room.openings) {
    if (op.ghost || c.elevation >= op.bottom + op.height) continue
    if (op.kind === 'door') {
      if (doorClearance(room, op).some((cl) => (cl.below === undefined || c.elevation < cl.below) && overlapDepth(fp, cl.poly) > 0)) return false
    } else if (avoidWindows || op.kind === 'opening') {
      if (c.elevation + c.height <= op.bottom) continue
      const z = openingZone(room, op, op.kind === 'window' ? 0.25 : 0.6)
      if (z && overlapDepth(fp, z) > 0) return false
    }
  }
  return true
}

export function findFreeSpot(item: FurnitureItem, room: Room, items: FurnitureItem[]): Vec2 {
  const b = roomBounds(room)
  const [hx, hz] = aabbHalf(item.width, item.depth, item.rotation)
  const step = 0.05
  // primeiro um lugar que também não tape janela (senão o móvel novo já nasce com alerta)
  for (const avoidWindows of [true, false]) {
    let best: Vec2 | null = null
    let bestD = Infinity
    for (let x = b.minX + hx; x <= b.maxX - hx + 1e-9; x += step) {
      for (let z = b.minZ + hz; z <= b.maxZ - hz + 1e-9; z += step) {
        const dd = (x - b.cx) ** 2 + (z - b.cz) ** 2
        if (dd >= bestD) continue
        if (fits({ ...item, x, z }, room, items, avoidWindows)) {
          best = [x, z]
          bestD = dd
        }
      }
    }
    if (best) return best
  }
  return [b.cx, b.cz]
}

/** Encosta o móvel numa parede livre (frente voltada para o cômodo). */
export function wallPlacement(item: FurnitureItem, room: Room, items: FurnitureItem[]) {
  const walls = [...room.walls].sort((a, b) => wallLength(b) - wallLength(a))
  for (const w of walls) {
    const L = wallLength(w)
    if (item.width > L - 0.02) continue
    const u = wallDir(w)
    const n = w.normal
    const rotation = normAngle(Math.atan2(n[0], n[1]))
    const offs: number[] = [L / 2]
    for (let k = 0.05; k < L / 2; k += 0.05) offs.push(L / 2 + k, L / 2 - k)
    for (const off of offs) {
      if (off - item.width / 2 < 0.005 || off + item.width / 2 > L - 0.005) continue
      const x = w.a[0] + u[0] * off + n[0] * (item.depth / 2 + 0.003)
      const z = w.a[1] + u[1] * off + n[1] * (item.depth / 2 + 0.003)
      const c = { ...item, x, z, rotation }
      if (fits(c, room, items, true)) return { x, z, rotation }
    }
  }
  return null
}

/** Alturas "magnéticas" ao subir/descer: piso, teto e tampos/fundos dos móveis sob/sobre ele. */
export function elevationTargets(item: FurnitureItem, items: FurnitureItem[], ceiling: number): number[] {
  const fp = footprint(item)
  const t = [0, Math.max(0, ceiling - item.height)]
  for (const o of items) {
    if (o.id === item.id || !isSolid(o)) continue
    if (overlapDepth(fp, footprint(o)) <= 0.003) continue
    t.push(o.elevation + o.height)
    if (o.elevation - item.height > 0) t.push(o.elevation - item.height)
  }
  return t
}

/** Tampo mais alto entre os móveis embaixo deste (para apoiar em cima). */
export function surfaceBelow(item: FurnitureItem, items: FurnitureItem[]): number | null {
  const fp = footprint(item)
  let best: number | null = null
  for (const o of items) {
    if (o.id === item.id || !isSolid(o)) continue
    if (overlapDepth(fp, footprint(o)) <= 0.003) continue
    const top = o.elevation + o.height
    if (best === null || top > best) best = top
  }
  return best
}

/**
 * Altura para encostar o topo deste móvel no fundo do móvel aéreo logo acima dele
 * (ex.: micro-ondas sob o armário aéreo). null = não há móvel suspenso em cima.
 */
export function elevationBelow(item: FurnitureItem, items: FurnitureItem[]): number | null {
  const fp = footprint(item)
  let best: number | null = null
  for (const o of items) {
    if (o.id === item.id || !isSolid(o) || o.elevation < 0.05) continue
    if (overlapDepth(fp, footprint(o)) <= 0.003) continue
    // o mais baixo entre os que estão acima da base atual (ou o mais baixo de todos)
    if (o.elevation < item.height - 0.001) continue
    if (best === null || o.elevation < best) best = o.elevation
  }
  return best === null ? null : best - item.height
}

/** Ajusta cortina/persiana a uma janela: cortina de tecido do teto ao piso e 20 cm além de cada lado; persiana sobre o vão. */
export function fitCurtainToWindow(item: FurnitureItem, room: Room, win: Opening) {
  const w = room.walls.find((x) => x.id === win.wallId)
  if (!w) return null
  const u = wallDir(w)
  const n = w.normal
  const style = (item.options.style as string) ?? 'tecido'
  let width: number
  let height: number
  let elevation: number
  if (style === 'tecido') {
    width = win.width + 0.4
    elevation = 0
    height = Math.max(1, room.ceilingHeight - 0.05)
  } else {
    width = win.width + 0.1
    const top = Math.min(room.ceilingHeight - 0.02, win.bottom + win.height + 0.12)
    elevation = win.bottom > 0.1 ? Math.max(0, win.bottom - 0.03) : 0
    height = Math.max(0.3, top - elevation)
  }
  return {
    x: w.a[0] + u[0] * win.offset + n[0] * (item.depth / 2 + 0.012),
    z: w.a[1] + u[1] * win.offset + n[1] * (item.depth / 2 + 0.012),
    rotation: normAngle(Math.atan2(n[0], n[1])),
    width,
    height,
    elevation,
  }
}

function windowCenter(room: Room, win: Opening): Vec2 | null {
  const w = room.walls.find((x) => x.id === win.wallId)
  if (!w) return null
  const u = wallDir(w)
  return [w.a[0] + u[0] * win.offset, w.a[1] + u[1] * win.offset]
}

export function nearestWindow(item: FurnitureItem, room: Room): Opening | null {
  let best: Opening | null = null
  let bd = Infinity
  for (const o of room.openings) {
    if (o.kind !== 'window') continue
    const c = windowCenter(room, o)
    if (!c) continue
    const dd = Math.hypot(c[0] - item.x, c[1] - item.z)
    if (dd < bd) {
      bd = dd
      best = o
    }
  }
  return best
}

/** Nova cortina: vai para a primeira janela que ainda não tem cortina. */
export function curtainPlacement(item: FurnitureItem, room: Room, items: FurnitureItem[] = []) {
  const wins = room.openings.filter((o) => o.kind === 'window')
  const free = wins.find((win) => {
    const c = windowCenter(room, win)
    return c && !items.some((i) => i.type === 'curtain' && Math.hypot(i.x - c[0], i.z - c[1]) < 0.5)
  })
  const win = free ?? wins[0]
  return win ? fitCurtainToWindow(item, room, win) : null
}

const CAT_NAMES: Record<string, string> = {
  storage: 'Armário',
  bed: 'Cama',
  table: 'Mesa',
  chair: 'Cadeira',
  sofa: 'Sofá',
  television: 'TV',
  refrigerator: 'Geladeira',
  stove: 'Fogão',
  oven: 'Forno',
  dishwasher: 'Lava-louças',
  washerDryer: 'Máquina de lavar',
  sink: 'Pia',
  toilet: 'Vaso sanitário',
  bathtub: 'Banheira',
  fireplace: 'Lareira',
  stairs: 'Escada',
}

export const scanCategoryName = (c: string) => CAT_NAMES[c] ?? c

type Box2 = { minX: number; maxX: number; minZ: number; maxZ: number }
const objBox = (o: ScannedObject): Box2 =>
  itemAabb({ x: o.position[0], z: o.position[2], width: o.size[0], depth: o.size[2], rotation: o.rotation })
const boxArea = (b: Box2) => Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxZ - b.minZ)
const boxInter = (a: Box2, b: Box2) =>
  Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) * Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ))

/** Converte os objetos detectados pelo RoomPlan em móveis editáveis (com o cômodo como contexto). */
export function itemsFromScan(room: Room): FurnitureItem[] {
  // 1) Duplicatas (ex.: a mesma geladeira detectada duas vezes): fica a maior
  const byVolume = [...room.scanned].sort((a, b) => b.size[0] * b.size[1] * b.size[2] - a.size[0] * a.size[1] * a.size[2])
  const kept: ScannedObject[] = []
  for (const o of byVolume) {
    const bo = objBox(o)
    const dup = kept.some((k) => {
      if (k.category !== o.category) return false
      // precisa coincidir também na altura (armário aéreo sobre o balcão não é duplicata)
      const vo = Math.min(k.position[1] + k.size[1], o.position[1] + o.size[1]) - Math.max(k.position[1], o.position[1])
      if (vo < 0.5 * Math.min(k.size[1], o.size[1])) return false
      const bk = objBox(k)
      return boxInter(bk, bo) > 0.5 * Math.min(boxArea(bk), boxArea(bo))
    })
    if (!dup) kept.push(o)
  }
  // 2) Cuba sobre um móvel (mesa/armário) vira um gabinete com cuba
  const withSink = new Set<ScannedObject>()
  const absorbed = new Set<ScannedObject>()
  for (const s of kept.filter((o) => o.category === 'sink')) {
    const bs = objBox(s)
    const base = kept.find((o) => (o.category === 'table' || o.category === 'storage') && boxInter(objBox(o), bs) > 0.3 * boxArea(bs))
    if (base) {
      withSink.add(base)
      absorbed.add(s)
    }
  }

  const nearestWallDist = (p: Vec2) => Math.min(...room.walls.map((wl) => pointSegDist(p, wl.a, wl.b)))
  const items = kept
    .filter((o) => !absorbed.has(o))
    .map((o) => {
      let [w, h, d] = o.size
      const kind = o.spaceKind ?? room.sections?.[0]?.label ?? ''
      let elevation = o.position[1]
      let type = 'box'
      let name = ''
      const options: FurnitureItem['options'] = {}
      const c: Vec2 = [o.position[0], o.position[2]]
      const backGap = () => {
        const back = rotLocal(0, d / 2, o.rotation)
        return Math.min(nearestWallDist([c[0] - back[0], c[1] - back[1]]), nearestWallDist([c[0] + back[0], c[1] + back[1]]))
      }
      switch (o.category) {
        case 'bed':
          type = 'bed'
          options.mattressHeight = Math.min(0.55, h * 0.85)
          break
        case 'storage':
          if (withSink.has(o)) type = kind === 'kitchen' ? 'kitchenCabinet' : 'bathVanity'
          else if (o.attributes.StorageType === 'shelf') type = 'bookshelf'
          else if (kind === 'kitchen') {
            type = elevation > 0.9 ? 'wardrobe' : 'kitchenCabinet'
            if (elevation > 0.9) name = 'Armário aéreo'
          } else if (kind === 'bathroom') type = 'bathVanity'
          else type = h > 1.3 ? 'wardrobe' : w < 0.62 && d < 0.62 ? 'nightstand' : 'dresser'
          break
        case 'table':
          if (withSink.has(o) || kind === 'bathroom') type = kind === 'kitchen' ? 'kitchenCabinet' : 'bathVanity'
          else if (o.attributes.TableShapeType === 'circularElliptic') {
            type = h < 0.55 ? 'coffeeTable' : 'diningTable'
            options.shape = 'round'
          } else if (kind === 'kitchen' && h >= 0.82 && backGap() < 0.15) type = 'kitchenCabinet'
          else if (w <= 0.65 && d <= 0.65 && h < 0.7) type = 'nightstand'
          else if (h < 0.55) type = 'coffeeTable'
          else type = kind === 'kitchen' || kind === 'diningRoom' ? 'diningTable' : 'desk'
          break
        case 'sink':
          if (kind === 'kitchen') {
            type = 'kitchenCabinet'
            h = 0.9
            d = Math.max(d, 0.55)
            elevation = 0
          } else {
            // cuba de parede isolada: gabinete suspenso
            type = 'bathVanity'
            const top = elevation + h
            elevation = Math.max(0, top - 0.25)
            h = top - elevation
            w = Math.max(w, 0.45)
            d = Math.max(d, 0.35)
          }
          options.sink = true
          break
        case 'refrigerator':
          type = 'fridge'
          if (w > 0.8) options.layout = 'side'
          break
        case 'stove':
        case 'oven':
          type = 'stove'
          break
        case 'washerDryer':
          type = 'washer'
          break
        case 'toilet':
          type = 'toilet'
          break
        case 'chair':
          type = 'chair'
          break
        case 'sofa':
          type = 'sofa'
          break
        case 'television':
          type = 'tv'
          break
      }
      if (withSink.has(o) && type === 'kitchenCabinet') options.sink = true
      const def = TYPES[type]
      for (const opt of def.options ?? []) if (!(opt.key in options)) options[opt.key] = opt.default
      let rotation = o.rotation
      if (def.backToWall) {
        const back = rotLocal(0, -d / 2, rotation)
        if (nearestWallDist([c[0] - back[0], c[1] - back[1]]) < nearestWallDist([c[0] + back[0], c[1] + back[1]])) rotation += Math.PI
      }
      return {
        id: uid(),
        type,
        name: `${name || (type === 'box' ? scanCategoryName(o.category) : def.name)} (scan)`,
        x: c[0],
        z: c[1],
        elevation,
        rotation: normAngle(rotation),
        width: w,
        depth: d,
        height: h,
        color: def.color,
        color2: def.color2,
        options,
        fromScan: true,
      }
    })

  // Balcão sobreposto a um eletrodoméstico (impreciso no scan): apara o balcão até encostar
  const appliances = items.filter((i) => ['fridge', 'stove', 'washer', 'toilet'].includes(i.type))
  for (const cab of items.filter((i) => i.type === 'kitchenCabinet' || i.type === 'bathVanity')) {
    for (const ap of appliances) {
      if (Math.abs(Math.sin(cab.rotation - ap.rotation)) > 0.05) continue
      const vo = Math.min(cab.elevation + cab.height, ap.elevation + ap.height) - Math.max(cab.elevation, ap.elevation)
      if (vo <= 0.01) continue
      // posição do aparelho no eixo da largura do balcão
      const [lx, lz] = toLocal(ap.x - cab.x, ap.z - cab.z, cab.rotation)
      if (Math.abs(lz) > (cab.depth + ap.depth) / 2) continue
      const half = Math.abs(Math.cos(cab.rotation - ap.rotation)) > 0.5 ? ap.width / 2 : ap.depth / 2
      const overlapRight = cab.width / 2 - (lx - half)
      const overlapLeft = lx + half - -cab.width / 2
      if (lx > 0 && overlapRight > 0 && overlapRight < cab.width * 0.6) {
        const cut = overlapRight + 0.003
        const [dx, dz] = rotLocal(-cut / 2, 0, cab.rotation)
        Object.assign(cab, { width: cab.width - cut, x: cab.x + dx, z: cab.z + dz })
      } else if (lx < 0 && overlapLeft > 0 && overlapLeft < cab.width * 0.6) {
        const cut = overlapLeft + 0.003
        const [dx, dz] = rotLocal(cut / 2, 0, cab.rotation)
        Object.assign(cab, { width: cab.width - cut, x: cab.x + dx, z: cab.z + dz })
      }
    }
  }

  // Cozinha sem cuba detectada: o gabinete mais longo costuma ser a pia
  const cabinets = items.filter((i) => i.type === 'kitchenCabinet' && i.elevation < 0.1)
  if (cabinets.length && !cabinets.some((i) => i.options.sink)) {
    const longest = cabinets.reduce((a, b) => (b.width > a.width ? b : a))
    if (longest.width >= 1.0) {
      longest.options.sink = true
      longest.name = 'Gabinete de pia (scan)'
    }
  }
  return items
}

// ---------------- Apoiar sobre outro móvel / soltar do catálogo ----------------

type Pose = Pick<FurnitureItem, 'x' | 'z' | 'elevation' | 'rotation'>

/** Vão para forno de embutir de um balcão (coordenadas locais do balcão), igual ao modelo 3D. */
function ovenBay(host: FurnitureItem) {
  if (host.type !== 'kitchenCabinet' || host.options.bay !== 'forno' || host.width < 0.3) return null
  const bw = clamp(typeof host.options.bayWidth === 'number' ? host.options.bayWidth : 0.6, 0.3, host.width)
  const pos = host.options.bayPos ?? 'direita'
  const x0 = pos === 'esquerda' ? -host.width / 2 : pos === 'centro' ? -bw / 2 : host.width / 2 - bw
  const plinth = host.elevation > FLOATING_MIN ? 0 : 0.1
  const carcH = host.height - 0.03 - plinth
  const bottom = plinth + Math.min(0.18, carcH * 0.25)
  return { cx: x0 + bw / 2, width: bw - 0.036, bottom }
}

const FRONT_KINDS = new Set(['teclado-mouse', 'teclado', 'mouse'])

/**
 * Lugar para `item` sobre o tampo de `host`, com a mesma rotação dele. Com `near` (onde o usuário
 * soltou), fica o mais perto possível desse ponto sem sair do tampo; sem ele, procura espaço livre:
 * encostado atrás (monitor, micro-ondas…) ou na frente (teclado, mouse). Forno de embutir vai para o
 * vão de forno do balcão. null = não cabe / não faz sentido apoiar.
 */
export function surfaceSpot(item: FurnitureItem, host: FurnitureItem, items: FurnitureItem[], near?: Vec2): Pose | null {
  const hr = host.rotation
  const pose = (lx: number, lz: number, elevation: number): Pose => {
    const [dx, dz] = rotLocal(lx, lz, hr)
    return { x: host.x + dx, z: host.z + dz, elevation, rotation: hr }
  }
  if (item.type === 'oven' && item.options.style !== 'bancada') {
    const bay = ovenBay(host)
    if (!bay || item.width > bay.width + 0.02) return null
    // frente do forno alinhada com as portas do balcão
    return pose(bay.cx, host.depth / 2 - 0.032 - item.depth / 2, host.elevation + bay.bottom)
  }
  if (!TYPES[host.type]?.surface || !TYPES[item.type]?.onSurface) return null
  if (item.width > host.width + 0.005 || item.depth > host.depth + 0.005) return null
  const top = host.elevation + host.height
  const mx = Math.max(0, (host.width - item.width) / 2)
  const mz = Math.max(0, (host.depth - item.depth) / 2)
  if (near) {
    const [lx, lz] = toLocal(near[0] - host.x, near[1] - host.z, hr)
    return pose(clamp(lx, -mx, mx), clamp(lz, -mz, mz), top)
  }
  const onTop = items.filter((o) => o.id !== host.id && o.id !== item.id && Math.abs(o.elevation - top) < 0.03)
  const free = (p: Pose) => {
    const fp = footprint({ ...item, ...p }, -0.002)
    return onTop.every((o) => overlapDepth(fp, footprint(o)) <= 0.002)
  }
  // braço com garra abraça a borda de trás: encosta sem folga
  const back = item.type === 'monitorArm' && item.options.mount !== 'furo' ? -mz : -mz + Math.min(0.02, mz)
  const front = mz - Math.min(0.04, mz)
  const rows = FRONT_KINDS.has(String(item.options.kind)) ? [front, back, 0] : [back, 0, front]
  const xs = [0]
  for (let k = 0.01; k <= mx + 1e-9; k += 0.01) xs.push(k, -k)
  for (const lz of rows)
    for (const lx of xs) {
      const p = pose(lx, lz, top)
      if (free(p)) return p
    }
  return pose(0, rows[0], top)
}

/** Encosta um item de parede na parede mais próxima do ponto (até 60 cm), de frente para o cômodo. */
export function wallSnapAt(item: FurnitureItem, room: Room, p: Vec2) {
  let best: { w: Room['walls'][number]; s: number; d: number } | null = null
  for (const w of room.walls) {
    const L = wallLength(w)
    if (item.width > L) continue
    const u = wallDir(w)
    const s = clamp((p[0] - w.a[0]) * u[0] + (p[1] - w.a[1]) * u[1], item.width / 2, L - item.width / 2)
    const q: Vec2 = [w.a[0] + u[0] * s, w.a[1] + u[1] * s]
    // só do lado de dentro do cômodo
    if ((p[0] - q[0]) * w.normal[0] + (p[1] - q[1]) * w.normal[1] < -0.05) continue
    const d = Math.hypot(p[0] - q[0], p[1] - q[1])
    if (d < 0.6 && (!best || d < best.d)) best = { w, s, d }
  }
  if (!best) return null
  const { w, s } = best
  const u = wallDir(w)
  const n = w.normal
  return {
    x: w.a[0] + u[0] * s + n[0] * (item.depth / 2 + 0.003),
    z: w.a[1] + u[1] * s + n[1] * (item.depth / 2 + 0.003),
    rotation: normAngle(Math.atan2(n[0], n[1])),
  }
}

/**
 * Pose de um item solto do catálogo sob o cursor: em cima do móvel de tampo que estiver embaixo
 * (monitor na escrivaninha, micro-ondas no balcão, forno no vão), na janela mais próxima (cortina),
 * na parede mais próxima (itens de parede) ou no piso. `at(y)` = ponto sob o cursor no plano de
 * altura y (corrige a paralaxe da vista 3D).
 */
export function dropPose(base: FurnitureItem, room: Room, items: FurnitureItem[], at: (y: number) => Vec2 | null): FurnitureItem | null {
  const p0 = at(0)
  if (!p0) return null
  const def = TYPES[base.type]
  if (def?.onSurface || base.type === 'oven') {
    let host: FurnitureItem | null = null
    let hp: Vec2 | null = null
    for (const h of items) {
      if (!TYPES[h.type]?.surface) continue
      const top = h.elevation + h.height
      const p = at(top)
      if (!p || !pointInPoly(p, footprint(h))) continue
      if (!host || top > host.elevation + host.height) {
        host = h
        hp = p
      }
    }
    if (host && hp) {
      const s = surfaceSpot(base, host, items, hp)
      if (s) return { ...base, ...s }
    }
  }
  if (base.type === 'curtain') {
    const c = { ...base, x: p0[0], z: p0[1] }
    const win = nearestWindow(c, room)
    const fit = win && fitCurtainToWindow(c, room, win)
    if (fit) return { ...c, ...fit }
  }
  if (def?.wallMounted || base.elevation > 0.05) {
    const pe = at(base.elevation + base.height / 2) ?? p0
    const w = wallSnapAt(base, room, pe)
    return w ? { ...base, ...w } : { ...base, x: pe[0], z: pe[1] }
  }
  return { ...base, x: p0[0], z: p0[1] }
}
