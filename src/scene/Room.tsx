import { Line } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rng } from '../furniture/parts'
import { doorSwing, isSliding, openingDepth, panelSpan, polyArea, polyCentroid, roomBounds, slidingZone, swingPolygon, wallDir, wallLength, wallThicknessAt } from '../lib/geom'
import { wallPieces, wallSolids, type WallPiece } from '../lib/wallPlan'
import { baseboardGeometry, baseboardMaterial } from '../lib/baseboard'
import { DEFAULT_WALL_COLOR, paintMaterial, wallpaperMaterial } from '../lib/patterns'
import type { Opening, Room, Vec2, Vec3, Wall, WallPanel } from '../lib/types'
import { fmtCm, fmtCmShort, fmtM2 } from '../lib/util'

/** Altura das paredes no modo "paredes baixas". */
export const LOW_WALL = 1.1
/** Altura do plano de corte da planta baixa. */
export const PLAN_CUT = 1.2
import { useStore } from '../store'
import { useSceneColors } from '../theme'
import { noRaycast, usePxPerMeter, useViewRoom } from './helpers'
import { Label } from './Label'
import { DoorView, GhostCasing, useOpeningPointer } from './Openings'
import { walkApi } from './Walk'

function woodTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const g = c.getContext('2d')!
  const planks = 8
  const ph = 1024 / planks
  const R = rng(3)
  for (let i = 0; i < planks; i++) {
    let x = -R() * 500
    while (x < 1024) {
      const len = 380 + R() * 520
      g.fillStyle = `hsl(${32 + R() * 5}, ${22 + R() * 8}%, ${70 + R() * 7}%)`
      g.fillRect(x, i * ph, len, ph)
      g.strokeStyle = 'rgba(110,70,35,0.07)'
      g.lineWidth = 2
      for (let k = 0; k < 7; k++) {
        const y = i * ph + 6 + R() * (ph - 12)
        g.beginPath()
        g.moveTo(x, y)
        g.bezierCurveTo(x + len * 0.3, y + (R() - 0.5) * 8, x + len * 0.6, y + (R() - 0.5) * 8, x + len, y)
        g.stroke()
      }
      g.fillStyle = 'rgba(70,45,20,0.3)'
      g.fillRect(x, i * ph, 2, ph)
      x += len
    }
    g.fillStyle = 'rgba(70,45,20,0.3)'
    g.fillRect(0, i * ph, 1024, 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1 / 1.6, 1 / 1.6)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Porcelanato/cerâmica: placas quadradas com rejunte e leve variação de tom. */
function tileTexture(base: string, grout: string, tiles: number, tile: number, seed: number) {
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const g = c.getContext('2d')!
  const R = rng(seed)
  const ts = 1024 / tiles
  g.fillStyle = grout
  g.fillRect(0, 0, 1024, 1024)
  const b = new THREE.Color(base)
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < tiles; j++) {
      const k = b.clone().offsetHSL(0, 0, (R() - 0.5) * 0.035)
      g.fillStyle = '#' + k.getHexString()
      g.fillRect(i * ts + 2, j * ts + 2, ts - 4, ts - 4)
      g.fillStyle = 'rgba(255,255,255,0.05)'
      for (let n = 0; n < 6; n++) g.fillRect(i * ts + R() * ts, j * ts + R() * ts, 30 + R() * 60, 2)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1 / (tile * tiles), 1 / (tile * tiles))
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function cementTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  const R = rng(17)
  g.fillStyle = '#a9a7a2'
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 260; i++) {
    const v = Math.round(140 + R() * 50)
    g.fillStyle = `rgba(${v},${v - 2},${v - 6},${0.05 + R() * 0.07})`
    g.beginPath()
    g.arc(R() * 512, R() * 512, 10 + R() * 50, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1 / 2, 1 / 2)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export type FloorType = 'wood' | 'porcelain' | 'ceramic' | 'cement'
export const FLOOR_TYPES: { id: FloorType; name: string }[] = [
  { id: 'wood', name: 'Madeira / vinílico' },
  { id: 'porcelain', name: 'Porcelanato 60×60' },
  { id: 'ceramic', name: 'Cerâmica 30×30' },
  { id: 'cement', name: 'Cimento queimado' },
]

const floorMats = new Map<FloorType, THREE.MeshStandardMaterial>()
function floorMaterial(t: FloorType) {
  let m = floorMats.get(t)
  if (!m) {
    const map =
      t === 'porcelain' ? tileTexture('#e6e1d8', '#cfc9bf', 4, 0.6, 5) : t === 'ceramic' ? tileTexture('#e9eaea', '#bfc3c6', 8, 0.3, 8) : t === 'cement' ? cementTexture() : woodTexture()
    m = new THREE.MeshStandardMaterial({ map, roughness: t === 'porcelain' ? 0.35 : t === 'ceramic' ? 0.45 : 0.82 })
    floorMats.set(t, m)
  }
  return m
}

function Floor({ floor, spaceId, type = 'wood' }: { floor: Vec2[]; spaceId?: string; type?: FloorType }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape(floor.map(([x, z]) => new THREE.Vector2(x, -z)))
    const g = new THREE.ShapeGeometry(shape)
    g.rotateX(-Math.PI / 2)
    return g
  }, [floor])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh
      geometry={geo}
      material={floorMaterial(type)}
      receiveShadow
      userData={{ surface: 'floor' }}
      onClick={
        spaceId
          ? (e: ThreeEvent<MouseEvent>) => {
              // modo andar: seleciona o cômodo só num clique (sem arrastar)
              const st = useStore.getState()
              if (!st.walk || st.settings.tool !== 'select' || e.delta > 4) return
              // um móvel/porta na frente já foi selecionado no pointerdown
              if (e.intersections[0]?.eventObject !== e.eventObject) return
              e.stopPropagation()
              st.select({ kind: 'space', id: spaceId })
            }
          : undefined
      }
      onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
        if (!useStore.getState().walk || !walkApi.goTo) return
        e.stopPropagation()
        walkApi.goTo([e.point.x, e.point.z])
      }}
      onPointerDown={
        spaceId
          ? (e: ThreeEvent<PointerEvent>) => {
              const st = useStore.getState()
              if (st.settings.tool !== 'select' || e.button !== 0 || st.walk) return
              // não interrompe: o clique no vazio continua deselecionando móveis
              st.select({ kind: 'space', id: spaceId })
            }
          : undefined
      }
    />
  )
}

