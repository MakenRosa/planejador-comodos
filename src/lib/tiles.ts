/**
 * Azulejos e revestimentos cerâmicos: cada modelo desenha um ladrilho contínuo (várias peças com o
 * rejunte). Com `mask`, desenha só peça (branco) × rejunte (preto) — vira relevo e brilho no 3D.
 */
import * as THREE from 'three'
import { rng } from '../furniture/parts'
import type { PatternDef } from './patterns'

type G = CanvasRenderingContext2D

/** Mesma cor, com a luminosidade variando um pouco (peças nunca são idênticas). */
function jitter(hex: string, R: () => number, amt: number, hue = 0) {
  if (amt <= 0) return hex
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl, THREE.SRGBColorSpace)
  c.setHSL((hsl.h + (R() - 0.5) * hue + 1) % 1, hsl.s, Math.min(0.97, Math.max(0.02, hsl.l * (1 + (R() - 0.5) * 2 * amt))), THREE.SRGBColorSpace)
  return '#' + c.getHexString(THREE.SRGBColorSpace)
}

const darker = (hex: string, k: number) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#000000'), k).getHexString()
const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()

/** Chama fn nas posições que fazem o retângulo emendar nas bordas do ladrilho. */
function wrapAt(S: number, x: number, y: number, w: number, h: number, fn: (ox: number, oy: number) => void) {
  for (const ox of [-S, 0, S])
    for (const oy of [-S, 0, S]) {
      if (x + ox + w <= 0 || x + ox >= S || y + oy + h <= 0 || y + oy >= S) continue
      fn(ox, oy)
    }
}

interface PieceOpts {
  /** Brilho no alto e sombra embaixo (peça biselada, tipo metrô). */
  bevel?: boolean
  /** Esmalte artesanal: centro mais claro, bordas mais escuras. */
  glaze?: boolean
  glazeOff?: [number, number]
}

