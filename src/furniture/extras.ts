/**
 * Eletrodomésticos, informática e acessórios (micro-ondas, airfryer, cooktop de indução, forno,
 * PC gamer, monitor, periféricos, acessórios de banheiro, pias sem armário, nicho e porta pano de prato).
 * Mesma convenção dos outros modelos: origem no centro da base, largura em X, altura em Y,
 * profundidade em Z, frente = +Z (a traseira, −Z, encosta na parede).
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { OptionValue } from '../lib/types'
import { clamp } from '../lib/util'
import { ARM_BACK, ARM_FRONT, ARM_L1, ARM_L2, monitorPanel, slotsFrom } from '../lib/arms'
import { auto, bool, corners, num, str, type BuildParams } from './builders'
import { M, mat, Parts, sbox, shade, type Solid } from './parts'
import { pcMirage } from './setup'
import { kitchenArtKAF16A } from './kitchenart'
import { carvedVanity } from './bathroom'

const glow = (c: string, k = 0.9) => mat(shade(c, -0.6), { emissive: c, emissiveIntensity: k, rough: 0.4 })
const finish = (c: string) => mat(c, { rough: 0.22, metal: 0.85 })
const isDark = (c: string) => new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }).l < 0.45

/** Junta várias caixas pequenas (teclas, grelhas) numa malha só. */
function mergedBoxes(list: [number, number, number, number, number, number][]) {
  const geos = list.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z))
  const g = mergeGeometries(geos)
  geos.forEach((x) => x.dispose())
  return g
}

// ---------------- Cozinha ----------------

/** Micro-ondas de bancada ou de embutir (com moldura). */
let mideaPanelTex: THREE.CanvasTexture | null = null
let mideaLogoTex: THREE.CanvasTexture | null = null
const mideaMats: Record<string, THREE.Material> = {}

/** Painel de toque do Midea espelhado (coordenadas do recorte da foto: 247 × 950). */
function mideaPanelTexture() {
  if (mideaPanelTex) return mideaPanelTex
  const W = 420
  const H = Math.round((W * 950) / 247)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#45474a')
  bg.addColorStop(1, '#3a3c3f')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  g.scale(W / 247, H / 950)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const txt = (s: string, x: number, y: number, size: number, color = '#e8e8e8', weight = 500) => {
    g.fillStyle = color
    g.font = `${weight} ${size}px Arial, Helvetica, sans-serif`
    g.fillText(s, x, y)
  }
  // visor
  g.fillStyle = '#323437'
  g.beginPath()
  g.roundRect(35, 88, 137, 45, 3)
  g.fill()
  txt('0:00', 117, 112, 42, '#ffffff', 700)
  txt('POTÊNCIA', 200, 96, 7, '#bfc1c4', 400)
  txt('PESO (g)', 197, 126, 7, '#bfc1c4', 400)
  // seções
  const section = (label: string, x: number, y: number, lineY: number, blue = false) => {
    g.textAlign = 'left'
    txt(label, x, y, 8, '#c9cbce', 400)
    g.textAlign = 'center'
    g.fillStyle = '#6b6e72'
    g.fillRect(19, lineY, 211, 1)
    if (blue) {
      g.fillStyle = '#29a9d6'
      g.fillRect(19, lineY - 0.5, 50, 2)
    }
  }
  section('RECEITAS', 19, 166, 176, true)
  const rows: [number, string[]][] = [
    [209, ['ARROZ', 'PIPOCA', 'LASANHA']],
    [262, ['BRIGADEIRO', 'BOLO|CANECA', 'PUDIM']],
    [365, ['MASTER|COOK', 'BABY|CARE', 'MANTER|AQUECIDO']],
    [417, ['RELÓGIO', 'SILÊNCIO', 'LIMPAR']],
    [509, ['CARNE', 'FRANGO', 'FEIJÃO']],
  ]
  section('FUNÇÕES', 19, 316, 325)
  section('DESCONGELAR', 19, 466, 474)
  for (const [y, labels] of rows)
    labels.forEach((l, i) => {
      const x = 54 + i * 70
      const parts = l.split('|')
      if (parts.length === 1) txt(l, x, y, 10)
      else parts.forEach((p, k) => txt(p, x, y - 7 + k * 14, 10))
    })
  // atalhos de tempo
  g.fillStyle = '#4b4e52'
  g.beginPath()
  g.roundRect(20, 555, 210, 51, 4)
  g.fill()
  ;[['5', 'MINUTOS'], ['1', 'MINUTO'], ['10', 'SEGUNDOS']].forEach(([n, l], i) => {
    txt(n, 55 + i * 70, 573, 25, '#f2f2f2', 400)
    txt(l, 55 + i * 70, 596, 6, '#bfc1c4', 400)
  })
  txt('—', 56, 645, 18, '#e8e8e8', 300)
  txt('+', 197, 644, 26, '#e8e8e8', 300)
  txt('POTÊNCIA', 127, 640, 10, '#d8d8d8', 400)
  txt('TEMPO | PESO', 127, 654, 7, '#bfc1c4', 400)
  // iniciar: anel com arco azul
  g.lineWidth = 3
  g.strokeStyle = '#55585c'
  g.beginPath()
  g.arc(128, 744, 57, 0, Math.PI * 2)
  g.stroke()
  g.strokeStyle = '#29a9d6'
  g.lineWidth = 3.5
  g.beginPath()
  g.arc(128, 744, 57, Math.PI * 0.55, Math.PI * 1.45)
  g.stroke()
  txt('INICIAR', 128, 736, 14, '#ffffff', 700)
  txt('+ 30 seg.', 128, 754, 10, '#bfc1c4', 400)
  txt('CANCELAR', 128, 851, 14, '#ffffff', 700)
  txt('PAUSAR | ECO', 128, 874, 10, '#bfc1c4', 400)
  mideaPanelTex = new THREE.CanvasTexture(c)
  mideaPanelTex.colorSpace = THREE.SRGBColorSpace
  mideaPanelTex.anisotropy = 8
  return mideaPanelTex
}

function mideaLogoTexture() {
  if (mideaLogoTex) return mideaLogoTex
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 512, 128)
  g.fillStyle = '#d3d5d8'
  g.strokeStyle = '#d3d5d8'
  g.font = '500 92px Arial, Helvetica, sans-serif'
  g.textBaseline = 'middle'
  g.fillText('Midea', 118, 70)
  // o "círculo" do logo em volta do M
  g.lineWidth = 7
  g.beginPath()
  g.arc(140, 66, 48, Math.PI * 0.35, Math.PI * 1.75)
  g.stroke()
  mideaLogoTex = new THREE.CanvasTexture(c)
  mideaLogoTex.colorSpace = THREE.SRGBColorSpace
  return mideaLogoTex
}

/**
 * Micro-ondas Midea espelhado: corpo grafite, porta espelhada com o logo, painel de toque à direita,
 * rebaixo de abertura embaixo da porta e pés redondos. Proporções tiradas da foto do produto.
 */
function mideaMicrowave(P: Parts, w: number, h: number, d: number, color: string) {
  const body = mat(color, { rough: 0.45, metal: 0.35 })
  const dark = mat(shade(color, -0.35), { rough: 0.5, metal: 0.3 })
  mideaMats.mirror ??= new THREE.MeshStandardMaterial({ color: '#a0a3a7', metalness: 0.95, roughness: 0.13 })
  mideaMats.panel ??= new THREE.MeshStandardMaterial({ map: mideaPanelTexture(), roughness: 0.25, metalness: 0.15 })
  mideaMats.logo ??= new THREE.MeshStandardMaterial({ map: mideaLogoTexture(), transparent: true, alphaTest: 0.2, roughness: 0.4, metalness: 0.3 })
  const feet = h * 0.065
  const bh = h - feet
  // pés redondos (os dois da frente aparecem) e a base central
  for (const fx of [-0.345, 0.355]) for (const fz of [d / 2 - 0.06, -d / 2 + 0.06]) P.cyl(0.011, 0.012, feet, fx * w, feet / 2, fz, dark, 16)
  P.boxB(w * 0.19, feet * 0.5, 0.06, -w * 0.07, feet * 0.5, d / 2 - 0.08, dark)
  P.boxB(w, bh, d - 0.02, 0, feet, -0.01, body, 0.014)
  const fz = d / 2 - 0.02
  // frente: porta (86%) e painel (13%) em cima do rebaixo de baixo (11% da altura)
  const lipH = bh * 0.11
  const top = feet + bh - bh * 0.007
  const y0 = feet + lipH
  const fh = top - y0
  const mx = w * 0.003
  const doorW = w * 0.861
  const panelW = w * 0.132
  const dx0 = -w / 2 + mx
  // rebaixo (puxador embaixo da porta): face inclinada, mais escura
  const lip = P.boxB(doorW, lipH * 0.9, 0.03, dx0 + doorW / 2, feet + lipH * 0.05, fz - 0.006, dark)
  lip.rotation.x = -0.35
  const lip2 = P.boxB(panelW, lipH * 0.9, 0.03, w / 2 - mx - panelW / 2, feet + lipH * 0.05, fz - 0.006, dark)
  lip2.rotation.x = -0.35
  // porta espelhada e o logo
  P.boxB(doorW, fh, 0.02, dx0 + doorW / 2, y0, fz + 0.008, mideaMats.mirror, 0.004)
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.095, w * 0.024), mideaMats.logo)
  logo.position.set(-w / 2 + w * 0.41, y0 + fh * 0.08, fz + 0.0185)
  P.group.add(logo)
  // painel de toque
  P.boxB(panelW, fh, 0.016, w / 2 - mx - panelW / 2, y0, fz + 0.006, body, 0.003)
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW - 0.002, fh - 0.002), mideaMats.panel)
  panel.position.set(w / 2 - mx - panelW / 2, y0 + fh / 2, fz + 0.0142)
  P.group.add(panel)
  return P.group
}

