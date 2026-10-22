/**
 * Air fryer forno Kitchen Art KAF16A Redstone (16 L, 360 × 345 × 375 mm): laterais de inox, painel de
 * vidro preto no alto com visor azul e ícones de toque, faixa "KITCHEN ART", porta de vidro com
 * moldura preta mostrando a câmara com duas assadeiras Redstone (vermelho pedra) e a etiqueta do
 * modelo embaixo à direita. Proporções tiradas da foto do produto.
 */
import * as THREE from 'three'
import { applianceFinish, corners, type BuildParams } from './builders'
import { mat, Parts, rng } from './parts'
import { cached, canvasTex, decal } from './setup'

const EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'

/** Painel de toque (coordenadas do recorte da foto: 678 × 305). */
function panelTex() {
  const W = 1356
  const H = 610
  return canvasTex('kaf16a-panel', W, H, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#121315')
    bg.addColorStop(1, '#0a0b0c')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.scale(2, 2)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const white = '#f2f3f5'
    g.strokeStyle = white
    g.fillStyle = white
    // visor azul com "180"
    const lcd = g.createLinearGradient(271, 45, 271, 95)
    lcd.addColorStop(0, '#5559b8')
    lcd.addColorStop(1, '#4347a0')
    g.fillStyle = lcd
    g.fillRect(271, 45, 132, 50)
    g.fillStyle = white
    g.font = '700 40px "DS-Digital", "Consolas", monospace'
    g.fillText('180', 337, 71)
    g.font = '500 13px Arial, sans-serif'
    g.fillText('°C', 436, 50)
    g.fillText('min', 436, 87)
    // indicadores à esquerda do visor
    g.lineWidth = 1.6
    g.beginPath()
    g.arc(220, 70, 5, 0, Math.PI * 2)
    g.stroke()
    const thermo = (x: number, y: number, s: number, color = '#e9a23b') => {
      g.strokeStyle = color
      g.lineWidth = 1.6
      g.beginPath()
      g.moveTo(x, y - s)
      g.lineTo(x, y + s * 0.5)
      g.stroke()
      g.fillStyle = color
      g.beginPath()
      g.arc(x, y + s * 0.6, s * 0.35, 0, Math.PI * 2)
      g.fill()
    }
    const timer = (x: number, y: number, r: number) => {
      g.strokeStyle = '#9fd36b'
      g.lineWidth = 1.6
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.stroke()
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x, y - r * 0.6)
      g.moveTo(x, y)
      g.lineTo(x + r * 0.5, y)
      g.stroke()
    }
    thermo(246, 50, 9)
    timer(246, 88, 6)
    // botões + e − dos dois lados
    const roundBtn = (x: number, y: number, plus: boolean) => {
      g.strokeStyle = white
      g.lineWidth = 2
      g.beginPath()
      g.arc(x, y, 14, 0, Math.PI * 2)
      g.stroke()
      g.beginPath()
      g.moveTo(x - 7, y)
      g.lineTo(x + 7, y)
      if (plus) {
        g.moveTo(x, y - 7)
        g.lineTo(x, y + 7)
      }
      g.stroke()
    }
    for (const x of [168, 514]) {
      roundBtn(x, 118, true)
      roundBtn(x, 203, false)
    }
    thermo(168, 160, 10)
    timer(514, 162, 8)
    // funções prontas (ícones coloridos)
    g.font = `26px ${EMOJI}`
    const xs = [226, 283, 338, 395, 454]
    ;['🍟', '🥩', '🥦', '🍤', '🍕'].forEach((e, i) => g.fillText(e, xs[i], 132))
    ;['🍗', '🍰', '🦃', '🍋'].forEach((e, i) => g.fillText(e, xs[i], 190))
    // desidratar: seta circular laranja com ondas
    g.strokeStyle = '#f08a2b'
    g.lineWidth = 2.4
    g.beginPath()
    g.arc(454, 190, 12, Math.PI * 0.15, Math.PI * 1.75)
    g.stroke()
    g.strokeStyle = '#f2f3f5'
    g.lineWidth = 1.6
    for (const dx of [-4, 1, 6]) {
      g.beginPath()
      g.moveTo(450 + dx, 199)
      g.bezierCurveTo(446 + dx, 194, 454 + dx, 189, 450 + dx, 182)
      g.stroke()
    }
    // luz, liga/desliga e rotação
    g.strokeStyle = white
    g.lineWidth = 2
    g.beginPath()
    g.arc(255, 244, 7, Math.PI * 0.8, Math.PI * 2.2)
    g.lineTo(258, 255)
    g.lineTo(252, 255)
    g.closePath()
    g.stroke()
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i * Math.PI) / 4
      g.beginPath()
      g.moveTo(255 + Math.cos(a) * 11, 244 + Math.sin(a) * 11)
      g.lineTo(255 + Math.cos(a) * 15, 244 + Math.sin(a) * 15)
      g.stroke()
    }
    g.beginPath()
    g.arc(340, 248, 15, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.arc(340, 249, 7, -Math.PI * 0.3, Math.PI * 1.3)
    g.moveTo(340, 238)
    g.lineTo(340, 247)
    g.stroke()
    g.beginPath()
    g.arc(427, 248, 11, Math.PI * 0.1, Math.PI * 0.9)
    g.stroke()
    g.beginPath()
    g.arc(427, 248, 11, Math.PI * 1.1, Math.PI * 1.9)
    g.stroke()
    for (const [x, y, a] of [[438, 251, 0.5], [416, 245, -2.6]] as const) {
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + Math.cos(a + 0.6) * 5, y + Math.sin(a + 0.6) * 5)
      g.moveTo(x, y)
      g.lineTo(x + Math.cos(a - 1.2) * 5, y + Math.sin(a - 1.2) * 5)
      g.stroke()
    }
  })
}