export interface Hole {
  u0: number
  u1: number
  v0: number
  v1: number
}

/** Prisma vertical a partir de um polígono da planta da parede (u, k) — k para fora do cômodo. */
function wallPrism(poly: Vec2[], v0: number, v1: number, out: number) {
  const shape = new THREE.Shape(poly.map(([u, k]) => new THREE.Vector2(u, -out * k)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: v1 - v0, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  g.translate(0, v0, 0)
  return g
}

/**
 * Corpo da parede: pedaços em meia-esquadria (ver lib/wallPlan) extrudados na vertical,
 * deixando livres as faixas de portas e janelas.
 */
export function buildWallGeometry(pieces: WallPiece[], H: number, out: number, holes: Hole[]) {
  const parts = wallSolids(pieces, H, holes).map((sd) => wallPrism(sd.poly, sd.v0, sd.v1, out))
  const merged = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry()
  parts.forEach((g) => g.dispose())
  return merged
}

/** Tampa escura do topo da parede (planta), com o mesmo contorno em meia-esquadria. */
function buildCapGeometry(pieces: WallPiece[], H: number, out: number) {
  const parts = pieces.map((pc) => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(pc.poly.map(([u, k]) => new THREE.Vector2(u, -out * k))))
    g.rotateX(-Math.PI / 2)
    g.translate(0, H + 0.001, 0)
    return g
  })
  const merged = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry()
  parts.forEach((g) => g.dispose())
  return merged
}

const glassMat = new THREE.MeshStandardMaterial({ color: '#a9c7dd', transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.1, depthWrite: false })

/** Folha de janela (caixilho + vidro), com origem no centro. */
function Sash({ w, h, color }: { w: number; h: number; color: string }) {
  const f = 0.035
  const frame = <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
  return (
    <group>
      <mesh position={[-w / 2 + f / 2, 0, 0]} castShadow>
        <boxGeometry args={[f, h, 0.03]} />
        {frame}
      </mesh>
      <mesh position={[w / 2 - f / 2, 0, 0]} castShadow>
        <boxGeometry args={[f, h, 0.03]} />
        {frame}
      </mesh>
      <mesh position={[0, h / 2 - f / 2, 0]} castShadow>
        <boxGeometry args={[w, f, 0.03]} />
        {frame}
      </mesh>
      <mesh position={[0, -h / 2 + f / 2, 0]} castShadow>
        <boxGeometry args={[w, f, 0.03]} />
        {frame}
      </mesh>
      <mesh material={glassMat}>
        <boxGeometry args={[Math.max(0.01, w - 2 * f), Math.max(0.01, h - 2 * f), 0.006]} />
      </mesh>
    </group>
  )
}