export function microwave({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  if (str(options, 'model', 'generico') === 'midea-espelhado' && str(options, 'mount', 'bancada') === 'bancada') return mideaMicrowave(P, w, h, d, color)
  const body = mat(color, { rough: 0.35, metal: 0.45 })
  const builtIn = str(options, 'mount', 'bancada') === 'embutir'
  const feet = builtIn ? 0 : Math.min(0.012, h * 0.05)
  if (feet) corners((sx, sz) => P.boxB(0.03, feet, 0.03, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.05), mat('#1b1c1e')))
  const bh = h - feet
  const fz = d / 2 - 0.018
  P.boxB(w, bh, d - 0.018, 0, feet, -0.009, body, 0.01)
  const trim = builtIn ? Math.min(0.03, w * 0.05) : 0.006
  // moldura de embutir: placa frontal em volta
  if (builtIn) P.boxB(w, bh, 0.006, 0, feet, fz + 0.003, mat(shade(color, -0.25), { rough: 0.35, metal: 0.5 }))
  const zf = builtIn ? fz + 0.006 : fz
  const inner = w - 2 * trim
  const panelW = Math.min(0.13, inner * 0.25)
  const doorW = inner - panelW - 0.004
  const dh = bh - 2 * trim
  const x0 = -w / 2 + trim
  const y0 = feet + trim
  P.boxB(doorW, dh, 0.012, x0 + doorW / 2, y0, zf + 0.006, mat(color2, { rough: 0.18, metal: 0.25 }), 0.006)
  P.boxB(doorW * 0.74, dh * 0.62, 0.003, x0 + doorW * 0.45, y0 + dh * 0.19, zf + 0.0125, M.screen())
  P.boxB(0.014, dh * 0.62, 0.012, x0 + doorW - 0.024, y0 + dh * 0.19, zf + 0.018, mat(shade(color2, 0.35), { rough: 0.3, metal: 0.7 }), 0.005)
  // painel de comando: visor e teclas
  const px = x0 + doorW + 0.004 + panelW / 2
  P.boxB(panelW, dh, 0.01, px, y0, zf + 0.005, mat(shade(color2, 0.1), { rough: 0.3, metal: 0.3 }), 0.004)
  P.boxB(panelW * 0.72, Math.min(0.03, dh * 0.12), 0.003, px, y0 + dh * 0.8, zf + 0.0115, glow('#39d98a', 0.7))
  const bw = panelW * 0.22
  const keys: [number, number, number, number, number, number][] = []
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) keys.push([bw, bw * 0.6, 0.004, px + (c - 1) * bw * 1.35, y0 + dh * (0.64 - r * 0.11), zf + 0.0115])
  P.mesh(mergedBoxes(keys), mat('#4a4d52', { rough: 0.5 }))
  // ventilação na lateral
  if (!builtIn) for (let i = 0; i < 6; i++) P.boxB(0.002, 0.005, d * 0.35, w / 2 + 0.001, feet + bh * 0.55 + i * 0.012, -d * 0.1, mat('#2a2b2e'))
  return P.group
}

/** Espessura do monitor portátil (Arzopa Z3FC: 9,3 mm). */
export const PORTABLE_T = 0.0093

/**
 * Geometria do monitor portátil apoiado no descanso: o painel (pw × ph) fica na borda de baixo,
 * inclinado `tilt` para trás; o descanso, preso na traseira a 60% da altura, desce até a mesa.
 * Devolve a altura e a profundidade ocupadas e os dados do descanso.
 */
export function portableGeom(pw: number, ph: number, tiltDeg: number) {
  const th = (clamp(tiltDeg, 3, 40) * Math.PI) / 180
  const t = PORTABLE_T
  const s = ph * 0.6
  const yh = s * Math.cos(th) - t * Math.sin(th)
  const zh = -(s * Math.sin(th) + t * Math.cos(th))
  const L = Math.max(ph * 0.62, yh + 0.002)
  const alpha = Math.acos(clamp(yh / L, -1, 1))
  const height = ph * Math.cos(th) + t * Math.sin(th)
  const depth = -(zh - L * Math.sin(alpha)) + 0.012
  return { th, t, s, yh, zh, L, alpha, height, depth, pw }
}

/**
 * Monitor portátil (ex.: Arzopa Z3FC 16,1", 366 × 228 × 9,3 mm, alumínio cinza): placa fina com a tela
 * na frente, apoiada na borda de baixo e inclinada pelo descanso embutido na traseira (abre até 80°).
 * Na vertical, o painel gira e o queixo da tela vai para o lado.
 */
export function portableMonitor({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const vertical = str(options, 'orientation', 'horizontal') === 'vertical'
  const tilt = num(options, 'tilt', 15)
  // altura do painel a partir da altura do item (que já considera a inclinação)
  const g0 = portableGeom(w, 1, tilt)
  const ph = Math.max(0.05, (h - PORTABLE_T * Math.sin(g0.th)) / Math.cos(g0.th))
  const g = portableGeom(w, ph, tilt)
  const t = g.t
  const alu = mat(color, { rough: 0.35, metal: 0.6 })
  const glass = mat('#0b0c0e', { rough: 0.08, metal: 0.2 })
  const z0 = d / 2 - 0.006
  // painel (pivô na borda de baixo da frente), deitado para trás
  const panel = new Parts()
  panel.boxB(w, ph, t, 0, 0, -t / 2, alu, Math.min(0.0035, t * 0.4))
  panel.boxB(w - 0.002, ph - 0.002, 0.0012, 0, 0.001, 0.0004, glass)
  // tela: bordas finas e o "queixo" maior embaixo (ou do lado, na vertical)
  const [l, r, b, tp] = vertical ? [0.018, 0.0045, 0.0045, 0.0045] : [0.0045, 0.0045, 0.018, 0.007]
  panel.boxB(w - l - r, ph - b - tp, 0.0008, (l - r) / 2, b, 0.0014, M.screen())
  panel.group.position.set(0, 0, z0)
  panel.group.rotation.x = -g.th
  P.group.add(panel.group)
  // descanso: placa fina presa na traseira, aberta até tocar a mesa
  const kw = vertical ? w * 0.7 : w * 0.5
  const stand = new Parts()
  stand.boxB(kw, g.L, 0.0035, 0, -g.L, -0.00175, alu, 0.0015)
  stand.boxB(kw * 0.92, 0.004, 0.006, 0, -g.L, -0.003, mat('#2a2b2e', { rough: 0.8 }))
  stand.group.position.set(0, g.yh, z0 + g.zh)
  stand.group.rotation.x = g.alpha
  P.group.add(stand.group)
  // dobradiça do descanso
  const hinge = P.cyl(0.003, 0.003, kw, 0, g.yh, z0 + g.zh, mat(shade(color, -0.15), { rough: 0.35, metal: 0.6 }), 10)
  hinge.rotation.z = Math.PI / 2
  return P.group
}

/** Airfryer de cesto (gaveta) ou tipo forno (porta de vidro). */
export function airfryer({ w, h, d, color, color2, options }: BuildParams) {
  if (str(options, 'style', 'cesto') === 'kaf16a') return kitchenArtKAF16A({ w, h, d, color, color2, options } as BuildParams)
  const P = new Parts()
  const body = mat(color, { rough: 0.35, metal: 0.1 })
  const dark = mat('#141517', { rough: 0.15, metal: 0.2 })
  if (str(options, 'style', 'cesto') === 'forno') {
    const ft = 0.012
    corners((sx, sz) => P.boxB(0.025, ft, 0.025, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.04), mat('#111214')))
    P.boxB(w, h - ft, d - 0.012, 0, ft, -0.006, body, 0.015)
    const fz = d / 2 - 0.012
    const dw = w * 0.9
    const dh = (h - ft) * 0.62
    P.boxB(dw, dh, 0.01, 0, ft + 0.02, fz + 0.005, mat(shade(color, 0.08), { rough: 0.3 }), 0.008)
    P.boxB(dw * 0.82, dh * 0.74, 0.003, 0, ft + 0.02 + dh * 0.1, fz + 0.0105, mat('#1a1b1e', { rough: 0.06, metal: 0.3 }))
    const bar = P.cyl(0.006, 0.006, dw * 0.7, 0, ft + 0.02 + dh - 0.025, fz + 0.028, M.chrome(), 10)
    bar.rotation.z = Math.PI / 2
    for (const sx of [-1, 1]) P.boxB(0.01, 0.01, 0.02, sx * dw * 0.3, ft + 0.02 + dh - 0.03, fz + 0.017, M.chrome())
    const ph = (h - ft) * 0.26
    P.boxB(dw, ph, 0.006, 0, h - ph - 0.012, fz + 0.003, dark, 0.006)
    P.boxB(dw * 0.3, ph * 0.4, 0.002, 0, h - ph * 0.7 - 0.012, fz + 0.007, glow('#ff8a3d'))
    return P.group
  }
  const r = Math.min(w, d, h) * 0.18
  P.boxB(w * 0.88, 0.01, d * 0.88, 0, 0, 0, mat('#101113'), 0.02)
  P.boxB(w, h - 0.01, d - 0.05, 0, 0.01, -0.025, body, r)
  // gaveta (cesto) saliente na frente, com friso escuro e puxador
  const gw = w * 0.86
  const gh = h * 0.48
  const gz = d / 2 - 0.05
  P.boxB(gw + 0.006, gh + 0.006, 0.02, 0, 0.027, gz + 0.008, mat('#0d0e10'), Math.min(0.03, gh * 0.2))
  P.boxB(gw, gh, 0.03, 0, 0.03, gz + 0.02, mat(color2, { rough: 0.28 }), Math.min(0.03, gh * 0.2))
  P.boxB(0.04, 0.034, 0.05, 0, 0.03 + gh * 0.52, d / 2 - 0.02, mat(shade(color2, -0.35), { rough: 0.4 }), 0.012)
  // painel de vidro no topo com visor
  P.boxB(w * 0.62, 0.004, d * 0.42, 0, h - 0.004, d * 0.08, dark, 0.008)
  P.boxB(w * 0.22, 0.002, d * 0.09, 0, h - 0.001, d * 0.1, glow('#ff8a3d'))
  for (let i = 0; i < 5; i++) P.boxB(w * 0.5, 0.004, 0.004, 0, h * 0.5 + i * 0.022, -d / 2 + 0.001, dark)
  return P.group
}

