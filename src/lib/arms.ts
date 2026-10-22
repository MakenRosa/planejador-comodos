/**
 * Braço articulado de monitor: monitores "vinculados" ficam presos à placa VESA do braço (sem o pé
 * próprio) e acompanham o braço quando ele é movido ou girado.
 */
import { rotLocal } from './geom'
import type { FurnitureItem } from './types'

const num = (v: unknown, def: number) => (typeof v === 'number' ? v : def)

/** Painel do monitor (largura, altura) e altura do pé, igual ao modelo 3D. */
export function monitorPanel(it: Pick<FurnitureItem, 'width' | 'height' | 'options'>) {
  const o = it.options
  if (o.mount === 'braco') return { pw: it.width, ph: it.height, stand: 0 }
  if (o.orientation === 'vertical') {
    const ph = Math.min(it.height - 0.06, it.width / 0.59)
    return { pw: it.width, ph, stand: it.height - ph }
  }
  const ph = Math.min(it.width * (it.width > 0.75 ? 0.43 : 0.59), it.height * 0.8)
  return { pw: it.width, ph, stand: it.height - ph }
}

export const isArm = (it: FurnitureItem) => it.type === 'monitorArm'
export const armCount = (arm: FurnitureItem) => (num(arm.options.count, 1) >= 2 ? 2 : 1)
/** Altura do centro da placa VESA acima da base do braço (tampo da mesa). */
export const vesaHeight = (arm: FurnitureItem) => Math.max(0.1, num(arm.options.vesa, 0.38))
export const PLATE = 0.012
/** Segmentos de cada braço (do poste ao cotovelo e do cotovelo à placa) e folgas da caixa do item. */
export const ARM_L1 = 0.22
export const ARM_L2 = 0.28
export const ARM_BACK = 0.05
export const ARM_FRONT = 0.035

/** Flecha da curvatura (raio 1500R) de um painel curvo de largura pw. */
export const curveSag = (pw: number) => 1.5 * (1 - Math.cos(pw / 1.5 / 2))

/** Profundidade do monitor preso ao braço: encaixe VESA + painel (+ a flecha, se for curvo). */
export function armMonitorDepth(it: Pick<FurnitureItem, 'width' | 'height' | 'options'>) {
  const curved = !!it.options.curved && it.options.orientation !== 'vertical'
  return 0.05 + (curved ? curveSag(monitorPanel(it).pw) : 0)
}

/** Alcance máximo do braço (os dois segmentos quase retos). */
export const ARM_MAX = ARM_L1 + ARM_L2 - 0.005
export const ARM_MIN_REACH = 0.03

/**
 * Placa VESA de cada braço, no espaço local do item: `x` (para o lado, a partir do poste), `reach`
 * (à frente do poste) e `vesa` (altura do centro acima do tampo). Sem ajuste próprio, as placas
 * ficam nas pontas da caixa, na profundidade da caixa e na altura geral.
 */
export interface ArmSlot {
  x: number
  reach: number
  vesa: number
}

export function slotsFrom(w: number, d: number, options: Record<string, unknown>): ArmSlot[] {
  const n = num(options.count, 1) >= 2 ? 2 : 1
  const defX = n === 2 ? [-(w / 2 - 0.05), w / 2 - 0.05] : [0]
  const defReach = d - ARM_BACK - ARM_FRONT
  const vesa = Math.max(0.1, num(options.vesa, 0.38))
  return defX.map((dx, k) => ({
    x: num(options[`armX${k}`], dx),
    reach: Math.min(defReach, num(options[`reach${k}`], defReach)),
    vesa: Math.max(0.1, num(options[`vesa${k}`], vesa)),
  }))
}

export const armSlotsFull = (arm: FurnitureItem) => slotsFrom(arm.width, arm.depth, arm.options)
/** Posição lateral (x local) de cada placa. */
export const armSlots = (arm: FurnitureItem): number[] => armSlotsFull(arm).map((s) => s.x)

/** Mantém a placa ao alcance dos dois segmentos (nem colada no poste, nem além do braço esticado). */
export function clampSlot(sl: ArmSlot): ArmSlot {
  let x = Math.max(-ARM_MAX * 0.97, Math.min(ARM_MAX * 0.97, sl.x))
  let reach = Math.max(ARM_MIN_REACH, sl.reach)
  if (Math.hypot(x, reach) > ARM_MAX) reach = Math.max(ARM_MIN_REACH, Math.sqrt(ARM_MAX * ARM_MAX - x * x))
  if (Math.hypot(x, reach) > ARM_MAX) x = Math.sign(x) * Math.sqrt(ARM_MAX * ARM_MAX - reach * reach)
  return { x, reach, vesa: Math.max(0.1, sl.vesa) }
}

/** Alcance para frente possível de uma placa, dada a posição lateral dela. */
export function armReach(arm: FurnitureItem, k = 0) {
  const sl = armSlotsFull(arm)[k] ?? armSlotsFull(arm)[0]
  const max = Math.max(ARM_MIN_REACH, Math.sqrt(Math.max(0, ARM_MAX * ARM_MAX - sl.x * sl.x)))
  return { min: ARM_MIN_REACH, max, cur: sl.reach }
}

/**
 * Grava as placas e recalcula a caixa do braço (largura = placa mais afastada para o lado,
 * profundidade = placa mais à frente) mantendo o poste/garra no mesmo lugar.
 */
