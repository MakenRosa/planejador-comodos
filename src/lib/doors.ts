/**
 * Acabamentos de portas: cores e madeiras da folha e do batente/alisar, vidros e maçanetas.
 * Os valores ficam na abertura como id (ex.: 'freijo') ou cor livre ('#rrggbb').
 */
import * as THREE from 'three'
import { woodVeneerTexture } from './patterns'
import type { Opening } from './types'

export interface DoorFinish {
  id: string
  label: string
  /** Cor da amostra (e da peça, quando não é madeira). */
  color: string
  /** Madeira: cores da lâmina (fundo, veio). */
  wood?: [string, string]
}

export const DOOR_FINISHES: DoorFinish[] = [
  { id: 'branco', label: 'Branco', color: '#f5f4f0' },
  { id: 'bege', label: 'Bege', color: '#e4dccd' },
  { id: 'cinza', label: 'Cinza claro', color: '#b9bec3' },
  { id: 'grafite', label: 'Grafite', color: '#4b5056' },
  { id: 'preto', label: 'Preto', color: '#25262a' },
  { id: 'verde', label: 'Verde sálvia', color: '#9aab94' },
  { id: 'azul', label: 'Azul petróleo', color: '#3f5f6b' },
  { id: 'carvalho', label: 'Carvalho', color: '#d6b98c', wood: ['#dcc097', '#9c7b51'] },
  { id: 'madeira', label: 'Madeira natural', color: '#cf9a5c', wood: ['#d69d5a', '#8c5125'] },
  { id: 'freijo', label: 'Freijó', color: '#b98b5b', wood: ['#c39360', '#7a5232'] },
  { id: 'cumaru', label: 'Cumaru', color: '#a0683f', wood: ['#a86e43', '#5e3519'] },
  { id: 'cerejeira', label: 'Cerejeira (avermelhada)', color: '#a5583c', wood: ['#ad5e3e', '#5f2615'] },
  { id: 'jatoba', label: 'Jatobá (marrom avermelhado)', color: '#8e4630', wood: ['#984b32', '#4d1d10'] },
  { id: 'mogno', label: 'Mogno (vermelho escuro)', color: '#743426', wood: ['#7e3828', '#3a140b'] },
  { id: 'mogno-escuro', label: 'Mogno escuro', color: '#5a271c', wood: ['#62291d', '#2a0c06'] },
  { id: 'jacaranda', label: 'Jacarandá (vermelho bem escuro)', color: '#4a1f16', wood: ['#51221a', '#200a05'] },
  { id: 'nogueira', label: 'Nogueira', color: '#7a5436', wood: ['#87603f', '#45291a'] },
  { id: 'imbuia', label: 'Imbuia', color: '#58402c', wood: ['#664a33', '#2b1c11'] },
]

export const DEFAULT_LEAF = 'bege'
export const DEFAULT_FRAME = 'branco'

/** Cor do veio a partir do fundo da madeira: bem mais escura e um pouco mais saturada. */
export function veinOf(hex: string) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl, THREE.SRGBColorSpace)
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.15 + 0.05), hsl.l * 0.45, THREE.SRGBColorSpace)
  return '#' + c.getHexString(THREE.SRGBColorSpace)
}

/** Mesmo tom de madeira, mais clara (k > 1) ou mais escura (k < 1). */
export function toneWood(hex: string, k: number) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl, THREE.SRGBColorSpace)
  c.setHSL(hsl.h, hsl.s, Math.min(0.92, Math.max(0.04, hsl.l * k)), THREE.SRGBColorSpace)
  return '#' + c.getHexString(THREE.SRGBColorSpace)
}

export function finishInfo(v: string | undefined, def: string): DoorFinish {
  const id = v ?? def
  if (id.startsWith('#')) return { id, label: 'Cor personalizada', color: id }
  // madeira na cor que a pessoa escolheu: 'wood:#rrggbb' (fundo; o veio sai dele)
  if (id.startsWith('wood:')) {
    const hex = id.slice(5)
    return { id, label: `Madeira personalizada (${hex.toUpperCase()})`, color: hex, wood: [hex, veinOf(hex)] }
  }
  return DOOR_FINISHES.find((f) => f.id === id) ?? DOOR_FINISHES.find((f) => f.id === def) ?? DOOR_FINISHES[0]
}

const finishCache = new Map<string, THREE.MeshStandardMaterial>()
/**
 * Material de uma peça (folha, batente, alisar) de `w` × `h` metros. Madeira: veio ao comprido da
 * peça (na vertical, ou na horizontal com `horizontal`).
 */