function WindowView({ op, t, inward }: { op: Opening; t: number; inward: number }) {
  const out = -inward
  const selected = useStore((s) => s.selection?.kind === 'opening' && s.selection.id === op.id)
  const ptr = useOpeningPointer(op)
  const zMid = (out * t) / 2
  const fw = 0.05
  const cx = op.offset
  const cy = op.bottom + op.height / 2
  const color = selected ? '#93c5fd' : '#eceef0'
  const frame = <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
  const iw = Math.max(0.05, op.width - 2 * fw)
  const ih = Math.max(0.05, op.height - 2 * fw)
  const type = op.windowType ?? 'sliding'
  const open = op.isOpen

  let sashes: ReactNode = null
  if (type === 'fixed') {
    sashes = (
      <group position={[cx, cy, zMid]}>
        <Sash w={iw} h={ih} color={color} />
      </group>
    )
  } else if (type === 'sliding') {
    // Duas folhas em trilhos diferentes; aberta = a folha interna corre sobre a externa
    const sw = iw / 2 + 0.02
    const xA = open ? cx + iw / 4 - 0.01 : cx - iw / 4 + 0.01
    const xB = cx + iw / 4 - 0.01
    sashes = (
      <>
        <group position={[xA, cy, zMid + inward * 0.017]}>
          <Sash w={sw} h={ih} color={color} />
        </group>
        <group position={[xB, cy, zMid + out * 0.017]}>
          <Sash w={sw} h={ih} color={color} />
        </group>
      </>
    )
  } else if (type === 'casement') {
    // Duas folhas de abrir, dobradiças nas laterais, abrindo para fora
    const lw = iw / 2
    const ang = open ? 1.2 : 0
    sashes = [-1, 1].map((side) => {
      const e = -side
      return (
        <group key={side} position={[cx + (side * iw) / 2, cy, zMid + out * 0.02]} rotation={[0, -out * e * ang, 0]}>
          <group position={[(e * lw) / 2, 0, 0]}>
            <Sash w={lw} h={ih} color={color} />
          </group>
        </group>
      )
    })
  } else {
    // Basculante: articulada no topo, a base projeta para fora
    sashes = (
      <group position={[cx, op.bottom + fw + ih, zMid]} rotation={[open ? -out * 0.5 : 0, 0, 0]}>
        <group position={[0, -ih / 2, 0]}>
          <Sash w={iw} h={ih} color={color} />
        </group>
      </group>
    )
  }

  return (
    <group {...ptr} userData={{ opening: op.id }}>
      <mesh position={[cx - op.width / 2 + fw / 2, cy, zMid]}>
        <boxGeometry args={[fw, op.height, 0.08]} />
        {frame}
      </mesh>
      <mesh position={[cx + op.width / 2 - fw / 2, cy, zMid]}>
        <boxGeometry args={[fw, op.height, 0.08]} />
        {frame}
      </mesh>
      <mesh position={[cx, op.bottom + op.height - fw / 2, zMid]}>
        <boxGeometry args={[op.width, fw, 0.08]} />
        {frame}
      </mesh>
      <mesh position={[cx, op.bottom + fw / 2, zMid]}>
        <boxGeometry args={[op.width, fw, 0.08]} />
        {frame}
      </mesh>
      {sashes}
      {op.bottom > 0.05 && (
        <mesh position={[cx, op.bottom - 0.0125, (out * t * 0.5 + inward * 0.04) / 2]} castShadow>
          <boxGeometry args={[op.width + 0.08, 0.025, t * 0.5 + 0.04]} />
          <meshStandardMaterial color="#e7e2da" roughness={0.5} />
        </mesh>
      )}
    </group>
  )
}

