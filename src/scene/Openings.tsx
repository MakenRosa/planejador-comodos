/**
 * Portas (de abrir ou de correr, madeira ou vidro, com batente, alisar e maçaneta) e o clique/arraste
 * de portas e janelas: clicar seleciona; com a abertura já selecionada, arrastar muda de lugar na
 * parede (janelas também sobem/descem e passam para outra parede do cômodo).
 */
import { Edges } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { DEFAULT_FRAME, DEFAULT_LEAF, defaultRailDepth, finishMaterial, glassMaterial, handleModelOf, metalMaterial, SELECTED_GLASS, SELECTED_LEAF } from '../lib/doors'
import { isSliding, slidingLayout, wallDir, wallLength } from '../lib/geom'
import type { Opening, Room, Wall } from '../lib/types'
import { clamp, snapTo } from '../lib/util'
import { useStore } from '../store'
import { rayAtY, type ControlsLike } from './helpers'

type PEvent = ThreeEvent<PointerEvent>

/** Espessura do batente (forra do vão). */
const JT = 0.015

/** Alisar: moldura em volta do vão (7 cm, ou a largura da porta), numa face da parede (z). */
function Casing({ op, z, finish }: { op: Opening; z: number; finish?: string }) {
  const c = op.casing ?? 0.07
  const h = op.height + c
  const side = finishMaterial(finish, DEFAULT_FRAME, c, h)
  const top = finishMaterial(finish, DEFAULT_FRAME, op.width + 2 * c, c, true)
  return (
    <group>
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[op.offset + sd * (op.width / 2 + c / 2), op.bottom + h / 2, z]} material={side}>
          <boxGeometry args={[c, h, 0.012]} />
        </mesh>
      ))}
      <mesh position={[op.offset, op.bottom + op.height + c / 2, z]} material={top}>
        <boxGeometry args={[op.width + 2 * c, c, 0.012]} />
      </mesh>
    </group>
  )
}

/** Batente: forra as laterais e o topo do vão, de z0 a z1 (a espessura da parede). */
function Jambs({ op, z0, z1, finish }: { op: Opening; z0: number; z1: number; finish?: string }) {
  const d = Math.abs(z1 - z0)
  if (d < 0.01) return null
  const zc = (z0 + z1) / 2
  const side = finishMaterial(finish, DEFAULT_FRAME, d, op.height)
  const top = finishMaterial(finish, DEFAULT_FRAME, op.width, d, true)
  return (
    <group>
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[op.offset + sd * (op.width / 2 - JT / 2), op.bottom + op.height / 2, zc]} material={side}>
          <boxGeometry args={[JT, op.height, d]} />
        </mesh>
      ))}
      <mesh position={[op.offset, op.bottom + op.height - JT / 2, zc]} material={top}>
        <boxGeometry args={[op.width - 2 * JT, JT, d]} />
      </mesh>
    </group>
  )
}

const PI2 = Math.PI / 2

/**
 * Maçaneta/puxador numa face da folha. Origem no eixo da maçaneta, rente à face; +z sai da face.
 * `toHinge`: para que lado (x) a alavanca aponta.
 */
