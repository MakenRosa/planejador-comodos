/**
 * Modelos 3D paramétricos. Cada função recebe as dimensões reais (metros) e gera a geometria
 * proporcional — redimensionar um guarda-roupa recalcula portas, puxadores, rodapé etc.,
 * em vez de simplesmente esticar a malha.
 *
 * Convenção: origem no centro da base, largura em X, altura em Y, profundidade em Z, frente = +Z.
 */
import * as THREE from 'three'
import type { OptionValue } from '../lib/types'
import { clamp, TAU } from '../lib/util'
import { M, mat, Parts, rng, sbox, shade, type Solid } from './parts'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { inductionMarks } from './extras'
import { finishMaterial } from '../lib/doors'
import { QUADRATTA_REACH, quadrattaShower, showerValve } from './bathroom'

export interface BuildParams {
  w: number
  h: number
  d: number
  color: string
  color2: string
  options: Record<string, OptionValue>
  /** Suspenso (acima do piso): modelos com pés/rodapé passam a ser fixados na parede. */
  floating?: boolean
}

export const num = (o: Record<string, OptionValue>, k: string, def: number) => (typeof o[k] === 'number' ? (o[k] as number) : def)
export const bool = (o: Record<string, OptionValue>, k: string, def: boolean) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : def)
export const str = (o: Record<string, OptionValue>, k: string, def: string) => (typeof o[k] === 'string' ? (o[k] as string) : def)
/** Opção inteira onde 0 = automático. */
export const auto = (o: Record<string, OptionValue>, k: string, autoV: number) => {
  const v = num(o, k, 0)
  return v > 0 ? Math.round(v) : autoV
}
export const corners = (fn: (sx: number, sz: number) => void) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) fn(sx, sz)
}

export function bed({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const head = bool(options, 'headboard', true)
  const hbT = head ? Math.min(0.07, d * 0.05) : 0
  const mTop = clamp(num(options, 'mattressHeight', 0.55), 0.15, Math.max(0.15, h))
  const mattT = Math.min(0.24, mTop * 0.45)
  const baseTop = mTop - mattT
  const legH = Math.min(0.08, baseTop * 0.4)
  const bodyD = d - hbT
  const zc = hbT / 2
  corners((sx, sz) => P.boxB(0.05, legH, 0.05, sx * (w / 2 - 0.07), 0, zc + sz * (bodyD / 2 - 0.07), mat(shade(color, -0.35))))
  P.boxB(w, baseTop - legH, bodyD, 0, legH, zc, mat(color, { rough: 0.65 }), 0.01)
  P.boxB(w - 0.03, mattT, bodyD - 0.03, 0, baseTop, zc, M.white(), 0.04)
  const dvD = bodyD * 0.7
  P.boxB(w + 0.012, 0.045, dvD, 0, mTop - 0.015, d / 2 - dvD / 2, M.fabric(color2), 0.02)
  P.boxB(w + 0.016, 0.05, 0.14, 0, mTop - 0.012, d / 2 - dvD + 0.07, M.fabric(shade(color2, 0.45)), 0.025)
  const n = w > 1.15 ? 2 : 1
  const pw = Math.min(0.62, (w - 0.12) / n - 0.04)
  const pd = Math.min(0.38, bodyD * 0.22)
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (i === 0 ? -1 : 1) * (pw / 2 + 0.025)
    P.boxB(pw, 0.12, pd, x, mTop - 0.01, -d / 2 + hbT + 0.03 + pd / 2, M.white(), 0.055)
  }
  if (head && h > mTop + 0.03) P.boxB(w, h, hbT, 0, 0, -d / 2 + hbT / 2, mat(color, { rough: 0.7 }), 0.015)
  return P.group
}

export function wardrobe({ w, h, d, color, color2, options, floating }: BuildParams) {
  const P = new Parts()
  const sliding = bool(options, 'sliding', false)
  const mirror = bool(options, 'mirror', false)
  const t = 0.02
  const plinth = floating ? 0 : 0.07
  const body = mat(color, { rough: 0.6 })
  const doorM = mat(color2, { rough: 0.5 })
  const carcD = d - (sliding ? 2 * t + 0.01 : t)
  P.boxB(w, h - plinth, carcD, 0, plinth, -d / 2 + carcD / 2, body)
  if (plinth) P.boxB(w - 0.04, plinth, carcD - 0.03, 0, 0, -d / 2 + carcD / 2 - 0.015, mat(shade(color, -0.35)))
  const gap = 0.004
  const dh = h - plinth - gap * 2
  if (sliding) {
    const n = auto(options, 'doors', Math.max(2, Math.round(w / 0.9)))
    const slot = w / n
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + slot * (i + 0.5)
      const z = d / 2 - t / 2 - (i % 2 === 0 ? 0 : t + 0.005)
      const isMirror = mirror && (n === 2 ? i === 0 : i === Math.floor(n / 2))
      P.boxB(slot + (i > 0 && i < n - 1 ? 0.03 : 0.015), dh, t, x, plinth + gap, z, isMirror ? M.mirror() : doorM)
      const px = x + (i === 0 ? 1 : -1) * (slot / 2 - 0.035)
      P.boxB(0.012, dh * 0.5, 0.008, px, plinth + dh * 0.25, z + t / 2 + 0.004, M.darkMetal())
    }
    P.boxB(w, 0.035, 2 * t + 0.01, 0, h - 0.035, d / 2 - t - 0.005, body)
  } else {
    const n = auto(options, 'doors', Math.max(1, Math.round(w / 0.45)))
    const dw = (w - gap * (n + 1)) / n
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + gap + dw / 2 + i * (dw + gap)
      const isMirror = mirror && n >= 2 && (n % 2 === 1 ? i === (n - 1) / 2 : i === n / 2 - 1 || i === n / 2)
      P.boxB(dw, dh, t, x, plinth + gap, d / 2 - t / 2, isMirror ? M.mirror() : doorM)
      const side = i % 2 === 0 && i + 1 < n ? 1 : -1
      const hx = n === 1 ? x + dw / 2 - 0.04 : x + side * (dw / 2 - 0.035)
      P.boxB(0.014, Math.min(0.35, dh * 0.2), 0.02, hx, plinth + dh * 0.45, d / 2 + 0.012, M.metal())
    }
  }
  return P.group
}

function drawerCabinet(P: Parts, p: BuildParams, rows: number, cols: number, legH: number, legs: boolean) {
  const { w, h, d, color, color2 } = p
  const top = 0.025
  const t = 0.018
  const body = mat(color, { rough: 0.6 })
  const front = mat(color2, { rough: 0.55 })
  if (legH > 0) {
    if (legs) corners((sx, sz) => P.cyl(0.018, 0.012, legH, sx * (w / 2 - 0.05), legH / 2, sz * (d / 2 - 0.05), mat(shade(color, -0.3)), 12))
    else P.boxB(w - 0.04, legH, d - 0.05, 0, 0, -0.01, mat(shade(color, -0.35)))
  }
  P.boxB(w, top, d, 0, h - top, 0, body, 0.004)
  P.boxB(w, h - legH - top, d - t, 0, legH, -t / 2, body)
  const gap = 0.004
  const fh = (h - legH - top - gap * (rows + 1)) / rows
  const fw = (w - gap * (cols + 1)) / cols
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + gap + fw / 2 + c * (fw + gap)
      const y0 = legH + gap + r * (fh + gap)
      P.boxB(fw, fh, t, x, y0, d / 2 - t / 2, front)
      P.boxB(Math.min(0.14, fw * 0.4), 0.012, 0.018, x, y0 + fh * 0.62, d / 2 + 0.009, M.metal())
    }
  }
}

export function dresser(p: BuildParams) {
  const P = new Parts()
  const legH = p.floating ? 0 : 0.1
  const cols = auto(p.options, 'columns', p.w > 1.0 ? 2 : 1)
  const rows = auto(p.options, 'drawers', clamp(Math.round((p.h - legH - 0.03) / 0.2), 1, 8))
  drawerCabinet(P, p, rows, cols, legH, bool(p.options, 'legs', true))
  return P.group
}

export function nightstand(p: BuildParams) {
  const P = new Parts()
  const legH = p.floating ? 0 : Math.min(0.14, p.h * 0.25)
  const rows = auto(p.options, 'drawers', clamp(Math.round((p.h - legH) / 0.18), 1, 4))
  drawerCabinet(P, p, rows, 1, legH, true)
  return P.group
}

/** Partes sólidas da escrivaninha: tampo, pés e gaveteiro — o vão das pernas fica livre. */
export function deskSolids({ w, h, d, options }: { w: number; h: number; d: number; options: Record<string, OptionValue> }, floating: boolean): Solid[] {
  const topT = 0.03
  const out = [sbox(0, 0, w, d, h - topT, h)]
  const drawers = bool(options, 'drawers', true)
  if (floating) {
    const gh = Math.min(0.13, h - topT)
    const pw = Math.min(0.5, w * 0.4)
    if (drawers && gh > 0.06) out.push(sbox(w / 2 - pw / 2 - 0.03, -0.01, pw, d - 0.02, h - topT - gh, h - topT))
    return out
  }
  const legH = h - topT
  const pw = drawers && w > 0.7 ? Math.min(0.42, w * 0.35) : 0
  if (pw) out.push(sbox(w / 2 - pw / 2 - 0.02, -0.01, pw, d - 0.02, 0, legH))
  for (const sx of [-1, 1]) {
    if (sx === 1 && pw) continue
    for (const sz of [-1, 1]) out.push(sbox(sx * (w / 2 - 0.05), sz * (d / 2 - 0.05), 0.04, 0.04, 0, legH))
  }
  if (pw) out.push(sbox(w / 2 - pw - 0.06, -(d / 2 - 0.05), 0.04, 0.04, 0, legH))
  return out
}

export function desk({ w, h, d, color, color2, options, floating }: BuildParams) {
  const P = new Parts()
  const topT = 0.03
  const top = mat(color, { rough: 0.55 })
  P.boxB(w, topT, d, 0, h - topT, 0, top, 0.004)
  if (floating) {
    // Bancada suspensa: tampo fixado na parede, com gaveta pendurada opcional
    const gh = Math.min(0.13, h - topT)
    if (bool(options, 'drawers', true) && gh > 0.06) {
      const pw = Math.min(0.5, w * 0.4)
      const px = w / 2 - pw / 2 - 0.03
      P.boxB(pw, gh, d - 0.06, px, h - topT - gh, -0.03, mat(shade(color, -0.06), { rough: 0.6 }))
      P.boxB(pw - 0.01, gh - 0.01, 0.016, px, h - topT - gh + 0.005, d / 2 - 0.06 + 0.008, top)
      P.boxB(0.12, 0.012, 0.016, px, h - topT - gh * 0.45, d / 2 - 0.06 + 0.024, M.metal())
    }
    return P.group
  }
  const legH = h - topT
  const leg = mat(color2, { rough: 0.4, metal: 0.6 })
  let pw = 0
  if (bool(options, 'drawers', true) && w > 0.7) {
    pw = Math.min(0.42, w * 0.35)
    const px = w / 2 - pw / 2 - 0.02
    P.boxB(pw, legH - 0.02, d - 0.08, px, 0.02, -0.02, mat(shade(color, -0.06), { rough: 0.6 }))
    const n = 3
    const fh = (legH - 0.06) / n
    for (let i = 0; i < n; i++) {
      P.boxB(pw - 0.012, fh - 0.006, 0.018, px, 0.04 + i * fh, d / 2 - 0.06 + 0.009, top)
      P.boxB(0.12, 0.012, 0.018, px, 0.04 + i * fh + fh * 0.6, d / 2 - 0.06 + 0.027, M.metal())
    }
  }
  for (const sx of [-1, 1]) {
    if (sx === 1 && pw) continue
    for (const sz of [-1, 1]) P.boxB(0.04, legH, 0.04, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), leg)
  }
  if (pw) P.boxB(0.04, legH, 0.04, w / 2 - pw - 0.06, 0, -(d / 2 - 0.05), leg)
  return P.group
}

/** Partes sólidas da cadeira de escritório genérica: assento e braços passam sob o tampo de uma mesa. */
export function officeChairSolids({ w, h, d }: { w: number; h: number; d: number }): Solid[] {
  const seatH = clamp(h * 0.45, 0.3, 0.55)
  const ax = w * 0.41
  return [
    sbox(0, 0, w, d, 0, 0.1),
    sbox(0, 0, 0.06, 0.06, 0.1, seatH - 0.08),
    sbox(0, 0.03, w * 0.82, d * 0.78, seatH - 0.08, seatH),
    sbox(-ax, 0.01, 0.06, d * 0.36, seatH - 0.02, seatH + 0.205),
    sbox(ax, 0.01, 0.06, d * 0.36, seatH - 0.02, seatH + 0.205),
    { x0: -w * 0.38, x1: w * 0.38, z0: -d / 2, z1: -d * 0.36 + 0.035, y0: seatH - 0.04, y1: h },
  ]
}