/**
 * Geometria de um revestimento: retângulo [s0,s1]×[v0,v1] na face interna, recortando portas/janelas.
 * UV em metros/ladrilho, com o desenho lido da esquerda para a direita por quem está dentro do cômodo.
 */
export function panelGeometry(s0: number, s1: number, v0: number, v1: number, holes: Hole[], inward: number, L: number, tile: number, z: number, origin: [number, number] = [0, 0]) {
  const xs = [...new Set([s0, s1, ...holes.flatMap((h) => [h.u0, h.u1]).filter((x) => x > s0 && x < s1)])].sort((a, b) => a - b)
  const pos: number[] = []
  const uv: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  const quad = (a: number, b: number, c: number, e: number) => {
    const base = pos.length / 3
    for (const [x, y] of [
      [a, c],
      [b, c],
      [b, e],
      [a, e],
    ]) {
      pos.push(x, y, z)
      nor.push(0, 0, inward)
      uv.push(((inward === 1 ? x : L - x) - origin[0]) / tile, (y - origin[1]) / tile)
    }
    if (inward === 1) idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    else idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
  }
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i]
    const b = xs[i + 1]
    if (b - a < 1e-4) continue
    const mid = (a + b) / 2
    const cover = holes.filter((h) => h.u0 <= mid && mid <= h.u1 && h.v1 > v0 && h.v0 < v1).sort((p, q) => p.v0 - q.v0)
    let v = v0
    for (const c of cover) {
      if (c.v0 > v) quad(a, b, v, Math.min(c.v0, v1))
      v = Math.max(v, c.v1)
    }
    if (v < v1) quad(a, b, v, v1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

function PanelMesh({ wall, panel, index, holes, inward }: { wall: Wall; panel: WallPanel; index: number; holes: Hole[]; inward: number }) {
  const L = wallLength(wall)
  const holesKey = holes.map((h) => [h.u0, h.u1, h.v0, h.v1].join(',')).join(';')
  const geo = useMemo(() => {
    const [a, b] = panelSpan(wall, panel.left, panel.width)
    const s0 = Math.max(0, a)
    const s1 = Math.min(L, b)
    const v0 = Math.max(0, panel.bottom)
    const v1 = Math.min(wall.height, panel.bottom + panel.height)
    if (s1 - s0 < 0.005 || v1 - v0 < 0.005) return null
    // azulejo: as peças começam inteiras no canto de baixo à esquerda da área revestida
    const origin: [number, number] = panel.kind === 'tile' ? [inward === 1 ? s0 : L - s1, v0] : [0, 0]
    return panelGeometry(s0, s1, v0, v1, holes, inward, L, panel.kind === 'paint' ? 1 : Math.max(0.05, panel.scale), inward * (0.003 + index * 0.0012), origin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wall, panel, index, holesKey, inward, L])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  const material = panel.kind === 'paint' ? paintMaterial(panel.color) : wallpaperMaterial(panel.pattern, panel.color, panel.color2)
  return <mesh geometry={geo} material={material} receiveShadow userData={{ surface: 'wall' }} />
}

/** Rodapé ao longo da face interna (fica de fora das portas e passagens). */
function BaseboardMesh({ wall, ops, inward }: { wall: Wall; ops: Opening[]; inward: number }) {
  const b = wall.baseboard
  const L = wallLength(wall)
  const opsKey = ops.map((o) => [o.kind, o.offset, o.width, o.bottom].join(',')).join(';')
  const geo = useMemo(
    () => (b ? baseboardGeometry(b, L, ops, inward) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [b, L, opsKey, inward],
  )
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo || !b) return null
  return <mesh geometry={geo} material={baseboardMaterial(b.color)} castShadow receiveShadow raycast={noRaycast} />
}

/** Contorno do revestimento quando a parede está selecionada. */
function PanelOutline({ wall, panel, inward }: { wall: Wall; panel: WallPanel; inward: number }) {
  const L = wallLength(wall)
  const [a, b] = panelSpan(wall, panel.left, panel.width)
  const s0 = Math.max(0, a)
  const s1 = Math.min(L, b)
  const v0 = Math.max(0, panel.bottom)
  const v1 = Math.min(wall.height, panel.bottom + panel.height)
  const z = inward * 0.008
  return (
    <Line
      points={[
        [s0, v0, z],
        [s1, v0, z],
        [s1, v1, z],
        [s0, v1, z],
        [s0, v0, z],
      ]}
      color="#d946ef"
      lineWidth={1.6}
      dashed
      dashSize={0.06}
      gapSize={0.04}
      raycast={noRaycast}
    />
  )
}

function WallView({ wall, room }: { wall: Wall; room: Room }) {
  const view = useStore((s) => s.settings.view)
  const colors = useSceneColors()
  const wallMode = useStore((s) => s.settings.wallMode)
  const selected = useStore((s) => s.selection?.kind === 'wall' && s.selection.id === wall.id)
  const L = wallLength(wall)
  const u = wallDir(wall)
  const yaw = Math.atan2(-u[1], u[0])
  const inward = -u[1] * wall.normal[0] + u[0] * wall.normal[1] > 0 ? 1 : -1
  const out = -inward
  const walk = useStore((s) => s.walk)
  const low = view === '3d' && wallMode === 'low' && !walk
  // Planta: paredes cortadas a 1,20 m (como desenho de arquitetura) — portas e vãos aparecem abertos
  const H = view === '2d' ? Math.min(wall.height, PLAN_CUT) : low ? Math.min(wall.height, LOW_WALL) : wall.height
  const ops = room.openings.filter((o) => o.wallId === wall.id)
  const holesKey = ops.map((o) => [o.offset, o.width, o.bottom, o.height].join(',')).join(';')
  const holes = useMemo<Hole[]>(
    () => ops.map((o) => ({ u0: o.offset - o.width / 2, u1: o.offset + o.width / 2, v0: o.bottom, v1: Math.min(wall.height, o.bottom + o.height) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [holesKey, wall.height],
  )
  const spansKey = JSON.stringify(wall.thicknessSpans ?? []) + (wall.thickness ?? room.wallThickness)
  const tAt = useMemo(
    () => (s: number) => wallThicknessAt(room, wall, s),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spansKey],
  )
  // Corpo da parede dividido nas bordas de cada porta/janela: cada vão é recortado só no seu trecho
  const pieces = useMemo(
    () => wallPieces(room, wall, [], holes.flatMap((h) => [h.u0, h.u1])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.walls, spansKey, holes],
  )
  // Vãos que chegam ao topo da parede cortada (planta a 1,20 m) ficam abertos na tampa
  const capPieces = useMemo(
    () => wallPieces(room, wall, holes.filter((h) => h.v1 >= H - 1e-3 && h.v0 < H).map((h) => [h.u0, h.u1] as [number, number])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.walls, spansKey, holes, H],
  )
  const geo = useMemo(() => buildWallGeometry(pieces, H, out, holes), [pieces, H, out, holes])
  const capGeo = useMemo(() => buildCapGeometry(capPieces, H, out), [capPieces, H, out])
  useEffect(() => () => geo.dispose(), [geo])
  useEffect(() => () => capGeo.dispose(), [capGeo])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: DEFAULT_WALL_COLOR, roughness: 0.92 }), [])
  useEffect(() => {
    material.color.set(wall.paint ?? DEFAULT_WALL_COLOR)
  }, [material, wall.paint])
  const capRef = useRef<THREE.Mesh>(null)
  const decorRef = useRef<THREE.Group>(null)

  useFrame(({ camera }) => {
    let opacity = 1
    if (view === '3d' && !walk) {
      if (wallMode === 'transparent') opacity = 0.28
      else if (wallMode === 'cutaway') {
        const s = (camera.position.x - wall.a[0]) * wall.normal[0] + (camera.position.z - wall.a[1]) * wall.normal[1]
        if (s < -0.05) opacity = 0.07
      }
    }
    if (material.opacity !== opacity) {
      material.opacity = opacity
      material.transparent = opacity < 1
      material.depthWrite = opacity === 1
      material.needsUpdate = true
    }
    if (capRef.current) capRef.current.visible = opacity === 1
    if (decorRef.current) decorRef.current.visible = opacity > 0.2
  })

  // Parede fantasma (recorte automático) não captura cliques: deixa passar para o que está atrás
  const selectable = () => material.opacity >= 0.5 && useStore.getState().settings.tool === 'select'
  const lowWall = useMemo(() => ({ ...wall, height: H }), [wall, H])

  return (
    <group position={[wall.a[0], 0, wall.a[1]]} rotation={[0, yaw, 0]}>
      <mesh
        geometry={geo}
        material={material}
        receiveShadow
        userData={{ surface: 'wall' }}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (e.button !== 0 || !selectable()) return
          e.stopPropagation()
          // no modo andar, arrastar sobre a parede é olhar em volta: seleciona só no clique
          if (!useStore.getState().walk) useStore.getState().select({ kind: 'wall', id: wall.id })
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          // e.delta: quanto o mouse andou entre apertar e soltar (arrastou = não é clique)
          if (!useStore.getState().walk || !selectable() || e.delta > 4) return
          if (e.intersections[0]?.eventObject !== e.eventObject) return
          e.stopPropagation()
          useStore.getState().select({ kind: 'wall', id: wall.id })
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          if (!selectable()) return
          e.stopPropagation()
          if (!useStore.getState().interacting) document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          if (!useStore.getState().interacting) document.body.style.cursor = ''
        }}
      />
      <mesh ref={capRef} geometry={capGeo} raycast={noRaycast}>
        <meshBasicMaterial color={selected ? '#2563eb' : view === '2d' ? colors.capPlan : colors.cap} />
      </mesh>
      <group ref={decorRef}>
        {(wall.panels ?? []).map((p, i) => (
          <PanelMesh key={p.id} wall={lowWall} panel={p} index={i} holes={holes} inward={inward} />
        ))}
        <BaseboardMesh wall={wall} ops={ops} inward={inward} />
        {!low &&
          ops.map((op) =>
            op.ghost ? (
              <GhostCasing key={op.id} op={op} primary={room.openings.find((o) => o.id === op.pairId)} t={tAt(op.offset)} inward={inward} />
            ) : op.kind === 'door' ? (
              <DoorView key={op.id} op={op} t={tAt(op.offset)} depth={openingDepth(room, op)} inward={inward} />
            ) : op.kind === 'window' ? (
              <WindowView key={op.id} op={op} t={tAt(op.offset)} inward={inward} />
            ) : null,
          )}
        {selected && (
          <group userData={{ helper: true }}>
            <Line
              points={[
                [0, 0.004, inward * 0.008],
                [L, 0.004, inward * 0.008],
                [L, H - 0.004, inward * 0.008],
                [0, H - 0.004, inward * 0.008],
                [0, 0.004, inward * 0.008],
              ]}
              color="#2563eb"
              lineWidth={3}
              raycast={noRaycast}
            />
            {(wall.panels ?? []).map((p) => (
              <PanelOutline key={p.id} wall={lowWall} panel={p} inward={inward} />
            ))}
          </group>
        )}
      </group>
    </group>
  )
}