function HandleModel({ model, mat, toHinge }: { model: string; mat: THREE.Material; toHinge: number }) {
  const key = <meshStandardMaterial color="#141414" roughness={0.6} />
  switch (model) {
    case 'alavanca-quadrada':
      return (
        <group>
          <mesh position-z={0.004} material={mat}>
            <boxGeometry args={[0.052, 0.052, 0.008]} />
          </mesh>
          <mesh rotation-x={PI2} position-z={0.026} material={mat}>
            <cylinderGeometry args={[0.008, 0.008, 0.04, 12]} />
          </mesh>
          <mesh position={[toHinge * 0.058, 0, 0.048]} material={mat}>
            <boxGeometry args={[0.13, 0.014, 0.012]} />
          </mesh>
          <mesh position={[0, -0.078, 0.003]} material={mat}>
            <boxGeometry args={[0.04, 0.03, 0.006]} />
          </mesh>
          <mesh position={[0, -0.078, 0.0065]}>
            <boxGeometry args={[0.004, 0.012, 0.001]} />
            {key}
          </mesh>
        </group>
      )
    case 'bola':
      return (
        <group>
          <mesh rotation-x={PI2} position-z={0.004} material={mat}>
            <cylinderGeometry args={[0.03, 0.03, 0.008, 28]} />
          </mesh>
          <mesh rotation-x={PI2} position-z={0.024} material={mat}>
            <cylinderGeometry args={[0.009, 0.012, 0.035, 14]} />
          </mesh>
          <mesh position-z={0.06} material={mat}>
            <sphereGeometry args={[0.029, 24, 16]} />
          </mesh>
          <mesh position={[0, 0, 0.0885]}>
            <boxGeometry args={[0.004, 0.012, 0.002]} />
            {key}
          </mesh>
        </group>
      )
    case 'puxador':
    case 'puxador-longo': {
      const L = model === 'puxador' ? 0.4 : 1.0
      return (
        <group>
          <mesh position-z={0.05} material={mat}>
            <cylinderGeometry args={[0.0125, 0.0125, L, 16]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} rotation-x={PI2} position={[0, s * (L / 2 - 0.06), 0.025]} material={mat}>
              <cylinderGeometry args={[0.007, 0.007, 0.05, 10]} />
            </mesh>
          ))}
        </group>
      )
    }
    case 'concha':
      return (
        <group>
          <mesh position-z={0.0015} material={mat}>
            <boxGeometry args={[0.05, 0.15, 0.003]} />
          </mesh>
          <mesh position-z={0.0032}>
            <boxGeometry args={[0.032, 0.12, 0.001]} />
            {key}
          </mesh>
        </group>
      )
    default:
      // alavanca com roseta redonda e espelho de chave
      return (
        <group>
          <mesh rotation-x={PI2} position-z={0.004} material={mat}>
            <cylinderGeometry args={[0.026, 0.026, 0.008, 28]} />
          </mesh>
          <mesh rotation-x={PI2} position-z={0.03} material={mat}>
            <cylinderGeometry args={[0.009, 0.009, 0.05, 12]} />
          </mesh>
          <mesh position={[toHinge * 0.058, 0, 0.052]} rotation-z={PI2} material={mat}>
            <cylinderGeometry args={[0.0095, 0.0095, 0.13, 14]} />
          </mesh>
          <mesh rotation-x={PI2} position={[0, -0.078, 0.003]} material={mat}>
            <cylinderGeometry args={[0.018, 0.018, 0.006, 22]} />
          </mesh>
          <mesh position={[0, -0.078, 0.0065]}>
            <boxGeometry args={[0.004, 0.012, 0.001]} />
            {key}
          </mesh>
        </group>
      )
  }
}

/** Maçaneta dos dois lados da folha (espessura th); `inner` troca o modelo do lado de trás. */
function BothHandles({ x, y, th, model, back, mat, toHinge }: { x: number; y: number; th: number; model: string; back?: string; mat: THREE.Material; toHinge: number }) {
  return (
    <group position={[x, y, 0]}>
      <group position-z={th / 2}>
        <HandleModel model={model} mat={mat} toHinge={toHinge} />
      </group>
      <group position-z={-th / 2} scale={[1, 1, -1]}>
        <HandleModel model={back ?? model} mat={mat} toHinge={toHinge} />
      </group>
    </group>
  )
}

function Leaf({ w, h, th, op, selected, children }: { w: number; h: number; th: number; op: Opening; selected: boolean; children?: ReactNode }) {
  const mat = op.glass ? (selected ? SELECTED_GLASS : glassMaterial(op.glassTint)) : selected ? SELECTED_LEAF : finishMaterial(op.leafFinish, DEFAULT_LEAF, w, h)
  return (
    <mesh material={mat} castShadow={!op.glass}>
      <boxGeometry args={[w, h, th]} />
      {op.glass && <Edges color="#86aaa6" />}
      {children}
    </mesh>
  )
}

