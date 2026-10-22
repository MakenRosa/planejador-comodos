/**
 * Papéis de parede procedurais: cada padrão desenha um ladrilho quadrado e contínuo (seamless)
 * num canvas, usado como textura repetida. O tamanho do ladrilho em metros vem do revestimento.
 */
import * as THREE from 'three'
import { rng } from '../furniture/parts'
import { TILES } from './tiles'

/** `mask`: só peça (c1) × rejunte (c2), sem detalhes — usado para relevo/brilho dos azulejos. */
type Draw = (g: CanvasRenderingContext2D, S: number, c1: string, c2: string, mask?: boolean) => void

export interface PatternDef {
  id: string
  name: string
  /** Tamanho padrão do ladrilho em metros. */
  scale: number
  c1: string
  c2: string
  /** Rugosidade do material (0 = espelhado, 1 = fosco). */
  rough?: number
  /** Lado da textura em pixels (padrão 512). */
  res?: number
  /** Azulejo: quantas peças cabem na largura do ladrilho e altura/largura da peça. */
  across?: number
  ratio?: number
  /** Rejunte em relevo e peça mais brilhante que o rejunte (desenho em modo máscara). */
  relief?: boolean
  /** Nomes das duas cores no painel. */
  labels?: [string, string]
  draw: Draw
}

/** Desenha uma forma nas 9 posições vizinhas para o ladrilho emendar sem costura. */
function wrapDraw(S: number, x: number, y: number, fn: (x: number, y: number) => void) {
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(x + dx, y + dy)
}

function leaf(g: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number) {
  g.save()
  g.translate(x, y)
  g.rotate(ang)
  g.beginPath()
  g.moveTo(0, 0)
  g.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0)
  g.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0)
  g.fill()
  g.restore()
}

/**
 * Lâmina de madeira natural (folha contínua, sem emendas): veios finos e longos, quase retos, que
 * ondulam devagar, se juntam e se afastam; faixas suaves de tom e, de vez em quando, um nó com os
 * veios contornando em "catedral". Desenhado pixel a pixel e contínuo nas bordas (tudo periódico).
 */