/** Posições das zonas de um cooktop (x, z do centro e raio), centradas em (0, 0). */
function zoneLayout(n: number, w: number, d: number) {
  const narrow = w < 0.42
  let pts: [number, number, number][]
  if (n <= 1) pts = [[0, 0, 1]]
  else if (n === 2) pts = narrow ? [[0, -0.24, 0.9], [0, 0.22, 1]] : [[-0.25, 0, 1], [0.25, 0, 1]]
  else if (n === 3) pts = narrow ? [[0, -0.32, 0.75], [0, 0, 0.75], [0, 0.32, 0.75]] : [[-0.24, 0, 1.15], [0.26, -0.24, 0.8], [0.26, 0.24, 0.8]]
  else if (n === 4) pts = [[-0.25, -0.22, 0.9], [0.25, -0.22, 0.8], [-0.25, 0.22, 0.8], [0.25, 0.22, 1]]
  else pts = [[-0.34, -0.22, 0.8], [0.34, -0.22, 0.8], [-0.34, 0.22, 0.8], [0.34, 0.22, 0.8], [0, 0, 1.1]]
  const cols = n <= 1 || narrow ? 1 : n >= 5 ? 3 : 2
  const rows = n <= 1 ? 1 : narrow ? n : 2
  const base = Math.min(w / cols, d / rows) * 0.36
  return pts.map(([fx, fz, k]) => ({ x: fx * w, z: fz * d, r: base * k }))
}

/** Marcações de um vidro de indução (anéis das zonas + comandos de toque), no topo y. */
export function inductionMarks(P: Parts, w: number, d: number, y: number, n: number) {
  const ctrl = d > 0.3 ? Math.min(0.08, d * 0.16) : 0
  const zones = zoneLayout(n, w - 0.04, d - ctrl - 0.04)
  const geos: THREE.BufferGeometry[] = []
  for (const z of zones)
    for (const k of [1, 0.6]) {
      const g = new THREE.TorusGeometry(z.r * k, 0.0016, 4, 64)
      g.rotateX(Math.PI / 2)
      g.translate(z.x, y + 0.0006, z.z - ctrl / 2)
      geos.push(g)
    }
  P.mesh(mergeGeometries(geos), mat('#7a7f88', { rough: 0.6 }))
  geos.forEach((g) => g.dispose())
  if (!ctrl) return
  const zc = d / 2 - ctrl / 2 - 0.004
  const sym = mat('#c9ced6', { rough: 0.5 })
  const k = n + 1
  for (let i = 0; i < k; i++) {
    const x = -w * 0.3 + (i * w * 0.6) / (k - 1)
    P.cyl(0.0065, 0.0065, 0.0012, x, y + 0.0006, zc + 0.01, i === k - 1 ? glow('#ff3b30') : sym, 16)
  }
  if (w > 0.4) P.boxB(Math.min(0.16, w * 0.3), 0.0012, 0.005, 0, y, zc - 0.014, sym)
}

/** Cooktop de indução (vidro sobre a bancada) ou fogão de indução portátil. */
let dakoTex: THREE.CanvasTexture | null = null
let dakoTop: THREE.MeshStandardMaterial | null = null
/**
 * Vidro do cooktop de indução Dako Supreme (4 zonas, 59 × 52 cm): zonas marcadas por cruzes com o
 * canto de fora arredondado, "T" (turbo) em duas zonas, logo, "SUPREME", filete vermelho e o painel
 * de toque com os dígitos vermelhos. Desenhado em coordenadas de 1090 × 960 (proporção do vidro).
 */
function dakoSupremeTexture() {
  if (dakoTex) return dakoTex
  const W = 1600
  const H = Math.round((W * 960) / 1090)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#0a0a0b'
  g.fillRect(0, 0, W, H)
  g.scale(W / 1090, H / 960)
  const line = '#8d8d8f'
  const red = '#e5352b'
  g.lineCap = 'round'
  // zonas: cruzes; os dois braços do lado do canto do vidro se juntam numa curva
  const r0 = 36
  const r1 = 168
  const rr = 32
  for (const [cx, cy, ox, oy] of [
    [232, 224, -1, -1],
    [860, 224, 1, -1],
    [232, 705, -1, 1],
    [860, 705, 1, 1],
  ]) {
    g.strokeStyle = line
    g.lineWidth = 1.6
    g.beginPath()
    g.moveTo(cx, cy + oy * r1)
    g.lineTo(cx, cy + oy * rr)
    g.arcTo(cx, cy, cx + ox * rr, cy, rr)
    g.lineTo(cx + ox * r1, cy)
    g.stroke()
    g.beginPath()
    g.moveTo(cx - ox * r0, cy)
    g.lineTo(cx - ox * (r1 - 30), cy)
    g.moveTo(cx, cy - oy * r0)
    g.lineTo(cx, cy - oy * (r1 - 30))
    g.stroke()
  }
  // turbo
  g.fillStyle = red
  g.font = '500 17px Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('T', 856, 230)
  g.fillText('T', 234, 699)
  // logo
  g.fillStyle = '#9a9b9e'
  g.font = '800 30px Arial, Helvetica, sans-serif'
  g.fillText('DAKO', 543, 702)
  g.strokeStyle = '#9a9b9e'
  g.lineWidth = 3
  g.beginPath()
  g.ellipse(543, 706, 36, 16, 0, Math.PI * 0.18, Math.PI * 0.82)
  g.stroke()
  // SUPREME e filete
  g.fillStyle = '#b7b8bb'
  g.font = '400 15px Arial, sans-serif'
  const word = 'SUPREME'
  for (let i = 0; i < word.length; i++) g.fillText(word[i], 494 + i * 17.5, 807)
  g.strokeStyle = '#c0392b'
  g.lineWidth = 1.4
  g.beginPath()
  g.moveTo(403, 824)
  g.lineTo(685, 824)
  g.stroke()
  // painel de toque
  const icon = (x: number, y: number) => {
    g.strokeStyle = '#d6d6d8'
    g.lineWidth = 1.4
    g.beginPath()
    g.moveTo(x - 8, y - 7)
    g.lineTo(x - 8, y + 6)
    g.lineTo(x + 8, y + 6)
    g.lineTo(x + 8, y - 7)
    g.stroke()
    g.beginPath()
    g.arc(x - 3, y - 3, 1.8, 0, Math.PI * 2)
    g.stroke()
  }
  const ring = (x: number, y: number, draw: () => void) => {
    g.strokeStyle = '#d6d6d8'
    g.lineWidth = 1.4
    g.beginPath()
    g.arc(x, y, 10, 0, Math.PI * 2)
    g.stroke()
    draw()
  }
  icon(445, 852)
  icon(642, 852)
  icon(445, 888)
  icon(642, 888)
  g.fillStyle = red
  g.font = 'italic 700 25px "Courier New", monospace'
  g.fillText('2', 477, 854)
  g.fillText('50', 543, 854)
  g.fillText('6', 609, 854)
  g.fillText('5', 477, 890)
  g.fillText('H', 609, 890)
  ring(413, 889, () => {
    g.fillStyle = red
    g.font = '500 13px Arial, sans-serif'
    g.fillText('T', 413, 890)
  })
  ring(511, 889, () => {
    g.beginPath()
    g.moveTo(505, 889)
    g.lineTo(517, 889)
    g.stroke()
  })
  ring(545, 889, () => {
    g.beginPath()
    g.arc(545, 889, 5, 0, Math.PI * 2)
    g.moveTo(545, 889)
    g.lineTo(548, 885)
    g.stroke()
  })
  ring(577, 889, () => {
    g.beginPath()
    g.moveTo(571, 889)
    g.lineTo(583, 889)
    g.moveTo(577, 883)
    g.lineTo(577, 895)
    g.stroke()
  })
  ring(676, 889, () => {
    g.strokeStyle = red
    g.beginPath()
    g.moveTo(676, 883)
    g.lineTo(676, 895)
    g.stroke()
  })
  g.fillStyle = '#bdbdc0'
  g.font = '400 7px Arial, sans-serif'
  g.fillText('TURBO', 413, 907)
  g.fillText('TIMER', 545, 875)
  g.fillText('TRAVA', 545, 918)
  g.beginPath()
  g.strokeStyle = '#bdbdc0'
  g.lineWidth = 1
  g.moveTo(512, 902)
  g.lineTo(530, 908)
  g.moveTo(578, 902)
  g.lineTo(560, 908)
  g.stroke()
  dakoTex = new THREE.CanvasTexture(c)
  dakoTex.colorSpace = THREE.SRGBColorSpace
  dakoTex.anisotropy = 8
  return dakoTex
}