/** Na planta, uma faixa na face interna mostra a cor da parede e os revestimentos. */
function WallFinishStrips({ room }: { room: Room }) {
  return (
    <>
      {room.walls.map((w) => {
        const hasPaint = w.paint && w.paint.toLowerCase() !== DEFAULT_WALL_COLOR
        if (!hasPaint && !(w.panels ?? []).length) return null
        const u = wallDir(w)
        const L = wallLength(w)
        const k = 0.022
        const P = (s: number, y: number): Vec3 => [w.a[0] + u[0] * s + w.normal[0] * k, y, w.a[1] + u[1] * s + w.normal[1] * k]
        return (
          <group key={w.id}>
            {hasPaint && <Line points={[P(0, w.height + 0.004), P(L, w.height + 0.004)]} color={w.paint!} lineWidth={6} raycast={noRaycast} />}
            {(w.panels ?? []).map((p) => {
              const [a, b] = panelSpan(w, p.left, p.width)
              return (
                <Line
                  key={p.id}
                  points={[P(Math.max(0, a), w.height + 0.005), P(Math.min(L, b), w.height + 0.005)]}
                  color={p.kind === 'wallpaper' ? p.color2 : p.color}
                  lineWidth={6}
                  dashed={p.kind !== 'paint'}
                  dashSize={0.05}
                  gapSize={0.03}
                  raycast={noRaycast}
                />
              )
            })}
          </group>
        )
      })}
    </>
  )
}