/** "KITCHEN ART" (fino + negrito) na faixa de inox acima da porta. */
function brandTex() {
  return canvasTex('kaf16a-brand', 1024, 116, (g, W, H) => {
    g.clearRect(0, 0, W, H)
    g.fillStyle = '#26272a'
    g.textBaseline = 'middle'
    g.font = '300 58px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    const a = 'KITCHEN '
    g.font = '300 58px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    const wa = g.measureText(a).width
    g.font = '700 58px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    const wb = g.measureText('ART').width
    const x0 = (W - wa - wb) / 2
    g.font = '300 58px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    g.fillText(a, x0, H / 2 + 2)
    g.font = '700 58px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
    g.fillText('ART', x0 + wa, H / 2 + 2)
  })
}

/** Etiqueta "Air Fryer KAF16A / REDSTONE / 16L" (embaixo, à direita). */
function labelTex() {
  return canvasTex('kaf16a-label', 256, 128, (g, W) => {
    g.clearRect(0, 0, W, 128)
    g.fillStyle = '#26272a'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = '400 24px Arial, sans-serif'
    g.fillText('Air Fryer KAF16A', W / 2, 26)
    g.font = '700 30px Arial, sans-serif'
    g.fillText('REDSTONE', W / 2, 62)
    g.font = '400 22px Arial, sans-serif'
    g.fillText('16L', W / 2, 96)
  })
}

/** Assadeira Redstone: antiaderente vermelho-pedra com pintinhas claras. */
function redstoneTex() {
  return canvasTex('kaf16a-redstone', 512, 512, (g, W, H) => {
    g.fillStyle = '#4e2421'
    g.fillRect(0, 0, W, H)
    const R = rng(16)
    for (let i = 0; i < 2600; i++) {
      const v = R()
      g.fillStyle = v < 0.12 ? 'rgba(235,225,220,0.9)' : v < 0.3 ? 'rgba(170,110,100,0.7)' : 'rgba(40,14,12,0.6)'
      const s = v < 0.12 ? 1 + R() * 2 : 1 + R() * 3
      g.fillRect(R() * W, R() * H, s, s)
    }
    // borda levantada mais escura
    g.strokeStyle = 'rgba(30,10,8,0.8)'
    g.lineWidth = 18
    g.strokeRect(9, 9, W - 18, H - 18)
  })
}

/** Vidro da porta: faixa escura no alto (como na foto) e o resto quase transparente. */
function glassTex() {
  return canvasTex('kaf16a-glass', 64, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H)
    const gr = g.createLinearGradient(0, 0, 0, H)
    gr.addColorStop(0, 'rgba(22,24,26,0.92)')
    gr.addColorStop(0.15, 'rgba(22,24,26,0.86)')
    gr.addColorStop(0.17, 'rgba(22,24,26,0.2)')
    gr.addColorStop(1, 'rgba(22,24,26,0.16)')
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
  })
}

