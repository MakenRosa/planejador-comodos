/**
 * Itens de setup com modelo real: soundbar Redragon Orpheus GS550 (barra ou duas caixinhas), mousepad
 * Havit HV-MP830, teclado Redragon Kumara K552 RGB (ABNT2), mouse Logitech G703, headset Corsair HS80 e
 * o gabinete Aerocool Mirage com placa-mãe MSI MPG B550 Gaming Plus, RTX 5070 da MSI, 2× XPG Spectrix
 * D35 e fonte XPG 750 W. Medidas das fichas técnicas.
 */
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clamp } from '../lib/util'
import { bool, corners, num, str, type BuildParams } from './builders'
import { M, mat, Parts, rng, shade } from './parts'

// ------------------------------------------------------------------ utilidades

export const glow = (c: string, k = 1) => mat(shade(c, -0.55), { emissive: c, emissiveIntensity: k, rough: 0.4 })

const texCache = new Map<string, THREE.CanvasTexture>()
/** Textura de canvas guardada pela chave (cada desenho é feito uma vez só). */
export function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  let t = texCache.get(key)
  if (!t) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    draw(c.getContext('2d')!, w, h)
    t = new THREE.CanvasTexture(c)
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    texCache.set(key, t)
  }
  return t
}

const matCache = new Map<string, THREE.Material>()
export function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined
  if (!m) {
    m = make()
    matCache.set(key, m)
  }
  return m
}

/** Plano com textura (decalque) na face voltada para +z, centrado em (x, y, z). */
export function decal(P: Parts, w: number, h: number, m: THREE.Material, x: number, y: number, z: number, rotY = 0, rotX = 0) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m)
  p.position.set(x, y, z)
  p.rotation.set(rotX, rotY, 0, 'YXZ')
  P.group.add(p)
  return p
}

const hsl = (h: number, s = 100, l = 55) => `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`

// ------------------------------------------------------------------ Redragon Orpheus GS550

/** Grade de metal perfurado com o alto-falante aceso em vermelho no meio (cor e brilho). */
function grilleTex(kind: 'bar' | 'tower', emissive: boolean) {
  const [W, H] = kind === 'bar' ? [512, 190] : [190, 512]
  return canvasTex(`grille-${kind}-${emissive}`, W, H, (g) => {
    g.fillStyle = emissive ? '#000000' : '#101113'
    g.fillRect(0, 0, W, H)
    const cx = W / 2
    const cy = H / 2
    const r = Math.min(W, H) * 0.38
    // anel vermelho do alto-falante (atrás da grade)
    const gr = g.createRadialGradient(cx, cy, r * 0.35, cx, cy, r * 1.15)
    gr.addColorStop(0, emissive ? 'rgba(255,40,30,0.25)' : 'rgba(120,20,15,0.6)')
    gr.addColorStop(0.62, emissive ? 'rgba(255,40,30,1)' : 'rgba(230,40,30,1)')
    gr.addColorStop(0.8, emissive ? 'rgba(255,40,30,0.5)' : 'rgba(150,20,15,0.6)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.beginPath()
    g.arc(cx, cy, r * 1.15, 0, Math.PI * 2)
    g.fill()
    // furinhos da grade
    g.fillStyle = emissive ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.6)'
    const step = 7
    for (let y = 3; y < H; y += step)
      for (let x = 3 + ((y / step) % 2) * (step / 2); x < W; x += step) {
        g.beginPath()
        g.arc(x, y, 1.4, 0, Math.PI * 2)
        g.fill()
      }
  })
}

/** Dragão da Redragon (emblema vermelho simplificado), fundo transparente. */
function dragonTex() {
  return canvasTex('redragon-dragon', 256, 256, (g) => {
    g.clearRect(0, 0, 256, 256)
    g.fillStyle = '#e8261c'
    g.beginPath()
    // cabeça de perfil com chifres e boca aberta
    g.moveTo(70, 200)
    g.bezierCurveTo(40, 150, 60, 80, 120, 60)
    g.lineTo(150, 20)
    g.lineTo(158, 62)
    g.bezierCurveTo(200, 70, 220, 100, 214, 130)
    g.lineTo(178, 128)
    g.lineTo(200, 160)
    g.bezierCurveTo(170, 170, 150, 160, 140, 150)
    g.bezierCurveTo(150, 185, 130, 215, 100, 228)
    g.closePath()
    g.fill()
    g.fillStyle = '#000'
    g.beginPath()
    g.arc(160, 98, 9, 0, Math.PI * 2)
    g.fill()
  })
}