/** Porta de abrir: folha nas dobradiças, abre 90° para dentro ou para fora. */
function SwingDoor({ op, t, inward, selected }: { op: Opening; t: number; inward: number; selected: boolean }) {
  const out = -inward
  const th = op.glass ? 0.01 : 0.035
  const lw = op.width - 2 * JT - 0.006
  const lh = op.height - JT - 0.008
  const e = op.hingeAtEnd ? -1 : 1
  const hingeU = op.offset - e * (op.width / 2 - JT - 0.003)
  const swingDir = op.swingOut ? out : inward
  const phi = op.isOpen ? (-swingDir * e * Math.PI) / 2 : 0
  const zPivot = op.swingOut ? out * (t - th / 2 - 0.006) : out * (th / 2 + 0.006)
  const metal = metalMaterial(op.handleFinish, op.glass ? 'inox' : 'cromado')
  const model = handleModelOf(op)
  return (
    <group position={[hingeU, op.bottom + 0.005, zPivot]} rotation={[0, phi, 0]}>
      <group position={[(e * lw) / 2, lh / 2, 0]}>
        <Leaf w={lw} h={lh} th={th} op={op} selected={selected} />
      </group>
      {op.glass
        ? // dobradiças de vidro (ferragens de pressão)
          [0.25, lh - 0.25].map((y) => (
            <mesh key={`g${y}`} position={[e * 0.045, y, 0]} material={metal}>
              <boxGeometry args={[0.09, 0.055, th + 0.016]} />
            </mesh>
          ))
        : [0.22, lh / 2, lh - 0.22].map((y) => (
            <mesh key={`w${y}`} position={[0, y, 0]} material={metal}>
              <cylinderGeometry args={[0.0065, 0.0065, 0.09, 10]} />
            </mesh>
          ))}
      <BothHandles x={e * (lw - 0.065)} y={Math.min(1.0, lh * 0.47)} th={th} model={model} mat={metal} toHinge={-e} />
    </group>
  )
}

/**
 * Porta de correr aparente: a folha (4 cm maior que o vão de cada lado) fica sobre a face da parede,
 * pendurada em roldanas num trilho; aberta, corre para o lado e libera o vão.
 */