function DoorSwings({ room }: { room: Room }) {
  return (
    <>
      {room.openings
        .filter((o) => o.kind === 'door' && !o.ghost)
        .map((op) => {
          if (isSliding(op)) {
            const z = slidingZone(room, op, 0.05)
            if (!z) return null
            const pts = [...z, z[0]].map(([x, zz]) => [x, 0.004, zz] as Vec3)
            return <Line key={op.id} points={pts} color="#94a3b8" lineWidth={1.2} dashed dashSize={0.05} gapSize={0.035} />
          }
          const s = doorSwing(room, op)
          const poly = swingPolygon(room, op, 28)
          if (!s || !poly) return null
          const arc = poly.slice(1).map(([x, z]) => [x, 0.004, z] as Vec3)
          const end = arc[arc.length - 1]
          return (
            <group key={op.id}>
              <Line points={arc} color="#94a3b8" lineWidth={1.2} dashed dashSize={0.05} gapSize={0.035} />
              <Line points={[[s.hinge[0], 0.004, s.hinge[1]], end]} color="#94a3b8" lineWidth={1.6} />
            </group>
          )
        })}
    </>
  )
}

/** Casa: cotas internas de cada cômodo, rente à face interna das paredes. */
function InteriorDims({ room }: { room: Room }) {
  const ppm = usePxPerMeter()
  if (ppm < 60) return null
  return (
    <>
      {room.walls.map((w) => {
        const L = wallLength(w)
        if (L < 0.45 || room.openings.some((o) => o.wallId === w.id && o.width >= 0.9 * L)) return null
        const n = w.normal
        const u = wallDir(w)
        const k = 0.2
        const y = 0.012
        const P = (s: number, kk = k): Vec3 => [w.a[0] + u[0] * s + n[0] * kk, y, w.a[1] + u[1] * s + n[1] * kk]
        const p0 = P(0.02)
        const p1 = P(L - 0.02)
        return (
          <group key={w.id}>
            <Line points={[p0, p1]} color="#94a3b8" lineWidth={1} />
            <Line points={[P(0.02, k - 0.05), P(0.02, k + 0.05)]} color="#64748b" lineWidth={1.4} />
            <Line points={[P(L - 0.02, k - 0.05), P(L - 0.02, k + 0.05)]} color="#64748b" lineWidth={1.4} />
            <Label position={P(L / 2)} text={fmtCm(L)} variant="wall" />
          </group>
        )
      })}
    </>
  )
}

