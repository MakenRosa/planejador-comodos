/**
 * Cadeira ergonômica Elements Vertta Pro (preta): base estrela de nylon com rodízios duplos, cilindro
 * a gás, assento e encosto de tela (mesh) com moldura preta, apoio lombar em "espinha" de costelas,
 * travessa no encosto, apoio de cabeça de tela com reforço em "Y" e braços em L com almofada.
 * Medidas da ficha (68 × 51 × até 137 cm); proporções tiradas da foto do produto.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clamp } from '../lib/util'
import type { BuildParams } from './builders'
import { mat, Parts, sbox, type Solid } from './parts'
import { cached, canvasTex } from './setup'

/** Tela (mesh): fios finos na horizontal sobre o fundo — multiplica a cor do material. */
function meshTex() {
  const t = canvasTex('vertta-mesh', 256, 256, (g, W, H) => {
    g.fillStyle = '#9a9a9a'
    g.fillRect(0, 0, W, H)
    for (let y = 0; y < H; y += 4) {
      g.fillStyle = '#ffffff'
      g.fillRect(0, y, W, 1.6)
    }
    for (let x = 0; x < W; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.12)'
      g.fillRect(x, 0, 1, H)
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

function meshMat(color: string, rx: number, ry: number) {
  return cached(`vertta-mesh-${color}-${rx.toFixed(1)}-${ry.toFixed(1)}`, () => {
    const map = meshTex().clone()
    map.needsUpdate = true
    map.repeat.set(rx, ry)
    return new THREE.MeshStandardMaterial({ color, map, roughness: 0.85, side: THREE.DoubleSide })
  })
}

/** Moldura (anel retangular de cantos arredondados) no plano XY, espessura em z, centrada. */
function frameGeo(w: number, h: number, r: number, bar: number, t: number) {
  const shape = (W: number, H: number, R: number) => {
    const s = new THREE.Shape()
    s.moveTo(-W / 2 + R, -H / 2)
    s.lineTo(W / 2 - R, -H / 2)
    s.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + R)
    s.lineTo(W / 2, H / 2 - R)
    s.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2)
    s.lineTo(-W / 2 + R, H / 2)
    s.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R)
    s.lineTo(-W / 2, -H / 2 + R)
    s.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + R, -H / 2)
    return s
  }
  const outer = shape(w, h, r)
  outer.holes.push(shape(w - 2 * bar, h - 2 * bar, Math.max(0.005, r - bar)))
  const g = new THREE.ExtrudeGeometry(outer, { depth: t, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2, curveSegments: 8 })
  g.translate(0, 0, -t / 2)
  return g
}

/**
 * Partes sólidas da Vertta Pro (mesmas medidas do modelo): base, cilindro, assento com o mecanismo,
 * braços até a almofada e o encosto atrás — assento e braços passam sob o tampo de uma mesa.
 */
export function verttaProSolids({ w, h, d }: { w: number; h: number; d: number }): Solid[] {
  const seatH = clamp(h * 0.35, 0.42, 0.56)
  const sw = Math.min(w * 0.76, 0.52)
  const sd = Math.min(d * 0.8, 0.5)
  const seatY = seatH - 0.05
  const armX = Math.min(w / 2 - 0.045, sw / 2 + 0.07)
  const padTop = seatH + 0.24
  const backW = Math.min(w * 0.72, 0.48)
  return [
    sbox(0, 0, w, d, 0, 0.125),
    sbox(0, 0, 0.08, 0.08, 0.125, seatH - 0.075),
    sbox(0, 0.02, Math.max(sw, 0.55), sd + 0.02, seatY - 0.04, seatY + 0.05),
    sbox(-armX, 0.02, 0.09, 0.25, seatY - 0.04, padTop),
    sbox(armX, 0.02, 0.09, 0.25, seatY - 0.04, padTop),
    { x0: -backW / 2, x1: backW / 2, z0: -d / 2, z1: -sd / 2 + 0.06, y0: seatH + 0.02, y1: h },
  ]
}