function SlidingDoor({ op, depth, inward, selected }: { op: Opening; depth: number; inward: number; selected: boolean }) {
  const out = -inward
  const L = slidingLayout(op)
  const th = op.glass ? 0.01 : 0.035
  const zFace = op.swingOut ? out * depth : 0
  const sgn = op.swingOut ? out : inward
  // face de fora da folha a `railDepth` da parede (o trilho fica no plano da folha ou logo atrás)
  const outer = Math.max(th + 0.008, op.railDepth ?? defaultRailDepth(op))
  const zLeaf = zFace + sgn * (outer - th / 2)
  const lh = op.height + 0.03
  const y0 = op.bottom + 0.008
  const top = y0 + lh
  const railY = top + 0.05
  const metal = metalMaterial(op.handleFinish, op.glass ? 'inox' : 'preto')
  const rail = op.glass ? metal : metalMaterial(op.handleFinish ?? 'preto')
  const len = L.rail[1] - L.rail[0]
  const rc = (L.rail[0] + L.rail[1]) / 2
  const zRail = op.glass ? zLeaf : zFace + sgn * Math.max(0.006, outer - th - 0.01)
  const carriers = [-1, 1].map((k) => L.center + k * (L.lw / 2 - 0.12))
  const model = handleModelOf(op)
  return (
    <group>
      <group position={[L.center, y0 + lh / 2, zLeaf]}>
        <Leaf w={L.lw} h={lh} th={th} op={op} selected={selected} />
      </group>
      {/* trilho, suportes na parede e batentes de fim de curso */}
      {op.glass ? (
        <mesh key="rail-tube" position={[rc, railY, zRail]} rotation-z={PI2} material={rail}>
          <cylinderGeometry args={[0.0125, 0.0125, len, 16]} />
        </mesh>
      ) : (
        <mesh key="rail-bar" position={[rc, railY, zRail]} material={rail}>
          <boxGeometry args={[len, 0.04, 0.006]} />
        </mesh>
      )}
      {[L.rail[0] + 0.04, rc, L.rail[1] - 0.04].map((x) => (
        <mesh key={x} position={[x, railY, (zFace + zRail) / 2]} rotation-x={PI2} material={rail}>
          <cylinderGeometry args={[0.008, 0.008, Math.max(0.005, Math.abs(zRail - zFace)), 10]} />
        </mesh>
      ))}
      {[L.rail[0] + 0.012, L.rail[1] - 0.012].map((x) => (
        <mesh key={x} position={[x, railY, zRail]} material={rail}>
          <boxGeometry args={[0.024, 0.035, 0.03]} />
        </mesh>
      ))}
      {/* roldanas */}
      {carriers.map((x) =>
        op.glass ? (
          <group key={`g${x}`}>
            <mesh position={[x, top - 0.02, zLeaf]} material={metal}>
              <boxGeometry args={[0.06, 0.05, th + 0.016]} />
            </mesh>
            <mesh position={[x, (top + railY) / 2, zLeaf]} material={metal}>
              <boxGeometry args={[0.012, railY - top, 0.012]} />
            </mesh>
            <mesh position={[x, railY + 0.012, zLeaf + sgn * 0.02]} rotation-x={PI2} material={metal}>
              <cylinderGeometry args={[0.026, 0.026, 0.012, 20]} />
            </mesh>
          </group>
        ) : (
          <group key={`w${x}`}>
            <mesh position={[x, (top - 0.14 + railY + 0.03) / 2, zLeaf + sgn * (th / 2 + 0.003)]} material={rail}>
              <boxGeometry args={[0.035, railY + 0.03 - (top - 0.14), 0.005]} />
            </mesh>
            <mesh position={[x, railY + 0.03, zRail]} rotation-x={PI2} material={rail}>
              <cylinderGeometry args={[0.035, 0.035, 0.014, 22]} />
            </mesh>
            <mesh position={[x, railY + 0.03, (zRail + zLeaf + sgn * th / 2) / 2]} rotation-x={PI2} material={rail}>
              <cylinderGeometry args={[0.006, 0.006, Math.abs(zLeaf + sgn * th / 2 - zRail) + 0.01, 8]} />
            </mesh>
          </group>
        ),
      )}
      {/* guia no piso */}
      <mesh position={[op.offset + L.side * (op.width / 2 + 0.025), op.bottom + 0.01, zLeaf]} material={rail}>
        <boxGeometry args={[0.03, 0.02, th + 0.02]} />
      </mesh>
      {/* puxador na ponta que fecha; do lado da parede, concha (passa rente ao alisar) */}
      <group position={[0, 0, zLeaf]} scale={[1, 1, sgn]}>
        <BothHandles x={L.center - L.side * (L.lw / 2 - 0.07)} y={Math.min(1.0, lh * 0.47)} th={th} model={model} back="concha" mat={metal} toHinge={L.side} />
      </group>
    </group>
  )
}

export function DoorView({ op, t, depth, inward }: { op: Opening; t: number; depth: number; inward: number }) {
  const out = -inward
  const selected = useStore((s) => s.selection?.kind === 'opening' && s.selection.id === op.id)
  const ptr = useOpeningPointer(op)
  return (
    <group {...ptr} userData={{ opening: op.id }}>
      <Casing op={op} z={inward * 0.006} finish={op.frameFinish} />
      <Jambs op={op} z0={0} z1={out * t} finish={op.frameFinish} />
      {isSliding(op) ? (
        <SlidingDoor key={`s${op.glass ? 'v' : 'm'}`} op={op} depth={depth} inward={inward} selected={selected} />
      ) : (
        <SwingDoor key={`a${op.glass ? 'v' : 'm'}`} op={op} t={t} inward={inward} selected={selected} />
      )}
    </group>
  )
}

