import * as THREE from 'three'

const matCache = new Map<string, THREE.MeshStandardMaterial>()

export interface MatOpts {
  rough?: number
  metal?: number
  opacity?: number
  emissive?: string
  emissiveIntensity?: number
  side?: THREE.Side
  flat?: boolean
}

/** Materiais compartilhados (cache por cor/parâmetros). Nunca descartar individualmente. */
export function mat(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = [color, o.rough ?? 0.75, o.metal ?? 0, o.opacity ?? 1, o.emissive ?? '', o.emissiveIntensity ?? 0, o.side ?? 0, o.flat ? 1 : 0].join('|')
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.75,
      metalness: o.metal ?? 0,
      transparent: (o.opacity ?? 1) < 1,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
      flatShading: !!o.flat,
    })
    if (o.emissive) {
      m.emissive = new THREE.Color(o.emissive)
      m.emissiveIntensity = o.emissiveIntensity ?? 0.5
    }
    if ((o.opacity ?? 1) < 1) m.depthWrite = false
    matCache.set(key, m)
  }
  return m
}

export const M = {
  metal: () => mat('#a9adb2', { rough: 0.35, metal: 0.85 }),
  darkMetal: () => mat('#3a3d42', { rough: 0.4, metal: 0.7 }),
  chrome: () => mat('#d7dadd', { rough: 0.15, metal: 1 }),
  glass: () => mat('#b9d4e6', { rough: 0.05, metal: 0.1, opacity: 0.28 }),
  mirror: () => mat('#e4ebef', { rough: 0.03, metal: 1 }),
  screen: () => mat('#0c0e11', { rough: 0.18, metal: 0.4 }),
  white: () => mat('#f7f7f5', { rough: 0.85 }),
  fabric: (c: string) => mat(c, { rough: 0.95 }),
}

const lineMat = new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25 })

export function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex)
  if (f < 0) c.lerp(new THREE.Color('#000000'), -f)
  else c.lerp(new THREE.Color('#ffffff'), f)
  return '#' + c.getHexString()
}

const pos = (v: number) => Math.max(v, 0.002)

/**
 * Caixa com cantos arredondados. O RoundedBoxGeometry do three r178 monta a caixa já no tamanho real
 * mas calcula os cantos como se ela tivesse 1 m — peças pequenas saem encolhidas e com "espinhos" nos
 * cantos. Aqui os cantos são calculados sobre o cubo unitário (algoritmo clássico) e só então
 * levados às medidas reais.
 */
export function roundedBoxGeometry(w: number, h: number, d: number, segments: number, radius: number) {
  const seg = segments * 2 + 1
  const r = Math.min(w / 2, h / 2, d / 2, radius)
  const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg).toNonIndexed()
  const p = g.attributes.position.array as Float32Array
  const nr = g.attributes.normal.array as Float32Array
  const half = 0.5 / seg
  const bx = w / 2 - r
  const by = h / 2 - r
  const bz = d / 2 - r
  const n = new THREE.Vector3()
  for (let i = 0; i < p.length; i += 3) {
    const sx = Math.sign(p[i])
    const sy = Math.sign(p[i + 1])
    const sz = Math.sign(p[i + 2])
    n.set(p[i] - sx * half, p[i + 1] - sy * half, p[i + 2] - sz * half).normalize()
    p[i] = bx * sx + n.x * r
    p[i + 1] = by * sy + n.y * r
    p[i + 2] = bz * sz + n.z * r
    nr[i] = n.x
    nr[i + 1] = n.y
    nr[i + 2] = n.z
  }
  g.attributes.position.needsUpdate = true
  g.attributes.normal.needsUpdate = true
  return g
}

/** Montador de peças. Origem na base, centro; frente = +Z. */
/**
 * Parte sólida de um móvel para a colisão: caixa no espaço dele (x/z a partir do centro, antes de girar;
 * y a partir da base do móvel).
 */
export interface Solid {
  x0: number
  x1: number
  z0: number
  z1: number
  y0: number
  y1: number
}

/** Parte sólida pelo centro (x, z) e tamanho (w × d), de y0 a y1. */
export const sbox = (x: number, z: number, w: number, d: number, y0: number, y1: number): Solid => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1 })

export class Parts {
  group = new THREE.Group()

  private finish<T extends THREE.Mesh>(mesh: T, x: number, y: number, z: number): T {
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.group.add(mesh)
    return mesh
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, r = 0) {
    w = pos(w)
    h = pos(h)
    d = pos(d)
    const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)
    const geo = rr > 0.002 ? roundedBoxGeometry(w, h, d, 3, rr) : new THREE.BoxGeometry(w, h, d)
    return this.finish(new THREE.Mesh(geo, m), x, y, z)
  }

  /** Caixa definida pela base (y0) em vez do centro. */
  boxB(w: number, h: number, d: number, x: number, y0: number, z: number, m: THREE.Material, r = 0) {
    return this.box(w, h, d, x, y0 + pos(h) / 2, z, m, r)
  }

  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, m: THREE.Material, seg = 24, open = false) {
    const geo = new THREE.CylinderGeometry(pos(rTop), pos(rBot), pos(h), seg, 1, open)
    return this.finish(new THREE.Mesh(geo, m), x, y, z)
  }

  /** Cilindro elíptico com base em y0 (largura w em x, profundidade d em z). */
  ellipse(w: number, h: number, d: number, x: number, y0: number, z: number, m: THREE.Material, seg = 40) {
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, seg)
    const mesh = this.finish(new THREE.Mesh(geo, m), x, y0 + pos(h) / 2, z)
    mesh.scale.set(pos(w), pos(h), pos(d))
    return mesh
  }

  blob(r: number, x: number, y: number, z: number, m: THREE.Material, detail = 1) {
    return this.finish(new THREE.Mesh(new THREE.IcosahedronGeometry(pos(r), detail), m), x, y, z)
  }

  edges(w: number, h: number, d: number, y0 = 0) {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(pos(w), pos(h), pos(d)))
    const ls = new THREE.LineSegments(geo, lineMat)
    ls.position.y = y0 + pos(h) / 2
    this.group.add(ls)
    return ls
  }

  mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
    return this.finish(new THREE.Mesh(geo, m), x, y, z)
  }
}

export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const g = (o as THREE.Mesh).geometry
    if (g) g.dispose()
  })
}

/** Gerador pseudoaleatório determinístico. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