/** Caixas da Orpheus: barra deitada (as duas unidades juntas) ou duas torres nas pontas do item. */
export function orpheusSoundbar({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const body = mat(color, { rough: 0.15, metal: 0.25 })
  const L = 0.186
  const A = 0.058
  const B = Math.min(0.081, d - 0.004)
  const grilleBar = cached('orp-g-bar', () => new THREE.MeshStandardMaterial({ map: grilleTex('bar', false), emissive: '#ffffff', emissiveMap: grilleTex('bar', true), emissiveIntensity: 0.9, roughness: 0.6, metalness: 0.3 }))
  const grilleTower = cached('orp-g-tower', () => new THREE.MeshStandardMaterial({ map: grilleTex('tower', false), emissive: '#ffffff', emissiveMap: grilleTex('tower', true), emissiveIntensity: 0.9, roughness: 0.6, metalness: 0.3 }))
  const logo = cached('orp-logo', () => new THREE.MeshStandardMaterial({ map: dragonTex(), transparent: true, alphaTest: 0.3, emissive: '#ff2a1c', emissiveMap: dragonTex(), emissiveIntensity: 0.7 }))
  const knob = (x: number, y: number, z: number) => {
    const k = P.cyl(0.011, 0.012, 0.012, x, y, z + 0.006, mat('#141414', { rough: 0.35, metal: 0.5 }), 24)
    k.rotation.x = Math.PI / 2
    const ring = P.mesh(new THREE.TorusGeometry(0.0135, 0.0016, 8, 30), glow('#ff2a1c', 1.4), x, y, z + 0.001)
    ring.rotation.set(0, 0, 0)
  }
  const jack = (x: number, y: number, z: number) => {
    const j = P.cyl(0.004, 0.004, 0.003, x, y, z + 0.0015, mat('#b9bdc2', { rough: 0.3, metal: 0.8 }), 16)
    j.rotation.x = Math.PI / 2
    const hole = P.cyl(0.0022, 0.0022, 0.0034, x, y, z + 0.0017, mat('#050505'), 12)
    hole.rotation.x = Math.PI / 2
  }
  if (str(options, 'mode', 'barra') === 'barra') {
    const total = 2 * L + 0.002
    const ft = Math.max(0.004, h - A)
    const fz = -d / 2 + B
    for (const sx of [-1, 1]) {
      P.boxB(L, A, B, sx * (L / 2 + 0.001), ft, -d / 2 + B / 2, body, 0.004)
      for (const k of [0.25, 0.85]) P.boxB(0.02, ft, 0.05, sx * L * k, 0, -d / 2 + B / 2, mat('#0b0b0c'))
    }
    const endW = 0.052
    const gw = total / 2 - endW - 0.004
    const gh = A - 0.01
    decal(P, gw, gh, grilleBar, -0.002 - gw / 2, ft + A / 2, fz + 0.0008)
    decal(P, gw, gh, grilleBar, 0.002 + gw / 2, ft + A / 2, fz + 0.0008)
    decal(P, 0.032, 0.032, logo, -total / 2 + endW / 2, ft + A / 2, fz + 0.0008)
    const ex = total / 2 - endW / 2
    knob(ex + 0.006, ft + A / 2 + 0.008, fz)
    jack(ex - 0.006, ft + A / 2 - 0.016, fz)
    jack(ex + 0.014, ft + A / 2 - 0.016, fz)
    return P.group
  }
  // duas torres nas pontas (a largura do item é a distância entre elas)
  const base = 0.012
  for (const side of [-1, 1]) {
    const x = side * (w / 2 - A / 2 - 0.006)
    const zc = -d / 2 + B / 2 + 0.012
    const fz = zc + B / 2
    P.boxB(A + 0.012, base, B + 0.028, x, 0, zc - 0.008, mat('#0b0b0c', { rough: 0.3 }), 0.003)
    P.boxB(A, L, B, x, base, zc, body, 0.004)
    P.boxB(A, 0.012, B * 0.55, x, base + L, zc - B * 0.2, body, 0.003)
    const gh = L * 0.66
    decal(P, A - 0.008, gh, grilleTower, x, base + L - 0.008 - gh / 2, fz + 0.0008)
    if (side < 0) decal(P, 0.034, 0.034, logo, x, base + L * 0.14, fz + 0.0008)
    else {
      knob(x + 0.009, base + L * 0.15, fz)
      jack(x - 0.017, base + L * 0.2, fz)
      jack(x - 0.017, base + L * 0.09, fz)
    }
  }
  return P.group
}

// ------------------------------------------------------------------ mousepad Havit

/** Garra da Havit (três riscos curvos e o traço de baixo). */
function drawHavitClaw(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  g.save()
  g.translate(x, y)
  g.scale(s, s)
  g.fillStyle = color
  for (let i = 0; i < 3; i++) {
    g.beginPath()
    const oy = i * 14
    g.moveTo(-40, -20 + oy)
    g.bezierCurveTo(-10, -34 + oy, 20, -30 + oy, 46, -38 + oy)
    g.bezierCurveTo(24, -24 + oy, 0, -16 + oy, -34, -12 + oy)
    g.closePath()
    g.fill()
  }
  g.beginPath()
  g.moveTo(-46, 26)
  g.bezierCurveTo(-30, 8, 0, 4, 30, 10)
  g.bezierCurveTo(4, 12, -22, 18, -38, 32)
  g.closePath()
  g.fill()
  g.restore()
}

export function mousepad({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const brand = str(options, 'brand', 'havit')
  const W = 1024
  const H = Math.max(64, Math.round((W * d) / w))
  const top = canvasTex(`pad-${brand}-${color}-${color2}-${W}x${H}`, W, H, (g) => {
    g.fillStyle = color
    g.fillRect(0, 0, W, H)
    // trama do tecido
    const R = rng(5)
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)'
      g.fillRect(R() * W, R() * H, 1.4, 1.4)
    }
    // costura da borda
    const b = (0.006 / w) * W
    g.strokeStyle = color2
    g.lineWidth = b
    g.strokeRect(b / 2, b / 2, W - b, H - b)
    if (brand === 'havit') drawHavitClaw(g, W * 0.93, H * 0.84, (H * 0.11) / 40, color2)
  })
  const topM = cached(`pad-m-${brand}-${color}-${color2}-${W}x${H}`, () => new THREE.MeshStandardMaterial({ map: top, roughness: 0.95 }))
  const edge = mat(color2, { rough: 0.8 })
  const pad = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [edge, edge, topM, mat('#2a2a2a', { rough: 1 }), edge, edge])
  pad.position.y = h / 2
  pad.receiveShadow = true
  P.group.add(pad)
  return P.group
}