/** Contorno do corpo visto de cima: retângulo com os quatro cantos arredondados (para extrudar). */
function footprint(hw: number, hd: number, r: number) {
  const s = new THREE.Shape()
  s.moveTo(-hw + r, -hd)
  s.lineTo(hw - r, -hd)
  s.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false)
  s.lineTo(hw, hd - r)
  s.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false)
  s.lineTo(-hw + r, hd)
  s.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(-hw, -hd + r)
  s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

export function kitchenArtKAF16A({ w, h, d, color }: BuildParams) {
  const P = new Parts()
  const inox = applianceFinish('inox', color)
  const inoxSide = applianceFinish('inox', color, true)
  const black = mat('#0e0f11', { rough: 0.25, metal: 0.2 })
  const glossy = mat('#0b0c0d', { rough: 0.08, metal: 0.3 })
  const liner = mat('#d6d9dc', { rough: 0.32, metal: 0.55 })
  const ft = 0.008
  // pés pretos
  corners((sx, sz) => P.boxB(0.034, ft, 0.03, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.045), mat('#111214', { rough: 0.7 }), 0.003))
  // alturas (frações da foto): porta, faixa da marca, friso preto e painel de toque
  const y0 = h * 0.128
  const y1 = h * 0.605
  const ySeam = h * 0.686
  const yTop = h - 0.011
  const pw = w * 0.137
  const iw = w - 2 * pw
  const fz = d / 2
  const back = 0.035
  // colunas laterais de inox com os cantos verticais arredondados (coluna reta + canto + lateral)
  const R = 0.02
  const ch = yTop - ft
  for (const sx of [-1, 1]) {
    const xin = w / 2 - pw - 0.002
    P.boxB(w / 2 - R - xin, ch, d - 0.002, sx * ((xin + w / 2 - R) / 2), ft, -0.001, inox, 0.0015)
    P.boxB(R, ch, d - 2 * R, sx * (w / 2 - R / 2), ft, 0, inoxSide)
    for (const sz of [-1, 1]) P.cyl(R, R, ch, sx * (w / 2 - R), ft + ch / 2, sz * (d / 2 - R), inoxSide, 20)
  }
  P.boxB(iw + 0.01, yTop - ft, back, 0, ft, -d / 2 + back / 2 + 0.002, inox)
  // base de inox (com a etiqueta) e o bloco atrás da faixa da marca
  P.boxB(iw + 0.004, y0 - ft, d - back - 0.004, 0, ft, back / 2, inox)
  P.boxB(iw + 0.004, ySeam - y1, d - back - 0.004, 0, y1, back / 2, inox)
  // friso preto em volta (contorno arredondado, rente ao corpo) e o bloco do painel (frente de vidro preto)
  const seamGeo = new THREE.ExtrudeGeometry(footprint(w / 2 + 0.0006, d / 2 + 0.0006, R + 0.0006), { depth: 0.004, bevelEnabled: false, curveSegments: 10 })
  seamGeo.rotateX(-Math.PI / 2)
  P.mesh(seamGeo, black, 0, ySeam, 0)
  P.boxB(iw + 0.004, yTop - ySeam - 0.004, d - back - 0.004, 0, ySeam + 0.004, back / 2, black)
  // tampa preta (mesmo contorno arredondado do corpo)
  const capGeo = new THREE.ExtrudeGeometry(footprint(w / 2 - 0.001, d / 2 - 0.001, R - 0.001), { depth: 0.011, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 8 })
  capGeo.rotateX(-Math.PI / 2)
  P.mesh(capGeo, black, 0, yTop, 0)
  // painel de toque, faixa "KITCHEN ART" e etiqueta
  const ph = yTop - ySeam - 0.006
  const panelM = cached('kaf16a-panel-m', () => new THREE.MeshStandardMaterial({ map: panelTex(), roughness: 0.12, metalness: 0.2, emissive: '#ffffff', emissiveMap: panelTex(), emissiveIntensity: 0.25 }))
  decal(P, iw - 0.002, ph, panelM, 0, ySeam + 0.004 + ph / 2, fz - 0.0015)
  const brandM = cached('kaf16a-brand-m', () => new THREE.MeshStandardMaterial({ map: brandTex(), transparent: true, alphaTest: 0.3, roughness: 0.5 }))
  decal(P, iw * 0.62, (ySeam - y1) * 0.7, brandM, 0, (y1 + ySeam) / 2, fz - 0.0015)
  const labelM = cached('kaf16a-label-m', () => new THREE.MeshStandardMaterial({ map: labelTex(), transparent: true, alphaTest: 0.3, roughness: 0.5 }))
  decal(P, 0.06, 0.03, labelM, w * 0.293, ft + (y0 - ft) * 0.48, fz - 0.0015)
  // câmara (oca) atrás da porta: paredes claras, trilhos e as duas assadeiras Redstone
  const cw = iw - 0.004
  const cz0 = -d / 2 + back + 0.002
  const cz1 = fz - 0.014
  const cd = cz1 - cz0
  const czc = (cz0 + cz1) / 2
  P.boxB(cw, 0.004, cd, 0, y0, czc, liner)
  P.boxB(cw, 0.004, cd, 0, y1 - 0.004, czc, liner)
  for (const sx of [-1, 1]) {
    P.boxB(0.004, y1 - y0, cd, sx * (cw / 2 - 0.002), y0, czc, liner)
    for (const fy of [0.235, 0.325, 0.415, 0.505]) P.boxB(0.006, 0.003, cd * 0.92, sx * (cw / 2 - 0.006), h * fy - 0.003, czc, mat('#b9bdc1', { rough: 0.3, metal: 0.7 }))
  }
  // grelhas de arame nos outros dois níveis
  const wire = mat('#c3c6ca', { rough: 0.25, metal: 0.85 })
  for (const fy of [0.325, 0.505]) {
    const y = h * fy + 0.002
    for (const z of [cz0 + 0.012, cz1 - 0.01]) {
      const bar = P.cyl(0.0018, 0.0018, cw - 0.016, 0, y, z, wire, 6)
      bar.rotation.z = Math.PI / 2
    }
    for (let i = 0; i < 9; i++) {
      const rod = P.cyl(0.0012, 0.0012, cd - 0.02, -cw / 2 + 0.014 + (i * (cw - 0.028)) / 8, y, czc, wire, 5)
      rod.rotation.x = Math.PI / 2
    }
  }
  const trayM = cached('kaf16a-tray-m', () => new THREE.MeshStandardMaterial({ map: redstoneTex(), roughness: 0.55, metalness: 0.15 }))
  for (const fy of [0.235, 0.415]) P.boxB(cw - 0.016, 0.006, cd * 0.88, 0, h * fy, czc + 0.004, trayM, 0.002)
  // bandeja de migalhas no fundo e a resistência no teto
  P.boxB(cw - 0.02, 0.008, cd * 0.85, 0, y0 + 0.004, czc, mat('#2a2c2f', { rough: 0.4, metal: 0.5 }), 0.002)
  for (let i = 0; i < 3; i++) {
    const rod = P.cyl(0.0025, 0.0025, cw - 0.03, 0, y1 - 0.012, cz0 + cd * (0.25 + i * 0.25), mat('#6b6e72', { rough: 0.4, metal: 0.8 }), 8)
    rod.rotation.z = Math.PI / 2
  }
  // porta: moldura preta e o vidro
  const dh = y1 - y0
  const bt = 0.005
  P.boxB(iw, bt, 0.012, 0, y0, fz - 0.006, glossy)
  P.boxB(iw, bt, 0.012, 0, y1 - bt, fz - 0.006, glossy)
  for (const sx of [-1, 1]) P.boxB(bt, dh, 0.012, sx * (iw / 2 - bt / 2), y0, fz - 0.006, glossy)
  const glassM = cached(
    'kaf16a-glass-m',
    () => new THREE.MeshStandardMaterial({ map: glassTex(), transparent: true, roughness: 0.04, metalness: 0.3, depthWrite: false }),
  )
  decal(P, iw - 2 * bt, dh - 2 * bt, glassM, 0, y0 + dh / 2, fz - 0.002)
  // saídas de ar atrás
  for (let i = 0; i < 6; i++) P.boxB(iw * 0.7, 0.004, 0.002, 0, h * 0.45 + i * 0.012, -d / 2 + 0.001, black)
  return P.group
}