export function verttaPro({ w, h, d, color, color2 }: BuildParams) {
  const P = new Parts()
  // estrutura de nylon fosco (brilhante demais ficava cinza de frente)
  const frame = mat(color, { rough: 0.72 })
  const nylon = mat(color, { rough: 0.55 })
  const wheel = mat('#151618', { rough: 0.35 })
  const seatH = clamp(h * 0.35, 0.42, 0.56)
  const R = Math.min(w, d) / 2 - 0.035
  // base estrela: 5 raias inclinadas, cubo e rodízios duplos
  const hubY = 0.1
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + (i / 5) * Math.PI * 2
    const cx = Math.cos(a)
    const cz = Math.sin(a)
    const len = R - 0.03
    const spoke = P.box(len, 0.034, 0.05, (cx * (len + 0.06)) / 2, hubY - 0.012, (cz * (len + 0.06)) / 2, nylon)
    spoke.rotation.y = -a
    const ex = cx * R
    const ez = cz * R
    P.cyl(0.012, 0.014, 0.05, ex, 0.07, ez, nylon, 10)
    for (const side of [-1, 1]) {
      const wh = P.cyl(0.026, 0.026, 0.016, ex - cz * side * 0.011, 0.027, ez + cx * side * 0.011, wheel, 18)
      wh.rotation.z = Math.PI / 2
      wh.rotation.y = -a + Math.PI / 2
    }
  }
  P.cyl(0.045, 0.05, 0.05, 0, hubY - 0.005, 0, nylon, 20)
  // cilindro a gás com a capa telescópica
  const cylTop = seatH - 0.075
  P.cyl(0.034, 0.036, (cylTop - hubY) * 0.55, 0, hubY + (cylTop - hubY) * 0.275, 0, frame, 20)
  P.cyl(0.026, 0.026, cylTop - hubY, 0, hubY + (cylTop - hubY) / 2, 0, mat('#202124', { rough: 0.3, metal: 0.4 }), 16)
  // mecanismo e alavanca (lado direito de quem senta)
  P.boxB(0.2, 0.05, 0.22, 0, cylTop, -0.01, frame, 0.01)
  const lever = P.boxB(0.17, 0.012, 0.016, -0.17, cylTop + 0.015, 0.03, frame, 0.004)
  lever.rotation.y = 0.15
  P.boxB(0.045, 0.01, 0.03, -0.26, cylTop + 0.014, 0.045, frame, 0.004)
  // assento de tela com moldura preta (frente em cascata)
  const sw = Math.min(w * 0.76, 0.52)
  const sd = Math.min(d * 0.8, 0.5)
  const seatY = seatH - 0.05
  P.boxB(sw, 0.045, sd, 0, seatY, 0.02, frame, 0.02)
  const top = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.04, sd - 0.05), meshMat(color2, 3, 3))
  top.rotation.x = -Math.PI / 2
  top.position.set(0, seatY + 0.047, 0.02)
  P.group.add(top)
  const lip = P.boxB(sw - 0.02, 0.035, 0.04, 0, seatY - 0.012, 0.02 + sd / 2 - 0.02, frame, 0.015)
  lip.rotation.x = 0.35
  // braços em L: barra saindo de baixo do assento, poste e almofada
  const armX = Math.min(w / 2 - 0.045, sw / 2 + 0.07)
  const padTop = seatH + 0.24
  for (const sx of [-1, 1]) {
    P.boxB(armX - 0.12, 0.03, 0.05, sx * (0.12 + (armX - 0.12) / 2), seatY - 0.04, 0, frame, 0.008)
    P.boxB(0.036, padTop - 0.025 - (seatY - 0.04), 0.05, sx * armX, seatY - 0.04, 0, frame, 0.008)
    P.boxB(0.085, 0.026, 0.25, sx * armX, padTop - 0.026, 0.02, mat(color, { rough: 0.7 }), 0.012)
  }
  // encosto: moldura, travessa, telas e a "espinha" lombar, levemente reclinado
  const backW = Math.min(w * 0.72, 0.48)
  const headH = clamp(h * 0.1, 0.1, 0.14)
  const backBottom = seatH + 0.02
  const backTop = h - headH - 0.08
  const backH = Math.max(0.3, backTop - backBottom)
  const back = new THREE.Group()
  back.position.set(0, backBottom, -sd / 2 + 0.02)
  back.rotation.x = -0.14
  P.group.add(back)
  const fr = new THREE.Mesh(frameGeo(backW, backH, 0.06, 0.03, 0.026), frame)
  fr.position.y = backH / 2
  back.add(fr)
  const crossY = backH * 0.62
  const cross = new THREE.Mesh(new THREE.BoxGeometry(backW - 0.04, 0.026, 0.024), frame)
  cross.position.set(0, crossY, 0)
  back.add(cross)
  const upperH = backH - crossY - 0.03
  const up = new THREE.Mesh(new THREE.PlaneGeometry(backW - 0.05, upperH), meshMat(color2, 3, 2))
  up.position.set(0, crossY + upperH / 2 + 0.01, -0.002)
  back.add(up)
  const lowH = crossY - 0.04
  const low = new THREE.Mesh(new THREE.PlaneGeometry(backW - 0.05, lowH), meshMat(color2, 3, 2.4))
  low.position.set(0, 0.025 + lowH / 2, -0.002)
  back.add(low)
  // espinha: eixo vertical e costelas (mais largas no meio)
  const ribs: THREE.BufferGeometry[] = []
  const spineTop = crossY - 0.04
  const spineBot = 0.06
  const spine = new THREE.BoxGeometry(0.014, spineTop - spineBot, 0.016)
  spine.translate(0, (spineTop + spineBot) / 2, 0.012)
  ribs.push(spine)
  const n = 10
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const len = backW * (0.46 + 0.12 * Math.sin(Math.PI * t))
    const g = new THREE.BoxGeometry(len, 0.012, 0.014)
    g.translate(0, spineBot + 0.01 + t * (spineTop - spineBot - 0.02), 0.012)
    ribs.push(g)
  }
  const ribGeo = mergeGeometries(ribs)
  ribs.forEach((g) => g.dispose())
  back.add(new THREE.Mesh(ribGeo, frame))
  // ligação do encosto com o mecanismo (atrás)
  P.boxB(0.07, 0.03, sd / 2, 0, cylTop + 0.01, -sd / 4 - 0.02, frame, 0.008)
  const plate = P.boxB(0.07, backBottom - cylTop + 0.12, 0.022, 0, cylTop + 0.01, -sd / 2 - 0.005, frame, 0.008)
  plate.rotation.x = -0.14
  // apoio de cabeça: poste, moldura com tela e o reforço em Y
  const tilt = -0.14
  const topLocal = new THREE.Vector3(0, backH, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt).add(back.position)
  const postH = h - headH - topLocal.y + 0.02
  P.boxB(0.04, Math.max(0.04, postH), 0.022, 0, topLocal.y - 0.04, topLocal.z - 0.012, frame, 0.006)
  const head = new THREE.Group()
  head.position.set(0, h - headH / 2, topLocal.z - 0.005)
  head.rotation.x = 0.05
  P.group.add(head)
  const hw = Math.min(backW * 0.66, 0.32)
  head.add(new THREE.Mesh(frameGeo(hw, headH, 0.03, 0.018, 0.022), frame))
  const hm = new THREE.Mesh(new THREE.PlaneGeometry(hw - 0.03, headH - 0.03), meshMat(color2, 2, 1))
  hm.position.z = -0.002
  head.add(hm)
  // reforço em Y (duas hastes inclinadas e a do meio)
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.32, 0.016, 0.014), frame)
    arm.position.set(sx * hw * 0.13, headH * 0.08, 0.008)
    arm.rotation.z = sx * 0.5
    head.add(arm)
  }
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.018, headH * 0.42, 0.014), frame)
  stem.position.set(0, -headH * 0.22, 0.008)
  head.add(stem)
  return P.group
}