function veneer(g: CanvasRenderingContext2D, S: number, c1: string, c2: string, seed: number, withKnots = true) {
  const TAU = Math.PI * 2
  const R = rng(seed)
  const N = 150 // veios por ladrilho (~1,3 cm entre veios num ladrilho de 2 m)
  // cada veio: posição dentro do intervalo, força (a maioria suave, alguns marcados) e espessura
  const lines = Array.from({ length: N }, () => {
    const r = R()
    return { c: 0.2 + R() * 0.6, wt: r < 0.4 ? 0.14 + R() * 0.16 : r < 0.82 ? 0.34 + R() * 0.26 : 0.65 + R() * 0.3, lw: 0.12 + R() * 0.16, c2: R(), wt2: R() * 0.1 }
  })
  // fibras: estrias bem finas paralelas ao veio
  const fib = Array.from({ length: N * 6 }, () => R() - 0.5)
  // balanço lateral dos veios ao longo da altura: suave e sem um período dominante
  const sway = (
    [
      [1, 0.012, 1],
      [2, 0.005, -1],
      [3, 0.0025, 2],
      [4, 0.001, -2],
    ] as const
  ).map(([k, a, m]) => [k, a * (0.7 + R() * 0.6) * S, R() * TAU, m] as const)
  // veios que se aproximam e se afastam (depende de x e de y)
  const warp = Array.from({ length: 4 }, () => [1 + Math.floor(R() * 3), 1 + Math.floor(R() * 3), (0.002 + R() * 0.003) * S, R() * TAU, R() * TAU] as const)
  // espaçamento irregular entre veios (zonas mais densas e mais abertas); mantém a função crescente
  const dens = (
    [
      [1, 5],
      [3, 2.4],
      [7, 0.7],
    ] as const
  ).map(([k, a]) => [k, a, R() * TAU] as const)
  const bandPh = [R() * TAU, R() * TAU, R() * TAU]
  const swPh = [R() * TAU, R() * TAU]
  const swayX = Array.from({ length: S }, (_, x) => 0.65 + 0.25 * Math.sin((TAU * x) / S + swPh[0]) + 0.1 * Math.sin((TAU * 2 * x) / S + swPh[1]))
  const knots = [
    { x: R(), y: R(), r: 0.011 + R() * 0.005 },
    { x: R(), y: R(), r: 0.008 + R() * 0.004 },
  ].slice(0, withKnots ? 2 : 0).flatMap((k) => {
    const out = []
    for (const ox of [-1, 0, 1]) for (const oy of [-1, 0, 1]) out.push({ x: (k.x + ox) * S, y: (k.y + oy) * S, r: k.r * S })
    return out
  })
  // cores em sRGB (o THREE.Color guarda em espaço linear; o canvas espera sRGB)
  const srgb = (c: THREE.Color) => {
    const o = { r: 0, g: 0, b: 0 }
    c.getRGB(o, THREE.SRGBColorSpace)
    return o
  }
  const base = new THREE.Color(c1)
  const darkC = new THREE.Color(c2)
  // papel de parede: claro puxado para o creme (mel dourado); portas: o mesmo matiz, só mais claro
  // (puxar para o creme lavava as madeiras escuras/avermelhadas)
  const lighter = (c: THREE.Color, k: number) => {
    const hsl = { h: 0, s: 0, l: 0 }
    c.getHSL(hsl)
    return c.clone().setHSL(hsl.h, hsl.s, Math.min(0.9, hsl.l * k))
  }
  const light = srgb(withKnots ? base.clone().lerp(new THREE.Color('#fbe2b5'), 0.3) : lighter(base, 1.3))
  const mid = srgb(base.clone().lerp(darkC, 0.14))
  const dark = srgb(darkC)
  const img = g.createImageData(S, S)
  const px = img.data
  // 1 px em fração do intervalo entre veios
  const minW = N / S
  for (let y = 0; y < S; y++) {
    const near = knots.filter((kn) => Math.abs(y - kn.y) < kn.r * 22)
    for (let x = 0; x < S; x++) {
      // o balanço muda de intensidade e de fase ao longo da largura (os veios não andam todos juntos)
      let dy0 = 0
      for (const [k, a, ph, m] of sway) dy0 += a * Math.sin((TAU * (k * y + m * x)) / S + ph)
      let w = x + dy0 * swayX[x]
      for (const [kx, ky, a, px0, py0] of warp) w += a * Math.sin((TAU * kx * x) / S + px0) * Math.sin((TAU * ky * y) / S + py0)
      let ring = 0
      let core = 0
      for (const kn of near) {
        const ddx = x - kn.x
        if (Math.abs(ddx) > kn.r * 9) continue
        const ddy = (y - kn.y) * 0.4
        const dist = Math.hypot(ddx, ddy)
        // veios contornam o nó (forma de "catedral", alongada na vertical)
        w += (ddx / (dist + 1e-3)) * kn.r * 2.4 * Math.exp(-((dist / (kn.r * 3.2)) ** 2))
        if (dist < kn.r * 2) ring = Math.max(ring, (0.5 + 0.5 * Math.cos((dist / kn.r) * 6)) * (1 - dist / (kn.r * 2)) * 0.7)
        if (dist < kn.r * 0.7) core = Math.max(core, Math.min(1, 1.6 * (1 - dist / (kn.r * 0.7))))
      }
      let u = (w / S) * N
      for (const [k, a, ph] of dens) u += a * Math.sin((TAU * k * w) / S + ph)
      u = ((u % N) + N) % N
      const i = Math.floor(u)
      const f = u - i
      const L = lines[i]
      // veio principal (perfil suave, sem serrilhado) + um secundário bem leve; nenhum mais fino que
      // 1 px (senão vira pontilhado), com a força diluída na largura extra
      const lw1 = Math.max(L.lw, minW)
      const lw2 = Math.max(0.08, minW)
      const t1 = Math.max(0, 1 - Math.abs(f - L.c) / lw1)
      const t2 = Math.max(0, 1 - Math.abs(f - L.c2) / lw2)
      const line = L.wt * t1 * t1 * (L.lw / lw1) + L.wt2 * t2 * (0.08 / lw2)
      // faixas largas de tom (claro ↔ médio), levemente variando com a altura
      const band = Math.min(
        1,
        Math.max(0, 0.4 + 0.17 * Math.sin((TAU * 3 * w) / S + bandPh[0]) + 0.09 * Math.sin((TAU * 8 * w) / S + bandPh[1]) + 0.06 * Math.sin((TAU * y) / S + bandPh[2])),
      )
      const k = Math.min(1, line + ring * 0.45 + core * 0.85)
      const n = fib[Math.floor(u * 6) % fib.length] * (withKnots ? 0.04 : 0.018)
      const r = (light.r + (mid.r - light.r) * band) * (1 - k) + dark.r * k + n
      const gg = (light.g + (mid.g - light.g) * band) * (1 - k) + dark.g * k + n * 0.9
      const bb = (light.b + (mid.b - light.b) * band) * (1 - k) + dark.b * k + n * 0.7
      const o = (y * S + x) * 4
      px[o] = Math.max(0, Math.min(255, r * 255))
      px[o + 1] = Math.max(0, Math.min(255, gg * 255))
      px[o + 2] = Math.max(0, Math.min(255, bb * 255))
      px[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
}

export const PATTERNS: PatternDef[] = [
  {
    id: 'listras',
    name: 'Listras largas',
    scale: 0.4,
    c1: '#ece6da',
    c2: '#cbbca3',
    draw: (g, S, c1, c2) => {
      g.fillStyle = c1
      g.fillRect(0, 0, S, S)
      g.fillStyle = c2
      g.fillRect(S / 4, 0, S / 4, S)
      g.fillRect((3 * S) / 4, 0, S / 4, S)
    },
  },
  {
    id: 'riscas',
    name: 'Listras finas',
    scale: 0.3,
    c1: '#f2efe9',
    c2: '#9aa7b4',
    draw: (g, S, c1, c2) => {
      g.fillStyle = c1
      g.fillRect(0, 0, S, S)
      g.fillStyle = c2
      for (let i = 0; i < 8; i++) g.fillRect((i * S) / 8, 0, S / 48, S)
    },
  },
  {
    id: 'xadrez',
    name: 'Xadrez',
    scale: 0.25,
    c1: '#f3f1ec',
    c2: '#7f97ad',
    draw: (g, S, c1, c2) => {
      g.fillStyle = c1
      g.fillRect(0, 0, S, S)
      g.globalAlpha = 0.45
      g.fillStyle = c2
      g.fillRect(0, 0, S / 2, S)
      g.fillRect(0, 0, S, S / 2)
      g.globalAlpha = 1
    },
  },
  {
    id: 'poa',
    name: 'Poá',
    scale: 0.22,
    c1: '#f4efe6',
    c2: '#c98b6b',
    draw: (g, S, c1, c2) => {
      g.fillStyle = c1
      g.fillRect(0, 0, S, S)
      g.fillStyle = c2
      for (const [x, y] of [
        [S / 4, S / 4],
        [(3 * S) / 4, (3 * S) / 4],
      ]) {
        g.beginPath()
        g.arc(x, y, S / 13, 0, Math.PI * 2)
        g.fill()
      }
    },
  },
  {
    id: 'losangos',
    name: 'Losangos',
    scale: 0.35,
    c1: '#e9e6df',
    c2: '#b49a6b',
    draw: (g, S, c1, c2) => {
      g.fillStyle = c1
      g.fillRect(0, 0, S, S)
      g.strokeStyle = c2
      g.lineWidth = S / 64
      g.beginPath()
      g.moveTo(0, S / 2)
      g.lineTo(S / 2, 0)
      g.lineTo(S, S / 2)
      g.lineTo(S / 2, S)
      g.closePath()
      g.stroke()
      g.fillStyle = c2
      for (const [x, y] of [
        [0, 0],
        [S, 0],
        [0, S],
        [S, S],
        [S / 2, S / 2],
      ]) {
        g.beginPath()
        g.arc(x, y, S / 40, 0, Math.PI * 2)
        g.fill()
      }
    },
  },
  {
    id: 'chevron',
    name: 'Chevron',
    scale: 0.4,
    c1: '#f1eee8',
    c2: '#5f6f7d',
    draw: (g, S, c1, c2) => {
      g.fillStyle = c1
      g.fillRect(0, 0, S, S)
      g.strokeStyle = c2
      g.lineWidth = S / 14
      g.lineJoin = 'miter'
      for (let k = -1; k <= 4; k++) {
        const y = (k * S) / 4
        g.beginPath()
        g.moveTo(0, y + S / 8)
        g.lineTo(S / 4, y)
        g.lineTo(S / 2, y + S / 8)
        g.lineTo((3 * S) / 4, y)
        g.lineTo(S, y + S / 8)
        g.stroke()
      }
    },
  },
  {
    id: 'tijolinho',
    name: 'Tijolinho',
    scale: 0.5,
    c1: '#b4654a',
    c2: '#e6ddd0',
    draw: (g, S, c1, c2) => {
      const R = rng(11)
      g.fillStyle = c2
      g.fillRect(0, 0, S, S)
      const rows = 8
      const rh = S / rows
      const bw = S / 2
      const m = S / 110
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? bw / 2 : 0
        for (let c = -1; c < 3; c++) {
          const base = new THREE.Color(c1)
          base.offsetHSL(0, (R() - 0.5) * 0.08, (R() - 0.5) * 0.08)
          g.fillStyle = '#' + base.getHexString()
          g.fillRect(c * bw + off + m, r * rh + m, bw - 2 * m, rh - 2 * m)
        }
      }
    },
  },
  {
    id: 'ripado',
    name: 'Ripado de madeira',
    scale: 0.6,
    c1: '#a8774c',
    c2: '#3b2a1e',
    draw: (g, S, c1, c2) => {
      const R = rng(5)
      g.fillStyle = c2
      g.fillRect(0, 0, S, S)
      const n = 6
      const sw = S / n
      for (let i = 0; i < n; i++) {
        const base = new THREE.Color(c1)
        base.offsetHSL(0, 0, (R() - 0.5) * 0.06)
        g.fillStyle = '#' + base.getHexString()
        g.fillRect(i * sw + sw * 0.08, 0, sw * 0.84, S)
        g.strokeStyle = 'rgba(60,35,15,0.18)'
        g.lineWidth = 1.5
        for (let k = 0; k < 5; k++) {
          const x = i * sw + sw * (0.15 + R() * 0.7)
          g.beginPath()
          g.moveTo(x, 0)
          g.bezierCurveTo(x + 3, S * 0.3, x - 3, S * 0.6, x, S)
          g.stroke()
        }
        g.fillStyle = 'rgba(255,255,255,0.12)'
        g.fillRect(i * sw + sw * 0.08, 0, sw * 0.08, S)
      }
    },
  },
  {
    id: 'floral',
    name: 'Floral',
    scale: 0.35,
    c1: '#f3ece4',
    c2: '#c27b86',
    draw: (g, S, c1, c2) => {
      g.fillStyle = c1
      g.fillRect(0, 0, S, S)
      const flower = (cx: number, cy: number, r: number) =>
        wrapDraw(S, cx, cy, (x, y) => {
          g.fillStyle = '#7f9a77'
          leaf(g, x, y, r * 2.1, 0.6)
          leaf(g, x, y, r * 2.1, Math.PI + 0.6)
          g.fillStyle = c2
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2
            g.beginPath()
            g.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.5, 0, Math.PI * 2)
            g.fill()
          }
          g.fillStyle = '#e8c35c'
          g.beginPath()
          g.arc(x, y, r * 0.32, 0, Math.PI * 2)
          g.fill()
        })
      flower(S * 0.25, S * 0.25, S * 0.07)
      flower(S * 0.75, S * 0.75, S * 0.07)
    },
  },
  {
    id: 'folhagem',
    name: 'Folhagem',
    scale: 0.6,
    c1: '#e9efe6',
    c2: '#4f7a55',
    draw: (g, S, c1, c2) => {
      const R = rng(21)
      g.fillStyle = c1
      g.fillRect(0, 0, S, S)
      const base = new THREE.Color(c2)
      for (let i = 0; i < 26; i++) {
        const x = R() * S
        const y = R() * S
        const len = S * (0.08 + R() * 0.1)
        const ang = R() * Math.PI * 2
        const c = base.clone().offsetHSL((R() - 0.5) * 0.04, 0, (R() - 0.5) * 0.18)
        g.fillStyle = '#' + c.getHexString()
        wrapDraw(S, x, y, (xx, yy) => leaf(g, xx, yy, len, ang))
      }
    },
  },
  {
    id: 'geometrico',
    name: 'Geométrico',
    scale: 0.4,
    c1: '#ece8e1',
    c2: '#2f4858',
    draw: (g, S, c1, c2) => {
      g.fillStyle = c1
      g.fillRect(0, 0, S, S)
      g.fillStyle = c2
      const h = S / 2
      // triângulos alternados
      for (const [x, y, up] of [
        [0, 0, true],
        [h, 0, false],
        [0, h, false],
        [h, h, true],
      ] as [number, number, boolean][]) {
        g.globalAlpha = up ? 0.85 : 0.35
        g.beginPath()
        if (up) {
          g.moveTo(x + h / 2, y + h * 0.15)
          g.lineTo(x + h * 0.88, y + h * 0.85)
          g.lineTo(x + h * 0.12, y + h * 0.85)
        } else {
          g.moveTo(x + h * 0.12, y + h * 0.15)
          g.lineTo(x + h * 0.88, y + h * 0.15)
          g.lineTo(x + h / 2, y + h * 0.85)
        }
        g.closePath()
        g.fill()
      }
      g.globalAlpha = 1
    },
  },
  {
    id: 'arabesco',
    name: 'Arabesco',
    scale: 0.5,
    c1: '#e7e1d6',
    c2: '#a8926a',
    draw: (g, S, c1, c2) => {
      g.fillStyle = c1
      g.fillRect(0, 0, S, S)
      g.strokeStyle = c2
      g.lineWidth = S / 90
      const motif = (cx: number, cy: number, r: number) =>
        wrapDraw(S, cx, cy, (x, y) => {
          for (const sx of [-1, 1]) {
            g.beginPath()
            g.moveTo(x, y - r)
            g.bezierCurveTo(x + sx * r * 0.9, y - r * 0.8, x + sx * r * 0.9, y + r * 0.2, x, y + r)
            g.stroke()
            g.beginPath()
            g.moveTo(x, y - r * 0.35)
            g.bezierCurveTo(x + sx * r * 0.45, y - r * 0.35, x + sx * r * 0.45, y + r * 0.3, x, y + r * 0.45)
            g.stroke()
            g.beginPath()
            g.arc(x + sx * r * 0.62, y - r * 0.05, r * 0.1, 0, Math.PI * 2)
            g.stroke()
          }
        })
      motif(S * 0.25, S * 0.25, S * 0.2)
      motif(S * 0.75, S * 0.75, S * 0.2)
    },
  },
  {
    id: 'madeira-tabuas',
    name: 'Madeira em tábuas',
    scale: 1.2,
    c1: '#b88a5c',
    c2: '#7a5434',
    draw: (g, S, c1, c2) => {
      // Tábuas largas e lisas (sem frisos/ripas), emendas desencontradas e veios
      const R = rng(31)
      const rows = 6
      const rh = S / rows
      const base = new THREE.Color(c1)
      const grain = new THREE.Color(c2)
      for (let r = 0; r < rows; r++) {
        let x = -R() * S * 0.6
        while (x < S) {
          const len = S * (0.45 + R() * 0.5)
          const k = base.clone().offsetHSL((R() - 0.5) * 0.015, (R() - 0.5) * 0.05, (R() - 0.5) * 0.07)
          g.fillStyle = '#' + k.getHexString()
          g.fillRect(x, r * rh, len, rh)
          // veios ondulados
          for (let v = 0; v < 9; v++) {
            const y = r * rh + rh * (0.08 + R() * 0.84)
            g.strokeStyle = `rgba(${Math.round(grain.r * 255)},${Math.round(grain.g * 255)},${Math.round(grain.b * 255)},${0.08 + R() * 0.14})`
            g.lineWidth = 0.8 + R() * 1.8
            g.beginPath()
            g.moveTo(x, y)
            const amp = rh * (0.03 + R() * 0.06)
            g.bezierCurveTo(x + len * 0.3, y - amp, x + len * 0.6, y + amp, x + len, y + (R() - 0.5) * amp)
            g.stroke()
          }
          // nó ocasional
          if (R() < 0.25) {
            g.fillStyle = `rgba(${Math.round(grain.r * 255)},${Math.round(grain.g * 255)},${Math.round(grain.b * 255)},0.35)`
            g.beginPath()
            g.ellipse(x + len * (0.2 + R() * 0.6), r * rh + rh * (0.3 + R() * 0.4), rh * 0.09, rh * 0.05, 0, 0, Math.PI * 2)
            g.fill()
          }
          // emenda discreta
          g.fillStyle = 'rgba(40,25,12,0.18)'
          g.fillRect(x, r * rh, 1.2, rh)
          x += len
        }
        g.fillStyle = 'rgba(40,25,12,0.16)'
        g.fillRect(0, r * rh, S, 1.2)
      }
    },
  },
  {
    id: 'madeira',
    name: 'Madeira (lâmina natural)',
    scale: 2.0,
    res: 1024,
    c1: '#da9a52',
    c2: '#8a4a1e',
    rough: 0.5,
    draw: (g, S, c1, c2) => {
      // cores padrão antigas (painel de tábuas) passam para as da lâmina
      if (c1 === '#b88a5c' && c2 === '#7a5434') [c1, c2] = ['#da9a52', '#8a4a1e']
      veneer(g, S, c1, c2, 41)
    },
  },
  {
    id: 'madeira-clara',
    name: 'Madeira clara (lâmina)',
    scale: 2.0,
    res: 1024,
    c1: '#e2bf8e',
    c2: '#9c7046',
    rough: 0.5,
    draw: (g, S, c1, c2) => {
      if (c1 === '#d8bf98' && c2 === '#a8875e') [c1, c2] = ['#e2bf8e', '#9c7046']
      veneer(g, S, c1, c2, 57)
    },
  },
  {
    id: 'cimento',
    name: 'Cimento queimado',
    scale: 1.2,
    c1: '#a9a7a2',
    c2: '#7d7b77',
    draw: (g, S, c1, c2) => {
      const R = rng(9)
      g.fillStyle = c1
      g.fillRect(0, 0, S, S)
      const c = new THREE.Color(c2)
      for (let i = 0; i < 220; i++) {
        const x = R() * S
        const y = R() * S
        const r = S * (0.02 + R() * 0.09)
        const k = c.clone().offsetHSL(0, 0, (R() - 0.5) * 0.12)
        g.fillStyle = `rgba(${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)},${0.05 + R() * 0.08})`
        wrapDraw(S, x, y, (xx, yy) => {
          g.beginPath()
          g.arc(xx, yy, r, 0, Math.PI * 2)
          g.fill()
        })
      }
    },
  },
]