/** O outro lado de uma porta entre cômodos: alisar e batente, com o acabamento da porta. */
export function GhostCasing({ op, primary, t, inward }: { op: Opening; primary?: Opening; t: number; inward: number }) {
  if (op.kind !== 'door') return null
  const finish = primary?.frameFinish
  return (
    <group>
      <Casing op={{ ...op, casing: op.casing ?? primary?.casing }} z={inward * 0.006} finish={finish} />
      <Jambs op={op} z0={0} z1={-inward * t} finish={finish} />
    </group>
  )
}

// ---------------------------------------------------------------- clique e arraste

interface OpeningDrag {
  id: string
  /** Onde o mouse pegou, relativo ao centro (u) e à base (v) da abertura. */
  du: number
  dv: number
  x: number
  y: number
  started: boolean
}

/** Raio do mouse → parede (e posição nela) sob o cursor; o raio passa pelos vãos das outras aberturas. */
function wallHit(ray: THREE.Ray, walls: Wall[], plan: boolean, room?: Room, self?: Opening): { wall: Wall; u: number; v: number } | null {
  if (plan) {
    const p = rayAtY(ray, 0)
    if (!p) return null
    let best: { wall: Wall; u: number; v: number; d: number } | null = null
    for (const w of walls) {
      const d = wallDir(w)
      const L = wallLength(w)
      const u = clamp((p.x - w.a[0]) * d[0] + (p.z - w.a[1]) * d[1], 0, L)
      const dist = Math.hypot(p.x - (w.a[0] + d[0] * u), p.z - (w.a[1] + d[1] * u))
      if (dist < 0.6 && (!best || dist < best.d)) best = { wall: w, u, v: 0, d: dist }
    }
    return best
  }
  let best: { wall: Wall; u: number; v: number; t: number } | null = null
  for (const w of walls) {
    const n = new THREE.Vector3(w.normal[0], 0, w.normal[1])
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(w.a[0], 0, w.a[1]))
    const p = ray.intersectPlane(plane, new THREE.Vector3())
    if (!p) continue
    const d = wallDir(w)
    const u = (p.x - w.a[0]) * d[0] + (p.z - w.a[1]) * d[1]
    if (u < -0.05 || u > wallLength(w) + 0.05 || p.y < -0.05 || p.y > w.height + 0.05) continue
    const hole = room?.openings.some(
      (o) => o.wallId === w.id && o.id !== self?.id && o.id !== self?.pairId && Math.abs(u - o.offset) < o.width / 2 && p.y > o.bottom && p.y < o.bottom + o.height,
    )
    if (hole) continue
    const t = p.distanceTo(ray.origin)
    if (!best || t < best.t) best = { wall: w, u, v: p.y, t }
  }
  return best
}

/** Encaixa o vão [c ± w/2] na parede sem encostar em outro (5 cm de folga); null se não couber. */
function fitOnWall(room: Room, op: Opening, wall: Wall, c: number): number | null {
  const L = wallLength(wall)
  const half = op.width / 2
  const gap = 0.05
  const others = room.openings
    .filter((o) => o.wallId === wall.id && o.id !== op.id && o.id !== op.pairId)
    .map((o) => [o.offset - o.width / 2 - gap - half, o.offset + o.width / 2 + gap + half] as [number, number])
  let x = clamp(c, half, L - half)
  for (let pass = 0; pass < 3; pass++) {
    const hit = others.find(([a, b]) => x > a && x < b)
    if (!hit) break
    x = x - hit[0] < hit[1] - x ? hit[0] : hit[1]
    if (x < half - 1e-6 || x > L - half + 1e-6) return null
  }
  return others.some(([a, b]) => x > a + 1e-6 && x < b - 1e-6) ? null : x
}