export function armWithSlots(arm: FurnitureItem, slots: ArmSlot[]): Pick<FurnitureItem, 'width' | 'depth' | 'x' | 'z' | 'options'> {
  const sl = slots.map(clampSlot)
  const depth = ARM_BACK + Math.max(...sl.map((s) => s.reach)) + ARM_FRONT
  const width = Math.max(0.15, 2 * Math.max(...sl.map((s) => Math.abs(s.x))) + 0.1)
  // poste fixo: centro novo = poste − (0, −d'/2 + recuo)
  const [px, pz] = rotLocal(0, -arm.depth / 2 + ARM_BACK, arm.rotation)
  const [nx, nz] = rotLocal(0, -depth / 2 + ARM_BACK, arm.rotation)
  const options = { ...arm.options }
  sl.forEach((s, k) => {
    options[`armX${k}`] = s.x
    options[`reach${k}`] = s.reach
    options[`vesa${k}`] = s.vesa
  })
  return { width, depth, x: arm.x + px - nx, z: arm.z + pz - nz, options }
}

/** Ajusta uma placa (lado, frente e/ou altura). */
export function moveSlot(arm: FurnitureItem, k: number, patch: Partial<ArmSlot>) {
  const slots = armSlotsFull(arm)
  slots[k] = { ...slots[k], ...patch }
  return armWithSlots(arm, slots)
}

/** Placas fora do alcance (ex.: depois de mudar a largura): puxa de volta. null = tudo certo. */
export function fitArmReach(arm: FurnitureItem) {
  const slots = armSlotsFull(arm)
  const ok = slots.every((s) => {
    const c = clampSlot(s)
    return Math.abs(c.x - s.x) < 1e-4 && Math.abs(c.reach - s.reach) < 1e-4
  })
  return ok ? null : armWithSlots(arm, slots)
}

/** Distância (local) do centro do monitor até o eixo da placa, na frente dela. */
export const monitorOffset = (mon: Pick<FurnitureItem, 'depth'>) => ARM_FRONT + PLATE + mon.depth / 2

/** Pose do monitor preso ao braço (centro do painel na placa VESA do lado dele). */
export function poseOnArm(mon: FurnitureItem, arm: FurnitureItem): Pick<FurnitureItem, 'x' | 'z' | 'elevation' | 'rotation'> {
  const slots = armSlotsFull(arm)
  const sl = slots[Math.min(mon.attachSlot ?? 0, slots.length - 1)]
  const [dx, dz] = rotLocal(sl.x, -arm.depth / 2 + ARM_BACK + sl.reach + monitorOffset(mon), arm.rotation)
  return { x: arm.x + dx, z: arm.z + dz, rotation: arm.rotation, elevation: Math.max(0, arm.elevation + sl.vesa - mon.height / 2) }
}

/** Monitor solto do braço: volta a ter pé (altura e profundidade de antes). */
export function withStand(mon: FurnitureItem, baseElevation?: number): FurnitureItem {
  const { attachedTo: _a, attachSlot: _s, ...rest } = mon
  const gap = num(mon.options.standGap, 0.1)
  return {
    ...rest,
    height: mon.height + gap,
    depth: num(mon.options.standD, 0.22),
    elevation: baseElevation ?? Math.max(0, mon.elevation - gap),
    options: { ...mon.options, mount: 'base' },
  }
}

/** Reposiciona os monitores presos a braços (e solta os que perderam o braço). */
export function syncAttached(items: FurnitureItem[]): FurnitureItem[] {
  if (!items.some((i) => i.attachedTo)) return items
  const byId = new Map(items.map((i) => [i.id, i]))
  let changed = false
  const out = items.map((it) => {
    if (!it.attachedTo) return it
    const arm = byId.get(it.attachedTo)
    if (!arm) {
      changed = true
      return withStand(it)
    }
    // braço deixou de ser duplo: o monitor da segunda placa sai, com pé
    if ((it.attachSlot ?? 0) >= armSlots(arm).length) {
      changed = true
      return withStand(it, arm.elevation)
    }
    const p = poseOnArm(it, arm)
    if (Math.abs(p.x - it.x) < 1e-6 && Math.abs(p.z - it.z) < 1e-6 && Math.abs(p.elevation - it.elevation) < 1e-6 && Math.abs(p.rotation - it.rotation) < 1e-6) return it
    changed = true
    return { ...it, ...p }
  })
  return changed ? out : items
}

/**
 * Duas telas na mesma profundidade não se atravessam: a deste lado para quando encosta (1 cm) na do
 * outro braço. Com uma bem mais à frente que a outra, pode passar por cima.
 */
export function keepApart(arm: FurnitureItem, k: number, x: number, reach: number, items: FurnitureItem[], strict = false): number {
  const slots = armSlotsFull(arm)
  if (slots.length < 2) return x
  const o = 1 - k
  const mon = items.find((i) => i.attachedTo === arm.id && (i.attachSlot ?? 0) === k)
  const other = items.find((i) => i.attachedTo === arm.id && (i.attachSlot ?? 0) === o)
  if (!mon || !other) return x
  // strict (arrastando): nunca cruzam; senão, uma bem mais à frente que a outra pode passar
  if (!strict && Math.abs(reach - slots[o].reach) > (mon.depth + other.depth) / 2 + 0.05) return x
  const side = k === 0 ? -1 : 1
  const limit = slots[o].x + side * (other.width / 2 + mon.width / 2 + 0.01)
  return side > 0 ? Math.max(x, limit) : Math.min(x, limit)
}