/** Nome e área de cada cômodo; clique seleciona o cômodo. */
function SpaceLabels({ room }: { room: Room }) {
  const select = useStore((s) => s.select)
  const selection = useStore((s) => s.selection)
  return (
    <>
      {(room.spaces ?? []).map((sp) => {
        const c = polyCentroid(sp.floor)
        return (
          <Label
            key={sp.id}
            position={[c[0], 0.03, c[1]]}
            text={`${sp.name}\n${fmtM2(polyArea(sp.floor))}`}
            variant="space"
            selected={selection?.kind === 'space' && selection.id === sp.id}
            onClick={() => select({ kind: 'space', id: sp.id })}
          />
        )
      })}
    </>
  )
}

function RoomDims({ room }: { room: Room }) {
  const colors = useSceneColors()
  const t = room.wallThickness
  return (
    <>
      {room.walls.map((w) => {
        const n = w.normal
        const u = wallDir(w)
        const off = t + 0.3
        const y = 0.01
        const P = (p: Vec2, k: number): Vec3 => [p[0] - n[0] * k, y, p[1] - n[1] * k]
        const p0 = P(w.a, off)
        const p1 = P(w.b, off)
        const s: Vec2 = [(u[0] - n[0]) * 0.035, (u[1] - n[1]) * 0.035]
        const tick = (p: Vec3): Vec3[] => [
          [p[0] - s[0], y, p[2] - s[1]],
          [p[0] + s[0], y, p[2] + s[1]],
        ]
        return (
          <group key={w.id}>
            <Line points={[p0, p1]} color={colors.dimLine} lineWidth={1} />
            <Line points={[P(w.a, t + 0.05), P(w.a, off + 0.06)]} color={colors.dimExt} lineWidth={1} />
            <Line points={[P(w.b, t + 0.05), P(w.b, off + 0.06)]} color={colors.dimExt} lineWidth={1} />
            <Line points={tick(p0)} color={colors.dimTick} lineWidth={2} />
            <Line points={tick(p1)} color={colors.dimTick} lineWidth={2} />
            <Label position={[(p0[0] + p1[0]) / 2, y, (p0[2] + p1[2]) / 2]} text={fmtCm(wallLength(w))} variant="wall" />
          </group>
        )
      })}
    </>
  )
}