export function cooktop({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const portable = bool(options, 'portable', false)
  if (!portable && str(options, 'model', 'generico') === 'dako-supreme') {
    // vidro com a arte do modelo na face de cima
    P.boxB(w, h * 0.5, d, 0, 0, 0, finish('#9ea3a8'), 0.002)
    const edge = mat('#0c0d0f', { rough: 0.1, metal: 0.35 })
    // vidro preto: reflexo do ambiente baixo para não acinzentar (material único, reaproveitado)
    dakoTop ??= new THREE.MeshStandardMaterial({ map: dakoSupremeTexture(), roughness: 0.1, metalness: 0.05, envMapIntensity: 0.45 })
    const top = dakoTop
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 0.004, h, d - 0.004), [edge, edge, top, edge, edge, edge])
    glass.position.set(0, h / 2, 0)
    glass.castShadow = glass.receiveShadow = true
    P.group.add(glass)
    return P.group
  }
  const n = auto(options, 'zones', w > 0.7 ? 5 : w > 0.45 ? 4 : portable ? 1 : 2)
  const gt = portable ? Math.min(0.006, h * 0.3) : h
  if (portable) {
    P.boxB(w, h - gt, d, 0, 0, 0, mat(color, { rough: 0.45 }), 0.01)
    P.boxB(w * 0.5, 0.004, 0.004, 0, (h - gt) * 0.5, d / 2 + 0.001, mat('#2a2b2e'))
  } else P.boxB(w, gt * 0.5, d, 0, 0, 0, finish('#9ea3a8'), 0.002)
  P.boxB(portable ? w - 0.01 : w - 0.004, gt, portable ? d - 0.01 : d - 0.004, 0, h - gt, 0, mat('#0c0d0f', { rough: 0.1, metal: 0.35 }), 0.002)
  inductionMarks(P, w, d, h, n)
  return P.group
}

/** Forno de embutir (60 cm) ou forno elétrico de bancada. */
export function oven({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const body = mat(color, { rough: 0.35, metal: 0.5 })
  const knob = (x: number, y: number, z: number, r = 0.016) => {
    const k = P.cyl(r, r * 1.05, 0.018, x, y, z, mat('#1c1d20', { rough: 0.35, metal: 0.4 }), 18)
    k.rotation.x = Math.PI / 2
    P.boxB(0.003, r * 0.8, 0.002, x, y, z + 0.01, mat('#e8e8e8'))
  }
  if (str(options, 'style', 'embutir') === 'bancada') {
    const ft = 0.015
    corners((sx, sz) => P.boxB(0.03, ft, 0.03, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.05), mat('#111214')))
    const bh = h - ft
    const fz = d / 2
    P.boxB(w, bh, d - 0.012, 0, ft, -0.006, body, 0.012)
    const cw = Math.min(0.12, w * 0.24)
    const dw = w - cw - 0.02
    const x0 = -w / 2 + 0.01
    P.boxB(dw, bh - 0.03, 0.012, x0 + dw / 2, ft + 0.015, fz - 0.006, mat(shade(color, 0.06), { rough: 0.3, metal: 0.4 }), 0.006)
    P.boxB(dw * 0.84, (bh - 0.03) * 0.6, 0.003, x0 + dw / 2, ft + 0.015 + (bh - 0.03) * 0.14, fz + 0.001, mat('#141518', { rough: 0.06, metal: 0.3 }))
    const bar = P.cyl(0.006, 0.006, dw * 0.7, x0 + dw / 2, ft + bh - 0.05, fz + 0.022, M.chrome(), 10)
    bar.rotation.z = Math.PI / 2
    for (const sx of [-1, 1]) P.boxB(0.01, 0.01, 0.022, x0 + dw / 2 + sx * dw * 0.3, ft + bh - 0.055, fz + 0.006, M.chrome())
    const cx = w / 2 - 0.01 - cw / 2
    P.boxB(cw, bh - 0.03, 0.006, cx, ft + 0.015, fz - 0.003, mat('#1d1e21', { rough: 0.4 }))
    for (let i = 0; i < 3; i++) knob(cx, ft + bh * (0.76 - i * 0.24), fz + 0.009, Math.min(0.016, cw * 0.18))
    return P.group
  }
  const strip = Math.min(0.1, h * 0.17)
  const fz = d / 2 - 0.025
  P.boxB(w, h, d - 0.05, 0, 0, -0.025, mat('#2a2c30', { rough: 0.6 }))
  P.boxB(w, strip, 0.02, 0, h - strip, fz - 0.01, body, 0.004)
  P.boxB(w * 0.18, strip * 0.35, 0.003, 0, h - strip * 0.67, fz + 0.001, glow('#ffb347', 0.8))
  for (const fx of [-0.36, -0.22, 0.22, 0.36]) knob(fx * w, h - strip / 2, fz + 0.009)
  const dh = h - strip - 0.006
  P.boxB(w - 0.006, dh, 0.025, 0, 0.003, fz - 0.0125, mat(color2, { rough: 0.12, metal: 0.3 }), 0.004)
  P.boxB(w * 0.7, dh * 0.5, 0.002, 0, dh * 0.22, fz + 0.0005, mat(shade(color2, -0.5), { rough: 0.05 }))
  const bar = P.cyl(0.009, 0.009, w * 0.78, 0, dh - 0.04, fz + 0.038, M.chrome(), 12)
  bar.rotation.z = Math.PI / 2
  for (const sx of [-1, 1]) P.boxB(0.014, 0.014, 0.034, sx * w * 0.33, dh - 0.047, fz + 0.017, M.chrome())
  return P.group
}

// ---------------- Informática ----------------

/** Gabinete de PC gamer com lateral de vidro, fans e iluminação RGB. */
export function pcTower({ w, h, d, color, color2, options }: BuildParams) {
  if (str(options, 'model', 'generico') === 'mirage') return pcMirage({ w, h, d, color, color2, options } as BuildParams)
  const P = new Parts()
  const shell = mat(color, { rough: 0.45, metal: 0.35 })
  const inner = mat(shade(color, -0.12), { rough: 0.6 })
  const rgb = bool(options, 'rgb', true)
  const light = rgb ? glow(color2, 1.4) : mat('#3a3d42', { rough: 0.5 })
  const ft = 0.015
  corners((sx, sz) => P.boxB(0.04, ft, 0.05, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.05), mat('#111214')))
  const y0 = ft
  const H = h - ft
  const t = 0.008
  P.boxB(t, H, d, -w / 2 + t / 2, y0, 0, shell)
  P.boxB(w, t, d, 0, y0 + H - t, 0, shell)
  P.boxB(w, t, d, 0, y0, 0, shell)
  P.boxB(w, H, t, 0, y0, -d / 2 + t / 2, shell)
  // frente com tela e fans RGB visíveis
  P.boxB(w, H, 0.014, 0, y0, d / 2 - 0.007, mat(shade(color, -0.1), { rough: 0.75 }), 0.004)
  const fr = Math.min(w * 0.36, H * 0.13)
  const fan = (x: number, y: number, z: number, facing: 'z' | 'x', r = fr) => {
    const ring = P.mesh(new THREE.TorusGeometry(r, Math.max(0.004, r * 0.08), 8, 40), light, x, y, z)
    const hub = P.cyl(r * 0.32, r * 0.32, 0.006, x, y, z, mat('#18191c', { rough: 0.5 }), 20)
    if (facing === 'z') hub.rotation.x = Math.PI / 2
    else {
      ring.rotation.y = Math.PI / 2
      hub.rotation.z = Math.PI / 2
    }
  }
  for (const k of [0.28, 0.53, 0.78]) fan(0, y0 + H * k, d / 2 + 0.002, 'z')
  // lateral (+X): vidro temperado ou chapa
  if (bool(options, 'glass', true)) P.boxB(0.004, H - 0.01, d - 0.02, w / 2 - 0.002, y0 + 0.005, 0, mat('#20242b', { rough: 0.05, metal: 0.2, opacity: 0.3 }))
  else P.boxB(t, H, d, w / 2 - t / 2, y0, 0, shell)
  // interior: placa-mãe, cobertura da fonte, placa de vídeo, cooler e fan traseiro
  const ix = -w / 2 + t
  P.boxB(0.006, H * 0.6, d * 0.6, ix + 0.003, y0 + H * 0.34, -d * 0.1, mat('#1b2420', { rough: 0.6 }))
  const shH = H * 0.22
  P.boxB(w - 2 * t - 0.004, shH, d - 0.03, 0, y0 + t, -0.007, inner)
  const gpuW = (w - 2 * t) * 0.6
  const gpuH = Math.min(0.05, H * 0.1)
  const gpuL = d * 0.62
  P.boxB(gpuW, gpuH, gpuL, ix + 0.008 + gpuW / 2, y0 + shH + 0.06, -0.02, mat('#2a2d33', { rough: 0.4, metal: 0.5 }))
  if (rgb) P.boxB(0.003, 0.008, gpuL * 0.8, ix + 0.0095 + gpuW, y0 + shH + 0.06 + gpuH * 0.5, -0.02, light)
  const cy = y0 + H * 0.7
  const cs = Math.min(0.12, H * 0.2)
  P.boxB(Math.min(0.06, gpuW * 0.6), cs, cs, ix + 0.04, cy - cs / 2, -d * 0.12, mat('#9aa0a6', { rough: 0.35, metal: 0.7 }))
  fan(ix + 0.073, cy, -d * 0.12, 'x', cs * 0.42)
  fan(0, y0 + H * 0.74, -d / 2 + t + 0.016, 'z', fr * 0.9)
  P.boxB(w * 0.7, 0.002, d * 0.55, 0, h - 0.001, -d * 0.05, mat('#0e0f11'))
  P.cyl(0.006, 0.006, 0.004, w * 0.25, h - 0.001, d / 2 - 0.04, light, 14)
  return P.group
}