// ------------------------------------------------------------------ teclado Redragon Kumara K552 (ABNT2)

interface Key {
  label: string
  x: number
  y: number
  w: number
  h?: number
  sub?: string
}

/** Layout TKL ABNT2 em unidades de tecla (x a partir da esquerda, y a partir de cima). */
function kumaraLayout(): Key[] {
  const keys: Key[] = []
  const row = (y: number, x0: number, labels: string[], wdt = 1) => labels.forEach((l, i) => keys.push({ label: l, x: x0 + i * wdt, y, w: wdt }))
  keys.push({ label: 'Esc', x: 0, y: 0, w: 1 })
  row(0, 2, ['F1', 'F2', 'F3', 'F4'])
  row(0, 6.5, ['F5', 'F6', 'F7', 'F8'])
  row(0, 11, ['F9', 'F10', 'F11', 'F12'])
  row(0, 15.25, ['PrtSc', 'ScrLk', 'Pause'])
  row(1.5, 0, ["'", '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='])
  keys.push({ label: '⟵', x: 13, y: 1.5, w: 2 })
  row(1.5, 15.25, ['Ins', 'Home', 'PgUp'])
  keys.push({ label: 'Tab', x: 0, y: 2.5, w: 1.5 })
  row(2.5, 1.5, ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '´', '['])
  keys.push({ label: '↵', x: 13.5, y: 2.5, w: 1.5 })
  keys.push({ label: '', x: 13.75, y: 3.5, w: 1.25 })
  row(2.5, 15.25, ['Del', 'End', 'PgDn'])
  keys.push({ label: 'Caps', x: 0, y: 3.5, w: 1.75 })
  row(3.5, 1.75, ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç', '~', ']'])
  keys.push({ label: 'Shift', x: 0, y: 4.5, w: 1.25 })
  row(4.5, 1.25, ['\\', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', ';', '/'])
  keys.push({ label: 'Shift', x: 13.25, y: 4.5, w: 1.75 })
  keys.push({ label: '↑', x: 16.25, y: 4.5, w: 1 })
  const bottom: [string, number][] = [
    ['Ctrl', 1.25],
    ['Win', 1.25],
    ['Alt', 1.25],
    ['', 6.25],
    ['AltGr', 1.25],
    ['Fn', 1.25],
    ['Menu', 1.25],
    ['Ctrl', 1.25],
  ]
  let bx = 0
  for (const [l, kw] of bottom) {
    keys.push({ label: l, x: bx, y: 5.5, w: kw })
    bx += kw
  }
  row(5.5, 15.25, ['←', '↓', '→'])
  return keys
}

export function keyboardKumara({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const rgb = bool(options, 'rgb', true)
  const keys = kumaraLayout()
  const U = Math.min((w - 0.012) / 18.25, (d - 0.008) / 6.5)
  const ox = -w / 2 + (w - 18.25 * U) / 2
  const oz = -d / 2 + (d - 6.5 * U) / 2
  const caseH = Math.min(0.022, h * 0.58)
  P.boxB(w, caseH, d, 0, 0, 0, mat(color, { rough: 0.45, metal: 0.2 }), 0.004)
  // placa com o brilho RGB por baixo das teclas
  const TW = 1024
  const TH = Math.round((TW * 6.5) / 18.25)
  const hue = (x: number) => (x / 18.25) * 300
  const glowTex = canvasTex(`kumara-glow-${rgb}`, TW, TH, (g) => {
    g.fillStyle = '#000'
    g.fillRect(0, 0, TW, TH)
    if (!rgb) return
    const s = TW / 18.25
    for (const k of keys) {
      g.fillStyle = hsl(hue(k.x + k.w / 2), 100, 50)
      g.globalAlpha = 0.55
      g.fillRect((k.x - 0.08) * s, (k.y - 0.08) * s, (k.w + 0.16) * s, 1.16 * s)
    }
    g.globalAlpha = 1
  })
  const plate = cached(`kumara-plate-${rgb}`, () => new THREE.MeshStandardMaterial({ color: '#050505', emissive: '#ffffff', emissiveMap: glowTex, emissiveIntensity: 0.9, roughness: 0.6 }))
  decal(P, 18.25 * U, 6.5 * U, plate, ox + (18.25 * U) / 2, caseH + 0.0006, oz + (6.5 * U) / 2, 0, -Math.PI / 2)
  // teclas (uma geometria só)
  const capH = Math.max(0.006, h - caseH - 0.004)
  const geos: THREE.BufferGeometry[] = []
  for (const k of keys) {
    const g = new THREE.BoxGeometry(k.w * U - 0.0032, capH, U - 0.0032)
    g.translate(ox + (k.x + k.w / 2) * U, caseH + 0.003 + capH / 2, oz + (k.y + 0.5) * U)
    geos.push(g)
  }
  const capsGeo = mergeGeometries(geos)
  geos.forEach((g) => g.dispose())
  P.mesh(capsGeo, mat('#151618', { rough: 0.5 }))
  // legendas coloridas (e o logo) por cima das teclas
  const legend = canvasTex(`kumara-legend-${rgb}`, TW, TH, (g) => {
    g.clearRect(0, 0, TW, TH)
    const s = TW / 18.25
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (const k of keys) {
      if (!k.label) continue
      g.fillStyle = rgb ? hsl(hue(k.x + k.w / 2), 95, 62) : '#d9d9d9'
      const len = k.label.length
      g.font = `700 ${Math.round(s * (len > 3 ? 0.24 : len > 1 ? 0.3 : 0.42))}px Arial, sans-serif`
      g.fillText(k.label, (k.x + k.w / 2) * s, (k.y + 0.46) * s)
    }
    g.fillStyle = '#d4211b'
    g.font = `800 italic ${Math.round(s * 0.42)}px Arial, sans-serif`
    g.fillText('REDRAGON', 16.25 * s, 3.85 * s)
  })
  const legendM = cached(`kumara-legend-m-${rgb}`, () => new THREE.MeshStandardMaterial({ map: legend, transparent: true, alphaTest: 0.25, emissive: '#ffffff', emissiveMap: legend, emissiveIntensity: rgb ? 0.8 : 0.1, roughness: 0.5 }))
  decal(P, 18.25 * U, 6.5 * U, legendM, ox + (18.25 * U) / 2, caseH + 0.003 + capH + 0.0004, oz + (6.5 * U) / 2, 0, -Math.PI / 2)
  return P.group
}

// ------------------------------------------------------------------ mouse Logitech G703

/** Altura do casco do G703 ao longo do comprimento (zn: -1 atrás … 1 na frente). */
const g703Top = (zn: number, H: number) => H * (0.5 + 0.5 * Math.exp(-(((zn + 0.2) / 0.62) ** 2)))

export function mouseG703({ w, h, d, color }: BuildParams) {
  const P = new Parts()
  // na mesa, os botões apontam para longe de quem usa: a frente do mouse fica em −z (o apoio da
  // palma em +z, do lado da pessoa); polegar à esquerda (−x)
  // sem uv/normal para fundir os polos e a costura (senão aparece um ponto claro no topo)
  const sphere = new THREE.SphereGeometry(1, 56, 36)
  sphere.deleteAttribute('normal')
  sphere.deleteAttribute('uv')
  const shell = mergeVertices(sphere)
  sphere.dispose()
  const pos = shell.attributes.position as THREE.BufferAttribute
  const base = 0.005
  const halfAt = (zn: number, left: boolean) => {
    let half = (w / 2) * (0.9 - 0.08 * zn)
    if (left) half *= 1 - 0.1 * Math.exp(-(((zn - 0.05) / 0.35) ** 2))
    return half
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const zn = pos.getZ(i)
    const top = g703Top(zn, h)
    pos.setXYZ(i, x * halfAt(zn, x < 0), y > 0 ? base + y * (top - base) : base + y * base, -zn * (d / 2))
  }
  shell.computeVertexNormals()
  P.mesh(shell, mat(color, { rough: 0.55, metal: 0.1 }))
  // roda de rolagem (com a faixa azul) e o botão de DPI logo atrás
  const wy = g703Top(0.48, h)
  const wz = -d * 0.24
  const wheel = P.cyl(0.0105, 0.0105, 0.0085, 0, wy - 0.0055, wz, mat('#1d1e20', { rough: 0.7 }), 24)
  wheel.rotation.z = Math.PI / 2
  const strip = P.cyl(0.0108, 0.0108, 0.0018, 0, wy - 0.0055, wz, glow('#3fc8ff', 1.6), 24)
  strip.rotation.z = Math.PI / 2
  P.boxB(0.006, 0.0025, 0.011, 0, g703Top(0.2, h) - 0.0015, -d * 0.08, mat('#2a2b2e', { rough: 0.4, metal: 0.4 }), 0.002)
  // botões laterais rente ao casco do lado do polegar
  for (const zn of [0.08, -0.28]) {
    const yb = h * 0.42
    const top = g703Top(zn, h)
    const yn = Math.min(0.95, (yb - base) / (top - base))
    // ponto da esfera original: x² + y² + z² = 1
    const xs = -halfAt(zn, true) * Math.sqrt(Math.max(0, 1 - yn * yn - zn * zn))
    const sb = P.boxB(0.003, 0.008, 0.021, xs + 0.0011, yb - 0.004, -zn * (d / 2), mat('#2a2b2e', { rough: 0.35, metal: 0.3 }), 0.0013)
    sb.rotation.z = -0.35
  }
  // "G" aceso no apoio da palma (do lado da pessoa), deitado na inclinação do casco
  const zl = -0.42
  const yl = g703Top(zl, h)
  const slope = (g703Top(zl + 0.02, h) - g703Top(zl - 0.02, h)) / (0.04 * (d / 2))
  const gTex = canvasTex('g703-logo', 128, 128, (g) => {
    g.clearRect(0, 0, 128, 128)
    g.strokeStyle = '#46d2ff'
    g.lineWidth = 18
    g.beginPath()
    // contorno do "G": abre em cima à direita e termina na barra do meio
    g.arc(64, 64, 40, -Math.PI * 0.24, Math.PI * 0.03, true)
    g.stroke()
    g.fillStyle = '#46d2ff'
    g.fillRect(64, 56, 46, 18)
  })
  const gM = cached('g703-logo-m', () => new THREE.MeshStandardMaterial({ map: gTex, transparent: true, alphaTest: 0.3, emissive: '#46d2ff', emissiveMap: gTex, emissiveIntensity: 1.3 }))
  // o casco desce em direção à pessoa (+z): o "G" acompanha essa inclinação, de pé para quem está sentado
  decal(P, 0.016, 0.016, gM, 0, yl + 0.0012, -zl * (d / 2), 0, -Math.PI / 2 + Math.atan(slope))
  return P.group
}

// ------------------------------------------------------------------ headset Corsair HS80

function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + r, -h / 2)
  s.lineTo(w / 2 - r, -h / 2)
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  s.lineTo(w / 2, h / 2 - r)
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  s.lineTo(-w / 2 + r, h / 2)
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  s.lineTo(-w / 2, -h / 2 + r)
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  return s
}

