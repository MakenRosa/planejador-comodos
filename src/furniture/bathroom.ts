/**
 * Bancada suspensa esculpida de quartzo (estilo marmoglass): bloco com saia na frente e nas laterais,
 * frontão atrás (e, se quiser, numa ou nas duas laterais), cuba esculpida com fundo em rampa descendo
 * até o ralo oculto (fenda junto ao fundo) e torneira de mesa atrás da cuba, no meio dela. Pedra com
 * pintinhas e brilho.
 */
import * as THREE from 'three'
import { num, str, type BuildParams } from './builders'
import { M, mat, Parts, rng, shade } from './parts'
import { cached, canvasTex } from './setup'

/** Tamanho (m) de um ladrilho da textura de pedra — as pintinhas ficam do mesmo tamanho em toda face. */
const TILE = 0.25

/** Quartzo com pintinhas (claras, escuras e alguns pontos de brilho) — multiplica a cor da pedra. */
function quartzTex() {
  const t = canvasTex('quartz-speckle', 512, 512, (g, W, H) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)
    const R = rng(29)
    for (let i = 0; i < 5200; i++) {
      const v = R()
      const s = 1.6 + R() * 3.4
      g.fillStyle = v < 0.42 ? `rgba(110,84,58,${0.45 + R() * 0.4})` : v < 0.66 ? `rgba(55,46,40,${0.4 + R() * 0.4})` : v < 0.9 ? 'rgba(255,253,248,1)' : `rgba(150,128,96,${0.4 + R() * 0.3})`
      g.beginPath()
      g.arc(R() * W, R() * H, s / 2, 0, Math.PI * 2)
      g.fill()
    }
    // véu suave para a pedra não ficar chapada
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(150,130,100,${0.03 + R() * 0.03})`
      g.beginPath()
      g.arc(R() * W, R() * H, 20 + R() * 60, 0, Math.PI * 2)
      g.fill()
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

const quartz = (color: string) => cached(`quartz-${color}`, () => new THREE.MeshPhysicalMaterial({ color, map: quartzTex(), roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.15 }))

/** Caixa de pedra com UV em metros (as pintinhas ficam na mesma escala em todas as faces). */
function stoneBox(P: Parts, w: number, h: number, d: number, x: number, y0: number, z: number, m: THREE.Material) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv as THREE.BufferAttribute
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / TILE + x / TILE, (uv.getY(i) * dims[f][1]) / TILE + y0 / TILE)
    }
  return P.mesh(g, m, x, y0 + h / 2, z)
}

/**
 * Bancada esculpida. Altura do item = bloco (com a saia) + frontão. Opções: splash (altura do frontão),
 * sideSplash (frontão lateral: nenhum | esquerda | direita | ambos), basinW (largura da cuba), basinLeft
 * (distância da ponta esquerda até a cuba), faucet (mesa | nenhuma).
 */
export function carvedVanity({ w, h, d, color, options }: BuildParams) {
  const P = new Parts()
  const stone = quartz(color)
  const t = 0.02
  const splash = Math.min(Math.max(0, num(options, 'splash', 0.078)), h * 0.6)
  const blockH = Math.max(0.06, h - splash)
  const bw = Math.min(Math.max(0.2, num(options, 'basinW', 0.45)), w - 0.1)
  const bl = Math.min(Math.max(0.05, num(options, 'basinLeft', 0.24)), w - bw - 0.05)
  const back = Math.min(0.13, d * 0.24)
  const frontM = Math.min(0.08, d * 0.18)
  const bd = Math.max(0.15, d - back - frontM - t)
  const x0 = -w / 2 + bl
  const x1 = x0 + bw
  const zBack = -d / 2 + t + back
  const zFront = zBack + bd
  const top = blockH
  // saias (frente e laterais), fundo e o tampo com a abertura da cuba
  stoneBox(P, w, blockH, t, 0, 0, d / 2 - t / 2, stone)
  for (const sx of [-1, 1]) stoneBox(P, t, blockH, d - t, sx * (w / 2 - t / 2), 0, -t / 2, stone)
  stoneBox(P, w - 2 * t, t, d - t, 0, 0, -t / 2, stone)
  const ts = top - t
  stoneBox(P, x0 + w / 2, t, d - t, (-w / 2 + x0) / 2, ts, -t / 2, stone)
  stoneBox(P, w / 2 - x1, t, d - t, (x1 + w / 2) / 2, ts, -t / 2, stone)
  stoneBox(P, bw, t, zBack + d / 2, (x0 + x1) / 2, ts, (-d / 2 + zBack) / 2, stone)
  stoneBox(P, bw, t, d / 2 - t - zFront, (x0 + x1) / 2, ts, (zFront + d / 2 - t) / 2, stone)
  // frontão atrás e nas laterais escolhidas (do frontão de trás até a frente, rente à saia)
  if (splash > 0.005) {
    stoneBox(P, w, splash, t, 0, top, -d / 2 + t / 2, stone)
    const side = str(options, 'sideSplash', 'nenhum')
    for (const sx of [-1, 1]) {
      if (side !== 'ambos' && side !== (sx < 0 ? 'esquerda' : 'direita')) continue
      stoneBox(P, t, splash, d - t, sx * (w / 2 - t / 2), top, t / 2, stone)
    }
  }
  // cuba: paredes, rampa (rasa na frente, funda atrás) e a fenda do ralo junto ao fundo
  const deepB = Math.min(0.13, blockH - 0.05)
  const deepF = Math.min(0.025, deepB * 0.3)
  const slot = 0.018
  const wallH = deepB
  stoneBox(P, t, wallH, bd, x0 + t / 2, top - wallH, (zBack + zFront) / 2, stone)
  stoneBox(P, t, wallH, bd, x1 - t / 2, top - wallH, (zBack + zFront) / 2, stone)
  stoneBox(P, bw, deepF, t, (x0 + x1) / 2, top - deepF, zFront - t / 2, stone)
  stoneBox(P, bw, wallH + 0.01, t, (x0 + x1) / 2, top - wallH - 0.01, zBack + t / 2, stone)
  // rampa inclinada
  const rz0 = zBack + t + slot
  const rz1 = zFront - t
  const yB = top - deepB
  const yF = top - deepF
  const len = Math.hypot(rz1 - rz0, yF - yB)
  const rg = new THREE.PlaneGeometry(bw - 2 * t, len)
  const ruv = rg.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, (ruv.getX(i) * (bw - 2 * t)) / TILE, (ruv.getY(i) * len) / TILE)
  const ramp = P.mesh(rg, stone, (x0 + x1) / 2, (yB + yF) / 2, (rz0 + rz1) / 2)
  // deitada e inclinada: a ponta da frente fica mais alta (rasa), a de trás desce até a fenda
  ramp.rotation.x = -Math.PI / 2 - Math.atan2(yF - yB, rz1 - rz0)
  // fenda do ralo (escura) e o fundo embaixo dela
  P.boxB(bw - 2 * t, 0.004, slot, (x0 + x1) / 2, yB - 0.004, zBack + t + slot / 2, mat('#1b1a18', { rough: 0.8 }))
  stoneBox(P, bw - 2 * t, t, slot + 0.01, (x0 + x1) / 2, yB - t - 0.004, zBack + t + slot / 2, stone)
  // torneira de mesa atrás da cuba, no meio dela: corpo alto inclinado para a cuba, saída virada para
  // baixo na ponta e a alavanca em cima
  if (str(options, 'faucet', 'mesa') === 'mesa') {
    const chrome = M.chrome()
    const fx = (x0 + x1) / 2
    const fz = -d / 2 + t + back * 0.5
    P.cyl(0.024, 0.027, 0.016, fx, top + 0.008, fz, chrome, 20)
    const tilt = 0.42
    const L = 0.2
    const body = P.cyl(0.0105, 0.014, L, fx, top + 0.016 + (Math.cos(tilt) * L) / 2, fz + (Math.sin(tilt) * L) / 2, chrome, 16)
    body.rotation.x = tilt
    const tipY = top + 0.016 + Math.cos(tilt) * L
    const tipZ = fz + Math.sin(tilt) * L
    P.cyl(0.011, 0.009, 0.03, fx, tipY - 0.012, tipZ + 0.006, chrome, 14)
    const lever = P.boxB(0.011, 0.055, 0.014, fx, tipY - 0.004, tipZ - 0.012, mat(shade('#c8ccd0', -0.1), { rough: 0.2, metal: 0.9 }), 0.004)
    lever.rotation.x = -0.55
  }
  return P.group
}

// ---------------------------------------------------------------- box: ducha e registro na parede

/** Da parede ao centro do espalhador da Quadratta (sem braço). */
export const QUADRATTA_REACH = 0.26

/** Espalhador da Quadratta visto de baixo: placa clara com os furinhos em grade. */
function jetsTex() {
  return canvasTex('quadratta-jets', 256, 256, (g, W, H) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#5f646a'
    const n = 10
    for (let i = 0; i < n; i++)
      for (let k = 0; k < n; k++) {
        g.beginPath()
        g.arc(((i + 0.5) / n) * W, ((k + 0.5) / n) * H, W * 0.012, 0, Math.PI * 2)
        g.fill()
      }
  })
}

/**
 * Ducha elétrica Zagonel Quadratta, montada na parede (parede em z = 0, +z sai dela, y absoluto):
 * corpo em cunha subindo da parede até o espalhador quadrado de 22 cm, haste de controle pendurada
 * embaixo e, se quiser, a mangueirinha com o chuveirinho num suporte ao lado. `hy` = face de baixo do
 * espalhador; `standoff` = braço da parede até o corpo.
 */
export function quadrattaShower(hy: number, standoff: number, black: boolean, hose: boolean) {
  const P = new Parts()
  const body = mat(black ? '#1f2022' : '#f3f3f1', { rough: 0.32 })
  const z0 = standoff
  const yb = hy - 0.065
  if (standoff > 0.012) {
    P.cyl(0.011, 0.011, standoff, 0, yb, standoff / 2, M.chrome(), 12).rotation.x = Math.PI / 2
    P.cyl(0.026, 0.026, 0.008, 0, yb, 0.004, M.chrome(), 20).rotation.x = Math.PI / 2
  }
  // corpo: perfil lateral (sai da parede e sobe até o espalhador) extrudado na largura
  const prof: [number, number][] = [[0, -0.115], [0, -0.022], [0.16, 0.004], [0.2, 0.004], [0.2, -0.004], [0.13, -0.035], [0.07, -0.08], [0.025, -0.108]]
  const sh = new THREE.Shape()
  sh.moveTo(prof[0][0], prof[0][1])
  for (const [a, b] of prof.slice(1)) sh.lineTo(a, b)
  sh.closePath()
  const bw = 0.08
  const bg = new THREE.ExtrudeGeometry(sh, { depth: bw, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 })
  bg.translate(0, 0, -bw / 2)
  bg.rotateY(-Math.PI / 2)
  P.mesh(bg, body, 0, hy, z0 + 0.004)
  // plaquinha da marca nas laterais
  for (const sx of [-1, 1]) P.boxB(0.0015, 0.011, 0.032, sx * (bw / 2 + 0.0045), hy - 0.047, z0 + 0.085, mat('#a7adb3', { rough: 0.3, metal: 0.7 }))
  // espalhador quadrado de cantos arredondados
  const S = 0.22
  const r = 0.022
  const hs = new THREE.Shape()
  hs.moveTo(-S / 2 + r, -S / 2)
  hs.lineTo(S / 2 - r, -S / 2)
  hs.quadraticCurveTo(S / 2, -S / 2, S / 2, -S / 2 + r)
  hs.lineTo(S / 2, S / 2 - r)
  hs.quadraticCurveTo(S / 2, S / 2, S / 2 - r, S / 2)
  hs.lineTo(-S / 2 + r, S / 2)
  hs.quadraticCurveTo(-S / 2, S / 2, -S / 2, S / 2 - r)
  hs.lineTo(-S / 2, -S / 2 + r)
  hs.quadraticCurveTo(-S / 2, -S / 2, -S / 2 + r, -S / 2)
  const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 6 })
  hg.rotateX(Math.PI / 2)
  const hc = z0 + QUADRATTA_REACH
  P.mesh(hg, body, 0, hy + 0.015, hc)
  const jets = cached(`quadratta-face-${black}`, () => new THREE.MeshStandardMaterial({ map: jetsTex(), color: black ? '#4a4c50' : '#dfe2e5', roughness: 0.5 }))
  const fg = new THREE.PlaneGeometry(S - 0.03, S - 0.03)
  fg.rotateX(Math.PI / 2)
  P.mesh(fg, jets, 0, hy - 0.0005, hc)
  // haste de controle pendurada embaixo, perto da parede
  const rodTop = hy - 0.106
  const rodL = 0.34
  P.cyl(0.009, 0.009, 0.016, 0, rodTop - 0.008, z0 + 0.03, body, 14)
  P.cyl(0.0045, 0.0045, rodL, 0, rodTop - rodL / 2, z0 + 0.03, body, 10)
  P.cyl(0.006, 0.008, 0.03, 0, rodTop - rodL - 0.012, z0 + 0.03, body, 12)
  if (hose) {
    // saída embaixo do corpo, mangueira em barriga e o chuveirinho de pé no suporte ao lado
    const hx = 0.2
    const hyS = 1.2
    P.cyl(0.007, 0.007, 0.02, 0, hy - 0.068, z0 + 0.1, body, 12)
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, hy - 0.078, z0 + 0.1),
      new THREE.Vector3(0.01, hy - 0.4, z0 + 0.1),
      new THREE.Vector3(0.05, 1.02, z0 * 0.5 + 0.08),
      new THREE.Vector3(0.13, 0.9, 0.07),
      new THREE.Vector3(hx, 1.0, 0.05),
      new THREE.Vector3(hx, hyS - 0.07, 0.042),
    ])
    P.mesh(new THREE.TubeGeometry(curve, 48, 0.0055, 8, false), body)
    P.boxB(0.032, 0.045, 0.03, hx, hyS - 0.03, 0.015, body, 0.006)
    P.cyl(0.03, 0.011, 0.12, hx, hyS, 0.042, body, 20)
    P.cyl(0.026, 0.026, 0.002, hx, hyS + 0.06, 0.042, jets, 20)
  }
  return P.group
}

/**
 * Registro de chuveiro (acabamento cromado): canopla redonda, pescoço e manopla cilíndrica com um lado
 * reto e a tampa lisa. Parede em z = 0, +z sai dela.
 */
export function showerValve(y: number) {
  const P = new Parts()
  const chrome = M.chrome()
  P.cyl(0.03, 0.032, 0.008, 0, y, 0.004, chrome, 32).rotation.x = Math.PI / 2
  P.cyl(0.012, 0.012, 0.014, 0, y, 0.015, chrome, 20).rotation.x = Math.PI / 2
  const R = 0.019
  const a0 = Math.acos(0.72)
  const ds = new THREE.Shape()
  ds.absarc(0, 0, R, a0, Math.PI * 2 - a0, false)
  ds.closePath()
  const dg = new THREE.ExtrudeGeometry(ds, { depth: 0.034, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 24 })
  const knob = P.mesh(dg, chrome, 0, y, 0.022)
  knob.rotation.z = -0.6
  P.cyl(0.0155, 0.0155, 0.0015, 0, y, 0.0585, chrome, 28).rotation.x = Math.PI / 2
  return P.group
}