/**
 * Monitor: na horizontal (paisagem) ou vertical (retrato), plano ou curvo, com pé próprio ou preso a
 * um braço articulado (sem pé, com a placa VESA atrás — o painel ocupa a caixa toda).
 * A tela inclina (eixo X, `tilt`) e, no braço, gira para os lados (eixo Y, `swivel`) em torno do
 * encaixe VESA (ou do topo do pescoço, no pé).
 */
export function monitor({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const Q = new Parts()
  const frame = mat(color, { rough: 0.45, metal: 0.25 })
  const scr = mat('#0b0d12', { rough: 0.15, metal: 0.2, emissive: '#1d2b44', emissiveIntensity: 0.35 })
  const onArm = str(options, 'mount', 'base') === 'braco'
  const vertical = str(options, 'orientation', 'horizontal') === 'vertical'
  const { pw, ph } = monitorPanel({ width: w, height: h, options })
  const tilt = clamp(num(options, 'tilt', 0), -0.6, 0.6)
  const swivel = onArm ? clamp(num(options, 'swivel', 0), -1.1, 1.1) : 0
  const pt = 0.02
  // pivô (coordenadas do item) e posição do painel relativa a ele
  const pivot = new THREE.Vector3()
  let pz: number
  let py0: number
  if (onArm) {
    const vd = Math.max(0.004, Math.min(0.03, d - pt))
    pivot.set(0, h / 2, -d / 2 + vd)
    const v = Math.min(0.1, pw * 0.4, ph * 0.4)
    Q.boxB(v, v, vd, 0, -v / 2, -vd / 2, mat(shade(color, -0.2), { rough: 0.5, metal: 0.4 }), 0.004)
    pz = pt / 2
    py0 = -h / 2
  } else {
    const baseW = Math.min(0.28, Math.max(pw, 0.2) * 0.42)
    const baseD = Math.min(d * 0.95, 0.24)
    P.boxB(baseW, 0.012, baseD, 0, 0, 0, frame, 0.006)
    const neckZ = -baseD / 2 + 0.04
    const pivotY = h - ph / 2
    P.boxB(0.045, pivotY - 0.012, 0.022, 0, 0.012, neckZ, frame, 0.006)
    pivot.set(0, pivotY, neckZ + 0.011)
    // dobradiça da inclinação
    const hinge = Q.cyl(0.014, 0.014, 0.05, 0, 0, 0.002, frame, 12)
    hinge.rotation.z = Math.PI / 2
    pz = pt / 2 + 0.004
    py0 = -ph / 2
  }
  // bordas: inferior mais grossa (na vertical, numa lateral)
  const bx = 0.008
  const bb = 0.022
  if (bool(options, 'curved', false) && !vertical) {
    const R = 1.5
    const span = pw / R
    const n = 16
    const sw = 2 * R * Math.sin(span / (2 * n)) + 0.002
    for (let i = 0; i < n; i++) {
      const th = -span / 2 + ((i + 0.5) * span) / n
      const x = R * Math.sin(th)
      const z = pz + R * (1 - Math.cos(th))
      Q.boxB(sw, ph, pt, x, py0, z, frame).rotation.y = -th
      const sc = Q.boxB(sw, ph - bb - bx, 0.002, x, py0 + bb, z, scr)
      sc.rotation.y = -th
      sc.translateZ(pt / 2 + 0.0008)
    }
  } else {
    Q.boxB(pw, ph, pt, 0, py0, pz, frame, 0.005)
    if (vertical) Q.boxB(pw - bx - bb, ph - 2 * bx, 0.002, (bb - bx) / 2, py0 + bx, pz + pt / 2 + 0.0008, scr)
    else Q.boxB(pw - 2 * bx, ph - bb - bx, 0.002, 0, py0 + bb, pz + pt / 2 + 0.0008, scr)
  }
  Q.group.position.copy(pivot)
  Q.group.rotation.order = 'YXZ'
  // inclinação positiva = topo para trás (tela olhando um pouco para cima)
  Q.group.rotation.set(-tilt, swivel, 0)
  P.group.add(Q.group)
  return P.group
}

/**
 * Braço articulado para 1 ou 2 monitores, preso por garra (na borda da mesa) ou por furo no tampo.
 * Caixa do item = envoltória do braço: poste perto da borda de trás, placas VESA na frente
 * (z = d/2), na altura `vesa` acima do tampo.
 */
export function monitorArm({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const metal = mat(color, { rough: 0.38, metal: 0.65 })
  const joint = mat(shade(color, isDark(color) ? 0.18 : -0.18), { rough: 0.45, metal: 0.5 })
  const dual = num(options, 'count', 1) >= 2
  const zb = -d / 2
  const pz = zb + ARM_BACK
  if (str(options, 'mount', 'garra') === 'garra') {
    // garra em C abraçando a borda de trás do tampo
    P.boxB(0.07, 0.012, 0.09, 0, 0, zb + 0.045, metal, 0.004)
    P.boxB(0.07, 0.09, 0.014, 0, -0.078, zb - 0.007, metal, 0.003)
    P.boxB(0.07, 0.012, 0.07, 0, -0.078, zb + 0.035, metal, 0.003)
    P.cyl(0.006, 0.006, 0.05, 0, -0.1, zb + 0.045, M.chrome(), 10)
    P.cyl(0.022, 0.022, 0.012, 0, -0.128, zb + 0.045, joint, 18)
  } else {
    // furo no tampo: base redonda, parafuso passante e contraplaca embaixo
    P.cyl(0.045, 0.05, 0.012, 0, 0.006, pz, metal, 28)
    P.cyl(0.008, 0.008, 0.06, 0, -0.03, pz, M.chrome(), 10)
    P.cyl(0.032, 0.032, 0.008, 0, -0.058, pz, joint, 20)
  }
  P.cyl(0.017, 0.017, h - 0.012, 0, 0.012 + (h - 0.012) / 2, pz, metal, 16)
  P.cyl(0.02, 0.02, 0.012, 0, h - 0.006, pz, joint, 16)
  // cada braço com a placa no seu lugar (para o lado, para frente, altura)
  const slots = slotsFrom(w, d, options)
  const yjs = slots.map((sl) => clamp(sl.vesa, 0.08, h - 0.04))
  if (yjs.length === 2 && Math.abs(yjs[0] - yjs[1]) < 0.05) yjs[1] = yjs[0] - 0.05 >= 0.06 ? yjs[0] - 0.05 : yjs[0] + 0.05
  const beam = (a: THREE.Vector3, b: THREE.Vector3, t: number, m: THREE.Material) => {
    const len = a.distanceTo(b)
    const mesh = P.box(t, t, len, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, m, t * 0.3)
    mesh.lookAt(b)
  }
  slots.forEach((sl, i) => {
    const sx = sl.x
    const vesa = sl.vesa
    const yj = yjs[i]
    P.cyl(0.024, 0.024, 0.04, 0, yj, pz, joint, 18)
    // cotovelo: dois segmentos (ARM_L1, ARM_L2) do poste até a placa, dobrando para fora
    const tz = pz + sl.reach
    const dist = Math.hypot(sx, tz - pz)
    const dc = clamp(dist, Math.abs(ARM_L1 - ARM_L2) + 0.002, ARM_L1 + ARM_L2 - 0.002)
    const phi = Math.atan2(sx, tz - pz)
    const alpha = Math.acos(clamp((ARM_L1 * ARM_L1 + dc * dc - ARM_L2 * ARM_L2) / (2 * ARM_L1 * dc), -1, 1))
    // dobra para fora: o braço da esquerda (i = 0) para a esquerda, o da direita para a direita
    const th = phi + (dual ? (i === 1 ? 1 : -1) : -1) * alpha
    const a = new THREE.Vector3(0, yj, pz)
    const e = new THREE.Vector3(Math.sin(th) * ARM_L1, yj + 0.02, pz + Math.cos(th) * ARM_L1)
    const v = new THREE.Vector3(sx, vesa, tz)
    beam(a, e, 0.028, metal)
    P.cyl(0.02, 0.02, 0.045, e.x, e.y, e.z, joint, 16)
    beam(e, v, 0.034, metal)
    P.blob(0.018, v.x, v.y, v.z, joint, 1)
    P.boxB(0.1, 0.1, 0.012, sx, vesa - 0.05, tz + ARM_FRONT - 0.006, joint, 0.004)
  })
  return P.group
}

/** Teclado com teclas (malha única). */
function keyboard(P: Parts, x: number, z: number, kw: number, kd: number, color: string) {
  const base = mat(color, { rough: 0.5 })
  P.boxB(kw, 0.016, kd, x, 0.003, z, base, 0.004)
  const rows = kd > 0.12 ? 6 : 5
  const u = (kd - 0.02) / rows
  const cols = Math.max(3, Math.round((kw - 0.02) / u))
  const ks = u * 0.82
  const keys: [number, number, number, number, number, number][] = []
  for (let r = 0; r < rows; r++) {
    const kz = z - kd / 2 + 0.01 + u * (r + 0.5)
    if (r === rows - 1) {
      // fileira de baixo: barra de espaço
      const sp = Math.max(3, Math.round(cols * 0.35))
      const left = Math.floor((cols - sp) / 2)
      for (let c = 0; c < cols; c++) {
        if (c >= left && c < left + sp) continue
        keys.push([ks, 0.008, ks, x - kw / 2 + 0.01 + u * (c + 0.5), 0.023, kz])
      }
      keys.push([u * sp - (u - ks), 0.008, ks, x - kw / 2 + 0.01 + u * (left + sp / 2), 0.023, kz])
    } else for (let c = 0; c < cols; c++) keys.push([ks, 0.008, ks, x - kw / 2 + 0.01 + u * (c + 0.5), 0.023, kz])
  }
  P.mesh(mergedBoxes(keys), mat(shade(color, isDark(color) ? 0.14 : -0.1), { rough: 0.55 }))
}

function mouse(P: Parts, x: number, z: number, color: string, y = 0) {
  const m = P.blob(0.5, x, y + 0.018, z, mat(color, { rough: 0.4 }), 2)
  m.scale.set(0.062, 0.036, 0.112)
  const wheel = P.cyl(0.007, 0.007, 0.006, x, y + 0.034, z - 0.022, mat('#555a60'), 12)
  wheel.rotation.z = Math.PI / 2
}

/** Periféricos de mesa: teclado, mouse, headset, caixa de som, microfone. */
export function peripheral({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const kind = str(options, 'kind', 'teclado-mouse')
  const body = mat(color, { rough: 0.45 })
  if (kind === 'teclado-mouse' || kind === 'mouse') {
    P.boxB(w, 0.003, d, 0, 0, 0, M.fabric(color2), 0.004)
    if (kind === 'mouse') mouse(P, 0, 0, color, 0.003)
    else {
      const kw = Math.min(0.44, w * 0.6)
      const kd = Math.min(0.15, d * 0.55)
      keyboard(P, -w / 2 + 0.03 + kw / 2, 0, kw, kd, color)
      mouse(P, Math.min(w / 2 - 0.06, -w / 2 + 0.03 + kw + 0.12), 0, color, 0.003)
    }
  } else if (kind === 'teclado') keyboard(P, 0, 0, w, d, color)
  else if (kind === 'soundbar') {
    // barra de som de mesa (ex.: Redragon Adiemus GS560): grade frontal, RGB nas pontas, volume em cima
    const r = Math.min(h, d) * 0.42
    P.boxB(w, h - 0.004, d, 0, 0.004, 0, body, r)
    for (const sx of [-1, 1]) P.boxB(0.04, 0.004, d * 0.6, sx * (w / 2 - 0.05), 0, 0, mat('#111214', { rough: 0.9 }))
    P.boxB(w - 2 * r - 0.06, (h - 0.004) * 0.62, 0.003, 0, 0.004 + (h - 0.004) * 0.19, d / 2 - 0.0005, mat('#141518', { rough: 0.95 }), 0.002)
    for (const sx of [-1, 1]) P.boxB(0.006, (h - 0.004) * 0.6, d * 0.62, sx * (w / 2 - 0.002), 0.004 + (h - 0.004) * 0.2, 0, glow(color2, 1.3), 0.002)
    P.cyl(0.011, 0.012, 0.009, w / 2 - 0.045, h + 0.0045 - 0.004, 0, mat('#2a2c30', { rough: 0.35, metal: 0.5 }), 18)
  }
  else if (kind === 'headset') {
    const r = Math.min(w, d) * 0.42
    P.cyl(r, r * 1.05, 0.012, 0, 0.006, 0, body, 28)
    P.cyl(0.007, 0.007, h * 0.82, 0, h * 0.41, 0, mat(shade(color, 0.2), { rough: 0.3, metal: 0.6 }), 10)
    P.boxB(0.05, 0.014, 0.03, 0, h - 0.03, 0, body, 0.006)
    const R = Math.min(w * 0.42, h * 0.3)
    P.mesh(new THREE.TorusGeometry(R, 0.011, 8, 28, Math.PI), mat(color2, { rough: 0.6 }), 0, h - 0.011 - R, 0)
    const cr = Math.min(0.042, h * 0.16)
    const cupY = Math.max(cr + 0.012, h - R - 0.045)
    for (const sx of [-1, 1]) {
      const cup = P.cyl(cr, cr, 0.03, sx * (R + 0.004), cupY, 0, body, 24)
      cup.rotation.z = Math.PI / 2
      const pad = P.cyl(cr * 0.86, cr * 0.86, 0.016, sx * (R - 0.018), cupY, 0, M.fabric('#1d1e21'), 24)
      pad.rotation.z = Math.PI / 2
    }
  } else if (kind === 'caixa') {
    P.boxB(w, h, d, 0, 0, 0, body, 0.012)
    const fz = d / 2 + 0.001
    const rw = Math.min(w * 0.36, h * 0.24)
    P.cyl(rw, rw, 0.004, 0, h * 0.34, fz, mat('#141518', { rough: 0.7 }), 28).rotation.x = Math.PI / 2
    P.mesh(new THREE.TorusGeometry(rw, 0.004, 6, 32), mat(color2, { rough: 0.3, metal: 0.5 }), 0, h * 0.34, fz + 0.002)
    P.cyl(rw * 0.32, rw * 0.32, 0.006, 0, h * 0.34, fz + 0.002, mat('#2a2c30', { rough: 0.4 }), 20).rotation.x = Math.PI / 2
    P.cyl(rw * 0.4, rw * 0.4, 0.004, 0, h * 0.76, fz, mat('#141518', { rough: 0.6 }), 20).rotation.x = Math.PI / 2
    P.cyl(rw * 0.2, rw * 0.2, 0.008, 0, h * 0.76, fz + 0.002, mat(color2, { rough: 0.3, metal: 0.5 }), 16).rotation.x = Math.PI / 2
  } else {
    // microfone em pedestal de mesa
    const r = Math.min(w, d) * 0.42
    P.cyl(r, r * 1.05, 0.014, 0, 0.007, 0, body, 28)
    const capH = Math.min(0.12, h * 0.42)
    P.cyl(0.008, 0.008, h - capH - 0.02, 0, (h - capH - 0.02) / 2 + 0.014, 0, mat(shade(color, 0.2), { rough: 0.3, metal: 0.6 }), 10)
    const cap = P.mesh(new THREE.CapsuleGeometry(0.026, capH - 0.052, 6, 16), mat('#3a3d42', { rough: 0.6, metal: 0.4 }), 0, h - capH / 2, 0)
    cap.rotation.x = -0.15
    P.cyl(0.03, 0.03, 0.012, 0, h - capH * 0.75, 0, mat(color2, { rough: 0.3, metal: 0.6 }), 20)
  }
  return P.group
}

// ---------------- Banheiro ----------------

/** Toalha dobrada sobre uma barra (duas abas, frente e trás). */
function towelOver(P: Parts, x: number, barY: number, barZ: number, tw: number, th: number, color: string) {
  const cloth = M.fabric(color)
  const band = M.fabric(shade(color, -0.18))
  const t = 0.006
  P.boxB(tw, th, t, x, barY - th, barZ + 0.011, cloth, 0.002)
  P.boxB(tw, th * 0.86, t, x, barY - th * 0.86, barZ - 0.011, cloth, 0.002)
  const roll = P.cyl(0.014, 0.014, tw, x, barY, barZ, cloth, 14)
  roll.rotation.z = Math.PI / 2
  P.boxB(tw + 0.001, 0.022, t + 0.001, x, barY - th + th * 0.12, barZ + 0.011, band)
}

/** Toalheiro, porta-toalha de argola, ganchos, porta papel e porta-shampoo. */
export function bathAccessory({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const metal = finish(color)
  const kind = str(options, 'kind', 'toalheiro')
  const towel = bool(options, 'towel', true)
  const wz = -d / 2
  const rosette = (x: number, y: number, r = 0.02) => P.cyl(r, r, 0.008, x, y, wz + 0.004, metal, 20).rotation.x = Math.PI / 2
  if (kind === 'toalheiro') {
    const y = h - 0.03
    const bz = wz + Math.min(0.055, d - 0.02)
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.025)
      rosette(x, y)
      P.cyl(0.007, 0.007, bz - wz, x, y, (wz + bz) / 2, metal, 10).rotation.x = Math.PI / 2
    }
    P.cyl(0.0085, 0.0085, w - 0.02, 0, y, bz, metal, 14).rotation.z = Math.PI / 2
    if (towel) towelOver(P, 0, y, bz, Math.min(w - 0.1, w * 0.78), Math.max(0.05, y - 0.02), color2)
  } else if (kind === 'argola') {
    const R = Math.min(w * 0.42, (h - 0.06) * 0.3, 0.09)
    const rz = wz + Math.min(0.045, d - 0.015)
    const cy = h - 0.05 - R
    rosette(0, h - 0.035, 0.022)
    P.boxB(0.012, 0.012, rz - wz, 0, h - 0.041, (wz + rz) / 2, metal)
    P.cyl(0.005, 0.005, h - 0.04 - (cy + R), 0, (h - 0.04 + cy + R) / 2, rz, metal, 8)
    P.mesh(new THREE.TorusGeometry(R, 0.006, 10, 40), metal, 0, cy, rz)
    if (towel) {
      const tw = R * 1.5
      const top = cy - R + 0.012
      towelOver(P, 0, top, rz, tw, Math.max(0.05, top - 0.01), color2)
    }
  } else if (kind === 'ganchos') {
    const n = auto(options, 'count', Math.max(1, Math.round(w / 0.1)))
    const py = h / 2
    P.boxB(w, Math.min(0.03, h * 0.5), 0.012, 0, py - Math.min(0.015, h * 0.25), wz + 0.006, metal, 0.004)
    const L = d - 0.02
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5)
      P.boxB(0.01, 0.01, L, x, py - 0.005, wz + 0.012 + L / 2, metal, 0.003)
      P.boxB(0.01, Math.min(0.03, h - py), 0.01, x, py, wz + 0.012 + L - 0.005, metal, 0.003)
      P.blob(0.0075, x, py + Math.min(0.03, h - py), wz + 0.012 + L - 0.005, metal, 1)
    }
  } else if (kind === 'papel') {
    const r = Math.min(h, d) * 0.42
    const cy = h - r - 0.006
    const cz = wz + r + 0.014
    const ax = -w / 2 + 0.012
    rosette(ax, cy, 0.018)
    P.cyl(0.006, 0.006, cz - wz, ax, cy, (wz + cz) / 2, metal, 10).rotation.x = Math.PI / 2
    P.cyl(0.005, 0.005, w - 0.03, 0, cy, cz, metal, 10).rotation.z = Math.PI / 2
    const roll = P.cyl(r, r, Math.min(0.1, w - 0.04), 0.008, cy, cz, mat('#f7f6f2', { rough: 0.95 }), 28)
    roll.rotation.z = Math.PI / 2
    const core = P.cyl(r * 0.38, r * 0.38, Math.min(0.1, w - 0.04) + 0.002, 0.008, cy, cz, mat('#b89a74', { rough: 0.9 }), 18)
    core.rotation.z = Math.PI / 2
  } else {
    // porta-shampoo: prateleira aramada com frascos
    const sy = 0.012
    P.boxB(w, 0.006, d - 0.012, 0, sy, 0.006, metal, 0.003)
    for (const sx of [-1, 1]) rosette(sx * (w / 2 - 0.03), sy + 0.05, 0.014)
    P.boxB(w, 0.06, 0.006, 0, sy, wz + 0.003, metal, 0.002)
    const ry = sy + Math.min(0.05, h * 0.3)
    P.cyl(0.004, 0.004, w, 0, ry, d / 2 - 0.006, metal, 8).rotation.z = Math.PI / 2
    for (const sx of [-1, 1]) P.cyl(0.004, 0.004, d - 0.012, sx * (w / 2 - 0.003), ry, 0.006, metal, 8).rotation.x = Math.PI / 2
    if (bool(options, 'bottles', true) && h > 0.1) {
      const cols = ['#e8f0f5', '#7fb2c9', '#d9a7b7']
      const n = Math.max(1, Math.min(3, Math.floor(w / 0.08)))
      for (let i = 0; i < n; i++) {
        const bh = (h - sy - 0.01) * [0.95, 0.75, 0.85][i]
        const br = Math.min(0.028, (d - 0.03) / 2)
        const x = -w / 2 + (w / n) * (i + 0.5)
        P.cyl(br, br, bh * 0.85, x, sy + 0.006 + bh * 0.425, 0.004, mat(cols[i], { rough: 0.3 }), 18)
        P.cyl(br * 0.45, br * 0.5, bh * 0.15, x, sy + 0.006 + bh * 0.925, 0.004, mat('#f4f4f2', { rough: 0.4 }), 14)
      }
    }
  }
  return P.group
}