/** Placa arredondada (forma no plano y-z) com espessura ao longo de x, centrada em x. */
function roundedSlabX(P: Parts, wz: number, hy: number, r: number, t: number, x: number, y: number, z: number, m: THREE.Material) {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(wz, hy, r), { depth: t, bevelEnabled: true, bevelThickness: Math.min(0.004, t * 0.3), bevelSize: Math.min(0.004, r * 0.3), bevelSegments: 3, curveSegments: 10 })
  g.translate(0, 0, -t / 2)
  g.rotateY(Math.PI / 2)
  return P.mesh(g, m, x, y, z)
}

export function headsetHS80({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const stand = bool(options, 'stand', true)
  const metal = mat(shade(color, 0.12), { rough: 0.35, metal: 0.75 })
  const shell = mat(color, { rough: 0.5, metal: 0.25 })
  const fabric = M.fabric('#1b1c1e')
  const topY = stand ? h - 0.006 : h
  const R = Math.min(0.088, w / 2 - 0.012)
  const cupX = R
  const cupY = topY - R - 0.055
  // suporte (base, haste e apoio curvo)
  if (stand) {
    const br = Math.min(0.072, d / 2 - 0.002)
    P.cyl(br - 0.004, br, 0.012, 0, 0.006, 0, mat('#1a1b1d', { rough: 0.5, metal: 0.4 }), 40)
    P.cyl(0.008, 0.009, topY - 0.03, 0, 0.012 + (topY - 0.03) / 2, 0, mat('#2a2b2e', { rough: 0.4, metal: 0.6 }), 16)
    const saddle = P.mesh(new THREE.TorusGeometry(0.045, 0.007, 8, 20, Math.PI * 0.7), mat('#2a2b2e', { rough: 0.4, metal: 0.6 }), 0, topY - 0.052, 0)
    saddle.rotation.z = Math.PI * 0.15
  }
  // arco de metal e a cinta de suspensão (tecido)
  const band = P.mesh(new THREE.TorusGeometry(R, 0.006, 10, 40, Math.PI), metal, 0, cupY + 0.055, 0)
  band.scale.set(1, 1, 3.4)
  const strap = P.mesh(new THREE.TorusGeometry(R - 0.016, 0.004, 8, 40, Math.PI), fabric, 0, cupY + 0.05, 0)
  strap.scale.set(1, 0.92, 5)
  for (const sx of [-1, 1]) {
    // garfos em "Y" ligando o arco à concha
    for (const sz of [-1, 1]) {
      const fork = P.boxB(0.006, 0.05, 0.007, sx * cupX, cupY + 0.03, sz * 0.022, metal, 0.002)
      fork.rotation.x = -sz * 0.45
    }
    P.boxB(0.008, 0.02, 0.012, sx * cupX, cupY + 0.052, 0, metal, 0.003)
    // concha, almofada e o logo aceso
    roundedSlabX(P, 0.08, 0.09, 0.02, 0.026, sx * (cupX + 0.004), cupY, 0, shell)
    roundedSlabX(P, 0.086, 0.096, 0.024, 0.022, sx * (cupX - 0.02), cupY, 0, fabric)
    roundedSlabX(P, 0.056, 0.064, 0.014, 0.004, sx * (cupX + 0.02), cupY, 0, mat('#1a1b1d', { rough: 0.3, metal: 0.3 }))
    const sails = canvasTex('hs80-sails', 128, 128, (g) => {
      g.clearRect(0, 0, 128, 128)
      g.fillStyle = '#f2f2f2'
      for (let i = 0; i < 4; i++) {
        g.beginPath()
        g.moveTo(30 + i * 18, 96)
        g.quadraticCurveTo(44 + i * 18, 60 - i * 6, 40 + i * 20, 28 + i * 4)
        g.lineTo(48 + i * 20, 96)
        g.closePath()
        g.fill()
      }
    })
    const sM = cached('hs80-sails-m', () => new THREE.MeshStandardMaterial({ map: sails, transparent: true, alphaTest: 0.3, emissive: '#ffffff', emissiveMap: sails, emissiveIntensity: 0.9 }))
    decal(P, 0.022, 0.022, sM, sx * (cupX + 0.0245), cupY + 0.012, 0.01, (sx * Math.PI) / 2)
  }
  // microfone: sai da frente de baixo da concha esquerda, vem para a frente e para dentro (rumo à boca)
  const root = new THREE.Vector3(-cupX - 0.008, cupY - 0.028, 0.03)
  const dir = new THREE.Vector3(0.28, -0.3, 1).normalize()
  const len = 0.125
  const boom = P.cyl(0.0035, 0.0035, len, 0, 0, 0, mat('#1a1b1d', { rough: 0.4 }), 10)
  boom.position.copy(root).addScaledVector(dir, len / 2)
  boom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  const tip = P.cyl(0.0048, 0.0048, 0.014, 0, 0, 0, glow('#ff2a2a', 1.2), 12)
  tip.position.copy(root).addScaledVector(dir, len - 0.004)
  tip.quaternion.copy(boom.quaternion)
  void d
  return P.group
}

// ------------------------------------------------------------------ gabinete Aerocool Mirage com os componentes

/** Frente do Mirage: acrílico preto com a faixa vertical e os riscos RGB em leque (cor ou brilho). */
function mirageFrontTex(emissive: boolean) {
  return canvasTex(`mirage-front-${emissive}`, 256, 600, (g) => {
    g.fillStyle = emissive ? '#000' : '#08090a'
    g.fillRect(0, 0, 256, 600)
    if (!emissive) {
      const sh = g.createLinearGradient(0, 0, 256, 0)
      sh.addColorStop(0, 'rgba(255,255,255,0.05)')
      sh.addColorStop(0.5, 'rgba(255,255,255,0)')
      g.fillStyle = sh
      g.fillRect(0, 0, 256, 600)
    }
    g.lineCap = 'round'
    const strip = (x0: number, y0: number, x1: number, y1: number, c: string, wdt: number) => {
      g.strokeStyle = c
      g.lineWidth = wdt
      g.shadowColor = c
      g.shadowBlur = emissive ? 14 : 6
      g.beginPath()
      g.moveTo(x0, y0)
      g.lineTo(x1, y1)
      g.stroke()
    }
    strip(34, 40, 34, 470, hsl(310), 7)
    const cols = [350, 30, 60, 130, 190, 230]
    cols.forEach((hh, i) => strip(40 + i * 6, 70 + i * 26, 70 + i * 34, 430 + i * 22, hsl(hh), 6))
    g.shadowBlur = 0
  })
}

/** Placa-mãe MSI MPG B550 Gaming Plus: PCB preto com trilhas, serigrafia e slots desenhados. */
function boardTex() {
  return canvasTex('msi-b550-pcb', 488, 610, (g, W, H) => {
    g.fillStyle = '#0e0f11'
    g.fillRect(0, 0, W, H)
    const R = rng(11)
    g.strokeStyle = 'rgba(70,80,90,0.35)'
    g.lineWidth = 1
    for (let i = 0; i < 160; i++) {
      const x = R() * W
      const y = R() * H
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + (R() - 0.5) * 120, y)
      g.lineTo(x + (R() - 0.5) * 120, y + (R() - 0.5) * 90)
      g.stroke()
    }
    g.fillStyle = '#cfd2d6'
    g.font = '600 15px Arial, sans-serif'
    g.fillText('MPG B550 GAMING PLUS', 150, 395)
    g.font = '700 12px Arial, sans-serif'
    g.fillText('msi', 210, 375)
    // soquete AM4
    g.strokeStyle = '#8b9096'
    g.lineWidth = 2
    g.strokeRect(150, 120, 120, 120)
  })
}

