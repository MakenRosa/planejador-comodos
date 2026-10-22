/**
 * Gera a casa de exemplo em public/rooms/: um apartamento fictício (sala e cozinha, quarto e banheiro)
 * em três scans no formato JSON do Apple RoomPlan (CapturedRoom, version 2). Cada scan sai num sistema
 * de coordenadas próprio, girado e deslocado, como os que vêm do iPhone: quem junta os cômodos é a
 * montagem do app (src/lib/house.ts), pelas portas em comum declaradas em casa.json.
 *
 *   node tools/gerar-exemplo.mjs
 *
 * As coordenadas abaixo são da planta (metros): x para a direita, z para o fundo, piso em y = 0.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.join(import.meta.dirname, '..', 'public', 'rooms')
const CEILING = 2.6

// ids estáveis no formato do RoomPlan (UUID em maiúsculas): o arquivo só muda se a planta mudar
const uuid = (name) => {
  const h = createHash('sha1').update(name).digest('hex').toUpperCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

const r6 = (n) => Math.round(n * 1e6) / 1e6

/** simd_float4x4 column-major: giro em torno de Y (o eixo x local aponta para (cos, -sin) em x/z) + posição. */
const matrix = (yaw, [x, y, z]) => [Math.cos(yaw), 0, -Math.sin(yaw), 0, 0, 1, 0, 0, Math.sin(yaw), 0, Math.cos(yaw), 0, x, y, z, 1].map(r6)

/** Ângulo que leva o eixo x local para a direção (dx, dz) da planta. */
const yawOf = (dx, dz) => Math.atan2(-dz, dx)

function scan(name, frame, { corners, extraWalls = [], openings, objects, sections }) {
  // planta → coordenadas do aparelho que fez o scan
  const c = Math.cos(frame.yaw)
  const s = Math.sin(frame.yaw)
  const toScan = ([x, z]) => [x * c + z * s + frame.t[0], -x * s + z * c + frame.t[1]]
  const place = (yaw, [x, z], y) => {
    const [sx, sz] = toScan([x, z])
    return matrix(yaw + frame.yaw, [sx, y, sz])
  }

  const segments = [...corners.map((a, i) => [a, corners[(i + 1) % corners.length]]), ...extraWalls]
  const walls = segments.map(([a, b], i) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    return {
      identifier: uuid(`${name}:parede:${i}`),
      category: { wall: {} },
      confidence: { high: {} },
      dimensions: [r6(L), CEILING, 0],
      transform: place(yawOf(b[0] - a[0], b[1] - a[1]), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], CEILING / 2),
      polygonCorners: [],
      parentIdentifier: null,
      story: 0,
    }
  })

  const byKind = { door: [], window: [], opening: [] }
  for (const o of openings) {
    const [a, b] = segments[o.wall]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
    const center = [a[0] + u[0] * o.offset, a[1] + u[1] * o.offset]
    byKind[o.kind].push({
      identifier: uuid(`${name}:${o.kind}:${o.name}`),
      category: o.kind === 'door' ? { door: { isOpen: false } } : { [o.kind]: {} },
      confidence: { high: {} },
      dimensions: [o.width, o.height, 0],
      transform: place(yawOf(u[0], u[1]), center, o.bottom + o.height / 2),
      parentIdentifier: walls[o.wall].identifier,
      story: 0,
    })
  }

  const objs = objects.map((o, i) => {
    const [w, h, d] = o.size
    return {
      identifier: uuid(`${name}:objeto:${i}`),
      category: { [o.category]: {} },
      confidence: { high: {} },
      attributes: o.attributes ?? {},
      dimensions: [w, h, d],
      // "along": direção da largura na planta; "face": para onde a frente (+z local) aponta
      transform: place(o.face ? Math.atan2(o.face[0], o.face[1]) : o.along === 'z' ? yawOf(0, 1) : 0, o.at, (o.bottom ?? 0) + h / 2),
      parentIdentifier: null,
      story: 0,
    }
  })

  return {
    version: 2,
    identifier: uuid(name),
    story: 0,
    walls,
    doors: byKind.door,
    windows: byKind.window,
    openings: byKind.opening,
    objects: objs,
    floors: [
      {
        identifier: uuid(`${name}:piso`),
        category: { floor: {} },
        confidence: { high: {} },
        dimensions: [0, 0, 0],
        transform: matrix(frame.yaw, [frame.t[0], 0, frame.t[1]]),
        polygonCorners: corners.map(([x, z]) => [r6(x), 0, r6(z)]),
        parentIdentifier: null,
        story: 0,
      },
    ],
    sections: sections.map((x) => {
      const [sx, sz] = toScan(x.center)
      return { label: x.label, story: 0, center: [r6(sx), 0, r6(sz)] }
    }),
  }
}