function useOpeningPointer(op: Opening) {
  const get = useThree((s) => s.get)
  const drag = useRef<OpeningDrag | null>(null)
  const controls = () => get().controls as unknown as ControlsLike | null
  const end = (e: PEvent) => {
    if (!drag.current) return
    ;(e.target as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture(e.pointerId)
    const started = drag.current.started
    drag.current = null
    const c = controls()
    if (c) c.enabled = true
    if (started) useStore.getState().setInteracting(false)
  }
  return {
    onPointerDown: (e: PEvent) => {
      const st = useStore.getState()
      if (st.settings.tool !== 'select' || e.button !== 0) return
      e.stopPropagation()
      const was = st.selection?.kind === 'opening' && st.selection.id === op.id
      st.select({ kind: 'opening', id: op.id })
      // arrastar só move depois de selecionada (arrastar sobre uma porta continua girando a vista)
      if (!was || !st.room) return
      const wall = st.room.walls.find((w) => w.id === op.wallId)
      const h = wall && wallHit(e.ray, [wall], st.settings.view === '2d')
      if (!h) return
      drag.current = { id: op.id, du: h.u - op.offset, dv: h.v - op.bottom, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, started: false }
      const c = controls()
      if (c) c.enabled = false
      ;(e.target as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: PEvent) => {
      const d = drag.current
      if (!d) return
      e.stopPropagation()
      const st = useStore.getState()
      const room = st.room
      const cur = room?.openings.find((o) => o.id === d.id)
      if (!room || !cur) return
      if (!d.started) {
        if (Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) < 3) return
        d.started = true
        st.commit()
        st.setInteracting(true)
      }
      const plan = st.settings.view === '2d'
      // porta entre cômodos fica na sua parede; as outras passam para as outras paredes do mesmo cômodo
      const own = room.walls.find((w) => w.id === cur.wallId)
      const walls = cur.pairId || cur.ghost || !own ? room.walls.filter((w) => w.id === cur.wallId) : room.walls.filter((w) => w.spaceId === own.spaceId)
      const h = wallHit(e.ray, walls, plan, room, cur)
      if (!h) return
      const alt = e.nativeEvent.altKey
      const step = alt ? 0.001 : 0.01
      const L = wallLength(h.wall)
      let c = h.u - d.du
      // ímã: centro da parede
      if (!alt && Math.abs(c - L / 2) < 0.03) c = L / 2
      const x = fitOnWall(room, cur, h.wall, snapTo(c, step))
      if (x === null) return
      const patch: Partial<Opening> = { offset: x, wallId: h.wall.id }
      if (cur.kind === 'window' && !plan) {
        let b = snapTo(h.v - d.dv, step)
        // ímã: mesma altura de peitoril das outras janelas
        if (!alt) for (const o of room.openings) if (o.kind === 'window' && o.id !== cur.id && Math.abs(o.bottom - b) < 0.03) b = o.bottom
        patch.bottom = clamp(b, 0, Math.max(0, h.wall.height - cur.height))
      }
      st.updateOpening(cur.id, patch, false)
    },
    onPointerUp: end,
    onLostPointerCapture: end,
    // no modo andar o piso/parede atrás selecionam no clique: a porta fica com ele
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (useStore.getState().settings.tool === 'select') e.stopPropagation()
    },
    onPointerOver: (e: PEvent) => {
      if (useStore.getState().settings.tool !== 'select') return
      e.stopPropagation()
      const st = useStore.getState()
      const sel = st.selection?.kind === 'opening' && st.selection.id === op.id
      if (!st.interacting) document.body.style.cursor = sel && op.kind !== 'opening' ? 'move' : 'pointer'
    },
    onPointerOut: () => {
      if (!useStore.getState().interacting) document.body.style.cursor = ''
    },
  }
}

export { useOpeningPointer }