function rgbBarTex() {
  return canvasTex('rgb-bar', 256, 16, (g) => {
    const gr = g.createLinearGradient(0, 0, 256, 0)
    ;[0, 60, 120, 180, 240, 300].forEach((hh, i) => gr.addColorStop(i / 5, hsl(hh)))
    g.fillStyle = gr
    g.fillRect(0, 0, 256, 16)
  })
}

function argbRingTex() {
  return canvasTex('argb-ring', 256, 256, (g) => {
    g.clearRect(0, 0, 256, 256)
    for (let a = 0; a < 360; a += 2) {
      g.strokeStyle = hsl(a)
      g.lineWidth = 14
      g.beginPath()
      g.arc(128, 128, 110, (a * Math.PI) / 180, ((a + 3) * Math.PI) / 180)
      g.stroke()
    }
  })
}

/**
 * Gabinete Aerocool Mirage (216 × 499 × 417,5 mm): vidro temperado na lateral esquerda (vista de
 * frente), frente de acrílico com o RGB em leque, topo de tela e fan ARGB traseiro; dentro, a placa-mãe
 * MSI B550 Gaming Plus, a RTX 5070 da MSI (Ventus 2X ou 3X), 2 pentes XPG Spectrix D35 e a fonte XPG
 * 750 W escondida na cobertura.
 */