// Sala (4,2 × 4,6 m) e cozinha (2,4 × 3,0 m) num scan só, em L, separadas por uma viga sobre o vão
const salaCozinha = scan(
  'exemplo:sala-cozinha',
  { yaw: 0.31, t: [-1.7, 0.4] },
  {
    corners: [
      [0, 0],
      [6.6, 0],
      [6.6, 3.0],
      [4.2, 3.0],
      [4.2, 4.6],
      [0, 4.6],
    ],
    // parede que o RoomPlan detecta no vão entre sala e cozinha (vira só a viga)
    extraWalls: [
      [
        [4.2, 0],
        [4.2, 3.0],
      ],
    ],
    openings: [
      { name: 'entrada', kind: 'door', wall: 5, offset: 2.15, width: 0.9, height: 2.1, bottom: 0 },
      { name: 'quarto', kind: 'door', wall: 4, offset: 1.5, width: 0.8, height: 2.1, bottom: 0 },
      { name: 'banheiro', kind: 'door', wall: 4, offset: 0.425, width: 0.65, height: 2.1, bottom: 0 },
      { name: 'janela-sala', kind: 'window', wall: 0, offset: 3.0, width: 1.6, height: 1.3, bottom: 0.9 },
      { name: 'janela-cozinha', kind: 'window', wall: 0, offset: 5.5, width: 1.0, height: 1.0, bottom: 1.1 },
      { name: 'vao-cozinha', kind: 'opening', wall: 6, offset: 1.5, width: 2.8, height: 2.4, bottom: 0 },
    ],
    objects: [
      { category: 'sofa', at: [1.05, 4.13], size: [2.0, 0.85, 0.9] },
      { category: 'television', at: [1.05, 0.06], bottom: 0.95, size: [1.25, 0.72, 0.06] },
      { category: 'table', at: [2.35, 2.1], size: [1.1, 0.76, 1.1], attributes: { TableShapeType: 'circularElliptic' } },
      { category: 'chair', at: [2.35, 1.25], size: [0.45, 0.85, 0.5], face: [0, 1] },
      { category: 'chair', at: [2.35, 2.95], size: [0.45, 0.85, 0.5], face: [0, -1] },
      { category: 'chair', at: [1.5, 2.1], size: [0.45, 0.85, 0.5], face: [1, 0] },
      { category: 'chair', at: [3.2, 2.1], size: [0.45, 0.85, 0.5], face: [-1, 0] },
      { category: 'storage', at: [6.3, 1.3], size: [2.0, 0.9, 0.6], along: 'z' },
      { category: 'sink', at: [6.32, 1.0], bottom: 0.82, size: [0.55, 0.15, 0.42], along: 'z' },
      { category: 'storage', at: [6.425, 1.3], bottom: 1.5, size: [2.0, 0.7, 0.35], along: 'z' },
      { category: 'stove', at: [6.3, 2.62], size: [0.6, 0.9, 0.6], along: 'z' },
      { category: 'refrigerator', at: [4.62, 2.64], size: [0.7, 1.85, 0.7] },
    ],
    sections: [
      { label: 'livingRoom', center: [2.1, 2.3] },
      { label: 'kitchen', center: [5.4, 1.5] },
    ],
  },
)

const quarto = scan(
  'exemplo:quarto',
  { yaw: -2.2, t: [3.1, -5.0] },
  {
    corners: [
      [0, 4.72],
      [3.2, 4.72],
      [3.2, 8.12],
      [0, 8.12],
    ],
    openings: [
      { name: 'porta', kind: 'door', wall: 0, offset: 2.7, width: 0.8, height: 2.1, bottom: 0 },
      { name: 'janela', kind: 'window', wall: 2, offset: 1.6, width: 1.4, height: 1.2, bottom: 1.0 },
    ],
    objects: [
      { category: 'bed', at: [1.0, 6.6], size: [1.6, 0.5, 2.0], along: 'z' },
      { category: 'storage', at: [0.21, 5.5], size: [0.45, 0.55, 0.4], along: 'z' },
      { category: 'storage', at: [0.21, 7.7], size: [0.45, 0.55, 0.4], along: 'z' },
      { category: 'storage', at: [2.89, 6.9], size: [2.0, 2.2, 0.6], along: 'z' },
    ],
    sections: [{ label: 'bedroom', center: [1.6, 6.4] }],
  },
)

const banheiro = scan(
  'exemplo:banheiro',
  { yaw: 1.05, t: [0.6, 2.2] },
  {
    corners: [
      [3.32, 4.72],
      [5.12, 4.72],
      [5.12, 7.12],
      [3.32, 7.12],
    ],
    openings: [
      { name: 'porta', kind: 'door', wall: 0, offset: 0.455, width: 0.65, height: 2.1, bottom: 0 },
      { name: 'janela', kind: 'window', wall: 2, offset: 0.52, width: 0.6, height: 0.5, bottom: 1.6 },
    ],
    objects: [
      { category: 'toilet', at: [3.75, 6.79], size: [0.38, 0.4, 0.65] },
      { category: 'storage', at: [4.895, 5.6], size: [0.8, 0.8, 0.45], along: 'z' },
      { category: 'sink', at: [4.9, 5.6], bottom: 0.72, size: [0.5, 0.15, 0.35], along: 'z' },
    ],
    sections: [{ label: 'bathroom', center: [4.2, 5.9] }],
  },
)

const doorId = (s, n) => s.doors.find((d) => d.identifier === uuid(n)).identifier.slice(0, 8)

const casa = {
  app: 'planejador-casa',
  name: 'Apartamento de exemplo',
  exteriorWall: 0.15,
  rooms: [
    { file: 'sala-cozinha.json', name: 'Sala e cozinha', spaceNames: { livingRoom: 'Sala', kitchen: 'Cozinha' } },
    { file: 'quarto.json', name: 'Quarto' },
    { file: 'banheiro.json', name: 'Banheiro' },
  ],
  connections: [
    { a: 0, aOpening: doorId(salaCozinha, 'exemplo:sala-cozinha:door:quarto'), b: 1, bOpening: doorId(quarto, 'exemplo:quarto:door:porta'), gap: 0.12 },
    { a: 0, aOpening: doorId(salaCozinha, 'exemplo:sala-cozinha:door:banheiro'), b: 2, bOpening: doorId(banheiro, 'exemplo:banheiro:door:porta'), gap: 0.12 },
  ],
}

fs.mkdirSync(OUT, { recursive: true })
const files = { 'casa.json': casa, 'sala-cozinha.json': salaCozinha, 'quarto.json': quarto, 'banheiro.json': banheiro }
for (const [file, data] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(data, null, 2) + '\n')
  console.log(`public/rooms/${file}`)
}