export function finishMaterial(v: string | undefined, def: string, w: number, h: number, horizontal = false) {
  const f = finishInfo(v, def)
  const key = f.wood ? `w|${f.id}|${w.toFixed(2)}|${h.toFixed(2)}|${horizontal}` : `c|${f.color}`
  let m = finishCache.get(key)
  if (!m) {
    if (f.wood) {
      const tex = woodVeneerTexture(f.wood[0], f.wood[1]).clone()
      tex.center.set(0.5, 0.5)
      if (horizontal) {
        tex.rotation = Math.PI / 2
        tex.repeat.set(h / 2, w / 2)
      } else tex.repeat.set(w / 2, h / 2)
      tex.needsUpdate = true
      // reflexo do ambiente baixo: madeira escura não fica acinzentada
      m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, envMapIntensity: 0.55 })
    } else m = new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.55 })
    finishCache.set(key, m)
  }
  return m
}

export interface GlassTint {
  id: string
  label: string
  color: string
  opacity: number
  rough?: number
}

export const GLASS_TINTS: GlassTint[] = [
  { id: 'incolor', label: 'Incolor', color: '#d6ecea', opacity: 0.2 },
  { id: 'verde', label: 'Verde', color: '#9cd2bf', opacity: 0.32 },
  { id: 'fume', label: 'Fumê', color: '#555a60', opacity: 0.45 },
  { id: 'bronze', label: 'Bronze', color: '#8a6a4a', opacity: 0.42 },
  { id: 'jateado', label: 'Jateado (fosco)', color: '#eef3f3', opacity: 0.78, rough: 0.7 },
]

const glassCache = new Map<string, THREE.MeshStandardMaterial>()
export function glassMaterial(tint: string | undefined) {
  const g = GLASS_TINTS.find((x) => x.id === tint) ?? GLASS_TINTS[0]
  let m = glassCache.get(g.id)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: g.color, transparent: true, opacity: g.opacity, roughness: g.rough ?? 0.05, metalness: 0.1, depthWrite: false })
    glassCache.set(g.id, m)
  }
  return m
}

export interface HandleModel {
  id: string
  label: string
  /** Serve para porta de abrir / de correr. */
  swing: boolean
  sliding: boolean
}

export const HANDLE_MODELS: HandleModel[] = [
  { id: 'alavanca', label: 'Alavanca (roseta redonda)', swing: true, sliding: false },
  { id: 'alavanca-quadrada', label: 'Alavanca reta (roseta quadrada)', swing: true, sliding: false },
  { id: 'bola', label: 'Bola', swing: true, sliding: false },
  { id: 'puxador', label: 'Puxador vertical (40 cm)', swing: true, sliding: true },
  { id: 'puxador-longo', label: 'Puxador longo (1 m)', swing: true, sliding: true },
  { id: 'concha', label: 'Concha embutida', swing: false, sliding: true },
]

/** Profundidade padrão da porta de correr (da parede até a face de fora da folha). */
export const defaultRailDepth = (op: Opening) => 0.024 + (op.glass ? 0.01 : 0.035)

export function handleModelOf(op: Opening): string {
  const sliding = op.doorType === 'sliding'
  const m = HANDLE_MODELS.find((h) => h.id === op.handle)
  if (m && (sliding ? m.sliding : m.swing)) return m.id
  return sliding || op.glass ? 'puxador' : 'alavanca'
}

export interface MetalFinish {
  id: string
  label: string
  color: string
  metal: number
  rough: number
}

export const HANDLE_FINISHES: MetalFinish[] = [
  { id: 'cromado', label: 'Cromado', color: '#cdd1d6', metal: 0.95, rough: 0.16 },
  { id: 'inox', label: 'Inox escovado', color: '#b3b7bb', metal: 0.85, rough: 0.38 },
  { id: 'preto', label: 'Preto fosco', color: '#1f2022', metal: 0.3, rough: 0.6 },
  { id: 'dourado', label: 'Dourado', color: '#caa24c', metal: 0.9, rough: 0.28 },
  { id: 'bronze', label: 'Bronze / cobre', color: '#9a6a43', metal: 0.85, rough: 0.35 },
  { id: 'branco', label: 'Branco', color: '#f1f1ef', metal: 0.1, rough: 0.5 },
]

const metalCache = new Map<string, THREE.MeshStandardMaterial>()
export function metalMaterial(id: string | undefined, def = 'cromado') {
  const f = HANDLE_FINISHES.find((x) => x.id === (id ?? def)) ?? HANDLE_FINISHES[0]
  let m = metalCache.get(f.id)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: f.color, metalness: f.metal, roughness: f.rough })
    metalCache.set(f.id, m)
  }
  return m
}

/** Destaque da folha selecionada. */
export const SELECTED_LEAF = new THREE.MeshStandardMaterial({ color: '#bfdbfe', roughness: 0.6 })
export const SELECTED_GLASS = new THREE.MeshStandardMaterial({ color: '#93c5fd', transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false })