export function officeChair({ w, h, d, color, color2 }: BuildParams) {
  const P = new Parts()
  const seatH = clamp(h * 0.45, 0.3, 0.55)
  const base = mat(color2, { rough: 0.4, metal: 0.6 })
  const R = Math.min(w, d) / 2 - 0.03
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU
    const spoke = P.box(R, 0.03, 0.04, (Math.cos(a) * R) / 2, 0.07, (Math.sin(a) * R) / 2, base)
    spoke.rotation.y = -a
    P.blob(0.025, Math.cos(a) * R, 0.025, Math.sin(a) * R, mat('#1c1d20'), 1)
  }
  P.cyl(0.025, 0.025, seatH - 0.12, 0, 0.07 + (seatH - 0.12) / 2, 0, M.chrome())
  P.boxB(w * 0.82, 0.08, d * 0.78, 0, seatH - 0.08, 0.03, M.fabric(color), 0.03)
  const backH = h - seatH - 0.08
  const back = P.boxB(w * 0.76, backH, 0.06, 0, seatH + 0.06, -d * 0.36, M.fabric(color), 0.03)
  back.rotation.x = -0.06
  P.boxB(0.05, 0.16, 0.03, 0, seatH - 0.04, -d * 0.33, base)
  for (const sx of [-1, 1]) {
    P.boxB(0.03, 0.2, 0.03, sx * (w * 0.41), seatH - 0.02, 0, base)
    P.boxB(0.06, 0.025, d * 0.36, sx * (w * 0.41), seatH + 0.18, 0.01, mat('#26282b'), 0.01)
  }
  return P.group
}

/** Partes sólidas da cadeira: pés e assento (entram sob o tampo da mesa) e o encosto atrás. */
export function chairSolids({ w, h, d }: { w: number; h: number; d: number }): Solid[] {
  const seatH = clamp(h * 0.5, 0.3, 0.5)
  return [sbox(0, 0, w, d, 0, seatH + 0.035), { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: -d / 2 + 0.035, y0: seatH, y1: h }]
}

export function chair({ w, h, d, color, color2 }: BuildParams) {
  const P = new Parts()
  const seatH = clamp(h * 0.5, 0.3, 0.5)
  const wood = mat(color, { rough: 0.6 })
  const l = 0.035
  corners((sx, sz) => P.boxB(l, seatH - 0.04, l, sx * (w / 2 - l / 2), 0, sz * (d / 2 - l / 2), wood))
  P.boxB(w, 0.04, d, 0, seatH - 0.04, 0, wood, 0.005)
  P.boxB(w - 0.04, 0.035, d - 0.06, 0, seatH, 0.01, M.fabric(color2), 0.015)
  for (const sx of [-1, 1]) P.boxB(l, h - seatH, l, sx * (w / 2 - l / 2), seatH, -d / 2 + l / 2, wood)
  const bh = Math.min(0.25, (h - seatH) * 0.5)
  P.boxB(w - 2 * l, bh, 0.02, 0, h - bh - 0.02, -d / 2 + l / 2, wood)
  return P.group
}

export function armchair({ w, h, d, color, color2 }: BuildParams) {
  const P = new Parts()
  const legH = 0.1
  const armW = clamp(w * 0.14, 0.08, 0.18)
  const armH = Math.min(h, 0.62)
  const seatTop = Math.min(0.44, h * 0.55)
  const fab = M.fabric(color)
  corners((sx, sz) => P.cyl(0.02, 0.014, legH, sx * (w / 2 - 0.06), legH / 2, sz * (d / 2 - 0.06), mat(color2, { rough: 0.5 }), 12))
  P.boxB(w, seatTop - 0.12 - legH, d, 0, legH, 0, fab, 0.03)
  P.boxB(w - 2 * armW, 0.12, d - 0.2, 0, seatTop - 0.12, 0.1, M.fabric(shade(color, 0.08)), 0.04)
  P.boxB(w - 2 * armW, h - (seatTop - 0.12), 0.2, 0, seatTop - 0.12, -d / 2 + 0.1, fab, 0.05)
  for (const sx of [-1, 1]) P.boxB(armW, armH - legH, d, sx * (w / 2 - armW / 2), legH, 0, fab, 0.04)
  return P.group
}

export function sofa({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const legH = 0.1
  const armW = clamp(w * 0.08, 0.1, 0.2)
  const armH = Math.min(h, 0.62)
  const seatTop = Math.min(0.45, h * 0.55)
  const fab = M.fabric(color)
  const fabL = M.fabric(shade(color, 0.08))
  const n = auto(options, 'seats', clamp(Math.round((w - 2 * armW) / 0.62), 1, 6))
  corners((sx, sz) => P.cyl(0.02, 0.014, legH, sx * (w / 2 - 0.06), legH / 2, sz * (d / 2 - 0.06), mat(color2, { rough: 0.5 }), 12))
  const backD = 0.18
  P.boxB(w, h - legH, backD, 0, legH, -d / 2 + backD / 2, fab, 0.04)
  P.boxB(w - 2 * armW, seatTop - 0.13 - legH, d - backD, 0, legH, backD / 2, fab, 0.02)
  for (const sx of [-1, 1]) P.boxB(armW, armH - legH, d, sx * (w / 2 - armW / 2), legH, 0, fab, 0.04)
  const cw = (w - 2 * armW) / n
  const sd = d - backD - 0.14
  const bh = (h - seatTop) * 0.85
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + armW + cw * (i + 0.5)
    P.boxB(cw - 0.01, 0.13, sd, x, seatTop - 0.13, d / 2 - sd / 2, fabL, 0.04)
    P.boxB(cw - 0.02, bh, 0.16, x, seatTop - 0.02, -d / 2 + backD + 0.07, fabL, 0.06)
  }
  return P.group
}

export function pouf({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  if (str(options, 'shape', 'round') === 'round') {
    P.ellipse(w, h, d, 0, 0, 0, M.fabric(color))
    P.ellipse(w * 1.01, 0.015, d * 1.01, 0, h - 0.03, 0, M.fabric(shade(color, -0.15)))
  } else P.boxB(w, h, d, 0, 0, 0, M.fabric(color), 0.06)
  return P.group
}

export function bench({ w, h, d, color, color2 }: BuildParams) {
  const P = new Parts()
  P.boxB(w, h - 0.08, d, 0, 0, 0, mat(color2, { rough: 0.6 }), 0.01)
  P.boxB(w - 0.04, 0.012, 0.01, 0, (h - 0.08) * 0.6, d / 2 + 0.005, M.darkMetal())
  P.boxB(w, 0.08, d, 0, h - 0.08, 0, M.fabric(color), 0.03)
  return P.group
}

export function crib({ w, h, d, color, color2 }: BuildParams) {
  const P = new Parts()
  const wood = mat(color, { rough: 0.6 })
  const post = 0.045
  corners((sx, sz) => P.boxB(post, h, post, sx * (w / 2 - post / 2), 0, sz * (d / 2 - post / 2), wood))
  const mattY = Math.min(0.35, h * 0.38)
  P.boxB(w - 2 * post, 0.03, d - 2 * post, 0, mattY - 0.03, 0, wood)
  P.boxB(w - 2 * post - 0.01, 0.1, d - 2 * post - 0.01, 0, mattY, 0, M.fabric(color2), 0.03)
  const railH = 0.04
  const lowY = mattY - 0.06
  const side = (len: number, alongX: boolean, fixed: number) => {
    const inner = len - 2 * post
    const mk = (y: number) =>
      alongX ? P.boxB(inner, railH, 0.03, 0, y, fixed, wood) : P.boxB(0.03, railH, inner, fixed, y, 0, wood)
    mk(h - railH)
    mk(lowY)
    const count = Math.max(2, Math.floor(inner / 0.07))
    const step = inner / count
    for (let i = 1; i < count; i++) {
      const s = -inner / 2 + i * step
      const sh = h - railH - (lowY + railH)
      if (alongX) P.cyl(0.011, 0.011, sh, s, lowY + railH + sh / 2, fixed, wood, 8)
      else P.cyl(0.011, 0.011, sh, fixed, lowY + railH + sh / 2, s, wood, 8)
    }
  }
  side(w, true, d / 2 - post / 2)
  side(w, true, -d / 2 + post / 2)
  side(d, false, w / 2 - post / 2)
  side(d, false, -w / 2 + post / 2)
  return P.group
}

export function vanity({ w, h, d, color, color2, floating }: BuildParams) {
  const P = new Parts()
  const body = mat(color, { rough: 0.55 })
  // Suspensa: a caixa começa na gaveta (a elevação define a altura do tampo); senão, com pés
  const deskH = floating ? Math.min(0.18, h) : Math.min(0.76, h)
  if (!floating) corners((sx, sz) => P.cyl(0.018, 0.012, deskH - 0.15, sx * (w / 2 - 0.05), (deskH - 0.15) / 2, sz * (d / 2 - 0.05), body, 12))
  P.boxB(w - 0.02, Math.min(0.12, deskH - 0.03), d - 0.02, 0, Math.max(0, deskH - 0.15), 0, body)
  P.boxB(w * 0.5, 0.1, 0.012, 0, deskH - 0.14, d / 2 - 0.004, mat(color2, { rough: 0.5 }))
  P.boxB(0.12, 0.01, 0.015, 0, deskH - 0.095, d / 2 + 0.006, M.metal())
  P.boxB(w, 0.03, d, 0, deskH - 0.03, 0, body, 0.004)
  if (h > deskH + 0.2) {
    const fw = Math.min(w * 0.7, 0.8)
    const fh = h - deskH - 0.03
    P.boxB(fw, fh, 0.03, 0, deskH + 0.01, -d / 2 + 0.03, body, 0.01)
    P.boxB(fw - 0.06, fh - 0.06, 0.004, 0, deskH + 0.04, -d / 2 + 0.047, M.mirror())
  }
  return P.group
}

export function mirror({ w, h, d, color }: BuildParams) {
  const P = new Parts()
  P.boxB(w, h, d, 0, 0, 0, mat(color, { rough: 0.5 }), 0.01)
  P.boxB(w - 0.06, h - 0.06, 0.004, 0, 0.03, d / 2 + 0.001, M.mirror())
  return P.group
}

export function tvRack({ w, h, d, color, color2, options, floating }: BuildParams) {
  const P = new Parts()
  const legs = !floating && bool(options, 'legs', true)
  const legH = legs ? Math.min(0.15, h * 0.3) : 0
  const body = mat(color, { rough: 0.55 })
  const front = mat(color2, { rough: 0.5 })
  if (legs) corners((sx, sz) => P.boxB(0.03, legH, 0.03, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), M.darkMetal()))
  P.boxB(w, h - legH, d - 0.016, 0, legH, -0.008, body, 0.004)
  const n = w > 1.5 ? 3 : 2
  const g = 0.012
  const sw = (w - g * (n + 1)) / n
  const fh = h - legH - 2 * g
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + g + sw / 2 + i * (sw + g)
    if (n === 3 && i === 1) P.boxB(sw, fh, 0.004, x, legH + g, d / 2 - 0.014, mat(shade(color, -0.5)))
    else {
      P.boxB(sw, fh, 0.016, x, legH + g, d / 2 - 0.008, front)
      P.boxB(Math.min(0.15, sw * 0.4), 0.01, 0.012, x, legH + g + fh - 0.04, d / 2 + 0.004, M.darkMetal())
    }
  }
  return P.group
}

export function tv({ w, h, d, options }: BuildParams) {
  const P = new Parts()
  const bezel = mat('#15171a', { rough: 0.4, metal: 0.3 })
  if (bool(options, 'stand', false)) {
    const footH = 0.07
    P.boxB(Math.min(0.45, w * 0.35), 0.015, Math.min(d, 0.25), 0, 0, 0, bezel)
    P.boxB(0.06, footH, 0.03, 0, 0.015, 0, bezel)
    P.boxB(w, h - footH - 0.015, 0.045, 0, footH + 0.015, 0, bezel, 0.006)
    P.boxB(w - 0.02, h - footH - 0.035, 0.004, 0, footH + 0.025, 0.0245, M.screen())
  } else {
    const t = Math.min(d, 0.05)
    P.boxB(w, h, t, 0, 0, -d / 2 + t / 2, bezel, 0.006)
    P.boxB(w - 0.02, h - 0.02, 0.004, 0, 0.01, -d / 2 + t + 0.002, M.screen())
  }
  return P.group
}

function table(P: Parts, { w, h, d, color, color2, options }: BuildParams, shelf: boolean) {
  const top = mat(color, { rough: 0.5 })
  const leg = mat(color2, { rough: 0.5, metal: 0.2 })
  const tt = 0.03
  if (str(options, 'shape', 'rect') === 'round') {
    P.ellipse(w, tt, d, 0, h - tt, 0, top, 48)
    P.cyl(0.04, 0.05, h - tt - 0.02, 0, (h - tt) / 2 + 0.01, 0, leg, 16)
    P.ellipse(Math.min(w, d) * 0.5, 0.02, Math.min(w, d) * 0.5, 0, 0, 0, leg, 32)
  } else {
    P.boxB(w, tt, d, 0, h - tt, 0, top, 0.006)
    corners((sx, sz) => P.boxB(0.045, h - tt, 0.045, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), leg))
    if (shelf) P.boxB(w - 0.1, 0.02, d - 0.1, 0, Math.min(0.12, h * 0.3), 0, top)
  }
}

export function coffeeTable(p: BuildParams) {
  const P = new Parts()
  table(P, p, true)
  return P.group
}

/**
 * Partes sólidas da mesa: tampo e pés (ou a coluna central da redonda) — as cadeiras entram embaixo.
 * O tampo redondo vira uma cruz de 3 caixas, quase o contorno da elipse.
 */
