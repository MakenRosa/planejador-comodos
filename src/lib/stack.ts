/**
 * Itens apoiados sobre outro móvel (monitor na mesa, TV no rack…): acompanham o móvel de baixo quando
 * ele é movido, girado, sobe/desce (mesa com regulagem de altura) ou é trocado por outro modelo.
 */
import { TYPES } from '../furniture/catalog'
import { footprint, pointInPoly, rotLocal, toLocal } from './geom'
import type { FurnitureItem } from './types'
import { clamp, normAngle } from './util'

/** Itens com a base no nível do tampo de `host` e o centro sobre ele. */
export function ridersOf(host: FurnitureItem, items: FurnitureItem[]): FurnitureItem[] {
  if (!TYPES[host.type]?.surface) return []
  const top = host.elevation + host.height
  const fp = footprint(host)
  return items.filter((o) => o.id !== host.id && !o.attachedTo && Math.abs(o.elevation - top) < 0.015 && pointInPoly([o.x, o.z], fp))
}

/** Tudo que se move junto com `host` (o que está em cima e os monitores presos a braços nele). */
export function ridingIds(host: FurnitureItem, items: FurnitureItem[]): Set<string> {
  const ids = new Set(ridersOf(host, items).map((i) => i.id))
  ids.add(host.id)
  for (const o of items) if (o.attachedTo && ids.has(o.attachedTo)) ids.add(o.id)
  ids.delete(host.id)
  return ids
}

/**
 * Aplica a mudança de `prev` → `next` (posição, giro, altura) aos itens apoiados nele.
 * Ao redimensionar (largura/profundidade), os itens ficam onde estão — só acompanham a altura.
 */
export function carryRiders(prev: FurnitureItem, next: FurnitureItem, items: FurnitureItem[]): FurnitureItem[] {
  if (!TYPES[prev.type]?.surface) return items
  const dTop = next.elevation + next.height - (prev.elevation + prev.height)
  const moved = prev.x !== next.x || prev.z !== next.z || prev.rotation !== next.rotation
  if (!moved && Math.abs(dTop) < 1e-9) return items
  const riders = new Set(ridersOf(prev, items).map((i) => i.id))
  if (!riders.size) return items
  const resized = prev.width !== next.width || prev.depth !== next.depth
  const dRot = next.rotation - prev.rotation
  return items.map((o) => {
    if (!riders.has(o.id)) return o
    if (resized || !moved) return { ...o, elevation: o.elevation + dTop }
    const [lx, lz] = toLocal(o.x - prev.x, o.z - prev.z, prev.rotation)
    const [wx, wz] = rotLocal(lx, lz, next.rotation)
    return { ...o, x: next.x + wx, z: next.z + wz, rotation: normAngle(o.rotation + dRot), elevation: o.elevation + dTop }
  })
}

/**
 * Leva os itens que estavam em cima de `prev` para cima de `next` (troca de modelo): mesma posição
 * no mundo, presos dentro do novo tampo, na altura do novo tampo.
 */
export function moveRidersTo(prev: FurnitureItem, next: FurnitureItem, items: FurnitureItem[]): FurnitureItem[] {
  const riders = new Set(ridersOf(prev, items).map((i) => i.id))
  if (!riders.size) return items
  const top = next.elevation + next.height
  return items.map((o) => {
    if (!riders.has(o.id)) return o
    if (!TYPES[next.type]?.surface) return o
    const [lx, lz] = toLocal(o.x - next.x, o.z - next.z, next.rotation)
    const mx = Math.max(0, (next.width - o.width) / 2)
    const mz = Math.max(0, (next.depth - o.depth) / 2)
    const [wx, wz] = rotLocal(clamp(lx, -mx, mx), clamp(lz, -mz, mz), next.rotation)
    return { ...o, x: next.x + wx, z: next.z + wz, elevation: top }
  })
}

/** Curso do motor da mesa com regulagem de altura (altura do tampo), ou null se não for uma. */
export function motorRange(it: FurnitureItem): { lo: number; hi: number } | null {
  if (it.type !== 'standingDesk') return null
  const t = typeof it.options.topT === 'number' ? it.options.topT : 0.025
  return { lo: 0.72 + t, hi: 1.18 + t }
}