/** Pia de banheiro sem armário: de coluna, lavatório suspenso ou bancada suspensa com cuba. */
export function bathSink({ w, h, d, color, color2, options }: BuildParams) {
  if (str(options, 'style', 'coluna') === 'esculpida') return carvedVanity({ w, h, d, color: color2, color2, options } as BuildParams)
  const P = new Parts()
  const china = mat(color, { rough: 0.2 })
  const bowl = mat('#d6dde2', { rough: 0.2 })
  const style = str(options, 'style', 'coluna')
  const deckFaucet = (topY: number, z: number) => {
    P.cyl(0.013, 0.015, 0.16, 0, topY + 0.08, z, M.chrome(), 12)
    P.boxB(0.018, 0.018, 0.11, 0, topY + 0.13, z + 0.05, M.chrome(), 0.008)
    P.boxB(0.01, 0.04, 0.012, 0, topY + 0.16, z - 0.012, M.chrome(), 0.004)
  }
  const siphon = (top: number, x: number, z: number) => {
    if (top < 0.06) return
    const low = Math.max(0.025, top * 0.25)
    P.cyl(0.016, 0.016, top - low, x, (top + low) / 2, z, M.chrome(), 12)
    P.ellipse(0.045, 0.06, 0.045, x, low - 0.02, z, M.chrome(), 16)
    const arm = P.cyl(0.014, 0.014, z + d / 2, x, low + 0.01, (z - d / 2) / 2, M.chrome(), 10)
    arm.rotation.x = Math.PI / 2
  }
  if (style === 'bancada') {
    const vessel = str(options, 'basin', 'apoio') === 'apoio'
    const st = Math.min(0.04, h * 0.25)
    const slabTop = vessel ? Math.max(st + 0.02, h - Math.min(0.14, h * 0.6)) : h
    const sk = Math.min(0.12, slabTop)
    const stone = mat(color2, { rough: 0.3 })
    P.boxB(w, st, d, 0, slabTop - st, 0, stone, 0.003)
    P.boxB(w, sk, 0.02, 0, slabTop - sk, d / 2 - 0.01, stone, 0.003)
    const bw = Math.min(0.42, w * 0.5)
    const bd = Math.min(0.34, d * 0.72)
    if (vessel) {
      P.ellipse(bw, h - slabTop - 0.02, bd, 0, slabTop, 0.02, china, 40)
      P.ellipse(bw * 0.82, 0.004, bd * 0.8, 0, h - 0.024, 0.02, bowl, 40)
      // misturador de parede sobre a cuba
      P.cyl(0.022, 0.022, 0.01, 0, h - 0.03, -d / 2 + 0.005, M.chrome(), 18).rotation.x = Math.PI / 2
      P.boxB(0.02, 0.02, Math.min(0.17, d * 0.4), 0, h - 0.04, -d / 2 + Math.min(0.085, d * 0.2), M.chrome(), 0.008)
      siphon(slabTop - st, 0, 0.02)
    } else {
      P.ellipse(bw, 0.004, bd, 0, slabTop + 0.0005, 0.02, bowl, 40)
      const ub = Math.min(0.15, slabTop - st - 0.02)
      if (ub > 0.03) P.ellipse(bw + 0.02, ub, bd + 0.02, 0, slabTop - st - ub, 0.02, china, 40)
      siphon(slabTop - st - Math.max(0, ub), 0, 0.02)
    }
    return P.group
  }
  const bh = Math.min(0.2, h * (style === 'suspensa' ? 0.8 : 0.25))
  P.boxB(w, bh, d, 0, h - bh, 0, china, Math.min(0.05, bh * 0.4, w * 0.12))
  P.ellipse(w * 0.66, 0.004, d * 0.56, 0, h - 0.002, 0.03, bowl, 40)
  deckFaucet(h, -d / 2 + 0.05)
  if (style === 'coluna') {
    const r = Math.min(w, d) * 0.2
    P.cyl(r * 0.85, r, h - bh + 0.01, 0, (h - bh) / 2, -d / 2 + r + 0.05, china, 32)
  } else siphon(h - bh, 0, -d / 2 + 0.12)
  return P.group
}