/** Uma peça retangular já descontado o rejunte (j = largura do rejunte em px). */
function piece(g: G, S: number, x: number, y: number, w: number, h: number, j: number, color: string, mask: boolean, o: PieceOpts = {}) {
  const px = x + j / 2
  const py = y + j / 2
  const pw = w - j
  const ph = h - j
  wrapAt(S, px, py, pw, ph, (ox, oy) => {
    g.fillStyle = color
    g.fillRect(px + ox, py + oy, pw, ph)
    if (mask) return
    if (o.bevel) {
      const b = Math.max(2, Math.min(pw, ph) * 0.14)
      let gr = g.createLinearGradient(0, py + oy, 0, py + oy + b)
      gr.addColorStop(0, 'rgba(255,255,255,0.32)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gr
      g.fillRect(px + ox, py + oy, pw, b)
      gr = g.createLinearGradient(0, py + oy + ph - b, 0, py + oy + ph)
      gr.addColorStop(0, 'rgba(0,0,0,0)')
      gr.addColorStop(1, 'rgba(0,0,0,0.16)')
      g.fillStyle = gr
      g.fillRect(px + ox, py + oy + ph - b, pw, b)
    }
    if (o.glaze) {
      const cx = px + ox + pw / 2
      const cy = py + oy + ph / 2
      // centro levemente deslocado e fraco: cada peça brilha de um jeito
      const gr = g.createRadialGradient(cx + (o.glazeOff?.[0] ?? 0) * pw, cy + (o.glazeOff?.[1] ?? 0) * ph, 0, cx, cy, Math.max(pw, ph) * 0.75)
      gr.addColorStop(0, 'rgba(255,255,255,0.07)')
      gr.addColorStop(0.75, 'rgba(0,0,0,0)')
      gr.addColorStop(1, 'rgba(0,0,0,0.11)')
      g.fillStyle = gr
      g.fillRect(px + ox, py + oy, pw, ph)
    }
  })
}

/** Largura do rejunte em px para peças de `p` px (≈ 2–3 mm em peças de 10–20 cm). */
const joint = (p: number, k = 0.028) => Math.max(1.6, p * k)

function grid(g: G, S: number, cols: number, rows: number, c1: string, c2: string, mask: boolean, opt: { shift?: number; vertical?: boolean; vary?: number; seed: number; jk?: number } & PieceOpts) {
  g.fillStyle = c2
  g.fillRect(0, 0, S, S)
  const R = rng(opt.seed)
  const w = S / cols
  const h = S / rows
  const j = joint(Math.min(w, h), opt.jk)
  for (let r = 0; r < (opt.vertical ? cols : rows); r++) {
    const off = (r % 2) * (opt.shift ?? 0)
    for (let k = -1; k <= (opt.vertical ? rows : cols); k++) {
      const col = mask ? c1 : jitter(c1, R, opt.vary ?? 0.02)
      const o: PieceOpts = opt.glaze ? { ...opt, glazeOff: [(R() - 0.5) * 0.5, (R() - 0.5) * 0.5] } : opt
      if (opt.vertical) piece(g, S, r * w, (k + off) * h, w, h, j, col, mask, o)
      else piece(g, S, (k + off) * w, r * h, w, h, j, col, mask, o)
    }
  }
}

/** Espinha de peixe 90°: peças 2:1 (largura u, comprimento 2u); ladrilho de 4u × 4u. */
function herringbone(g: G, S: number, c1: string, c2: string, mask: boolean) {
  g.fillStyle = c2
  g.fillRect(0, 0, S, S)
  const R = rng(19)
  const u = S / 4
  const j = joint(u)
  for (let m = -4; m <= 6; m++)
    for (let n = -3; n <= 3; n++) {
      const ox = (m + 2 * n) * u
      const oy = (m - 2 * n) * u
      if (ox < -3 * u || ox > S + u || oy < -3 * u || oy > S + u) continue
      piece(g, S, ox, oy, 2 * u, u, j, mask ? c1 : jitter(c1, R, 0.04), mask)
      piece(g, S, ox, oy + u, u, 2 * u, j, mask ? c1 : jitter(c1, R, 0.04), mask)
    }
}

/** Hexágonos (ponta para cima): 7 por linha, 8 linhas — quase exato num ladrilho quadrado. */
function hexagons(g: G, S: number, c1: string, c2: string, mask: boolean) {
  g.fillStyle = c2
  g.fillRect(0, 0, S, S)
  const R = rng(23)
  const cols = 7
  const rows = 8
  const w = S / cols
  const rh = S / rows
  const rx = w / Math.sqrt(3)
  const ry = rh / 1.5
  const j = joint(w, 0.05)
  const shrink = 1 - j / w
  for (let k = -1; k <= rows; k++)
    for (let i = -1; i <= cols; i++) {
      const cx = i * w + (k % 2 ? w / 2 : 0) + w / 2
      const cy = k * rh + rh / 2
      g.fillStyle = mask ? c1 : jitter(c1, R, 0.025)
      g.beginPath()
      for (let a = 0; a < 6; a++) {
        const t = Math.PI / 2 + (a * Math.PI) / 3
        const x = cx + Math.cos(t) * rx * shrink
        const y = cy + Math.sin(t) * ry * shrink
        if (a === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.closePath()
      g.fill()
    }
}

/** Escama de peixe: arcos em fileiras desencontradas, cada fileira por cima da anterior. */
function scales(g: G, S: number, c1: string, c2: string, mask: boolean) {
  g.fillStyle = c2
  g.fillRect(0, 0, S, S)
  const R = rng(29)
  const w = S / 4
  const step = w / 2
  const j = joint(w, 0.035)
  for (let k = -2; k <= 9; k++)
    for (let i = -1; i <= 4; i++) {
      const cx = i * w + (k % 2 ? w / 2 : 0) + w / 2
      const cy = k * step
      g.fillStyle = c2
      g.beginPath()
      g.arc(cx, cy, w / 2, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = mask ? c1 : jitter(c1, R, 0.03)
      g.beginPath()
      g.arc(cx, cy, w / 2 - j, 0, Math.PI * 2)
      g.fill()
    }
}

/** Azulejo português: rosácea no centro, quartos de círculo nos cantos (formam círculos entre 4 peças). */
function portuguese(g: G, S: number, c1: string, c2: string, mask: boolean) {
  const grout = mask ? c2 : darker(c1, 0.14)
  g.fillStyle = grout
  g.fillRect(0, 0, S, S)
  const p = S / 2
  const j = joint(p, 0.02)
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      const x0 = tx * p
      const y0 = ty * p
      g.save()
      g.beginPath()
      g.rect(x0 + j / 2, y0 + j / 2, p - j, p - j)
      g.clip()
      g.fillStyle = c1
      g.fillRect(x0, y0, p, p)
      if (!mask) {
        const cx = x0 + p / 2
        const cy = y0 + p / 2
        g.fillStyle = c2
        g.strokeStyle = c2
        // quartos de círculo nos cantos
        for (const [ax, ay] of [
          [x0, y0],
          [x0 + p, y0],
          [x0, y0 + p],
          [x0 + p, y0 + p],
        ]) {
          g.beginPath()
          g.arc(ax, ay, p * 0.24, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = c1
          g.beginPath()
          g.arc(ax, ay, p * 0.15, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = c2
          g.beginPath()
          g.arc(ax, ay, p * 0.07, 0, Math.PI * 2)
          g.fill()
        }
        // moldura fina
        g.lineWidth = p * 0.012
        g.strokeRect(x0 + p * 0.06, y0 + p * 0.06, p * 0.88, p * 0.88)
        // rosácea de 8 pétalas
        for (let a = 0; a < 8; a++) {
          g.save()
          g.translate(cx, cy)
          g.rotate((a * Math.PI) / 4)
          g.beginPath()
          g.moveTo(0, 0)
          g.quadraticCurveTo(p * 0.09, -p * 0.14, 0, -p * 0.3)
          g.quadraticCurveTo(-p * 0.09, -p * 0.14, 0, 0)
          g.fill()
          // folhinhas entre as pétalas
          g.rotate(Math.PI / 8)
          g.beginPath()
          g.moveTo(0, -p * 0.2)
          g.quadraticCurveTo(p * 0.035, -p * 0.27, 0, -p * 0.36)
          g.quadraticCurveTo(-p * 0.035, -p * 0.27, 0, -p * 0.2)
          g.fill()
          g.restore()
        }
        g.fillStyle = c1
        g.beginPath()
        g.arc(cx, cy, p * 0.07, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = c2
        g.beginPath()
        g.arc(cx, cy, p * 0.035, 0, Math.PI * 2)
        g.fill()
      }
      g.restore()
    }
}

/** Ladrilho hidráulico: losango no centro e quartos de círculo nos cantos, em três cores. */
function hydraulic(g: G, S: number, c1: string, c2: string, mask: boolean) {
  const grout = mask ? c2 : darker(c1, 0.1)
  g.fillStyle = grout
  g.fillRect(0, 0, S, S)
  const p = S / 2
  const j = joint(p, 0.012)
  const c3 = mix(c1, c2, 0.45)
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      const x0 = tx * p
      const y0 = ty * p
      g.save()
      g.beginPath()
      g.rect(x0 + j / 2, y0 + j / 2, p - j, p - j)
      g.clip()
      g.fillStyle = c1
      g.fillRect(x0, y0, p, p)
      if (!mask) {
        const cx = x0 + p / 2
        const cy = y0 + p / 2
        g.fillStyle = c3
        for (const [ax, ay] of [
          [x0, y0],
          [x0 + p, y0],
          [x0, y0 + p],
          [x0 + p, y0 + p],
        ]) {
          g.beginPath()
          g.arc(ax, ay, p * 0.34, 0, Math.PI * 2)
          g.fill()
        }
        g.fillStyle = c1
        for (const [ax, ay] of [
          [x0, y0],
          [x0 + p, y0],
          [x0, y0 + p],
          [x0 + p, y0 + p],
        ]) {
          g.beginPath()
          g.arc(ax, ay, p * 0.24, 0, Math.PI * 2)
          g.fill()
        }
        g.fillStyle = c2
        g.beginPath()
        g.moveTo(cx, cy - p * 0.3)
        g.lineTo(cx + p * 0.3, cy)
        g.lineTo(cx, cy + p * 0.3)
        g.lineTo(cx - p * 0.3, cy)
        g.closePath()
        g.fill()
        g.fillStyle = c1
        g.beginPath()
        g.moveTo(cx, cy - p * 0.15)
        g.lineTo(cx + p * 0.15, cy)
        g.lineTo(cx, cy + p * 0.15)
        g.lineTo(cx - p * 0.15, cy)
        g.closePath()
        g.fill()
        g.fillStyle = c3
        g.beginPath()
        g.arc(cx, cy, p * 0.06, 0, Math.PI * 2)
        g.fill()
      }
      g.restore()
    }
}

/** Porcelanato grande (2 peças de 1 × 2 no ladrilho), rejunte fino; mármore com veios. */
function slabs(g: G, S: number, c1: string, c2: string, mask: boolean, marble: boolean) {
  const grout = mask ? c2 : marble ? darker(c1, 0.08) : c2
  g.fillStyle = grout
  g.fillRect(0, 0, S, S)
  const R = rng(marble ? 37 : 31)
  const j = Math.max(1.4, S * 0.003)
  for (let i = 0; i < 2; i++) {
    const x0 = i * (S / 2)
    g.fillStyle = c1
    g.fillRect(x0 + j / 2, j / 2, S / 2 - j, S - j)
    if (mask) continue
    g.save()
    g.beginPath()
    g.rect(x0 + j / 2, j / 2, S / 2 - j, S - j)
    g.clip()
    if (marble) {
      const W = S / 2
      // nuvens cinzentas bem suaves
      for (let k = 0; k < 6; k++) {
        const cx = x0 + R() * W
        const cy = R() * S
        const rr = S * (0.12 + R() * 0.2)
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr)
        gr.addColorStop(0, 'rgba(120,120,120,0.07)')
        gr.addColorStop(1, 'rgba(120,120,120,0)')
        g.fillStyle = gr
        g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
      }
      // veios: curvas longas e diagonais; cada uma em 3 passadas (halo largo e fraco + linha fina)
      const vein = (sx: number, sy: number, ex: number, ey: number, main: boolean) => {
        const pts: [number, number][] = []
        const n = 6
        for (let k = 0; k <= n; k++) {
          const t = k / n
          pts.push([sx + (ex - sx) * t + (R() - 0.5) * W * 0.18, sy + (ey - sy) * t + (R() - 0.5) * S * 0.04])
        }
        for (const [lw, a] of main ? [[7, 0.06], [3, 0.14], [1.1, 0.5]] : [[2.5, 0.06], [0.8, 0.35]]) {
          g.strokeStyle = c2
          g.globalAlpha = a
          g.lineWidth = lw
          g.beginPath()
          g.moveTo(pts[0][0], pts[0][1])
          for (let k = 1; k < pts.length - 1; k++) g.quadraticCurveTo(pts[k][0], pts[k][1], (pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2)
          g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
          g.stroke()
        }
        g.globalAlpha = 1
      }
      for (let k = 0; k < 2; k++) vein(x0 + R() * W * 0.3, -S * 0.05 + R() * S * 0.2, x0 + W * (0.7 + R() * 0.3), S * (0.85 + R() * 0.2), true)
      for (let k = 0; k < 4; k++) {
        const sy = R() * S
        vein(x0 + R() * W * 0.2, sy, x0 + W * (0.5 + R() * 0.5), sy + S * (0.2 + R() * 0.3), false)
      }
    } else {
      // pontinhos de cimento/pedra
      for (let k = 0; k < 900; k++) {
        g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'
        const r = 0.5 + R() * 1.6
        g.fillRect(x0 + R() * (S / 2), R() * S, r, r)
      }
    }
    g.restore()
  }
}

/**
 * Cerâmica de efeito cimentício (peças grandes, junta a prumo): cada peça com manchas suaves de tom,
 * como nuvens, e pontinhos finos; rejunte fino.
 */
function cloudy(g: G, S: number, cols: number, rows: number, c1: string, c2: string, mask: boolean, seed: number) {
  const jk = 0.0086
  grid(g, S, cols, rows, c1, c2, mask, { seed, vary: 0.025, jk })
  if (mask) return
  const R = rng(seed + 1)
  const w = S / cols
  const h = S / rows
  const j = joint(Math.min(w, h), jk)
  const dark = new THREE.Color(darker(c1, 0.22))
  const lite = new THREE.Color(mix(c1, '#ffffff', 0.55))
  const rgba = (c: THREE.Color, a: number) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = c * w + j / 2
      const y = r * h + j / 2
      const pw = w - j
      const ph = h - j
      g.save()
      g.beginPath()
      g.rect(x, y, pw, ph)
      g.clip()
      for (let k = 0; k < 16; k++) {
        const cx = x + R() * pw
        const cy = y + R() * ph
        const rr = Math.min(pw, ph) * (0.18 + R() * 0.5)
        const col = R() < 0.55 ? dark : lite
        const a = 0.05 + R() * 0.07
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr)
        gr.addColorStop(0, rgba(col, a))
        gr.addColorStop(1, rgba(col, 0))
        g.fillStyle = gr
        g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
      }
      for (let k = 0; k < 420; k++) {
        g.fillStyle = R() < 0.6 ? rgba(dark, 0.18) : rgba(lite, 0.3)
        const sz = 0.6 + R() * 1.2
        g.fillRect(x + R() * pw, y + R() * ph, sz, sz)
      }
      g.restore()
    }
}

const SQUARE: [string, string] = ['Cor do azulejo', 'Cor do rejunte']

export const TILES: PatternDef[] = [
  { id: 'az-quadrado', name: 'Quadrado', scale: 0.8, c1: '#f3f2ee', c2: '#cfcfcb', across: 4, ratio: 1, relief: true, rough: 0.2, res: 512, labels: SQUARE, draw: (g, S, c1, c2, m) => grid(g, S, 4, 4, c1, c2, !!m, { seed: 3 }) },
  {
    id: 'az-metro',
    name: 'Metrô (tijolinho)',
    scale: 0.4,
    c1: '#f1efe8',
    c2: '#bdbcb6',
    across: 2,
    ratio: 0.5,
    relief: true,
    rough: 0.15,
    res: 512,
    labels: SQUARE,
    draw: (g, S, c1, c2, m) => grid(g, S, 2, 4, c1, c2, !!m, { seed: 5, shift: 0.5, bevel: true }),
  },
  {
    id: 'az-metro-v',
    name: 'Metrô vertical',
    scale: 0.4,
    c1: '#8fa894',
    c2: '#e6e6e0',
    across: 4,
    ratio: 2,
    relief: true,
    rough: 0.15,
    res: 512,
    labels: SQUARE,
    draw: (g, S, c1, c2, m) => grid(g, S, 4, 2, c1, c2, !!m, { seed: 7, shift: 0.5, vertical: true, bevel: true }),
  },
  { id: 'az-empilhado', name: 'Retangular empilhado', scale: 0.6, c1: '#d8d8d4', c2: '#a9a9a5', across: 2, ratio: 0.5, relief: true, rough: 0.22, res: 512, labels: SQUARE, draw: (g, S, c1, c2, m) => grid(g, S, 2, 4, c1, c2, !!m, { seed: 9 }) },
  { id: 'az-espinha', name: 'Espinha de peixe', scale: 0.4, c1: '#c97d57', c2: '#e6dfd4', across: 4, ratio: 2, relief: true, rough: 0.25, res: 512, labels: SQUARE, draw: (g, S, c1, c2, m) => herringbone(g, S, c1, c2, !!m) },
  { id: 'az-hexagonal', name: 'Hexagonal', scale: 0.7, c1: '#ffffff', c2: '#c4c4c0', across: 7, ratio: 1.15, relief: true, rough: 0.22, res: 512, labels: SQUARE, draw: (g, S, c1, c2, m) => hexagons(g, S, c1, c2, !!m) },
  { id: 'az-escama', name: 'Escama', scale: 0.32, c1: '#2f6f73', c2: '#e9e6df', across: 4, ratio: 1, relief: true, rough: 0.15, res: 512, labels: SQUARE, draw: (g, S, c1, c2, m) => scales(g, S, c1, c2, !!m) },
  {
    id: 'az-zellige',
    name: 'Zellige (artesanal)',
    scale: 0.6,
    c1: '#3f7c8a',
    c2: '#d9d4c8',
    across: 6,
    ratio: 1,
    relief: true,
    rough: 0.1,
    res: 512,
    labels: SQUARE,
    draw: (g, S, c1, c2, m) => grid(g, S, 6, 6, c1, c2, !!m, { seed: 11, vary: 0.11, glaze: true, jk: 0.02 }),
  },
  { id: 'az-pastilha', name: 'Pastilha 2,5 cm', scale: 0.3, c1: '#4f8fb0', c2: '#e2e2de', across: 10, ratio: 1, relief: true, rough: 0.12, res: 512, labels: SQUARE, draw: (g, S, c1, c2, m) => grid(g, S, 10, 10, c1, c2, !!m, { seed: 13, vary: 0.09, jk: 0.06 }) },
  {
    id: 'az-portugues',
    name: 'Azulejo português',
    scale: 0.3,
    c1: '#f7f5ef',
    c2: '#1f4f9a',
    across: 2,
    ratio: 1,
    relief: true,
    rough: 0.15,
    res: 512,
    labels: ['Cor de fundo', 'Cor do desenho'],
    draw: (g, S, c1, c2, m) => portuguese(g, S, c1, c2, !!m),
  },
  {
    id: 'az-hidraulico',
    name: 'Ladrilho hidráulico',
    scale: 0.4,
    c1: '#ece4d6',
    c2: '#2e4a5c',
    across: 2,
    ratio: 1,
    relief: true,
    rough: 0.55,
    res: 512,
    labels: ['Cor de fundo', 'Cor do desenho'],
    draw: (g, S, c1, c2, m) => hydraulic(g, S, c1, c2, !!m),
  },
  {
    id: 'az-porcelanato',
    name: 'Porcelanato 60×120',
    scale: 1.2,
    c1: '#d6d3cd',
    c2: '#bdb9b2',
    across: 2,
    ratio: 2,
    relief: true,
    rough: 0.35,
    res: 512,
    labels: SQUARE,
    draw: (g, S, c1, c2, m) => slabs(g, S, c1, c2, !!m, false),
  },
  {
    id: 'az-marmore',
    name: 'Mármore 60×120',
    scale: 1.2,
    c1: '#f0eee9',
    c2: '#8d8d8d',
    across: 2,
    ratio: 2,
    relief: true,
    rough: 0.12,
    res: 512,
    labels: ['Cor da pedra', 'Cor dos veios'],
    draw: (g, S, c1, c2, m) => slabs(g, S, c1, c2, !!m, true),
  },
  {
    // ladrilho de 4 × 3 peças: 33,75 × 45 cm (a altura casa certinho com as juntas a 45 e 90 cm do piso)
    id: 'az-cimenticio',
    name: 'Cerâmica cimentícia 33×45',
    scale: 1.35,
    c1: '#e2d5bd',
    c2: '#d6c9b0',
    across: 4,
    ratio: 4 / 3,
    relief: true,
    rough: 0.32,
    res: 1024,
    labels: SQUARE,
    draw: (g, S, c1, c2, m) => cloudy(g, S, 4, 3, c1, c2, !!m, 41),
  },
]

/** Cores prontas de azulejo e de rejunte. */
export const TILE_COLORS: { name: string; hex: string }[] = [
  { name: 'Branco', hex: '#f3f2ee' },
  { name: 'Off-white', hex: '#ece6d8' },
  { name: 'Cinza claro', hex: '#d2d3d0' },
  { name: 'Cinza', hex: '#9a9d9f' },
  { name: 'Grafite', hex: '#4a4e53' },
  { name: 'Preto', hex: '#1f2124' },
  { name: 'Verde sálvia', hex: '#8fa894' },
  { name: 'Verde musgo', hex: '#5d7356' },
  { name: 'Verde-água', hex: '#7fb8ad' },
  { name: 'Azul petróleo', hex: '#2f6f73' },
  { name: 'Azul', hex: '#4f8fb0' },
  { name: 'Azul-marinho', hex: '#23395b' },
  { name: 'Rosa', hex: '#e2b3ae' },
  { name: 'Terracota', hex: '#c97d57' },
  { name: 'Mostarda', hex: '#d1a43f' },
  { name: 'Bege', hex: '#d9c8ad' },
]

export const GROUT_COLORS: { name: string; hex: string }[] = [
  { name: 'Branco', hex: '#f1f0ec' },
  { name: 'Cinza claro', hex: '#cfcfcb' },
  { name: 'Cinza', hex: '#a3a39f' },
  { name: 'Cinza escuro', hex: '#6d6e6c' },
  { name: 'Grafite', hex: '#3e4043' },
  { name: 'Preto', hex: '#1d1e20' },
  { name: 'Bege', hex: '#d8ccb6' },
  { name: 'Marrom', hex: '#6f5a46' },
]