function OpeningLabels({ room }: { room: Room }) {
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const ppm = usePxPerMeter()
  if (ppm < 85) return null
  return (
    <>
      {room.openings.map((op) => {
        const w = room.walls.find((x) => x.id === op.wallId)
        if (!w || op.ghost) return null
        const u = wallDir(w)
        const k = op.kind === 'window' ? 0.42 : 0.24
        const p: Vec3 = [w.a[0] + u[0] * op.offset + w.normal[0] * k, 0.02, w.a[1] + u[1] * op.offset + w.normal[1] * k]
        const text =
          op.kind === 'door'
            ? `Porta ${fmtCmShort(op.width)}`
            : op.kind === 'window'
              ? `Janela ${fmtCmShort(op.width)}\npeitoril ${fmtCmShort(op.bottom)}`
              : `Vão ${fmtCmShort(op.width)}`
        return (
          <Label
            key={op.id}
            position={p}
            text={text}
            variant="opening"
            selected={selection?.id === op.id}
            onClick={() => select({ kind: 'opening', id: op.id })}
          />
        )
      })}
    </>
  )
}

function GridLines({ room }: { room: Room }) {
  const colors = useSceneColors()
  const b = roomBounds(room)
  const [minor, major] = useMemo(() => {
    const x0 = Math.floor(b.minX - 0.6)
    const x1 = Math.ceil(b.maxX + 0.6)
    const z0 = Math.floor(b.minZ - 0.6)
    const z1 = Math.ceil(b.maxZ + 0.6)
    const mi: number[] = []
    const ma: number[] = []
    for (let i = Math.round(x0 * 10); i <= Math.round(x1 * 10); i++) {
      const x = i / 10
      ;(i % 10 === 0 ? ma : mi).push(x, 0, z0, x, 0, z1)
    }
    for (let i = Math.round(z0 * 10); i <= Math.round(z1 * 10); i++) {
      const z = i / 10
      ;(i % 10 === 0 ? ma : mi).push(x0, 0, z, x1, 0, z)
    }
    const mk = (a: number[]) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3))
      return g
    }
    return [mk(mi), mk(ma)]
  }, [b.minX, b.maxX, b.minZ, b.maxZ])
  return (
    <group position-y={0.002}>
      <lineSegments geometry={minor} raycast={noRaycast}>
        <lineBasicMaterial color={colors.grid} transparent opacity={colors.gridMinor} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={major} raycast={noRaycast}>
        <lineBasicMaterial color={colors.grid} transparent opacity={colors.gridMajor} depthWrite={false} />
      </lineSegments>
    </group>
  )
}

export function RoomView() {
  const room = useViewRoom()
  const view = useStore((s) => s.settings.view)
  const showGrid = useStore((s) => s.settings.showGrid)
  const showDims = useStore((s) => s.settings.showRoomDims)
  const showSwings = useStore((s) => s.settings.showSwings)
  const wallMode = useStore((s) => s.settings.wallMode)
  const walk = useStore((s) => s.walk)
  if (!room) return null
  return (
    <>
      <group name="room">
        {room.spaces?.length ? (
          room.spaces.map((sp) => <Floor key={sp.id} floor={sp.floor} spaceId={sp.id} type={(sp.floorType as FloorType) ?? 'wood'} />)
        ) : (
          <Floor floor={room.floor} />
        )}
        {room.walls.map((w) => (
          <WallView key={w.id} wall={w} room={room} />
        ))}
      </group>
      <group userData={{ helper: true }}>
        {showGrid && <GridLines room={room} />}
        {view === '2d' && <WallFinishStrips room={room} />}
        {showSwings && <DoorSwings room={room} />}
        {/* em primeira pessoa as cotas dos cômodos atravessariam as paredes: ficam ocultas */}
        {showDims && !walk && (room.spaces && room.spaces.length > 1 ? <InteriorDims room={room} /> : <RoomDims room={room} />)}
        {showDims && view === '2d' && <OpeningLabels room={room} />}
        {(room.spaces?.length ?? 0) > 1 && (view === '2d' || (wallMode === 'low' && !walk)) && <SpaceLabels room={room} />}
      </group>
    </>
  )
}