// ---------------- Nicho e porta pano de prato ----------------

/** Nicho (caixa aberta) com prateleiras e divisória opcionais. */
export function niche({ w, h, d, color, color2, options }: BuildParams) {
  if (str(options, 'layout', 'simples') === 'coluna') return nicheColumn({ w, h, d, color, color2, options } as BuildParams)
  const P = new Parts()
  const frame = mat(color, { rough: 0.55 })
  const t = Math.min(0.018, w * 0.06, h * 0.06)
  P.boxB(w, h, 0.006, 0, 0, -d / 2 + 0.003, mat(color2, { rough: 0.6 }))
  const cd = d - 0.006
  const cz = 0.003
  for (const sx of [-1, 1]) P.boxB(t, h, cd, sx * (w / 2 - t / 2), 0, cz, frame)
  P.boxB(w, t, cd, 0, 0, cz, frame)
  P.boxB(w, t, cd, 0, h - t, cz, frame)
  const n = clamp(Math.round(num(options, 'shelves', 1)), 0, 4)
  const gap = (h - 2 * t - n * t) / (n + 1)
  for (let i = 1; i <= n; i++) P.boxB(w - 2 * t, t, cd - 0.006, 0, t + i * gap + (i - 1) * t, cz - 0.003, frame)
  if (bool(options, 'divider', false)) P.boxB(t, h - 2 * t, cd - 0.006, 0, t, cz - 0.003, frame)
  return P.group
}

/**
 * Nicho com compartimento principal (ex.: micro-ondas) e uma coluna estreita de prateleiras ao lado.
 * A base do compartimento principal pode avançar além da caixa (a profundidade do item inclui esse avanço).
 */