export const findPattern = (id: string) => PATTERNS.find((p) => p.id === id) ?? TILES.find((p) => p.id === id) ?? PATTERNS[0]

function drawToCanvas(id: string, c1: string, c2: string, size: number, mask = false) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  findPattern(id).draw(g, size, c1, c2, mask)
  return c
}

const reliefCache = new Map<string, { bump: THREE.CanvasTexture; rough: THREE.CanvasTexture }>()
/** Relevo (rejunte afundado) e rugosidade (peça lisa, rejunte fosco) de um azulejo — não dependem da cor. */
function reliefMaps(id: string) {
  let r = reliefCache.get(id)
  if (!r) {
    const def = findPattern(id)
    const res = def.res ?? 512
    const tex = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c)
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = 8
      return t
    }
    const g = Math.round((def.rough ?? 0.2) * 255)
    const glossy = `rgb(${g},${g},${g})`
    r = { bump: tex(drawToCanvas(id, '#ffffff', '#000000', res, true)), rough: tex(drawToCanvas(id, glossy, '#e6e6e6', res, true)) }
    reliefCache.set(id, r)
  }
  return r
}

const veneerCache = new Map<string, THREE.CanvasTexture>()
/** Lâmina de madeira sem nós (portas, batentes): veio na vertical, ladrilho pensado para 2 m. */
export function woodVeneerTexture(c1: string, c2: string): THREE.CanvasTexture {
  const key = `${c1}|${c2}`
  let t = veneerCache.get(key)
  if (!t) {
    const c = document.createElement('canvas')
    c.width = c.height = 512
    veneer(c.getContext('2d')!, 512, c1, c2, 23, false)
    t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    veneerCache.set(key, t)
  }
  return t
}