export function tableSolids({ w, h, d, options }: { w: number; h: number; d: number; options: Record<string, OptionValue> }): Solid[] {
  const tt = 0.03
  if (str(options, 'shape', 'rect') === 'round') {
    const b = Math.min(w, d) * 0.5
    return [
      sbox(0, 0, w, d * 0.6, h - tt, h),
      sbox(0, 0, w * 0.85, d * 0.85, h - tt, h),
      sbox(0, 0, w * 0.6, d, h - tt, h),
      sbox(0, 0, 0.1, 0.1, 0, h - tt),
      sbox(0, 0, b, b, 0, 0.02),
    ]
  }
  const out = [sbox(0, 0, w, d, h - tt, h)]
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(sbox(sx * (w / 2 - 0.06), sz * (d / 2 - 0.06), 0.045, 0.045, 0, h - tt))
  return out
}

export function diningTable(p: BuildParams) {
  const P = new Parts()
  table(P, p, false)
  return P.group
}

const BOOK_COLORS = ['#7a2e2e', '#2e4a7a', '#c9a227', '#3f6b4f', '#e8e2d0', '#5a3d6b', '#b5562f', '#2b2b2b', '#8fa7b8']

export function bookshelf({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const t = 0.018
  const wood = mat(color, { rough: 0.6 })
  for (const sx of [-1, 1]) P.boxB(t, h, d, sx * (w / 2 - t / 2), 0, 0, wood)
  P.boxB(w - 2 * t, t, d, 0, 0, 0, wood)
  P.boxB(w - 2 * t, t, d, 0, h - t, 0, wood)
  P.boxB(w - 2 * t, h - 2 * t, 0.006, 0, t, -d / 2 + 0.003, mat(shade(color, -0.12)))
  const n = auto(options, 'shelves', clamp(Math.round(h / 0.36) - 1, 1, 10))
  const comp = (h - 2 * t - n * t) / (n + 1)
  for (let k = 1; k <= n; k++) P.boxB(w - 2 * t, t, d - 0.01, 0, t + k * comp + (k - 1) * t, 0.005, wood)
  if (bool(options, 'books', true)) {
    const R = rng(Math.round(w * 1000 + h * 100 + n))
    for (let k = 0; k <= n; k++) {
      const y0 = t + k * (comp + t)
      if (comp < 0.12) continue
      let x = -w / 2 + t + 0.01
      const limit = -w / 2 + t + (w - 2 * t) * (0.45 + R() * 0.45)
      while (x < limit) {
        const bw = 0.018 + R() * 0.03
        const bh = Math.min(comp - 0.02, comp * (0.6 + R() * 0.3))
        P.boxB(bw, bh, d * 0.72, x + bw / 2, y0, -d / 2 + 0.006 + (d * 0.72) / 2, mat(BOOK_COLORS[Math.floor(R() * BOOK_COLORS.length)], { rough: 0.8 }))
        x += bw + 0.002
      }
    }
  }
  return P.group
}

export function wallShelf({ w, h, d, color }: BuildParams) {
  const P = new Parts()
  P.boxB(w, h, d, 0, 0, 0, mat(color, { rough: 0.6 }), 0.003)
  return P.group
}

export function rug({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  if (str(options, 'shape', 'rect') === 'round') {
    P.ellipse(w, h, d, 0, 0, 0, M.fabric(color), 64)
    P.ellipse(w * 0.8, h + 0.001, d * 0.8, 0, 0, 0, M.fabric(color2), 64)
    P.ellipse(w * 0.7, h + 0.002, d * 0.7, 0, 0, 0, M.fabric(color), 64)
  } else {
    P.boxB(w, h, d, 0, 0, 0, M.fabric(color))
    const b = Math.min(0.12, Math.min(w, d) * 0.08)
    P.boxB(w - 2 * b, h + 0.001, d - 2 * b, 0, 0, 0, M.fabric(color2))
    P.boxB(w - 3 * b, h + 0.002, d - 3 * b, 0, 0, 0, M.fabric(color))
  }
  return P.group
}

export function floorLamp({ w, h, d, color2 }: BuildParams) {
  const P = new Parts()
  const r = Math.min(w, d) / 2
  P.cyl(r * 0.6, r * 0.65, 0.025, 0, 0.0125, 0, M.darkMetal(), 32)
  const shadeH = Math.min(0.32, h * 0.22)
  P.cyl(0.011, 0.011, h - shadeH * 0.6, 0, (h - shadeH * 0.6) / 2, 0, M.darkMetal(), 10)
  P.cyl(r * 0.6, r * 0.95, shadeH, 0, h - shadeH / 2, 0, mat(color2, { rough: 0.9, side: THREE.DoubleSide, emissive: '#ffd9a0', emissiveIntensity: 0.35 }), 32, true)
  P.blob(0.04, 0, h - shadeH * 0.55, 0, mat('#fff6e0', { emissive: '#ffe2a8', emissiveIntensity: 1.2 }), 2)
  return P.group
}

export function plant({ w, h, d, color, color2 }: BuildParams) {
  const P = new Parts()
  const r = Math.min(w, d) / 2
  const potH = Math.min(h * 0.32, 0.45)
  P.cyl(r * 0.7, r * 0.52, potH, 0, potH / 2, 0, mat(color, { rough: 0.8 }), 28)
  P.cyl(r * 0.64, r * 0.64, 0.01, 0, potH - 0.02, 0, mat('#4a3426'), 20)
  P.cyl(0.015, 0.02, (h - potH) * 0.6, 0, potH + (h - potH) * 0.3, 0, mat('#5b4a32'), 8)
  const leaf = mat(color2, { rough: 0.8, flat: true })
  const leaf2 = mat(shade(color2, -0.22), { rough: 0.8, flat: true })
  const R = rng(7)
  const low = potH + (h - potH) * 0.3
  for (let i = 0; i < 10; i++) {
    const fr = r * (0.32 + R() * 0.28)
    const y = low + (h - fr - low) * R()
    const a = R() * TAU
    const rr = Math.max(0, r - fr) * (0.3 + R() * 0.7)
    const m = P.blob(fr, ((Math.cos(a) * rr) / r) * (w / 2), y, ((Math.sin(a) * rr) / r) * (d / 2), i % 2 ? leaf : leaf2, 1)
    m.scale.set(w / (2 * r), 1, d / (2 * r))
  }
  return P.group
}

export function airConditioner({ w, h, d }: BuildParams) {
  const P = new Parts()
  P.boxB(w, h, d, 0, 0, 0, M.white(), 0.035)
  P.boxB(w * 0.86, 0.025, 0.012, 0, h * 0.12, d / 2 - 0.002, mat('#cfd3d6'))
  P.boxB(w * 0.9, 0.006, 0.006, 0, h * 0.55, d / 2 + 0.001, mat('#e0e3e6'))
  P.boxB(0.02, 0.008, 0.004, w * 0.32, h * 0.4, d / 2 + 0.001, mat('#7fd1ff', { emissive: '#7fd1ff', emissiveIntensity: 1 }))
  return P.group
}

export const ROD_WOOD = '#8a5a3b'

/**
 * Cortinas e persianas. Profundidade d vai do fundo (parede, -d/2) até a frente (+d/2).
 * Opções: style (tecido | rolo | horizontal), layers (simples | dupla), openness 0..1,
 * side (ambos | esquerda | direita), sheerOpenness 0..1, rod (varao | trilho | nenhum), rodColor.
 */
export function curtain({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const style = str(options, 'style', 'tecido')
  const legacy = typeof options.open === 'boolean' ? (options.open ? 0.75 : 0) : 0.7
  const openF = clamp(num(options, 'openness', legacy), 0, 1)
  const rodColor = str(options, 'rodColor', '#f2f2f0')
  // branco e preto são pintados (metal refletindo o ambiente deixava o varão branco cinza); inox e dourado, metálicos
  const metallic = rodColor === '#b8bcc0' || rodColor === '#b8963e'
  const hw = mat(rodColor, rodColor === ROD_WOOD ? { rough: 0.6 } : metallic ? { rough: 0.35, metal: 0.75 } : { rough: 0.38, metal: 0.08 })
  if (style === 'rolo') return rollerBlind(P, w, h, d, color, openF)
  if (style === 'horizontal') return venetianBlind(P, w, h, d, color, openF, clamp(num(options, 'tilt', 0.7), 0, 1), str(options, 'slat', '25') === '50' ? 0.05 : 0.025)

  const double = str(options, 'layers', 'simples') === 'dupla'
  const side = str(options, 'side', 'ambos')
  const rod = str(options, 'rod', 'varao')
  // ilhós: o varão passa por anéis presos no próprio tecido (a cortina sobe acima do varão)
  const eyelets = rod === 'varao' && str(options, 'heading', 'ilhos') === 'ilhos'
  const sheerF = clamp(num(options, 'sheerOpenness', 0), 0, 1)
  const topY = h - 0.035
  // Voil atrás (junto à janela), tecido na frente
  const zFront = double ? d / 4 : 0
  const zBack = -d / 4
  const ampMax = Math.max(0.008, (double ? d / 4 : d / 2) - 0.012)
  const fabric = mat(color, { rough: 0.95, side: THREE.DoubleSide })
  const sheer = mat(color2, { rough: 0.9, side: THREE.DoubleSide, opacity: 0.5 })

  const layer = (m: THREE.Material, f: number, z: number) => {
    const stack = (span: number) => Math.max(0.07, span * 0.16)
    const span = side === 'ambos' ? w / 2 : w
    const pw = stack(span) + (span - stack(span)) * (1 - f) + (side === 'ambos' && f < 0.02 ? 0.015 : 0)
    const centers = side === 'ambos' ? [-w / 2 + pw / 2, w / 2 - pw / 2] : [side === 'esquerda' ? -w / 2 + pw / 2 : w / 2 - pw / 2]
    const fabricTop = eyelets ? topY + 0.045 : topY - (rod === 'varao' ? 0.03 : 0.018)
    const y0 = 0.012
    const fh = Math.max(0.05, fabricTop - y0)
    // Mais fechada = ondas suaves; recolhida = pregas curtas e fundas. Com ilhós as ondas são largas
    // (um anel a cada ~13 cm, o tecido passando na frente e atrás do varão).
    const c = clamp(pw / span, 0.1, 1)
    const period = eyelets ? Math.max(0.045, 0.26 * c) : Math.max(0.03, 0.15 * c)
    const amp = eyelets ? clamp(ampMax * (0.75 + (1 - c) * 0.35), 0.016, ampMax) : clamp(ampMax * (0.5 + (1 - c) * 0.7), 0.006, ampMax)
    for (const cx of centers) {
      const seg = Math.min(600, Math.max(8, Math.round((pw / period) * 16)))
      const geo = new THREE.PlaneGeometry(pw, fh, seg, 1)
      const p = geo.attributes.position
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(((p.getX(i) + pw / 2) / period) * TAU) * amp)
      geo.computeVertexNormals()
      P.mesh(geo, m, cx, y0 + fh / 2, z)
      if (eyelets) {
        // um ilhós em cada ponto em que o tecido cruza o varão, deitado no plano do tecido
        const slope = (amp * TAU) / period
        const crossings = Math.max(1, Math.floor((pw - 0.01) / (period / 2)))
        for (let k = 0; k <= crossings; k++) {
          const lx = k * (period / 2)
          if (lx > pw) break
          const sgn = k % 2 === 0 ? 1 : -1
          const ring = P.mesh(new THREE.TorusGeometry(0.02, 0.0042, 8, 18), hw, cx - pw / 2 + lx, topY, z)
          ring.rotation.y = Math.atan2(-sgn * slope, 1)
        }
      } else if (rod === 'varao') {
        const n = Math.max(2, Math.round(pw / Math.max(period, 0.06)))
        for (let k = 0; k <= n; k++) {
          const ring = P.mesh(new THREE.TorusGeometry(0.019, 0.0035, 6, 14), hw, cx - pw / 2 + (k / n) * pw, topY, z)
          ring.rotation.y = Math.PI / 2
        }
      }
    }
  }

  const layersZ = double ? [zBack, zFront] : [zFront]
  if (rod === 'varao') {
    for (const z of layersZ) {
      const r = P.cyl(0.011, 0.011, w - 0.05, 0, topY, z, hw, 12)
      r.rotation.z = Math.PI / 2
      for (const sx of [-1, 1]) P.blob(0.02, sx * (w / 2 - 0.02), topY, z, hw, 1)
    }
    const xs = w > 2.2 ? [-w / 2 + 0.15, 0, w / 2 - 0.15] : [-w / 2 + 0.15, w / 2 - 0.15]
    for (const x of xs) P.boxB(0.02, 0.045, zFront + d / 2, x, topY - 0.022, (zFront - d / 2) / 2, hw)
  } else if (rod === 'trilho') {
    for (const z of layersZ) P.box(w, 0.02, 0.035, 0, topY + 0.012, z, hw)
  }
  if (double) layer(sheer, sheerF, zBack)
  layer(fabric, openF, zFront)
  return P.group
}

/** Persiana rolô: tubo no alto e tela lisa que desce conforme a abertura. */
function rollerBlind(P: Parts, w: number, h: number, d: number, color: string, openF: number) {
  const white = mat('#f2f2f0', { rough: 0.5 })
  const fabric = mat(color, { rough: 0.92, side: THREE.DoubleSide })
  const r = Math.min(0.03, d / 2 - 0.005)
  const topY = h - r - 0.005
  const tube = P.cyl(r, r, w - 0.03, 0, topY, 0, white, 20)
  tube.rotation.z = Math.PI / 2
  for (const sx of [-1, 1]) P.box(0.012, 2 * r + 0.01, 2 * r + 0.01, sx * (w / 2 - 0.006), topY, 0, white)
  const full = topY - 0.02
  const len = Math.max(0.015, full * (1 - openF))
  const z = Math.min(r - 0.002, d / 2 - 0.004)
  P.box(w - 0.04, len, 0.002, 0, topY - len / 2, z, fabric)
  P.box(w - 0.04, 0.02, 0.012, 0, topY - len - 0.01, z, white)
  return P.group
}

/**
 * Persiana horizontal (veneziana de alumínio ou madeira), como a de verdade: caixa no alto, lâminas
 * penduradas nas escadas de cordão (inclinação pelo bastão) e, ao recolher, o trilho de baixo sobe
 * juntando as lâminas numa pilha deitada em cima dele; as de cima continuam penduradas.
 * raiseF: 0 = baixada … 1 = toda recolhida. tiltF: 0 = lâminas fechadas … 1 = na horizontal.
 */
function venetianBlind(P: Parts, w: number, h: number, d: number, color: string, raiseF: number, tiltF: number, slatW: number) {
  const slatM = mat(color, { rough: 0.38, metal: slatW > 0.03 ? 0.05 : 0.35 })
  const cord = mat('#e9e6df', { rough: 0.9 })
  const headH = slatW > 0.03 ? 0.05 : 0.032
  const headD = Math.min(d, slatW + 0.014)
  // caixa do mecanismo, com as tampas das pontas
  P.boxB(w, headH, headD, 0, h - headH, 0, slatM, 0.004)
  for (const sx of [-1, 1]) P.boxB(0.006, headH + 0.002, headD + 0.002, sx * (w / 2 - 0.003), h - headH - 0.001, 0, mat(shade(color, -0.08), { rough: 0.5 }), 0.002)
  const yTop = h - headH - 0.006
  const railH = slatW > 0.03 ? 0.022 : 0.013
  const slatT = slatW > 0.03 ? 0.003 : 0.0018
  const pitch = slatW * 0.86
  // na pilha cada lâmina ocupa a própria espessura + a folga do cordão
  const stackStep = slatT + (slatW > 0.03 ? 0.0016 : 0.0009)
  const drop = Math.max(0.05, yTop - railH - 0.004)
  const N = Math.max(2, Math.floor(drop / pitch))
  const used = Math.max(N * stackStep, (1 - raiseF) * N * pitch)
  const hanging = clamp(Math.round((used - N * stackStep) / (pitch - stackStep)), 0, N)
  const stacked = N - hanging
  const ang = (1 - tiltF) * 1.36
  const geos: THREE.BufferGeometry[] = []
  for (let i = 0; i < hanging; i++) {
    const g = new THREE.BoxGeometry(w - 0.014, slatT, slatW)
    g.rotateX(ang)
    g.translate(0, yTop - (i + 0.5) * pitch, 0)
    geos.push(g)
  }
  let y = yTop - hanging * pitch - (hanging ? pitch * 0.35 : 0)
  for (let i = 0; i < stacked; i++) {
    const g = new THREE.BoxGeometry(w - 0.014, slatT, slatW)
    g.translate(0, y - (i + 0.5) * stackStep, 0)
    geos.push(g)
  }
  if (geos.length) {
    P.mesh(mergeGeometries(geos), slatM)
    geos.forEach((g) => g.dispose())
  }
  y -= stacked * stackStep
  // trilho de baixo (mais pesado)
  P.boxB(w - 0.01, railH, slatW + 0.003, 0, y - railH, 0, slatM, Math.min(0.004, railH * 0.3))
  const yBottom = y - railH
  // escadas de cordão (nas bordas das lâminas) e o cordão de içar no meio delas
  const ladders = w > 1.4 ? [-w / 2 + 0.1, 0, w / 2 - 0.1] : [-w / 2 + 0.09, w / 2 - 0.09]
  const zEdge = (slatW / 2) * Math.cos(ang) + 0.0012
  const span = yTop - yBottom
  for (const x of ladders) {
    for (const zz of [-zEdge, zEdge]) P.boxB(0.0015, span, 0.0015, x, yBottom, zz, cord)
    P.boxB(0.0013, span, 0.0013, x + 0.007, yBottom, 0, cord)
  }
  // bastão de inclinar (à direita) e cordões de recolher com a borla (à esquerda): recolher puxa mais cordão
  const zf = headD / 2 + 0.006
  const wandL = Math.min(0.9, h * 0.42)
  P.cyl(0.0042, 0.0042, wandL, w / 2 - 0.035, h - headH - wandL / 2, zf, mat('#f6f6f4', { rough: 0.15, opacity: 0.8 }), 8)
  const pullL = clamp(0.3 + (drop - span) * 0.95, 0.3, h - headH - 0.12)
  for (const dx of [0, 0.007]) P.boxB(0.0015, pullL, 0.0015, -w / 2 + 0.04 + dx, h - headH - pullL, zf, cord)
  P.cyl(0.0035, 0.007, 0.035, -w / 2 + 0.0435, h - headH - pullL - 0.0175, zf, slatM, 10)
  return P.group
}

// ---------------- Cozinha ----------------

let brushedTex: THREE.CanvasTexture | null = null
/** Escovado: riscos finos na horizontal, quase brancos (multiplica a cor do material). */
function brushedTexture() {
  if (brushedTex) return brushedTex
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#f6f6f6'
  g.fillRect(0, 0, S, S)
  const R = rng(77)
  for (let i = 0; i < 5000; i++) {
    const y = R() * S
    const v = 236 + Math.floor(R() * 19)
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + R() * 0.3})`
    g.fillRect(R() * S - 120, y, 120 + R() * 520, 0.5 + R() * 0.5)
  }
  brushedTex = new THREE.CanvasTexture(c)
  brushedTex.colorSpace = THREE.SRGBColorSpace
  brushedTex.wrapS = brushedTex.wrapT = THREE.RepeatWrapping
  brushedTex.anisotropy = 8
  return brushedTex
}

const finishCache = new Map<string, THREE.Material>()
/**
 * Acabamento de eletrodoméstico: inox escovado (aço, mais espelhado), inox look (aço pintado imitando
 * inox: claro, levemente quente, pouco metálico), black inox ou a cor escolhida (pintura lisa).
 * `side` deixa a lateral um tom mais escura.
 */
export function applianceFinish(finish: string, color: string, side = false): THREE.Material {
  const key = `${finish}|${color}|${side}`
  let m = finishCache.get(key)
  if (m) return m
  const brushed = (base: string, metal: number, rough: number, aniso: number) =>
    new THREE.MeshPhysicalMaterial({ color: side ? shade(base, -0.07) : base, metalness: metal, roughness: rough, map: brushedTexture(), anisotropy: aniso, anisotropyRotation: Math.PI / 2 })
  if (finish === 'inox-look') m = brushed('#c9c8c4', 0.45, 0.36, 0.5)
  else if (finish === 'inox') m = brushed('#c4c7ca', 0.82, 0.3, 0.7)
  else if (finish === 'black-inox') m = brushed('#3e3f42', 0.7, 0.32, 0.6)
  else m = side ? mat(shade(color, -0.08), { rough: 0.35, metal: 0.6 }) : mat(color, { rough: 0.3, metal: 0.62 })
  finishCache.set(key, m)
  return m
}

let fridgeDisplayTex: THREE.CanvasTexture | null = null
let fridgeScreen: THREE.MeshStandardMaterial | null = null
/** Painel preto vertical da porta do freezer (Electrolux): logo no alto, indicadores e "Inverter". */
function fridgeDisplayTexture() {
  if (fridgeDisplayTex) return fridgeDisplayTex
  const W = 256
  const H = 1100
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, W, 0)
  gr.addColorStop(0, '#050506')
  gr.addColorStop(0.5, '#141518')
  gr.addColorStop(1, '#050506')
  g.fillStyle = gr
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#f2f2f2'
  g.strokeStyle = '#f2f2f2'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // símbolo (quadrado arredondado com o "E") e o nome
  g.lineWidth = 5
  const s = 46
  g.beginPath()
  g.roundRect(W / 2 - s / 2, 70, s, s, 12)
  g.stroke()
  g.font = '700 34px Georgia, serif'
  g.fillText('E', W / 2, 94)
  g.font = '600 30px Georgia, serif'
  g.fillText('Electrolux', W / 2, 160)
  // indicadores (temperaturas, modos)
  g.font = '400 18px Arial, sans-serif'
  g.fillStyle = '#d8d8d8'
  g.fillText('Freezer', W / 2 - 20, 330)
  g.fillText('Geladeira', W / 2 - 14, 395)
  for (const y of [330, 395]) {
    g.fillRect(W / 2 + 46, y - 3, 22, 6)
  }
  for (let i = 0; i < 4; i++) g.fillRect(W / 2 - 4, 450 + i * 34, 8, 8)
  g.lineWidth = 2
  g.strokeStyle = '#d8d8d8'
  g.strokeRect(W / 2 - 46, 600, 92, 34)
  g.font = '600 16px Arial, sans-serif'
  g.fillText('TURBO', W / 2, 618)
  g.fillStyle = '#9a9a9a'
  g.font = '500 13px Arial, sans-serif'
  g.fillText('INVERTER', W / 2, H - 50)
  fridgeDisplayTex = new THREE.CanvasTexture(c)
  fridgeDisplayTex.colorSpace = THREE.SRGBColorSpace
  fridgeDisplayTex.anisotropy = 8
  return fridgeDisplayTex
}

/**
 * Porta com a frente abaulada (convexa na horizontal): o fundo é reto em z = 0, a frente fica em
 * z = t nas laterais e t + bulge no meio. x em [-w/2, w/2], y em [0, h]; quinas levemente boleadas.
 */
function curvedDoorGeometry(w: number, h: number, t: number, bulge: number) {
  const r = Math.min(0.006, t * 0.2)
  const sh = new THREE.Shape()
  // plano da forma: (x, -z) — depois de girar, a extrusão vira a altura (y)
  sh.moveTo(-w / 2 + r, 0)
  sh.lineTo(w / 2 - r, 0)
  sh.quadraticCurveTo(w / 2, 0, w / 2, -r)
  sh.lineTo(w / 2, -(t - r))
  sh.quadraticCurveTo(w / 2, -t, w / 2 - r, -t - 0.0004)
  sh.quadraticCurveTo(0, -(t + 2 * bulge), -w / 2 + r, -t - 0.0004)
  sh.quadraticCurveTo(-w / 2, -t, -w / 2, -(t - r))
  sh.lineTo(-w / 2, -r)
  sh.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0)
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2, curveSegments: 28 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, 0.004, 0)
  // normais suaves na frente curva (a extrusão vem com uma normal por triângulo)
  g.deleteAttribute('normal')
  const m = mergeVertices(g, 1e-5)
  m.computeVertexNormals()
  g.dispose()
  return m
}

/**
 * Geladeira duplex no estilo Electrolux Inverter (inox look): portas de frente abaulada, painel preto
 * vertical na porta do freezer, puxadores embutidos na lateral das portas, dobradiças do outro lado,
 * rodapé cinza e pés.
 */
function electroluxFridge(P: Parts, w: number, h: number, d: number, color: string, handleLeft: boolean, finish: string) {
  const inox = applianceFinish(finish, color)
  const side = applianceFinish(finish, color, true)
  const black = mat('#0d0e10', { rough: 0.35, metal: 0.2 })
  const base = 0.045
  const t = 0.045
  const bulge = Math.min(0.022, w * 0.035)
  const z0 = d / 2 - t - bulge // fundo das portas
  // rodapé cinza recuado e pés
  P.boxB(w - 0.03, base, d - 0.12, 0, 0, -0.04, mat('#a7a9ab', { rough: 0.5, metal: 0.3 }))
  for (const sx of [-1, 1]) P.cyl(0.017, 0.019, 0.028, sx * (w / 2 - 0.045), 0.014, z0 - 0.03, mat('#9b9ea2', { rough: 0.4, metal: 0.6 }), 16)
  // gabinete (laterais) até o fundo das portas
  const bodyD = z0 + d / 2
  P.boxB(w, h - base, bodyD, 0, base, -d / 2 + bodyD / 2, side, 0.01)
  const usable = h - base
  const fdh = usable * 0.31
  const gap = 0.008
  const f0 = h - fdh
  const gH = f0 - gap - base - 0.004
  P.mesh(curvedDoorGeometry(w - 0.004, fdh - 0.012, t, bulge), inox, 0, f0, z0)
  P.mesh(curvedDoorGeometry(w - 0.004, gH - 0.008, t, bulge), inox, 0, base + 0.004, z0)
  // fresta entre as portas
  P.boxB(w - 0.02, gap, t - 0.01, 0, f0 - gap, z0 + t / 2, black)
  // puxadores embutidos na lateral das portas (rasgo preto na face de lado)
  const sx = handleLeft ? -1 : 1
  const hx = sx * (w / 2 - 0.004)
  const groove = (y0: number, len: number) => P.boxB(0.012, len, t - 0.014, hx, y0, z0 + t / 2 + 0.002, black, 0.003)
  groove(f0 + fdh * 0.07, fdh * 0.48)
  const gl = gH * 0.44
  groove(f0 - gap - 0.025 - gl, gl)
  // dobradiças do outro lado
  const kx = -sx * (w / 2 - 0.035)
  const hingeM = mat(shade(color, -0.2), { rough: 0.3, metal: 0.8 })
  P.boxB(0.06, 0.012, 0.05, kx, h - 0.004, z0 + 0.012, hingeM, 0.003)
  P.boxB(0.05, gap + 0.004, 0.045, kx, f0 - gap - 0.002, z0 + t / 2 + 0.006, hingeM, 0.002)
  // painel preto vertical (com o logo) na porta do freezer, seguindo a frente abaulada
  const dw = Math.min(0.105, w * 0.165)
  const dh = fdh * 0.72
  const dx = -sx * w * 0.05
  const dy = f0 + 0.03
  // frente da porta em x (a curva + o chanfro de 3 mm da extrusão)
  const fx = (x: number) => z0 + t + 0.003 + bulge * (1 - (2 * x / (w - 0.004)) ** 2)
  const zf = Math.max(fx(dx - dw / 2), fx(dx + dw / 2)) + 0.0015
  P.boxB(dw + 0.006, dh + 0.006, 0.006, dx, dy - 0.003, zf - 0.002, black, 0.0025)
  fridgeScreen ??= new THREE.MeshStandardMaterial({ map: fridgeDisplayTexture(), roughness: 0.12, metalness: 0.2 })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), fridgeScreen)
  screen.position.set(dx, dy + dh / 2, zf + 0.0012)
  P.group.add(screen)
  return P.group
}

export function fridge({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const model = str(options, 'model', 'generico')
  const hs = str(options, 'handle', 'padrao')
  const finish = str(options, 'finish', 'cor')
  if (model === 'electrolux' && str(options, 'layout', 'duplex') === 'duplex') return electroluxFridge(P, w, h, d, color, hs !== 'direita', finish)
  const body = finish === 'cor' ? mat(color, { rough: 0.3, metal: 0.55 }) : applianceFinish(finish, color)
  const handle = mat(shade(color, -0.35), { rough: 0.3, metal: 0.7 })
  const layout = str(options, 'layout', w > 0.8 ? 'side' : 'duplex')
  const hsx = hs === 'esquerda' ? -1 : 1
  P.boxB(w - 0.04, 0.04, d - 0.1, 0, 0, -0.03, mat('#1d1f22'))
  P.boxB(w, h - 0.04, d - 0.035, 0, 0.04, -0.0175, body, 0.02)
  const t = 0.032
  const z = d / 2 - t / 2
  const g = 0.006
  if (layout === 'side') {
    const lw = w * 0.45
    const rw = w - lw - g
    P.boxB(lw, h - 0.06, t, -w / 2 + lw / 2, 0.05, z, body, 0.01)
    P.boxB(rw, h - 0.06, t, w / 2 - rw / 2, 0.05, z, body, 0.01)
    P.boxB(0.018, h * 0.5, 0.025, -w / 2 + lw - 0.03, h * 0.28, d / 2 + 0.012, handle, 0.008)
    P.boxB(0.018, h * 0.5, 0.025, w / 2 - rw + 0.03, h * 0.28, d / 2 + 0.012, handle, 0.008)
  } else {
    const split = 0.04 + (h - 0.06) * 0.66
    P.boxB(w, split - 0.05, t, 0, 0.05, z, body, 0.01)
    P.boxB(w, h - 0.01 - split - g, t, 0, split + g, z, body, 0.01)
    P.boxB(0.018, Math.min(0.5, split * 0.45), 0.025, hsx * (w / 2 - 0.05), split - 0.08 - Math.min(0.5, split * 0.45), d / 2 + 0.012, handle, 0.008)
    P.boxB(0.018, Math.min(0.28, (h - split) * 0.5), 0.025, hsx * (w / 2 - 0.05), split + 0.06, d / 2 + 0.012, handle, 0.008)
  }
  return P.group
}

export function stove({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const body = mat(color, { rough: 0.35, metal: 0.5 })
  const dark = mat('#17181a', { rough: 0.2, metal: 0.3 })
  const induction = str(options, 'top', 'gas') === 'inducao'
  P.boxB(w, h - 0.015, d - 0.02, 0, 0, -0.01, body, 0.008)
  P.boxB(w, 0.015, d, 0, h - 0.015, 0, induction ? mat('#0c0d0f', { rough: 0.1, metal: 0.35 }) : dark, 0.004)
  const n = w > 0.68 ? 5 : 4
  const pos: [number, number][] = induction
    ? []
    : n === 5
      ? [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.2], [0.3, 0.2], [0, -0.02]]
      : [[-0.25, -0.22], [0.25, -0.22], [-0.25, 0.22], [0.25, 0.22]]
  if (induction) inductionMarks(P, w, d, h, n)
  for (const [fx, fz] of pos) {
    const x = fx * w
    const zz = fz * d
    P.cyl(0.042, 0.046, 0.012, x, h + 0.006, zz, mat('#2a2b2e', { rough: 0.4, metal: 0.6 }), 20)
    const grate = P.mesh(new THREE.TorusGeometry(0.06, 0.004, 6, 24), mat('#3a3b3e', { rough: 0.5, metal: 0.4 }), x, h + 0.018, zz)
    grate.rotation.x = Math.PI / 2
  }
  const doorH = h * 0.55
  P.boxB(w - 0.04, doorH, 0.02, 0, 0.1, d / 2 - 0.01, body, 0.006)
  P.boxB((w - 0.04) * 0.72, doorH * 0.5, 0.004, 0, 0.1 + doorH * 0.25, d / 2 + 0.001, M.screen())
  const bar = P.cyl(0.008, 0.008, (w - 0.04) * 0.8, 0, 0.1 + doorH - 0.04, d / 2 + 0.03, M.chrome(), 10)
  bar.rotation.z = Math.PI / 2
  for (const sx of [-1, 1]) P.boxB(0.012, 0.012, 0.025, sx * (w - 0.04) * 0.38, 0.1 + doorH - 0.046, d / 2 + 0.012, M.chrome())
  for (let i = 0; i < n + 1; i++) {
    const k = P.cyl(0.013, 0.013, 0.018, -w * 0.38 + (i * (w * 0.76)) / n, h - 0.07, d / 2 + 0.008, dark, 14)
    k.rotation.x = Math.PI / 2
  }
  return P.group
}

/**
 * Balcão / gabinete de cozinha com tampo de pedra e, opcionalmente, cuba e um vão embaixo do tampo:
 * para forno de embutir (gaveta embaixo e nicho aberto) ou totalmente aberto (fogão, lava-louças).
 */
export function kitchenCabinet({ w, h, d, color, color2, options, floating }: BuildParams) {
  const P = new Parts()
  const body = mat(color, { rough: 0.55 })
  const inner = mat(shade(color, -0.14), { rough: 0.7 })
  const plinthM = mat(shade(color, -0.4))
  const top = counterTop(color2, options, w, d)
  const plinth = floating ? 0 : 0.1
  const topT = 0.03
  const carcH = h - topT - plinth
  const fz = d / 2 - 0.05 + 0.009
  const fh = carcH - 0.01
  const front = str(options, 'front', 'auto')
  if (front !== 'auto') return modularCabinet(P, { w, h, d, color, color2, options, body, inner, top, plinth, topT, carcH, fz, fh })
  const bay = str(options, 'bay', 'nenhum')
  const hasBay = bay !== 'nenhum' && w >= 0.3
  const bw = hasBay ? clamp(num(options, 'bayWidth', 0.6), 0.3, w) : 0
  const pos = str(options, 'bayPos', 'direita')
  const bx0 = !hasBay ? 0 : pos === 'esquerda' ? -w / 2 : pos === 'centro' ? -bw / 2 : w / 2 - bw
  const bx1 = bx0 + bw
  const segs: [number, number][] = (hasBay ? [[-w / 2, bx0], [bx1, w / 2]] : [[-w / 2, w / 2]]).filter(([a, b]) => b - a > 0.08) as [number, number][]
  const sink = bool(options, 'sink', false)
  const widest = segs.reduce((best, sg, i) => (sg[1] - sg[0] > segs[best][1] - segs[best][0] ? i : best), 0)
  let mod = 0
  segs.forEach(([a, b], si) => {
    const sw = b - a
    const cx = (a + b) / 2
    if (plinth) P.boxB(sw - 0.02, plinth, d - 0.12, cx, 0, -0.04, plinthM)
    P.boxB(sw, carcH, d - 0.05, cx, plinth, -0.025, body)
    const n = Math.max(1, Math.round(sw / 0.5))
    const mw = sw / n
    const sinkHere = sink && si === widest
    const sinkMod = sinkHere ? Math.min(n - 1, Math.floor(n / 2)) : -1
    for (let i = 0; i < n; i++, mod++) {
      const x = a + mw * (i + 0.5)
      const drawers = !sinkHere && mod % 3 === 1
      if (drawers) {
        for (let k = 0; k < 3; k++) {
          const dh = fh / 3
          P.boxB(mw - 0.006, dh - 0.006, 0.018, x, plinth + 0.004 + k * dh, fz, body)
          P.boxB(Math.min(0.2, mw * 0.4), 0.012, 0.018, x, plinth + 0.004 + k * dh + dh * 0.7, fz + 0.018, M.metal())
        }
      } else {
        P.boxB(mw - 0.006, fh - 0.006, 0.018, x, plinth + 0.004, fz, body)
        P.boxB(0.012, Math.min(0.2, fh * 0.3), 0.018, x + (i % 2 ? -1 : 1) * (mw / 2 - 0.04), plinth + fh - 0.06 - Math.min(0.2, fh * 0.3), fz + 0.018, M.metal())
      }
      if (i === sinkMod) sinkAt(P, x, Math.min(0.52, mw - 0.06), h, d, options)
    }
  })
  if (hasBay) {
    const cx = (bx0 + bx1) / 2
    const t = 0.018
    const open = bay === 'aberto'
    // gaveta embaixo do forno (no vão de forno)
    const dh = open ? 0 : Math.min(0.18, carcH * 0.25)
    const y0 = open ? 0 : plinth + dh
    if (!open) {
      if (plinth) P.boxB(bw - 0.02, plinth, d - 0.12, cx, 0, -0.04, plinthM)
      P.boxB(bw, dh, d - 0.05, cx, plinth, -0.025, body)
      P.boxB(bw - 0.006, dh - 0.006, 0.018, cx, plinth + 0.003, fz, body)
      P.boxB(Math.min(0.2, bw * 0.4), 0.012, 0.018, cx, plinth + dh * 0.62, fz + 0.018, M.metal())
    }
    const vh = h - topT - y0
    for (const sx of [bx0 + t / 2, bx1 - t / 2]) P.boxB(t, vh, d - 0.05, sx, y0, -0.025, body)
    P.boxB(bw - 2 * t, vh, 0.012, cx, y0, -d / 2 + 0.006, inner)
    if (!open) P.boxB(bw - 2 * t, 0.004, d - 0.06, cx, y0, -0.03, inner)
  }
  P.boxB(w, topT, d, 0, h - topT, 0, top, 0.004)
  return P.group
}

const SINK_COLORS: Record<string, [string, number, number]> = {
  inox: ['#c9ccd0', 0.25, 0.9],
  dourado: ['#c9a24c', 0.3, 0.9],
  preto: ['#2a2b2e', 0.45, 0.15],
  grafite: ['#4a4d52', 0.4, 0.3],
  branco: ['#eeeeec', 0.25, 0],
}
const METALS: Record<string, [string, number, number]> = {
  cromado: ['#cdd1d6', 0.16, 0.95],
  inox: ['#b3b7bb', 0.38, 0.85],
  dourado: ['#c9a24c', 0.28, 0.9],
  preto: ['#1f2022', 0.6, 0.3],
  branco: ['#f1f1ef', 0.5, 0.1],
}
const metalOf = (id: string, def: string) => {
  const [c, r, m] = METALS[id] ?? METALS[def]
  return mat(c, { rough: r, metal: m })
}

/** Cuba (cor à escolha) com torneira, centrada em x com largura sw. */
function sinkAt(P: Parts, x: number, sw: number, h: number, d: number, options: Record<string, OptionValue> = {}) {
  const [c, r, m] = SINK_COLORS[str(options, 'sinkColor', 'inox')] ?? SINK_COLORS.inox
  const faucet = metalOf(str(options, 'faucetColor', 'cromado'), 'cromado')
  const rim = mat(c, { rough: r, metal: m })
  const bowl = mat(shade(c, -0.25), { rough: r + 0.05, metal: m * 0.9 })
  const sd = Math.min(0.4, d - 0.16)
  P.boxB(sw, 0.004, sd, x, h, 0.02, rim)
  P.boxB(sw - 0.04, 0.003, sd - 0.04, x, h + 0.002, 0.02, bowl)
  const fx = x - Math.min(0.08, sw * 0.2)
  const model = str(options, 'faucet', 'bica')
  if (model === 'gourmet' || model === 'gourmet-parede') {
    // o corpo fica logo atrás da cuba; a de parede sai da parede num braço curto
    const zBody = Math.min(-d / 2 + 0.1, 0.02 - sd / 2 - 0.02)
    gourmetFaucet(P, fx, h, zBody, model === 'gourmet-parede' ? -d / 2 : null, faucet)
    return
  }
  P.cyl(0.014, 0.016, 0.26, fx, h + 0.13, -d / 2 + 0.07, faucet, 12)
  P.boxB(0.02, 0.02, 0.2, fx, h + 0.24, -d / 2 + 0.16, faucet, 0.008)
}

/** Hélice (a mola da torneira gourmet) em volta de um eixo vertical. */
class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(
    private cx: number,
    private cz: number,
    private y0: number,
    private y1: number,
    private r: number,
    private turns: number,
  ) {
    super()
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2
    return target.set(this.cx + Math.cos(a) * this.r, this.y0 + (this.y1 - this.y0) * t, this.cz + Math.sin(a) * this.r)
  }
}

/**
 * Torneira gourmet com mola: corpo com alavanca, coluna com a mola em volta, curva no alto e a ducha
 * descendo até o suporte preso na coluna. De bancada (sobre o tampo, top = altura do tampo) ou de
 * parede (wallZ: braço saindo da parede um pouco acima do tampo).
 */
function gourmetFaucet(P: Parts, x: number, top: number, z: number, wallZ: number | null, m: THREE.Material) {
  const wall = wallZ !== null
  // corpo do misturador
  // altura total ~44 cm acima do tampo: cabe embaixo de um aéreo comum (~46 cm de vão)
  const by = wall ? top + 0.06 : top
  const bodyH = wall ? 0.07 : 0.1
  P.cyl(0.022, 0.024, bodyH, x, by + bodyH / 2, z, m, 20)
  if (wall) {
    const len = z - wallZ
    P.cyl(0.012, 0.012, len, x, by + 0.03, wallZ + len / 2, m, 14).rotation.x = Math.PI / 2
    P.cyl(0.032, 0.032, 0.01, x, by + 0.03, wallZ + 0.005, m, 24).rotation.x = Math.PI / 2
  } else P.cyl(0.03, 0.03, 0.008, x, top + 0.004, z, m, 24)
  // alavanca do lado
  const lever = P.cyl(0.006, 0.006, 0.09, x + 0.05, by + bodyH * 0.6 + 0.02, z, m, 10)
  lever.rotation.z = Math.PI / 2 - 0.45
  // coluna e mola
  const y0 = by + bodyH
  const y1 = y0 + (wall ? 0.26 : 0.29)
  P.cyl(0.009, 0.009, y1 - y0, x, (y0 + y1) / 2, z, m, 12)
  P.mesh(new THREE.TubeGeometry(new Helix(x, z, y0 + 0.01, y1 - 0.04, 0.021, 17), 360, 0.0035, 6, false), m)
  P.cyl(0.024, 0.024, 0.02, x, y0 + 0.01, z, m, 18)
  // curva no alto, descendo para a ducha
  const R = 0.045
  const arc = P.mesh(new THREE.TorusGeometry(R, 0.0075, 8, 20, Math.PI), m, x - R, y1, z)
  arc.rotation.set(0, 0, 0)
  const sx = x - 2 * R
  const sprayTop = y0 + 0.13
  P.cyl(0.006, 0.006, y1 - sprayTop, sx, (y1 + sprayTop) / 2, z, m, 10)
  P.cyl(0.016, 0.014, 0.14, sx, sprayTop - 0.07, z, m, 16)
  P.cyl(0.017, 0.017, 0.006, sx, sprayTop - 0.143, z, mat('#3a3a3a', { rough: 0.5 }), 16)
  // suporte da ducha preso na coluna
  P.cyl(0.006, 0.006, 2 * R, x - R, sprayTop - 0.04, z, m, 8).rotation.z = Math.PI / 2
}

interface CabinetCtx {
  w: number
  h: number
  d: number
  color: string
  color2: string
  options: Record<string, OptionValue>
  body: THREE.Material
  inner: THREE.Material
  top: THREE.Material
  plinth: number
  topT: number
  carcH: number
  fz: number
  fh: number
}

/** Tampo de pedra (cor lisa) ou de madeira (veio ao comprido, na cor escolhida). */
export function counterTop(color2: string, options: Record<string, OptionValue>, w: number, d: number) {
  if (str(options, 'top', 'pedra') === 'madeira') return finishMaterial(`wood:${color2}`, 'madeira', w, d, true)
  return mat(color2, { rough: 0.25, metal: 0.05 })
}

/**
 * Painel de frente (porta ou gaveta) com o centro da espessura em z; com `provencal` (a cor), ganha a
 * moldura em relevo e o filete do chanfro.
 */
function frontPanel(P: Parts, x: number, y0: number, pw: number, ph: number, z: number, body: THREE.Material, provencal: string | null) {
  P.boxB(pw, ph, 0.018, x, y0, z, body)
  if (!provencal) return
  const f = Math.min(0.06, pw * 0.16, ph * 0.2)
  const zf = z + 0.012
  P.boxB(pw, f, 0.006, x, y0, zf, body)
  P.boxB(pw, f, 0.006, x, y0 + ph - f, zf, body)
  P.boxB(f, ph - 2 * f, 0.006, x - pw / 2 + f / 2, y0 + f, zf, body)
  P.boxB(f, ph - 2 * f, 0.006, x + pw / 2 - f / 2, y0 + f, zf, body)
  const bead = mat(shade(provencal, -0.1), { rough: 0.6 })
  P.boxB(pw - 2 * f, 0.004, 0.003, x, y0 + f, zf - 0.001, bead)
  P.boxB(pw - 2 * f, 0.004, 0.003, x, y0 + ph - f - 0.004, zf - 0.001, bead)
}

/**
 * Puxador sobre a face (faceZ): concha (meia-lua), botão (oval), ou barra — vertical numa porta
 * (descendo a partir de y) ou horizontal numa gaveta.
 */
function pullAt(P: Parts, kind: string, x: number, y: number, faceZ: number, m: THREE.Material, vertical: boolean, frontH: number) {
  if (kind === 'nenhum') return
  if (kind === 'concha') {
    const cup = P.mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.014, 24, 1, false, -Math.PI / 2, Math.PI), m, x, y, faceZ + 0.007)
    cup.rotation.x = Math.PI / 2
    const hole = P.mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.004, 20, 1, false, -Math.PI / 2, Math.PI), mat('#3a3020', { rough: 0.7 }), x, y - 0.004, faceZ + 0.0145)
    hole.rotation.x = Math.PI / 2
    P.boxB(0.074, 0.006, 0.016, x, y, faceZ + 0.008, m)
  } else if (kind === 'botao') {
    const base = P.cyl(0.011, 0.011, 0.006, x, y, faceZ + 0.003, m, 18)
    base.rotation.x = Math.PI / 2
    P.cyl(0.005, 0.007, 0.018, x, y, faceZ + 0.014, m, 12).rotation.x = Math.PI / 2
    const knob = P.mesh(new THREE.SphereGeometry(0.016, 20, 14), m, x, y, faceZ + 0.028)
    knob.scale.set(1.25, 0.85, 0.7)
  } else if (vertical) P.boxB(0.012, Math.min(0.2, frontH * 0.3), 0.018, x, y - Math.min(0.2, frontH * 0.3), faceZ + 0.009, m)
  else P.boxB(0.16, 0.012, 0.018, x, y, faceZ + 0.009, m)
}

/**
 * Armário aéreo de cozinha: 1 porta (dobradiça de um lado), 2 portas, porta elevadiça (basculante,
 * abre para cima) ou aberto. Portas lisas ou provençais, puxador botão/concha/barra; dá para mostrar
 * aberto. Prateleira interna no meio.
 */
export function wallCabinet({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const body = mat(color, { rough: 0.55 })
  const doorM = mat(color2, { rough: 0.55 })
  const inner = mat(shade(color, -0.12), { rough: 0.7 })
  const t = 0.018
  const front = str(options, 'front', 'portas')
  const provencal = str(options, 'doorStyle', 'lisa') === 'provencal' ? color2 : null
  const kind = str(options, 'pull', 'botao')
  const pullM = metalOf(str(options, 'pullColor', 'dourado'), 'dourado')
  const open = bool(options, 'open', false)
  const bd = d - 0.02
  // caixa aberta na frente (laterais, topo, base, fundo e prateleira)
  for (const sx of [-w / 2 + t / 2, w / 2 - t / 2]) P.boxB(t, h, bd, sx, 0, -d / 2 + bd / 2, body)
  P.boxB(w - 2 * t, t, bd, 0, 0, -d / 2 + bd / 2, body)
  P.boxB(w - 2 * t, t, bd, 0, h - t, -d / 2 + bd / 2, body)
  P.boxB(w - 2 * t, h - 2 * t, 0.008, 0, t, -d / 2 + 0.004, inner)
  if (h > 0.45) P.boxB(w - 2 * t, t, bd - 0.03, 0, h / 2 - t / 2, -d / 2 + (bd - 0.03) / 2, body)
  const zc = 0.009 // centro da porta, a partir da face da caixa
  const faceRel = zc + 0.009 + (provencal ? 0.006 : 0)
  const fz = -d / 2 + bd
  /** Porta (ou tampa) num grupo próprio, para girar quando aberta. */
  const leaf = (pivot: [number, number, number], build: (L: Parts) => void, rot: [number, number, number]) => {
    const L = new Parts()
    build(L)
    L.group.position.set(...pivot)
    L.group.rotation.set(...rot)
    P.group.add(L.group)
  }
  const ph = h - 0.006
  if (front === 'basculante') {
    // porta elevadiça: articulada no alto, abre para cima
    leaf(
      [0, h, fz],
      (L) => {
        frontPanel(L, 0, -ph, w - 0.006, ph, zc, doorM, provencal)
        pullAt(L, kind, 0, -ph + Math.min(0.05, ph * 0.18), faceRel, pullM, false, ph)
      },
      [open ? -1.3 : 0, 0, 0],
    )
  } else if (front === 'porta' || front === 'portas') {
    const doors: [number, number, boolean][] =
      front === 'porta' ? [[-w / 2, w / 2, str(options, 'handle', 'direita') !== 'esquerda']] : [[-w / 2, 0, true], [0, w / 2, false]]
    for (const [x0, x1, handleRight] of doors) {
      const dw = x1 - x0 - 0.006
      // dobradiça do lado oposto ao puxador
      const hx = handleRight ? x0 + 0.003 : x1 - 0.003
      const s = handleRight ? 1 : -1
      leaf(
        [hx, 0.003, fz],
        (L) => {
          frontPanel(L, (s * dw) / 2, 0, dw, ph, zc, doorM, provencal)
          pullAt(L, kind, s * (dw - (kind === 'concha' ? 0.075 : 0.045)), Math.min(0.06, ph * 0.15) + (kind === 'barra' ? Math.min(0.2, ph * 0.3) : 0), faceRel, pullM, true, ph)
        },
        [0, open ? s * -1.75 : 0, 0],
      )
    }
  }
  return P.group
}

/**
 * Balcão modular com a frente escolhida: 1 porta (maçaneta de um lado), 2 portas, 3 gavetas,
 * 2 portas + coluna de gavetas, porta-pano deslizante (vão aberto) ou vão para forno de embutir.
 * Portas lisas ou provençais (com moldura) e puxador de barra ou concha.
 */
function modularCabinet(P: Parts, c: CabinetCtx) {
  const { w, h, d, color, options, body, inner, top, plinth, topT, carcH, fz } = c
  const front = str(options, 'front', 'auto')
  const t = 0.018
  // frentes (portas e gavetas) com a altura escolhida, alinhadas por cima; o resto é faixa da caixa
  const avail = c.fh
  const frontH = num(options, 'frontH', 0) > 0.1 ? Math.min(avail, num(options, 'frontH', 0)) : avail
  const fy0 = plinth + 0.004 + Math.max(0, avail - frontH - Math.min(0.035, avail - frontH))
  const provencal = str(options, 'doorStyle', 'lisa') === 'provencal'
  const pullKind = str(options, 'pull', 'barra')
  const pullM = metalOf(str(options, 'pullColor', 'inox'), 'inox')
  const faceZ = fz + 0.009 + (provencal ? 0.006 : 0)
  if (plinth) P.boxB(w - 0.02, plinth, d - 0.12, 0, 0, -0.04, mat(shade(color, -0.07)))

  const panel = (x: number, y0: number, pw: number, ph: number) => frontPanel(P, x, y0, pw, ph, fz, body, provencal ? color : null)
  const pull = (x: number, y: number, vertical: boolean) => pullAt(P, pullKind, x, y, faceZ, pullM, vertical, frontH)
  const door = (x0: number, x1: number, handleRight: boolean) => {
    const mw = x1 - x0
    const x = (x0 + x1) / 2
    panel(x, fy0, mw - 0.006, frontH - 0.006)
    pull(x + (handleRight ? 1 : -1) * (mw / 2 - (pullKind === 'concha' ? 0.075 : 0.04)), fy0 + frontH - 0.065, true)
  }
  const drawers = (x0: number, x1: number, n = 3) => {
    const mw = x1 - x0
    const x = (x0 + x1) / 2
    const dh = frontH / n
    for (let k = 0; k < n; k++) {
      const y0 = fy0 + k * dh
      panel(x, y0, mw - 0.006, dh - 0.006)
      pull(x, y0 + dh * (pullKind === 'concha' ? 0.72 : 0.68), false)
    }
  }
  let sinkX: number | null = null
  let sinkW = w
  if (front === 'nicho') {
    // vão para forno de embutir: frente com recorte (largura × altura) centrado e caixa interna
    for (const sx of [-w / 2 + t / 2, w / 2 - t / 2]) P.boxB(t, carcH, d - 0.05, sx, plinth, -0.025, body)
    P.boxB(w - 2 * t, carcH, 0.012, 0, plinth, -d / 2 + 0.006, inner)
    const nw = clamp(num(options, 'nicheW', w - 0.12), 0.3, w - 0.04)
    const nh = clamp(num(options, 'nicheH', carcH - 0.12), 0.15, carcH - 0.04)
    const ny0 = plinth + (carcH - nh) / 2
    const side = (w - nw) / 2
    P.boxB(w, ny0 - plinth, t, 0, plinth, fz, body)
    P.boxB(w, plinth + carcH - ny0 - nh, t, 0, ny0 + nh, fz, body)
    P.boxB(side, nh, t, -w / 2 + side / 2, ny0, fz, body)
    P.boxB(side, nh, t, w / 2 - side / 2, ny0, fz, body)
    P.boxB(nw, 0.012, d - 0.07, 0, ny0 - 0.012, -0.03, inner)
    P.boxB(nw, 0.012, d - 0.07, 0, ny0 + nh, -0.03, inner)
    for (const sx of [-nw / 2 - 0.006, nw / 2 + 0.006]) P.boxB(0.012, nh, d - 0.07, sx, ny0, -0.03, inner)
  } else if (front === 'porta-pano') {
    // vão aberto com o porta-pano deslizante dentro (barras ao comprido e os panos pendurados)
    for (const sx of [-w / 2 + t / 2, w / 2 - t / 2]) P.boxB(t, carcH, d - 0.05, sx, plinth, -0.025, body)
    P.boxB(w - 2 * t, carcH, 0.012, 0, plinth, -d / 2 + 0.006, inner)
    P.boxB(w - 2 * t, t, d - 0.05, 0, plinth, -0.025, inner)
    P.boxB(w, 0.035, t, 0, h - topT - 0.035, fz, body)
    const len = Math.min(0.45, d - 0.1)
    const ext = bool(options, 'open', false) ? len - 0.04 : 0
    const y = h - topT - 0.07
    const zf = fz - 0.01 + ext
    const metal = metalOf('inox', 'inox')
    P.boxB(w - 2 * t - 0.012, 0.03, 0.01, 0, y - 0.01, zf, metal)
    const bars = w >= 0.18 ? 3 : 2
    const cloths = ['#eeece6', '#9aa7b3', '#e8c9b0']
    for (let k = 0; k < bars; k++) {
      const x = -w / 2 + t + 0.012 + ((w - 2 * t - 0.024) * (k + 0.5)) / bars
      P.cyl(0.004, 0.004, len, x, y, zf - len / 2, metal, 8).rotation.x = Math.PI / 2
      if (k !== 1 || bars === 2) P.boxB(0.006, 0.34, len * 0.75, x, y - 0.34, zf - len / 2 + 0.02, mat(cloths[k % 3], { rough: 0.95 }))
    }
  } else {
    P.boxB(w, carcH, d - 0.05, 0, plinth, -0.025, body)
    if (front === 'porta') {
      door(-w / 2, w / 2, str(options, 'handle', 'direita') !== 'esquerda')
      sinkX = 0
    } else if (front === 'portas') {
      door(-w / 2, 0, true)
      door(0, w / 2, false)
      sinkX = 0
    } else if (front === 'gavetas') {
      drawers(-w / 2, w / 2)
    } else if (front === 'portas-gavetas') {
      const dw = clamp(num(options, 'drawerWidth', 0.6), 0.2, Math.max(0.2, w - 0.3))
      const right = str(options, 'drawerSide', 'direita') !== 'esquerda'
      const [d0, d1] = right ? [w / 2 - dw, w / 2] : [-w / 2, -w / 2 + dw]
      const [p0, p1] = right ? [-w / 2, w / 2 - dw] : [-w / 2 + dw, w / 2]
      const mid = (p0 + p1) / 2
      door(p0, mid, true)
      door(mid, p1, false)
      drawers(d0, d1)
      sinkX = mid
      sinkW = p1 - p0
    }
  }
  if (sinkX !== null && bool(options, 'sink', false)) {
    // posição medida (início da cuba a partir da ponta esquerda do móvel) ou centrada nas portas
    const sl = num(options, 'sinkLeft', 0)
    const swOpt = num(options, 'sinkWidth', 0)
    const sw = swOpt > 0.15 ? Math.min(swOpt, w - 0.04) : Math.min(0.52, Math.min(sinkW, 0.6) - 0.06)
    const x = sl > 0 ? clamp(-w / 2 + sl + sw / 2, -w / 2 + sw / 2 + 0.02, w / 2 - sw / 2 - 0.02) : sinkX
    sinkAt(P, x, sw, h, d, options)
  }
  // tampo de canto vivo: módulos lado a lado formam uma peça só, sem vinco entre eles
  P.boxB(w, topT, d, 0, h - topT, 0, top)
  return P.group
}

// ---------------- Banheiro ----------------

export function toilet({ w, h, d, color }: BuildParams) {
  const P = new Parts()
  const white = mat(color, { rough: 0.22 })
  const tankD = Math.min(0.2, d * 0.32)
  const tankH = Math.min(0.42, h * 0.5)
  const seatY = Math.min(0.42, h - tankH * 0.4)
  P.boxB(w * 0.96, tankH, tankD, 0, h - tankH, -d / 2 + tankD / 2, white, 0.03)
  P.cyl(0.018, 0.018, 0.008, 0, h + 0.003, -d / 2 + tankD / 2, M.chrome(), 16)
  const bowlD = d - tankD
  const zc = -d / 2 + tankD + bowlD / 2
  P.ellipse(w * 0.55, seatY - 0.12, bowlD * 0.62, 0, 0, zc - 0.02, white)
  P.ellipse(w * 0.92, 0.13, bowlD, 0, seatY - 0.16, zc, white)
  P.ellipse(w * 0.95, 0.025, bowlD * 1.0, 0, seatY - 0.03, zc, mat('#f7f7f7', { rough: 0.35 }))
  P.ellipse(w * 0.55, 0.004, bowlD * 0.62, 0, seatY - 0.005, zc + 0.01, mat('#bcd3e0', { rough: 0.1 }))
  P.boxB(w * 0.5, seatY - 0.04, 0.12, 0, 0.02, -d / 2 + tankD + 0.04, white, 0.02)
  return P.group
}

/** Gabinete de banheiro com tampo e cuba (embutida ou de sobrepor). */
export function bathVanity({ w, h, d, color, color2, options, floating }: BuildParams) {
  const P = new Parts()
  const body = mat(color, { rough: 0.55 })
  const top = mat(color2, { rough: 0.3 })
  const white = mat('#f8f8f6', { rough: 0.2 })
  const vessel = str(options, 'basin', 'embutida') === 'sobrepor'
  const ct = vessel ? Math.max(0.12, h - 0.14) : h
  const plinth = floating ? 0 : 0.08
  if (plinth) P.boxB(w - 0.04, plinth, d - 0.08, 0, 0, -0.03, mat(shade(color, -0.35)))
  P.boxB(w, ct - 0.025 - plinth, d - 0.03, 0, plinth, -0.015, body)
  const n = w > 0.65 ? 2 : 1
  const dw = (w - 0.006 * (n + 1)) / n
  const dh = ct - 0.025 - plinth - 0.01
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.006 + dw / 2 + i * (dw + 0.006)
    P.boxB(dw, dh, 0.018, x, plinth + 0.005, d / 2 - 0.03 + 0.009, mat(shade(color, 0.04), { rough: 0.5 }))
    const side = n === 2 ? (i === 0 ? 1 : -1) : 1
    P.boxB(0.012, Math.min(0.14, dh * 0.3), 0.016, x + side * (dw / 2 - 0.035), plinth + dh - 0.05 - Math.min(0.14, dh * 0.3), d / 2 - 0.012 + 0.016, M.metal())
  }
  P.boxB(w + 0.01, 0.025, d, 0, ct - 0.025, 0, top, 0.004)
  const bw = Math.min(0.5, w * 0.55)
  const bd = Math.min(0.36, d * 0.68)
  if (vessel) {
    P.ellipse(bw * 0.85, h - ct, bd * 0.9, 0, ct, 0.02, white, 40)
    P.ellipse(bw * 0.7, 0.004, bd * 0.72, 0, h - 0.003, 0.02, mat('#d9e2e8', { rough: 0.15 }), 40)
  } else {
    P.ellipse(bw, 0.004, bd, 0, ct - 0.002, 0.02, white, 40)
    P.ellipse(bw * 0.84, 0.004, bd * 0.8, 0, ct, 0.02, mat('#d6dde2', { rough: 0.2 }), 40)
  }
  P.cyl(0.013, 0.015, 0.2, 0, ct + 0.1, -d / 2 + 0.06, M.chrome(), 12)
  P.boxB(0.018, 0.018, 0.13, 0, ct + 0.17, -d / 2 + 0.12, M.chrome(), 0.008)
  return P.group
}

/** Box de banheiro (vidro temperado): de canto, frontal ou walk-in; porta de correr, de abrir ou fixo. */
/**
 * Posições (locais, em metros) do chuveiro e do ralo dentro do box, já limitadas ao piso dele, e a
 * parede de onde sai o braço do chuveiro (a mais próxima — vidro não segura chuveiro).
 */
export function showerSpots(w: number, d: number, options: Record<string, OptionValue>) {
  const layout = str(options, 'layout', 'canto')
  const hx = clamp(num(options, 'headX', -w * 0.2), -w / 2 + 0.08, w / 2 - 0.08)
  const hz = clamp(num(options, 'headZ', -d / 2 + 0.3), -d / 2 + 0.06, d / 2 - 0.12)
  const hy = clamp(num(options, 'headY', 2.05), 1.6, 2.6)
  const drainKind = str(options, 'drain', 'redondo')
  const drainLen = drainKind === 'linear' ? Math.min(0.7, w - 0.16) : 0.1
  const dx = clamp(num(options, 'drainX', 0), -w / 2 + 0.03 + drainLen / 2, w / 2 - 0.03 - drainLen / 2)
  const dz = clamp(num(options, 'drainZ', 0), -d / 2 + 0.07, d / 2 - 0.07)
  const dist = { fundo: hz + d / 2, esquerda: hx + w / 2, direita: w / 2 - hx }
  const walls: (keyof typeof dist)[] = layout === 'canto' ? ['fundo', 'esquerda'] : ['fundo', 'esquerda', 'direita']
  const wall = walls.reduce((p, q) => (dist[q] < dist[p] ? q : p))
  return { head: [hx, hy, hz] as [number, number, number], drain: [dx, dz] as [number, number], drainKind, drainLen, wall, armLen: dist[wall] }
}

export function shower({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const glass = mat(color, { rough: 0.05, metal: 0.1, opacity: 0.25 })
  const alu = mat(color2, { rough: 0.3, metal: 0.8 })
  const layout = str(options, 'layout', 'canto')
  const door = layout === 'walkin' ? 'fixo' : str(options, 'door', 'correr')
  const open = bool(options, 'open', false)
  const sp = showerSpots(w, d, options)
  P.boxB(w, 0.02, d, 0, 0, 0, mat('#eceeee', { rough: 0.4 }))
  P.boxB(w - 0.04, 0.004, d - 0.04, 0, 0.02, 0, mat('#d7dadc', { rough: 0.4 }))
  // ralo
  const grate = mat('#9aa0a6', { rough: 0.4, metal: 0.7 })
  const slot = mat('#4b5056', { rough: 0.6 })
  const [dx, dz] = sp.drain
  if (sp.drainKind === 'linear') {
    P.boxB(sp.drainLen, 0.003, 0.07, dx, 0.022, dz, grate)
    for (let i = 0; i < Math.floor(sp.drainLen / 0.03); i++) P.boxB(0.012, 0.001, 0.045, dx - sp.drainLen / 2 + 0.02 + i * 0.03, 0.025, dz, slot)
  } else if (sp.drainKind === 'quadrado') {
    P.boxB(0.1, 0.003, 0.1, dx, 0.022, dz, grate)
    for (let i = -2; i <= 2; i++) P.boxB(0.07, 0.001, 0.007, dx, 0.025, dz + i * 0.016, slot)
  } else {
    P.cyl(0.05, 0.05, 0.003, dx, 0.0235, dz, grate, 28)
    P.cyl(0.032, 0.032, 0.001, dx, 0.0255, dz, slot, 24)
  }
  const y0 = 0.02
  const gh = h - 0.04
  const gt = 0.008
  const fz = d / 2 - 0.02
  if (layout === 'walkin') {
    // um vidro fixo cobrindo parte da frente, com barra de apoio até a parede
    const pw = Math.max(0.3, w * 0.6)
    P.boxB(pw, gh, gt, w / 2 - pw / 2, y0, fz, glass)
    P.boxB(0.02, gh, 0.024, w / 2 - 0.01, y0, fz, alu)
    const bar = P.cyl(0.008, 0.008, d - 0.02, w / 2 - pw + 0.04, h - 0.04, -0.01, alu, 10)
    bar.rotation.x = Math.PI / 2
  } else if (door === 'correr') {
    // vidro fixo num lado (trilho de trás) e a porta no outro (trilho da frente), correndo na direção do fixo
    const s = str(options, 'fixed', 'direita') === 'esquerda' ? -1 : 1
    const atEdge = str(options, 'handle', 'ponta') !== 'meio'
    const pw = w * 0.53
    P.boxB(pw, gh - 0.04, gt, s * (w / 2 - pw / 2), y0 + 0.02, fz - 0.011, glass)
    // aberta: com o puxador na ponta, corre até ele chegar no vidro fixo; no meio, até o fim do trilho
    const fixedInner = s * (w / 2 - pw)
    const mx = !open ? -s * (w / 2 - pw / 2) : atEdge ? fixedInner + s * (pw / 2 - 0.09) : s * (w / 2 - 0.02 - pw / 2)
    P.boxB(pw, gh - 0.04, gt, mx, y0 + 0.02, fz + 0.002, glass)
    P.boxB(w, 0.03, 0.034, 0, h - 0.03, fz - 0.005, alu)
    P.boxB(w, 0.016, 0.034, 0, y0, fz - 0.005, alu)
    for (const sx of [-1, 1]) P.boxB(0.02, gh, 0.034, sx * (w / 2 - 0.01), y0, fz - 0.005, alu)
    // puxador dos dois lados do vidro móvel: na ponta que fecha (junto ao perfil) ou no encontro dos vidros
    const hx = atEdge ? mx - s * (pw / 2 - 0.07) : mx + s * (pw / 2 - 0.07)
    const hy = Math.min(1.05, gh * 0.55)
    for (const z of [fz + 0.026, fz - 0.022]) P.cyl(0.008, 0.008, Math.min(0.32, gh * 0.2), hx, y0 + hy, z, alu, 10)
    for (const k of [-1, 1]) P.boxB(0.012, 0.012, 0.05, hx, y0 + hy + k * Math.min(0.13, gh * 0.08), fz + 0.002, alu)
  } else if (door === 'abrir') {
    // porta pivotante numa ponta (dobradiças no perfil da parede), vidro fixo no resto
    const s = str(options, 'hinge', 'esquerda') === 'direita' ? 1 : -1
    const dw = Math.min(0.7, w * 0.6)
    P.boxB(w - dw - 0.006, gh, gt, -s * (w / 2 - (w - dw) / 2), y0, fz, glass)
    P.boxB(0.02, gh, 0.024, -s * (w / 2 - 0.01), y0, fz, alu)
    const leaf = new Parts()
    leaf.boxB(dw - 0.006, gh, gt, -s * (dw / 2), y0, 0, glass)
    for (const k of [0.15, 0.85]) leaf.boxB(0.05, 0.07, 0.024, -s * 0.025, y0 + gh * k - 0.035, 0, alu, 0.004)
    const knob = leaf.cyl(0.012, 0.012, 0.06, -s * (dw - 0.07), y0 + Math.min(1.0, gh * 0.52), 0, alu, 16)
    knob.rotation.x = Math.PI / 2
    leaf.group.position.set(s * w / 2, 0, fz)
    // aberta: gira para fora do box
    leaf.group.rotation.y = open ? s * (Math.PI / 2) * 0.92 : 0
    P.group.add(leaf.group)
  } else {
    P.boxB(w, gh, gt, 0, y0, fz, glass)
    for (const sx of [-1, 1]) P.boxB(0.02, gh, 0.024, sx * (w / 2 - 0.01), y0, fz, alu)
  }
  if (layout === 'canto') {
    // vidro lateral fixo (lado +X)
    P.boxB(gt, gh, d - 0.04, w / 2 - 0.02, y0, -0.02, glass)
    P.boxB(0.024, gh, 0.02, w / 2 - 0.02, y0, -d / 2 + 0.01, alu)
    if (door === 'correr') P.boxB(0.034, 0.03, d - 0.04, w / 2 - 0.02, h - 0.03, -0.02, alu)
  }
  // chuveiro e registro (a 1,10 m) na parede mais próxima do chuveiro; `mount` = essa parede, com
  // +z saindo dela e x ao longo dela
  const chrome = M.chrome()
  const [hx, hy, hz] = sp.head
  const mount = new THREE.Group()
  if (sp.wall === 'fundo') mount.position.set(hx, 0, -d / 2)
  else {
    const sx = sp.wall === 'esquerda' ? -1 : 1
    mount.position.set((sx * w) / 2, 0, hz)
    mount.rotation.y = (-sx * Math.PI) / 2
  }
  P.group.add(mount)
  mount.add(showerValve(1.1))
  if (str(options, 'showerHead', 'redondo') === 'quadratta') {
    // ducha elétrica: encosta na parede (ou num braço, se o ponto do chuveiro estiver bem mais longe)
    const arm = sp.armLen - QUADRATTA_REACH
    mount.add(quadrattaShower(hy, arm < 0.05 ? 0 : arm, str(options, 'showerColor', 'branca') === 'preta', bool(options, 'hose', true)))
    return P.group
  }
  // ducha redonda cromada num braço saindo da parede
  const armY = hy + 0.05
  const len = Math.max(0.03, sp.armLen)
  if (sp.wall === 'fundo') {
    P.cyl(0.011, 0.011, len, hx, armY, -d / 2 + len / 2, chrome, 12).rotation.x = Math.PI / 2
    P.cyl(0.03, 0.03, 0.01, hx, armY, -d / 2 + 0.005, chrome, 20).rotation.x = Math.PI / 2
  } else {
    const sx = sp.wall === 'esquerda' ? -1 : 1
    P.cyl(0.011, 0.011, len, sx * (w / 2 - len / 2), armY, hz, chrome, 12).rotation.z = Math.PI / 2
    P.cyl(0.03, 0.03, 0.01, sx * (w / 2 - 0.005), armY, hz, chrome, 20).rotation.z = Math.PI / 2
  }
  P.cyl(0.009, 0.009, armY - hy, hx, (armY + hy) / 2, hz, chrome, 10)
  P.cyl(0.1, 0.1, 0.014, hx, hy, hz, chrome, 32)
  P.cyl(0.085, 0.085, 0.002, hx, hy - 0.008, hz, mat('#8b9096', { rough: 0.5, metal: 0.5 }), 32)
  return P.group
}

export function washer({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const body = mat(color, { rough: 0.3 })
  P.boxB(w, h, d, 0, 0, 0, body, 0.02)
  P.boxB(w - 0.02, 0.1, 0.006, 0, h - 0.12, d / 2 + 0.002, mat('#e4e6e8', { rough: 0.3 }))
  P.boxB(w * 0.3, 0.05, 0.004, -w * 0.15, h - 0.095, d / 2 + 0.005, M.screen())
  const k = P.cyl(0.03, 0.03, 0.02, w * 0.3, h - 0.07, d / 2 + 0.01, M.chrome(), 20)
  k.rotation.x = Math.PI / 2
  if (str(options, 'load', 'frontal') === 'frontal') {
    const r = Math.min(w, h) * 0.3
    const ring = P.mesh(new THREE.TorusGeometry(r, 0.025, 10, 40), mat('#cfd3d7', { rough: 0.3, metal: 0.6 }), 0, h * 0.42, d / 2 + 0.01)
    ring.rotation.set(0, 0, 0)
    const glassDoor = P.cyl(r - 0.01, r - 0.01, 0.01, 0, h * 0.42, d / 2 + 0.008, mat('#2b3a44', { rough: 0.1, metal: 0.3, opacity: 0.8 }), 40)
    glassDoor.rotation.x = Math.PI / 2
  } else {
    P.boxB(w - 0.06, 0.008, d - 0.2, 0, h, 0.04, mat('#e9ebec', { rough: 0.25 }))
  }
  return P.group
}

// ---------------- Elétrica ----------------

/** Disposição dos módulos numa placa 4×2 (vertical, até 3) ou 4×4 (duas colunas, até 6). */
function moduleSlots(w: number, h: number, count: number): [number, number, number, number][] {
  const cols = w >= 0.1 && count > 1 ? 2 : 1
  const rows = Math.max(1, Math.ceil(count / cols))
  const mw = cols === 2 ? Math.min(0.044, (w - 0.03) / 2) : Math.min(0.044, w - 0.03)
  const mh = Math.min(0.022, (h - 0.04) / 3)
  const slots: [number, number, number, number][] = []
  for (let i = 0; i < count; i++) {
    const c = cols === 2 ? i % 2 : 0
    const r = cols === 2 ? Math.floor(i / 2) : i
    const x = cols === 2 ? (c === 0 ? -1 : 1) * (mw / 2 + 0.003) : 0
    const y = h / 2 + ((rows - 1) / 2 - r) * (mh + 0.004)
    slots.push([x, y, mw, mh])
  }
  return slots
}

/** Base da placa: embutida (só o espelho) ou de sobrepor (caixa externa). Retorna o z da face frontal. */
function plateBase(P: Parts, w: number, h: number, d: number, plate: THREE.Material, mount: string) {
  if (mount === 'sobrepor') {
    P.boxB(w, h, d - 0.006, 0, 0, -0.003, plate, Math.min(0.012, w * 0.15))
    P.boxB(w - 0.006, h - 0.006, 0.006, 0, 0.003, d / 2 - 0.003, plate, 0.004)
  } else {
    P.boxB(w, h, Math.min(d, 0.009), 0, 0, d / 2 - Math.min(d, 0.009) / 2, plate, 0.003)
  }
  return d / 2
}

export function wallSwitch({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const plate = mat(color, { rough: 0.35, metal: color === '#c8a24a' || color === '#b8bcc0' ? 0.7 : 0 })
  const keyM = mat(color2, { rough: 0.3 })
  const type = str(options, 'type', 'simples')
  const zf = plateBase(P, w, h, d, plate, str(options, 'mount', 'embutir'))
  const keysByType: Record<string, number> = { simples: 1, paralelo: 1, duplo: 2, triplo: 3, quadruplo: 4, sextuplo: 6, campainha: 1, combo: 1, dimmer: 0 }
  const keys = keysByType[type] ?? 1
  const total = type === 'combo' ? 2 : Math.max(1, keys)
  const slots = moduleSlots(w, h, total)
  slots.forEach(([x, y, mw, mh], i) => {
    if (type === 'combo' && i === 1) {
      outletModule(P, x, y, mw, mh, zf, keyM, mat(shade(color2, -0.18)), false)
      return
    }
    const key = P.box(mw, mh, 0.006, x, y, zf + 0.003, keyM, 0.002)
    key.rotation.x = 0.06
    if (type === 'paralelo') P.boxB(mw * 0.5, 0.0015, 0.001, x, y - mh * 0.25, zf + 0.0065, mat('#8a8f95'))
    if (type === 'campainha') P.cyl(0.004, 0.004, 0.002, x, y, zf + 0.007, mat('#d4a84a', { emissive: '#d4a84a', emissiveIntensity: 0.3 }), 12).rotation.x = Math.PI / 2
  })
  if (type === 'dimmer') {
    const knob = P.cyl(0.013, 0.014, 0.014, 0, h / 2, zf + 0.007, keyM, 24)
    knob.rotation.x = Math.PI / 2
    P.boxB(0.002, 0.009, 0.001, 0, h / 2 + 0.002, zf + 0.0145, mat('#7d8288'))
  }
  return P.group
}

/** Módulo de tomada padrão brasileiro (NBR 14136): rebaixo sextavado com 3 furos; USB opcional. */
function outletModule(P: Parts, x: number, y: number, mw: number, mh: number, zf: number, face: THREE.Material, socket: THREE.Material, usb: boolean) {
  P.box(mw, mh, 0.004, x, y, zf + 0.002, face, 0.0015)
  if (usb) {
    for (const sx of [-1, 1]) P.box(0.012, 0.005, 0.002, x + sx * 0.009, y, zf + 0.0045, mat('#202225'))
    return
  }
  const r = Math.min(mh * 0.48, 0.0105)
  const hex = P.cyl(r, r, 0.003, x, y, zf + 0.004, socket, 6)
  hex.rotation.x = Math.PI / 2
  const hole = mat('#141517')
  for (const [hx, hy] of [
    [-r * 0.5, r * 0.08],
    [r * 0.5, r * 0.08],
    [0, -r * 0.35],
  ]) {
    const hcyl = P.cyl(0.0019, 0.0019, 0.002, x + hx, y + hy, zf + 0.0058, hole, 8)
    hcyl.rotation.x = Math.PI / 2
  }
}

export function outlet({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const type = str(options, 'type', 'padrao')
  const plate = mat(color, { rough: 0.35, metal: color === '#c8a24a' || color === '#b8bcc0' ? 0.7 : 0 })
  if (type === 'piso') {
    // Caixa de piso: tampa basculante metálica rente ao chão
    const alu = mat('#b8bcc0', { rough: 0.3, metal: 0.85 })
    P.boxB(w, h, d, 0, 0, 0, alu, 0.004)
    P.boxB(w - 0.014, 0.002, d - 0.014, 0, h, 0, mat('#9ea3a8', { rough: 0.35, metal: 0.8 }))
    P.boxB(w * 0.4, 0.002, 0.006, 0, h + 0.002, d / 2 - 0.012, mat('#6b7076', { metal: 0.6 }))
    return P.group
  }
  const count = Math.max(1, Math.min(6, Math.round(num(options, 'count', 1))))
  const mount = type === 'externa' ? 'sobrepor' : str(options, 'mount', 'embutir')
  const zf = plateBase(P, w, h, d, plate, mount)
  const socket = mat(type === '20A' ? '#c0392b' : shade(color2, -0.12), { rough: 0.35 })
  const face = mat(color2, { rough: 0.32 })
  moduleSlots(w, h, count).forEach(([x, y, mw, mh], i) => outletModule(P, x, y, mw, mh, zf, face, socket, type === 'usb' && i === count - 1))
  if (type === 'externa') {
    // Tampa articulada translúcida (proteção contra água)
    const lid = P.box(w - 0.006, h - 0.01, 0.004, 0, h / 2, zf + 0.016, mat('#dfe5ea', { rough: 0.2, opacity: 0.55 }), 0.004)
    lid.rotation.x = -0.25
  }
  return P.group
}

export function genericBox({ w, h, d, color }: BuildParams) {
  const P = new Parts()
  P.boxB(w, h, d, 0, 0, 0, mat(color, { rough: 0.7 }))
  P.edges(w, h, d)
  return P.group
}