export function pcMirage({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const shell = mat(color, { rough: 0.5, metal: 0.4 })
  const inner = mat(shade(color, -0.2), { rough: 0.7, metal: 0.2 })
  const glassLeft = str(options, 'glassSide', 'esquerda') !== 'direita'
  const gs = glassLeft ? -1 : 1 // lado do vidro (x local)
  const ft = 0.015
  corners((sx, sz) => P.cyl(0.018, 0.02, ft, sx * (w / 2 - 0.035), ft / 2, sz * (d / 2 - 0.05), mat('#0d0d0e', { rough: 0.6 }), 16))
  const y0 = ft
  const H = h - ft
  const t = 0.006
  // carcaça: lado oposto ao vidro, fundo, chão e teto
  P.boxB(t, H, d, -gs * (w / 2 - t / 2), y0, 0, shell)
  P.boxB(w, t, d, 0, y0, 0, shell)
  P.boxB(w, H, t, 0, y0, -d / 2 + t / 2, shell)
  const meshTex = canvasTex('mirage-mesh', 256, 256, (g) => {
    g.fillStyle = '#121315'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#050506'
    for (let y = 4; y < 256; y += 9) for (let x = 4 + ((y / 9) % 2) * 4.5; x < 256; x += 9) g.fillRect(x, y, 5, 5)
  })
  meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping
  meshTex.repeat.set(3, 6)
  const topM = cached('mirage-top', () => new THREE.MeshStandardMaterial({ map: meshTex, roughness: 0.7, metalness: 0.3 }))
  P.boxB(w, t, d, 0, y0 + H - t, 0, topM)
  // botões e USB no alto da frente
  const io = mat('#1b1c1f', { rough: 0.4, metal: 0.5 })
  P.cyl(0.008, 0.008, 0.003, gs * -0.04, h + 0.0015, d / 2 - 0.035, mat('#2c2e31', { rough: 0.3, metal: 0.6 }), 20)
  for (let i = 0; i < 3; i++) P.boxB(0.012, 0.002, 0.005, gs * (0.0 - i * 0.02) + gs * 0.02, h, d / 2 - 0.035, io)
  // frente com o RGB
  const frontM = cached('mirage-front', () => new THREE.MeshStandardMaterial({ map: mirageFrontTex(false), emissive: '#ffffff', emissiveMap: mirageFrontTex(true), emissiveIntensity: 1.2, roughness: 0.12, metalness: 0.3 }))
  const front = P.boxB(w, H, 0.016, 0, y0, d / 2 - 0.008, shell, 0.004)
  void front
  decal(P, w - 0.006, H - 0.012, frontM, 0, y0 + H / 2, d / 2 + 0.0004, 0)
  // vidro temperado
  P.boxB(0.004, H - 0.006, d - 0.012, gs * (w / 2 - 0.002), y0 + 0.003, 0, mat('#1e2226', { rough: 0.04, metal: 0.25, opacity: 0.28 }))
  // ---- dentro
  const wall = -gs * (w / 2 - t) // parede da placa-mãe
  const out = gs // para fora da placa (rumo ao vidro)
  const boardTop = y0 + H - 0.03
  const boardBack = -d / 2 + 0.018
  const bw = 0.244 // largura ATX (ao longo de z)
  const bh = 0.305 // altura ATX (ao longo de y)
  const bx = wall + out * 0.012
  const pcb = cached('msi-pcb', () => new THREE.MeshStandardMaterial({ map: boardTex(), roughness: 0.6, metalness: 0.2 }))
  P.boxB(0.002, bh, bw, bx, boardTop - bh, boardBack + bw / 2, mat('#0e0f11', { rough: 0.6 }))
  decal(P, bw, bh, pcb, bx + out * 0.0012, boardTop - bh / 2, boardBack + bw / 2, (out * Math.PI) / 2)
  const sink = mat('#1c1d20', { rough: 0.55, metal: 0.5 })
  // dissipadores dos VRMs (em cima e na traseira, com a tampa do painel traseiro) e do chipset
  P.boxB(0.026, 0.034, 0.11, bx + out * 0.014, boardTop - 0.05, boardBack + 0.12, sink, 0.004)
  P.boxB(0.034, 0.13, 0.04, bx + out * 0.018, boardTop - 0.15, boardBack + 0.025, sink, 0.004)
  const chip = P.boxB(0.012, 0.06, 0.07, bx + out * 0.007, boardTop - 0.255, boardBack + 0.19, sink, 0.004)
  chip.rotation.x = 0.18
  P.boxB(0.003, 0.06, 0.07, bx + out * 0.0005, boardTop - 0.258, boardBack + 0.19, glow('#8a3cff', 1.1))
  P.boxB(0.006, 0.02, 0.13, bx + out * 0.004, boardTop - 0.17, boardBack + 0.1, sink, 0.002)
  // slots PCIe
  P.boxB(0.008, 0.007, 0.09, bx + out * 0.005, boardTop - 0.155, boardBack + 0.09, mat('#c9ccd0', { rough: 0.3, metal: 0.8 }))
  P.boxB(0.008, 0.007, 0.09, bx + out * 0.005, boardTop - 0.235, boardBack + 0.09, mat('#2a2b2e', { rough: 0.5 }))
  // cooler do processador (box, redondo)
  const cpuY = boardTop - 0.085
  const cpuZ = boardBack + 0.105
  P.boxB(0.03, 0.075, 0.075, bx + out * 0.016, cpuY - 0.0375, cpuZ, mat('#2b2c2f', { rough: 0.5, metal: 0.4 }), 0.006)
  const cool = P.cyl(0.036, 0.036, 0.008, bx + out * 0.035, cpuY, cpuZ, mat('#141516', { rough: 0.5 }), 32)
  cool.rotation.z = Math.PI / 2
  // memórias XPG Spectrix D35 (2 pentes, slots 2 e 4) com a barra RGB
  const barM = cached('rgb-bar-m', () => new THREE.MeshStandardMaterial({ map: rgbBarTex(), emissive: '#ffffff', emissiveMap: rgbBarTex(), emissiveIntensity: 1.5, roughness: 0.4 }))
  for (const k of [1, 3]) {
    const z = boardBack + 0.172 + k * 0.0095
    P.boxB(0.009, 0.134, 0.006, bx + out * 0.006, cpuY - 0.067, z, mat('#2a2b2e', { rough: 0.5 }))
    P.boxB(0.038, 0.133, 0.0065, bx + out * 0.022, cpuY - 0.0665, z, mat('#17181a', { rough: 0.45, metal: 0.5 }), 0.0015)
    const bar = P.boxB(0.006, 0.13, 0.0068, bx + out * 0.043, cpuY - 0.065, z, barM)
    void bar
  }
  // placa de vídeo MSI RTX 5070 (deitada no slot de cima, ventoinhas para baixo)
  const v3 = str(options, 'gpu', 'ventus2x') === 'ventus3x'
  const gl = v3 ? 0.302 : 0.236
  const gpuH = v3 ? 0.121 : 0.126
  const gy = boardTop - 0.155
  const gx = bx + out * (0.008 + gpuH / 2)
  const gz = boardBack - 0.006 + gl / 2
  P.boxB(gpuH, 0.042, gl, gx, gy - 0.046, gz, mat('#2b2d31', { rough: 0.45, metal: 0.55 }), 0.006)
  P.boxB(gpuH - 0.006, 0.004, gl - 0.01, gx, gy - 0.004, gz, mat('#1a1b1e', { rough: 0.4, metal: 0.6 }))
  const fanN = v3 ? 3 : 2
  for (let i = 0; i < fanN; i++) {
    const fz = gz - gl / 2 + (gl / fanN) * (i + 0.5)
    const f = P.cyl(Math.min(0.045, gl / fanN / 2 - 0.006), Math.min(0.045, gl / fanN / 2 - 0.006), 0.004, gx, gy - 0.049, fz, mat('#0f1012', { rough: 0.6 }), 28)
    void f
  }
  const edgeTex = canvasTex('rtx-edge', 512, 64, (g) => {
    g.fillStyle = '#26282c'
    g.fillRect(0, 0, 512, 64)
    g.fillStyle = '#e6e6e6'
    g.font = '700 30px Arial, sans-serif'
    g.textBaseline = 'middle'
    g.fillText('GEFORCE RTX', 26, 33)
    g.fillStyle = '#c9ccd0'
    g.font = '600 22px Arial, sans-serif'
    g.fillText('MSI  VENTUS', 330, 33)
  })
  const edgeM = cached('rtx-edge-m', () => new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.45, metalness: 0.4 }))
  decal(P, gl * 0.9, 0.03, edgeM, gx + out * (gpuH / 2 + 0.0008), gy - 0.025, gz, (out * Math.PI) / 2)
  P.boxB(0.02, 0.12, 0.004, gx, gy - 0.1, -d / 2 + 0.008, mat('#9ca0a5', { rough: 0.35, metal: 0.8 }))
  // cobertura da fonte (XPG 750 W lá dentro)
  const shH = 0.09
  P.boxB(w - 2 * t - 0.004, shH, d - 0.03, 0, y0 + t, -0.007, inner, 0.003)
  P.boxB(0.15, 0.086, 0.14, -gs * 0.02, y0 + t + 0.002, -d / 2 + 0.08, mat('#151618', { rough: 0.5 }))
  // fan ARGB traseiro (120 mm)
  const ringM = cached('argb-ring-m', () => new THREE.MeshStandardMaterial({ map: argbRingTex(), transparent: true, alphaTest: 0.2, emissive: '#ffffff', emissiveMap: argbRingTex(), emissiveIntensity: 1.6, side: THREE.DoubleSide }))
  const fy = boardTop - 0.07
  const fzr = -d / 2 + t + 0.014
  P.boxB(0.12, 0.12, 0.025, -gs * 0.0, fy - 0.06, fzr, mat('#141517', { rough: 0.5 }), 0.008)
  decal(P, 0.118, 0.118, ringM, 0, fy, fzr + 0.0128, 0)
  P.cyl(0.02, 0.02, 0.003, 0, fy, fzr + 0.013, mat('#0c0c0d'), 20).rotation.x = Math.PI / 2
  void clamp
  void num
  return P.group
}