function nicheColumn({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const frame = mat(color, { rough: 0.55 })
  const back = mat(color2, { rough: 0.6 })
  const t = Math.min(0.018, w * 0.06, h * 0.06)
  const out = clamp(num(options, 'shelfOut', 0), 0, d - 0.1)
  const bd = d - out // profundidade da caixa
  const zc = -d / 2 + bd / 2
  const sw = clamp(num(options, 'sideWidth', 0.17), 0.06, w - 0.2)
  const right = str(options, 'side', 'direita') !== 'esquerda'
  P.boxB(w, h, 0.006, 0, 0, -d / 2 + 0.003, back)
  for (const sx of [-1, 1]) P.boxB(t, h, bd, sx * (w / 2 - t / 2), 0, zc, frame)
  P.boxB(w, t, bd, 0, h - t, zc, frame)
  // divisória entre o compartimento principal e a coluna
  const divX = right ? w / 2 - t - sw - t / 2 : -w / 2 + t + sw + t / 2
  P.boxB(t, h - 2 * t, bd - 0.004, divX, t, zc, frame)
  // base: na coluna, do tamanho da caixa; no principal, com o avanço
  const colC = right ? (divX + w / 2) / 2 : (divX - w / 2) / 2
  const colW = Math.abs(w / 2 - Math.abs(divX)) + t / 2
  const mainC = right ? (-w / 2 + divX + t / 2) / 2 : (w / 2 + divX - t / 2) / 2
  const mainW = w - colW
  P.boxB(colW, t, bd, colC, 0, zc, frame)
  P.boxB(mainW, t, d, mainC, 0, 0, frame)
  // prateleiras da coluna (n compartimentos de mesma altura)
  const cells = clamp(Math.round(num(options, 'sideCells', 2)), 1, 6)
  const cellH = (h - 2 * t - (cells - 1) * t) / cells
  for (let i = 1; i < cells; i++) P.boxB(sw, t, bd - 0.006, right ? divX + t / 2 + sw / 2 : divX - t / 2 - sw / 2, t + i * cellH + (i - 1) * t, zc, frame)
  return P.group
}

/** Pano de prato pendurado (aba única, com listra), girado em torno do eixo vertical. */
function cloth(P: Parts, x: number, topY: number, z: number, len: number, ch: number, color: string, rotY = 0) {
  const c = P.box(0.006, ch, len, x, topY - ch / 2, z, M.fabric(color), 0.002)
  c.rotation.y = rotY
  const s = P.box(0.007, Math.min(0.025, ch * 0.12), len + 0.001, x, topY - ch + Math.min(0.04, ch * 0.18), z, M.fabric(shade(color, -0.3)))
  s.rotation.y = rotY
}

/** Porta pano de prato: articulado (braços em leque), de barra ou de ganchos. */
export function dishTowelRack({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const metal = finish(color)
  const cloths = bool(options, 'cloths', true)
  const style = str(options, 'style', 'articulado')
  const wz = -d / 2
  const ch = Math.max(0.05, h - 0.05)
  if (style === 'articulado') {
    const n = auto(options, 'arms', w > 0.18 ? 4 : 3)
    const topY = h - 0.02
    P.boxB(Math.min(w, 0.05), Math.min(0.1, h * 0.4), 0.012, 0, topY - Math.min(0.1, h * 0.4) + 0.01, wz + 0.006, metal, 0.004)
    const L = d - 0.025
    const amax = Math.asin(Math.min(0.95, (w / 2 - 0.012) / L))
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? 0 : -amax + (2 * amax * i) / (n - 1)
      const y = topY - i * 0.012
      const cx = Math.sin(a) * (L / 2)
      const cz = wz + 0.012 + Math.cos(a) * (L / 2)
      P.box(0.007, 0.007, L, cx, y, cz, metal, 0.002).rotation.y = a
      P.blob(0.006, Math.sin(a) * L, y, wz + 0.012 + Math.cos(a) * L, metal, 1)
      if (cloths) {
        const len = L * 0.7
        const k = L * 0.25 + len / 2
        cloth(P, Math.sin(a) * k, y - 0.004, wz + 0.012 + Math.cos(a) * k, len, Math.max(0.05, y - 0.02), [color2, shade(color2, 0.35), color2, shade(color2, -0.15)][i % 4], a)
      }
    }
    return P.group
  }
  if (style === 'barra') {
    const y = h - 0.025
    const bz = wz + Math.min(0.045, d - 0.015)
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.02)
      P.cyl(0.016, 0.016, 0.008, x, y, wz + 0.004, metal, 18).rotation.x = Math.PI / 2
      P.cyl(0.006, 0.006, bz - wz, x, y, (wz + bz) / 2, metal, 10).rotation.x = Math.PI / 2
    }
    P.cyl(0.007, 0.007, w - 0.01, 0, y, bz, metal, 12).rotation.z = Math.PI / 2
    if (cloths) {
      const n = Math.max(1, Math.round((w - 0.06) / 0.17))
      const slot = (w - 0.07) / n
      for (let i = 0; i < n; i++) towelOver(P, -w / 2 + 0.035 + slot * (i + 0.5), y, bz, slot - 0.015, Math.max(0.05, y - 0.03), i % 2 ? shade(color2, 0.35) : color2)
    }
    return P.group
  }
  // ganchos com panos
  const n = auto(options, 'count', Math.max(1, Math.round(w / 0.12)))
  const py = h - 0.03
  P.boxB(w, 0.03, 0.012, 0, py - 0.015, wz + 0.006, metal, 0.004)
  const L = Math.min(0.05, d - 0.02)
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5)
    P.boxB(0.008, 0.008, L, x, py - 0.004, wz + 0.012 + L / 2, metal, 0.003)
    P.boxB(0.008, 0.02, 0.008, x, py, wz + 0.012 + L - 0.004, metal, 0.003)
    if (cloths) {
      const cw = Math.min(0.14, (w / n) * 0.85)
      P.box(cw, ch * 0.9, 0.006, x, py - ch * 0.45, wz + 0.012 + L - 0.012, M.fabric(i % 2 ? shade(color2, 0.35) : color2), 0.002)
      P.box(cw + 0.001, Math.min(0.02, ch * 0.1), 0.007, x, py - ch * 0.9 + 0.03, wz + 0.012 + L - 0.012, M.fabric(shade(color2, -0.3)))
    }
  }
  return P.group
}

// ---------------- Mesa com regulagem elétrica de altura ----------------

/** Faixa de altura da estrutura (sem tampo) da mesa elétrica de motor único (ex.: BlackAir). */
export const DESK_FRAME_MIN = 0.72
export const DESK_FRAME_MAX = 1.18

/**
 * Mesa com regulagem elétrica de altura: estrutura de motor único com colunas de 2 estágios
 * (tubo externo 65×45 mm), pés 580×60×20 mm com sapatas, suporte do tampo em cada coluna,
 * viga transversal única, motor junto à coluna direita e painel com display e 3 memórias.
 * color = tampo (MDF), color2 = estrutura. A altura do item é a do tampo (estrutura + espessura).
 */
/**
 * Partes sólidas da mesa elétrica (mesmas medidas do modelo): tampo, colunas, pés, suportes, viga,
 * motor e painel — o vão entre as colunas fica livre para a cadeira entrar com o assento e os braços.
 */
export function standingDeskSolids({ w, h, d, options }: { w: number; h: number; d: number; options: Record<string, OptionValue> }): Solid[] {
  const t = clamp(num(options, 'topT', 0.025), 0.01, 0.08)
  const fh = Math.max(0.2, h - t)
  const legX = clamp(w / 2 - 0.18, 0.2, 0.68)
  const footL = Math.min(0.58, d)
  const supD = Math.min(d - 0.06, 0.6)
  const px = Math.min(w / 2 - 0.12, legX + 0.05) - 0.1
  const out = [sbox(0, 0, w, d, fh, h)]
  for (const sx of [-1, 1]) {
    out.push(sbox(sx * legX, 0, 0.06, footL, 0, 0.028))
    out.push(sbox(sx * legX, 0, 0.045, 0.065, 0, fh))
    out.push(sbox(sx * legX, 0, 0.045, supD, fh - 0.03, fh))
  }
  out.push(sbox(0, 0, 2 * legX, 0.02, fh - 0.07, fh - 0.03))
  out.push(sbox(legX - 0.065, 0, 0.07, 0.09, fh - 0.1, fh - 0.04))
  out.push(sbox(px, d / 2 - 0.04, 0.17, 0.06, fh - 0.022, fh))
  return out
}

export function standingDesk({ w, h, d, color, color2, options }: BuildParams) {
  const P = new Parts()
  const frame = mat(color2, { rough: 0.42, metal: 0.35 })
  const dark = mat('#1b1c1f', { rough: 0.55 })
  const t = clamp(num(options, 'topT', 0.025), 0.01, 0.08)
  const fh = Math.max(0.2, h - t)
  const legX = clamp(w / 2 - 0.18, 0.2, 0.68)
  const footL = Math.min(0.58, d)
  // tampo de MDF
  P.boxB(w, t, d, 0, fh, 0, mat(color, { rough: 0.55 }), Math.min(0.003, t / 3))
  const supD = Math.min(d - 0.06, 0.6)
  for (const sx of [-1, 1]) {
    const x = sx * legX
    // pé (placa de base 580×60×20) com sapatas niveladoras
    P.boxB(0.06, 0.02, footL, x, 0.008, 0, frame, 0.008)
    for (const sz of [-1, 1]) P.cyl(0.013, 0.015, 0.008, x, 0.004, sz * (footL / 2 - 0.045), dark, 14)
    // coluna em 2 estágios: tubo de baixo 45×65 mm e de cima um pouco menor
    const low = Math.min(0.028 + 0.5, fh - 0.08)
    P.boxB(0.045, low - 0.028, 0.065, x, 0.028, 0, frame, 0.004)
    P.boxB(0.038, Math.max(0.01, fh - 0.03 - (low - 0.01)), 0.058, x, low - 0.01, 0, frame, 0.003)
    // suporte do tampo (placa lateral, no sentido da profundidade)
    P.boxB(0.045, 0.03, supD, x, fh - 0.03, 0, frame, 0.004)
  }
  // viga transversal única (20×40 mm) entre as colunas, com a haste de transmissão dentro
  P.boxB(2 * legX, 0.04, 0.02, 0, fh - 0.07, 0, frame, 0.003)
  // motor junto à coluna direita
  P.boxB(0.07, 0.06, 0.09, legX - 0.065, fh - 0.1, 0, frame, 0.01)
  // painel de controle sob o tampo, na frente à direita: display (altura) + ↑ ↓ e memórias 1·2·3
  const px = Math.min(w / 2 - 0.12, legX + 0.05) - 0.1
  const pz = d / 2 - 0.04
  P.boxB(0.17, 0.022, 0.06, px, fh - 0.022, pz, dark, 0.006)
  P.boxB(0.032, 0.012, 0.002, px - 0.055, fh - 0.017, pz + 0.0305, glow('#ff4a3d', 1.1))
  const keys: [number, number, number, number, number, number][] = []
  for (let i = 0; i < 5; i++) keys.push([0.012, 0.01, 0.004, px - 0.02 + i * 0.019, fh - 0.011, pz + 0.031])
  P.mesh(mergedBoxes(keys), mat('#5a5e65', { rough: 0.5 }))
  return P.group
}