const texCache = new Map<string, THREE.CanvasTexture>()
const matCache = new Map<string, THREE.MeshStandardMaterial>()

export function wallpaperMaterial(id: string, c1: string, c2: string): THREE.MeshStandardMaterial {
  const key = `${id}|${c1}|${c2}`
  let m = matCache.get(key)
  if (!m) {
    let tex = texCache.get(key)
    if (!tex) {
      tex = new THREE.CanvasTexture(drawToCanvas(id, c1, c2, findPattern(id).res ?? 512))
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      texCache.set(key, tex)
    }
    const def = findPattern(id)
    if (def.relief) {
      const r = reliefMaps(id)
      m = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, roughnessMap: r.rough, bumpMap: r.bump, bumpScale: 2.5 })
    } else m = new THREE.MeshStandardMaterial({ map: tex, roughness: def.rough ?? (id === 'ripado' ? 0.7 : 0.88) })
    matCache.set(key, m)
  }
  return m
}

const paintCache = new Map<string, THREE.MeshStandardMaterial>()
export function paintMaterial(color: string) {
  let m = paintCache.get(color)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
    paintCache.set(color, m)
  }
  return m
}

const thumbCache = new Map<string, string>()
export function patternThumb(id: string, c1: string, c2: string) {
  const key = `${id}|${c1}|${c2}`
  let u = thumbCache.get(key)
  if (!u) {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    if (findPattern(id).res) {
      // estampa de detalhe fino (ladrilho grande): um ladrilho só, desenhado grande e reduzido aos poucos
      let src = drawToCanvas(id, c1, c2, 512)
      while (src.width > 256) {
        const h = document.createElement('canvas')
        h.width = h.height = src.width / 2
        const hg = h.getContext('2d')!
        hg.imageSmoothingQuality = 'high'
        hg.drawImage(src, 0, 0, h.width, h.height)
        src = h
      }
      g.imageSmoothingQuality = 'high'
      g.drawImage(src, 0, 0, 128, 128)
    } else {
      // 2×2 ladrilhos para dar ideia da repetição
      const tile = drawToCanvas(id, c1, c2, 64)
      for (const x of [0, 64]) for (const y of [0, 64]) g.drawImage(tile, x, y)
    }
    u = c.toDataURL()
    thumbCache.set(key, u)
  }
  return u
}

/** Cores de tinta de parede comuns (nomes genéricos). */
export const WALL_PAINTS: { name: string; hex: string }[] = [
  { name: 'Branco neve', hex: '#f4f2ee' },
  { name: 'Gelo', hex: '#e9ebea' },
  { name: 'Off-white', hex: '#efe9dd' },
  { name: 'Areia', hex: '#e2d6c1' },
  { name: 'Palha', hex: '#e8dcb5' },
  { name: 'Fendi', hex: '#cfc2ae' },
  { name: 'Cinza claro', hex: '#d3d4d2' },
  { name: 'Cinza urbano', hex: '#a3a5a4' },
  { name: 'Grafite', hex: '#4b4f54' },
  { name: 'Verde sálvia', hex: '#a9b8a0' },
  { name: 'Verde oliva', hex: '#7c8560' },
  { name: 'Azul sereno', hex: '#a9bfd0' },
  { name: 'Azul petróleo', hex: '#2f5363' },
  { name: 'Terracota', hex: '#c0765a' },
  { name: 'Rosa queimado', hex: '#c99a91' },
  { name: 'Mostarda', hex: '#d4a84a' },
  { name: 'Preto', hex: '#26272a' },
]

export const DEFAULT_WALL_COLOR = '#f1eee8'
