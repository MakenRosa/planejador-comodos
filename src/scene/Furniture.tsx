import { Line } from '@react-three/drei'
import { motorRange, ridingIds } from '../lib/stack'
import { armSlotsFull, keepApart, moveSlot, type ArmSlot } from '../lib/arms'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildItemGroup, FLOATING_MIN, TYPES, type ItemPoint } from '../furniture/catalog'
import { disposeObject } from '../furniture/parts'
import { getTemplate, instantiate } from '../lib/assets'
import { footprint, rotLocal, toLocal } from '../lib/geom'
import { elevationTargets } from '../lib/placement'
import { snapEdge, snapPosition, type Guide } from '../lib/snap'
import type { FurnitureItem, Vec2 } from '../lib/types'
import { clamp, fmtDim, normAngle, snapTo, toRad } from '../lib/util'
import { groupOf, useStore } from '../store'
import { COLORS, noRaycast, rayAtY, type ControlsLike, useScreenScale, useViewItems, viewportApi, worldPerPixel } from './helpers'
import { EditableLabel, Label } from './Label'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type PEvent = ThreeEvent<PointerEvent>
/** Arraste de um conjunto: ponto inicial no piso, quanto já andou e o que fazer se for só um clique. */
interface GroupDrag {
  ids: string[]
  start: Vec2
  last: Vec2
  /** Arrastando um grupo salvo: o pivô anda junto. */
  groupId?: string
  /** Shift + clique num que já estava na seleção: tira ele. */
  clickToggle?: string
  /** Clique simples num do conjunto: fica só ele selecionado. */
  clickSelect?: string
}
type Capturable = { setPointerCapture: (id: number) => void; releasePointerCapture: (id: number) => void }
const capture = (e: PEvent) => (e.target as unknown as Capturable).setPointerCapture(e.pointerId)
const release = (e: PEvent) => (e.target as unknown as Capturable).releasePointerCapture(e.pointerId)

function useItemObject(item: FurnitureItem) {
  const optsKey = JSON.stringify(item.options)
  const floating = item.elevation > FLOATING_MIN
  const [tpl, setTpl] = useState<THREE.Object3D | null>(null)
  useEffect(() => {
    if (item.type === 'custom' && item.assetId) getTemplate(item.assetId).then(setTpl)
  }, [item.type, item.assetId])
  const obj = useMemo(() => {
    if (item.type === 'custom' && tpl) return instantiate(tpl, item)
    return buildItemGroup(item)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.type, item.width, item.height, item.depth, item.color, item.color2, optsKey, tpl, floating])
  useEffect(() => () => void (!obj.userData.shared && disposeObject(obj)), [obj])
  // peças marcadas com o id do móvel e uma área de clique invisível do tamanho da caixa
  // (pegar peças finas: braço, pés da mesa, luminária…)
  useEffect(() => {
    obj.traverse((o) => {
      o.userData.itemId = item.id
    })
    if (item.type === 'curtain') return
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.02, item.width), Math.max(0.02, item.height), Math.max(0.02, item.depth)), proxyMat)
    proxy.position.y = item.height / 2
    proxy.userData = { itemId: item.id, proxy: true, helper: true }
    proxy.castShadow = false
    proxy.receiveShadow = false
    obj.add(proxy)
    return () => {
      obj.remove(proxy)
      proxy.geometry.dispose()
    }
  }, [obj, item.id, item.type, item.width, item.height, item.depth])
  return obj
}

/** Arraste de um monitor preso: plano de arraste, ponto inicial e a placa como estava. */
interface PlateDrag {
  monId: string
  armId: string
  k: number
  plane: THREE.Plane
  start: THREE.Vector3
  slot: ArmSlot
  plan: boolean
}

/**
 * Começa a "dobrar" o braço de um monitor preso: no 3D a tela anda no próprio plano (para o lado e
 * para cima/baixo, como num braço de verdade); na planta, no piso (para o lado e para frente).
 */
function startPlate(mon: FurnitureItem, ray: THREE.Ray, hit: THREE.Vector3): PlateDrag | null {
  const st = useStore.getState()
  const arm = st.items.find((i) => i.id === mon.attachedTo)
  if (!arm || arm.locked) return null
  const k = mon.attachSlot ?? 0
  const plan = st.settings.view === '2d'
  // plano de frente para o mouse (o movimento na tela vira movimento "de verdade"; depois é decomposto
  // nos eixos do braço). Na planta o raio é vertical: o plano é o próprio piso.
  const plane = plan ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.y) : new THREE.Plane().setFromNormalAndCoplanarPoint(ray.direction.clone().negate(), hit)
  const start = ray.intersectPlane(plane, new THREE.Vector3())
  if (!start) return null
  return { monId: mon.id, armId: arm.id, k, plane, start, slot: armSlotsFull(arm)[k], plan }
}

/** Move a placa conforme o raio do mouse; com ímã, encosta na tela do outro braço sem cruzar. */
function movePlate(d: PlateDrag, ray: THREE.Ray, magnet: boolean) {
  const st = useStore.getState()
  const arm = st.items.find((i) => i.id === d.armId)
  const mon = st.items.find((i) => i.id === d.monId)
  const p = ray.intersectPlane(d.plane, new THREE.Vector3())
  if (!arm || !mon || !p) return
  // decompõe nos eixos do braço: lado (x local), frente (z local) e altura
  const [dlx, dlz] = toLocal(p.x - d.start.x, p.z - d.start.z, arm.rotation)
  let x = d.slot.x + dlx
  const reach = d.plan ? d.slot.reach + dlz : d.slot.reach
  const vesa = d.plan ? d.slot.vesa : Math.max(0.1, Math.min(arm.height + 0.3, d.slot.vesa + (p.y - d.start.y)))
  const slots = armSlotsFull(arm)
  if (magnet && slots.length === 2) {
    const o = 1 - d.k
    const other = st.items.find((i) => i.attachedTo === arm.id && (i.attachSlot ?? 0) === o)
    if (other) {
      const side = d.k === 0 ? -1 : 1
      const xJoin = slots[o].x + side * (other.width / 2 + mon.width / 2 + 0.01)
      if (Math.abs(x - xJoin) < 0.04) x = xJoin
    }
    // as telas não se cruzam (Alt solta)
    x = keepApart(arm, d.k, x, reach, st.items, true)
  }
  const patch: Partial<ArmSlot> = { x, reach, vesa }
  if (magnet && !d.plan && slots.length === 2) {
    // alinha a altura com a outra tela quando chega perto (2 cm)
    const vo = slots[1 - d.k].vesa
    if (Math.abs(vesa - vo) < 0.02) patch.vesa = vo
  }
  st.updateItem(arm.id, moveSlot(arm, d.k, patch), false)
}

/** Material da área de clique: não desenha nada, só recebe o raio do mouse. */
const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 })

/**
 * Este móvel deve ficar com o clique? Peças de verdade sempre; a área invisível só quando o raio
 * não acerta nenhuma peça de verdade de outro móvel (ex.: cadeira embaixo da mesa).
 */
function wins(e: PEvent, id: string): boolean {
  if (!e.object.userData.proxy) return true
  const real = e.intersections.find((h) => h.object.userData.itemId && !h.object.userData.proxy && !isHelperObj(h.object))
  return !real || real.object.userData.itemId === id
}

const isHelperObj = (o: THREE.Object3D) => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData?.helper && !p.userData.proxy) return true
  return false
}

/** Encapsula captura de ponteiro + desativação dos controles de câmera durante um arraste. */
function useDrag<S>(opts: {
  start: (e: PEvent) => S | null
  move: (e: PEvent, s: S) => void
  cursor?: string
  /** false = deixa o clique passar para o que está atrás (não para a propagação). */
  accept?: (e: PEvent) => boolean
  /** Soltou sem ter arrastado (clique). */
  click?: (s: S) => void
}) {
  const get = useThree((s) => s.get)
  const state = useRef<{ s: S; started: boolean; x: number; y: number } | null>(null)
  const controls = () => get().controls as unknown as ControlsLike
  return {
    onPointerDown: (e: PEvent) => {
      if (e.button !== 0 || useStore.getState().settings.tool !== 'select') return
      if (opts.accept && !opts.accept(e)) return
      e.stopPropagation()
      const s = opts.start(e)
      if (s === null) return
      const c = controls()
      if (c) c.enabled = false
      state.current = { s, started: false, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
      capture(e)
    },
    onPointerMove: (e: PEvent) => {
      const d = state.current
      if (!d) return
      e.stopPropagation()
      if (!d.started) {
        if (Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) < 3) return
        d.started = true
        useStore.getState().commit()
        useStore.getState().setInteracting(true)
      }
      opts.move(e, d.s)
    },
    onPointerUp: (e: PEvent) => {
      if (!state.current) return
      e.stopPropagation()
      release(e)
      const done = state.current
      state.current = null
      if (!done.started) opts.click?.(done.s)
      const c = controls()
      if (c) c.enabled = true
      const st = useStore.getState()
      st.setInteracting(false)
      st.setGuides([])
    },
    onPointerOver: (e: PEvent) => {
      if (useStore.getState().settings.tool !== 'select') return
      e.stopPropagation()
      if (opts.cursor) document.body.style.cursor = opts.cursor
    },
    onPointerOut: () => {
      if (!state.current) document.body.style.cursor = ''
    },
  }
}

const thrAt = (get: () => { camera: THREE.Camera; size: { height: number } }, p: THREE.Vector3, px = 10) => {
  const { camera, size } = get()
  return worldPerPixel(camera, size, p) * px
}

function FurnitureView({ item, colliding, flagged }: { item: FurnitureItem; colliding: boolean; flagged: boolean }) {
  const obj = useItemObject(item)
  const selected = useStore((s) => s.selection?.kind === 'item' && s.selection.id === item.id)
  const inMulti = useStore((s) => s.multi.includes(item.id))
  const inGroupSel = useStore((s) => s.selection?.kind === 'group' && !!s.groups.find((g) => g.id === s.selection!.id)?.members.includes(item.id))
  const hovered = useStore((s) => s.hovered === item.id)
  const tool = useStore((s) => s.settings.tool)
  const showLabels = useStore((s) => s.settings.showLabels)
  const view = useStore((s) => s.settings.view)
  const get = useThree((s) => s.get)

  const drag = useDrag<{ off: Vec2; planeY: number; id: string; skip: Set<string>; plate?: PlateDrag; group?: GroupDrag }>({
    // pontos arrastáveis (chuveiro, ralo) aparecem através do vidro: o clique passa para eles
    accept: (e) => wins(e, item.id) && !e.intersections.some((h) => h.object.userData.through),
    start: (e) => {
      // Alças têm prioridade sobre o corpo do móvel — só as que estão na frente dele
      if (e.intersections.some((h) => h.object.userData.handle && h.distance < e.distance - 1e-4)) return null
      const st = useStore.getState()
      // seleção múltipla: Shift (ou "Selecionar vários") inclui/tira; arrastar um do conjunto leva todos
      const add = e.nativeEvent.shiftKey || st.multiMode
      // móvel de um grupo: pega o grupo inteiro (menos em "Editar membros" desse grupo)
      const grp = add ? null : groupOf(st.groups, item.id)
      if (grp && st.editingGroup !== grp.id) {
        st.select({ kind: 'group', id: grp.id })
        const hit = rayAtY(e.ray, e.point.y)
        if (!hit) return null
        return { off: [0, 0], planeY: e.point.y, id: item.id, skip: new Set(), group: { ids: grp.members, start: [hit.x, hit.z], last: [0, 0], groupId: grp.id } }
      }
      if (add || (st.multi.length > 1 && st.multi.includes(item.id))) {
        const inSel = st.multi.includes(item.id) || (st.selection?.kind === 'item' && st.selection.id === item.id)
        let clickToggle: string | undefined
        let clickSelect: string | undefined
        if (add && !inSel) st.toggleMulti(item.id)
        else if (add) clickToggle = item.id
        else clickSelect = item.id
        const now = useStore.getState()
        const ids = now.multi.length ? now.multi : now.selection?.kind === 'item' ? [now.selection.id] : []
        const hit = rayAtY(e.ray, e.point.y)
        if (!hit || !ids.length) return null
        return { off: [0, 0], planeY: e.point.y, id: item.id, skip: new Set(), group: { ids, start: [hit.x, hit.z], last: [0, 0], clickToggle, clickSelect } }
      }
      st.select({ kind: 'item', id: item.id })
      const self = st.items.find((i) => i.id === item.id)
      // monitor preso a um braço: arrastar dobra só aquele braço (a tela vai junto, o poste fica)
      if (self?.attachedTo) {
        const plate = startPlate(self, e.ray, e.point)
        return plate ? { off: [0, 0], planeY: e.point.y, id: self.id, skip: new Set(), plate } : null
      }
      const cur = self
      if (!cur || cur.locked) return null
      const hit = rayAtY(e.ray, e.point.y)
      if (!hit) return null
      // o que está em cima vai junto: não serve de guia para o ímã
      return { off: [cur.x - hit.x, cur.z - hit.z], planeY: e.point.y, id: cur.id, skip: ridingIds(cur, st.items) }
    },
    move: (e, s) => {
      const st = useStore.getState()
      const cur = st.items.find((i) => i.id === s.id)
      const hit = rayAtY(e.ray, s.planeY)
      if (!cur || !hit) return
      document.body.style.cursor = 'grabbing'
      if (s.group) {
        // o conjunto anda junto, no passo da grade (Alt = livre); sem ímã para não desmanchar a arrumação
        const g = s.group
        const step = e.nativeEvent.altKey ? 0 : st.settings.snapStep
        const dx = snapTo(hit.x - g.start[0], step)
        const dz = snapTo(hit.z - g.start[1], step)
        if (g.groupId) st.moveGroup(g.groupId, dx - g.last[0], dz - g.last[1], false)
        else st.moveItems(g.ids, dx - g.last[0], dz - g.last[1], false)
        g.last = [dx, dz]
        return
      }
      if (s.plate) {
        movePlate(s.plate, e.ray, !e.nativeEvent.altKey)
        return
      }
      const r = snapPosition(cur, hit.x + s.off[0], hit.z + s.off[1], st.room, s.skip.size ? st.items.filter((i) => !s.skip.has(i.id)) : st.items, {
        thr: thrAt(get, hit),
        step: e.nativeEvent.altKey ? 0 : st.settings.snapStep,
        magnet: st.settings.magnet && !e.nativeEvent.altKey,
      })
      st.updateItem(s.id, { x: r.x, z: r.z }, false)
      st.setGuides(r.guides)
    },
    click: (s) => {
      const st = useStore.getState()
      if (s.group?.clickToggle) st.toggleMulti(s.group.clickToggle)
      else if (s.group?.clickSelect) st.select({ kind: 'item', id: s.group.clickSelect })
    },
  })

  const picked = selected || inMulti || inGroupSel
  const outlineColor = colliding ? COLORS.error : picked ? COLORS.accent : flagged ? COLORS.warn : COLORS.hover
  return (
    <group position={[item.x, item.elevation, item.z]} rotation={[0, item.rotation, 0]}>
      {/* key: quando o modelo é refeito (medidas/opções), monta de novo — trocar o object de um
          <primitive> no lugar perde os eventos de clique e o móvel deixa de ser selecionável */}
      <primitive
        key={obj.uuid}
        object={obj}
        {...drag}
        onPointerOver={(e: PEvent) => {
          if (useStore.getState().settings.tool !== 'select' || !wins(e, item.id)) return
          e.stopPropagation()
          useStore.getState().setHovered(item.id)
          document.body.style.cursor = item.locked ? 'pointer' : 'grab'
        }}
        onDoubleClick={(e: PEvent) => {
          if (useStore.getState().settings.tool !== 'select' || !wins(e, item.id)) return
          e.stopPropagation()
          useStore.getState().focusItem(item.attachedTo ?? item.id)
        }}
        onPointerOut={() => {
          if (useStore.getState().hovered === item.id) useStore.getState().setHovered(null)
          if (!useStore.getState().interacting) document.body.style.cursor = ''
        }}
      />
      {view === '2d' && !picked && !colliding && <PlanOutline w={item.width} d={item.depth} y={item.height + 0.003} />}
      {(picked || hovered || colliding || flagged) && (
        <BoxOutline w={item.width} h={item.height} d={item.depth} color={outlineColor} strong={picked || colliding} />
      )}
      {colliding && (
        <mesh position-y={item.height / 2} raycast={noRaycast} userData={{ helper: true }}>
          <boxGeometry args={[item.width + 0.006, item.height + 0.006, item.depth + 0.006]} />
          <meshBasicMaterial color={COLORS.error} transparent opacity={0.13} depthWrite={false} />
        </mesh>
      )}
      {selected && tool === 'select' && !item.locked && <Handles item={item} />}
      {selected && <DimensionLabels item={item} />}
      {showLabels && !selected && (
        <Label position={[0, item.height + 0.05, 0]} text={`${item.name} · ${fmtDim(item.width, item.depth)}`} variant="name" />
      )}
    </group>
  )
}

function BoxOutline({ w, h, d, color, strong }: { w: number; h: number; d: number; color: string; strong: boolean }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d])
  useEffect(() => () => geo.dispose(), [geo])
  const fp: [number, number, number][] = [
    [-w / 2, 0.003, -d / 2],
    [w / 2, 0.003, -d / 2],
    [w / 2, 0.003, d / 2],
    [-w / 2, 0.003, d / 2],
    [-w / 2, 0.003, -d / 2],
  ]
  return (
    <group userData={{ helper: true }}>
      <lineSegments geometry={geo} position-y={h / 2} raycast={noRaycast}>
        <lineBasicMaterial color={color} transparent opacity={strong ? 0.95 : 0.7} />
      </lineSegments>
      {strong && <Line points={fp} color={color} lineWidth={2.5} raycast={noRaycast} />}
      {strong && <Line points={fp.map(([x, , z]) => [x, h + 0.003, z] as [number, number, number])} color={color} lineWidth={2} raycast={noRaycast} />}
    </group>
  )
}

/** Contorno fino na planta, para leitura técnica. */
function PlanOutline({ w, d, y }: { w: number; d: number; y: number }) {
  const pts: [number, number, number][] = [
    [-w / 2, y, -d / 2],
    [w / 2, y, -d / 2],
    [w / 2, y, d / 2],
    [-w / 2, y, d / 2],
    [-w / 2, y, -d / 2],
  ]
  return (
    <group userData={{ helper: true }}>
      <Line points={pts} color="#4b5563" lineWidth={1.1} raycast={noRaycast} />
      <Line points={[pts[2], pts[3]]} color="#1f2937" lineWidth={2.4} raycast={noRaycast} />
    </group>
  )
}

// ---------------- Alças ----------------

const handleMat = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false })
const handleMatHot = new THREE.MeshBasicMaterial({ color: COLORS.accent, depthTest: false })
const handleEdge = new THREE.LineBasicMaterial({ color: COLORS.accent, depthTest: false })
const handleBox = new THREE.BoxGeometry(1, 0.35, 1)
const handleBoxEdges = new THREE.EdgesGeometry(handleBox)

function ResizeHandle({ item, axis, sign }: { item: FurnitureItem; axis: 'x' | 'z'; sign: 1 | -1 }) {
  const ref = useRef<THREE.Group>(null)
  const [hot, setHot] = useState(false)
  useScreenScale(ref, 13)
  const get = useThree((s) => s.get)
  const drag = useDrag<{ start: FurnitureItem; F: Vec2; U: Vec2; planeY: number }>({
    cursor: axis === 'x' ? 'ew-resize' : 'ns-resize',
    start: () => {
      const it = useStore.getState().items.find((i) => i.id === item.id)
      if (!it) return null
      const half = axis === 'x' ? it.width / 2 : it.depth / 2
      const fl = axis === 'x' ? rotLocal(-sign * half, 0, it.rotation) : rotLocal(0, -sign * half, it.rotation)
      const U = axis === 'x' ? rotLocal(sign, 0, it.rotation) : rotLocal(0, sign, it.rotation)
      return { start: it, F: [it.x + fl[0], it.z + fl[1]], U, planeY: it.elevation + it.height }
    },
    move: (e, s) => {
      const st = useStore.getState()
      const p = rayAtY(e.ray, s.planeY)
      if (!p) return
      let len = (p.x - s.F[0]) * s.U[0] + (p.z - s.F[1]) * s.U[1]
      const guides: Guide[] = []
      let snapped = false
      // Ímã da borda que se move (quando alinhado aos eixos)
      if (st.settings.magnet && !e.nativeEvent.altKey) {
        const ax = Math.abs(s.U[0]) > 0.999 ? 'x' : Math.abs(s.U[1]) > 0.999 ? 'z' : null
        if (ax) {
          const i = ax === 'x' ? 0 : 1
          const sgn = Math.sign(s.U[i])
          const edge = s.F[i] + sgn * len
          const r = snapEdge(edge, ax, st.room, st.items, item.id, thrAt(get, p), item.elevation)
          if (r) {
            len = (r.value - s.F[i]) * sgn
            snapped = true
            guides.push({ axis: ax, value: r.value, from: r.line.lo, to: r.line.hi })
          }
        }
      }
      if (!snapped) len = snapTo(len, e.nativeEvent.altKey ? 0.001 : 0.01)
      len = Math.max(0.02, len)
      const k = len / (axis === 'x' ? s.start.width : s.start.depth)
      const ratio = st.settings.keepRatio
      const patch: Partial<FurnitureItem> =
        axis === 'x'
          ? { width: len, ...(ratio ? { depth: s.start.depth * k, height: s.start.height * k } : {}) }
          : { depth: len, ...(ratio ? { width: s.start.width * k, height: s.start.height * k } : {}) }
      patch.x = s.F[0] + (s.U[0] * len) / 2
      patch.z = s.F[1] + (s.U[1] * len) / 2
      if (ratio) {
        // Mantém a linha central perpendicular ao eixo de arraste
        const perp = axis === 'x' ? rotLocal(0, 1, s.start.rotation) : rotLocal(1, 0, s.start.rotation)
        const off = (s.start.x - patch.x) * perp[0] + (s.start.z - patch.z) * perp[1]
        patch.x += perp[0] * off
        patch.z += perp[1] * off
      }
      st.updateItem(item.id, patch, false)
      st.setGuides(guides)
    },
  })
  const pos: [number, number, number] =
    axis === 'x' ? [(sign * item.width) / 2, item.height + 0.004, 0] : [0, item.height + 0.004, (sign * item.depth) / 2]
  return (
    <group ref={ref} position={pos} userData={{ helper: true }}>
      <mesh
        geometry={handleBox}
        material={hot ? handleMatHot : handleMat}
        renderOrder={10}
        userData={{ handle: true }}
        {...drag}
        onPointerOver={(e: PEvent) => {
          drag.onPointerOver(e)
          setHot(true)
        }}
        onPointerOut={() => {
          drag.onPointerOut()
          setHot(false)
        }}
      />
      <lineSegments geometry={handleBoxEdges} material={handleEdge} renderOrder={11} raycast={noRaycast} />
    </group>
  )
}

const ringGeo = new THREE.TorusGeometry(1, 0.24, 8, 32)
const discGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.2, 32)
const coneGeo = new THREE.ConeGeometry(0.7, 1.6, 16)

function RotateHandle({ item }: { item: FurnitureItem }) {
  const ref = useRef<THREE.Group>(null)
  const [hot, setHot] = useState(false)
  useScreenScale(ref, 9)
  const drag = useDrag<{ c: Vec2; planeY: number }>({
    cursor: 'crosshair',
    start: () => {
      const it = useStore.getState().items.find((i) => i.id === item.id)
      if (!it) return null
      return { c: [it.x, it.z], planeY: it.elevation + it.height }
    },
    move: (e, s) => {
      const p = rayAtY(e.ray, s.planeY)
      if (!p) return
      let a = Math.atan2(p.x - s.c[0], p.z - s.c[1])
      if (!e.nativeEvent.altKey) a = snapTo(a, toRad(e.nativeEvent.shiftKey ? 45 : 15))
      useStore.getState().updateItem(item.id, { rotation: normAngle(a) }, false)
    },
  })
  const dist = item.depth / 2 + 0.28
  return (
    <group userData={{ helper: true }}>
      <Line
        points={[
          [0, item.height + 0.004, item.depth / 2],
          [0, item.height + 0.004, dist],
        ]}
        color={COLORS.accent}
        lineWidth={1.5}
        depthTest={false}
        renderOrder={10}
        raycast={noRaycast}
      />
      <group ref={ref} position={[0, item.height + 0.004, dist]}>
        {/* Disco sólido = área de clique; anel azul = visual */}
        <mesh
          geometry={discGeo}
          material={hot ? handleMatHot : handleMat}
          renderOrder={10}
          userData={{ handle: true }}
          {...drag}
          onPointerOver={(e: PEvent) => {
            drag.onPointerOver(e)
            setHot(true)
          }}
          onPointerOut={() => {
            drag.onPointerOut()
            setHot(false)
          }}
        />
        <mesh geometry={ringGeo} material={handleEdgeMesh} rotation={[Math.PI / 2, 0, 0]} renderOrder={11} raycast={noRaycast} />
      </group>
    </group>
  )
}
const handleEdgeMesh = new THREE.MeshBasicMaterial({ color: COLORS.accent, depthTest: false })

function HeightHandle({ item }: { item: FurnitureItem }) {
  const ref = useRef<THREE.Group>(null)
  const [hot, setHot] = useState(false)
  useScreenScale(ref, 11)
  const get = useThree((s) => s.get)
  const drag = useDrag<{ plane: THREE.Plane; start: FurnitureItem }>({
    cursor: 'ns-resize',
    start: () => {
      const it = useStore.getState().items.find((i) => i.id === item.id)
      if (!it) return null
      const cam = get().camera.position
      const n = new THREE.Vector3(cam.x - it.x, 0, cam.z - it.z)
      if (n.lengthSq() < 1e-6) return null
      n.normalize()
      return { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(it.x, 0, it.z)), start: it }
    },
    move: (e, s) => {
      const p = e.ray.intersectPlane(s.plane, new THREE.Vector3())
      if (!p) return
      const st = useStore.getState()
      let h = Math.max(0.01, snapTo(p.y - s.start.elevation, e.nativeEvent.altKey ? 0.001 : 0.01))
      const motor = motorRange(s.start)
      if (motor) h = clamp(h, motor.lo, motor.hi)
      const k = h / s.start.height
      st.updateItem(item.id, st.settings.keepRatio ? { height: h, width: s.start.width * k, depth: s.start.depth * k } : { height: h }, false)
    },
  })
  return (
    <group ref={ref} position={[0, item.height + 0.02, 0]} userData={{ helper: true }}>
      <mesh
        geometry={coneGeo}
        material={hot ? handleMatHot : handleEdgeMesh}
        position-y={0.9}
        renderOrder={10}
        userData={{ handle: true }}
        {...drag}
        onPointerOver={(e: PEvent) => {
          drag.onPointerOver(e)
          setHot(true)
        }}
        onPointerOut={() => {
          drag.onPointerOut()
          setHot(false)
        }}
      />
    </group>
  )
}

const elevMat = new THREE.MeshBasicMaterial({ color: '#16a34a', depthTest: false })
const elevMatHot = new THREE.MeshBasicMaterial({ color: '#22c55e', depthTest: false })
const elevGeo = (() => {
  const up = new THREE.ConeGeometry(0.55, 0.9, 16)
  up.translate(0, 0.85, 0)
  const down = new THREE.ConeGeometry(0.55, 0.9, 16)
  down.rotateZ(Math.PI)
  down.translate(0, -0.85, 0)
  const stem = new THREE.CylinderGeometry(0.2, 0.2, 0.9, 10)
  const g = mergeGeometries([up, down, stem])
  ;[up, down, stem].forEach((x) => x.dispose())
  return g
})()

/** Seta dupla verde: sobe/desce o móvel inteiro (elevação), grudando no piso e no tampo do móvel de baixo. */
function ElevationHandle({ item }: { item: FurnitureItem }) {
  const ref = useRef<THREE.Group>(null)
  const [hot, setHot] = useState(false)
  useScreenScale(ref, 12)
  const get = useThree((s) => s.get)
  const drag = useDrag<{ plane: THREE.Plane; y0: number; start: FurnitureItem }>({
    cursor: 'ns-resize',
    start: (e) => {
      const it = useStore.getState().items.find((i) => i.id === item.id)
      if (!it || it.locked) return null
      const cam = get().camera.position
      const n = new THREE.Vector3(cam.x - it.x, 0, cam.z - it.z)
      if (n.lengthSq() < 1e-6) return null
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n.normalize(), new THREE.Vector3(it.x, 0, it.z))
      const p = e.ray.intersectPlane(plane, new THREE.Vector3())
      if (!p) return null
      return { plane, y0: p.y, start: it }
    },
    move: (e, s) => {
      const p = e.ray.intersectPlane(s.plane, new THREE.Vector3())
      if (!p) return
      const st = useStore.getState()
      const ceiling = st.room?.ceilingHeight ?? 3
      const alt = e.nativeEvent.altKey
      let elev = s.start.elevation + (p.y - s.y0)
      let snapped = false
      if (st.settings.magnet && !alt) {
        const thr = thrAt(get, p, 10)
        let best = thr
        for (const c of elevationTargets(s.start, st.items, ceiling)) {
          if (Math.abs(elev - c) < best) {
            best = Math.abs(elev - c)
            elev = c
            snapped = true
          }
        }
      }
      if (!snapped) elev = snapTo(elev, alt ? 0.001 : 0.01)
      // monitor preso a braço: sobe/desce só aquele braço
      if (s.start.attachedTo) {
        const arm = st.items.find((i) => i.id === s.start.attachedTo)
        if (arm) {
          const k = s.start.attachSlot ?? 0
          const v0 = armSlotsFull(arm)[k]?.vesa ?? 0.38
          const startCenter = s.start.elevation + s.start.height / 2 - arm.elevation
          const target = snapTo(startCenter + (p.y - s.y0), alt ? 0.001 : 0.005)
          if (Math.abs(target - v0) > 1e-6) st.updateItem(arm.id, moveSlot(arm, k, { vesa: clamp(target, 0.1, arm.height + 0.3) }), false)
        }
        return
      }
      // mesa elétrica: "subir/descer" é o motor (altura do tampo), os pés ficam no piso
      const motor = motorRange(s.start)
      if (motor) {
        const hgt = snapTo(s.start.height + (p.y - s.y0), alt ? 0.001 : 0.005)
        st.updateItem(item.id, { height: clamp(hgt, motor.lo, motor.hi) }, false)
        return
      }
      st.updateItem(item.id, { elevation: clamp(elev, 0, Math.max(0, ceiling - s.start.height)) }, false)
    },
  })
  return (
    <group ref={ref} position={[0, item.height / 2, item.depth / 2 + 0.16]} userData={{ helper: true }}>
      <mesh
        geometry={elevGeo}
        material={hot ? elevMatHot : elevMat}
        renderOrder={10}
        userData={{ handle: true }}
        {...drag}
        onPointerOver={(e: PEvent) => {
          drag.onPointerOver(e)
          setHot(true)
        }}
        onPointerOut={() => {
          drag.onPointerOut()
          setHot(false)
        }}
      />
    </group>
  )
}

const pointGeo = new THREE.SphereGeometry(1, 20, 14)
const pointRing = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false })
const pointMats = new Map<string, THREE.MeshBasicMaterial>()
const pointMat = (c: string) => {
  let m = pointMats.get(c)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: c, depthTest: false })
    pointMats.set(c, m)
  }
  return m
}

/** Ponto arrastável dentro do móvel (ex.: chuveiro e ralo do box), visto através de tudo. */
function PointHandle({ item, pt }: { item: FurnitureItem; pt: ItemPoint }) {
  const ref = useRef<THREE.Group>(null)
  const [hot, setHot] = useState(false)
  useScreenScale(ref, hot ? 9 : 7)
  const drag = useDrag<{ y: number }>({
    cursor: 'move',
    start: () => {
      const it = useStore.getState().items.find((i) => i.id === item.id)
      return it && !it.locked ? { y: it.elevation + pt.at[1] } : null
    },
    move: (e, s) => {
      const st = useStore.getState()
      const it = st.items.find((i) => i.id === item.id)
      const p = it && rayAtY(e.ray, s.y)
      if (!it || !p) return
      const [lx, lz] = toLocal(p.x - it.x, p.z - it.z, it.rotation)
      const step = e.nativeEvent.altKey ? 0.001 : 0.01
      const cur = TYPES[it.type]?.points?.(it).find((q) => q.key === pt.key)
      if (cur) st.updateItem(it.id, { options: { ...it.options, ...cur.move(snapTo(lx, step), snapTo(lz, step)) } }, false)
    },
  })
  return (
    <group ref={ref} position={pt.at} userData={{ helper: true }}>
      <mesh geometry={pointGeo} material={pointRing} scale={1.4} renderOrder={12} raycast={noRaycast} />
      <mesh
        geometry={pointGeo}
        material={pointMat(pt.color)}
        renderOrder={13}
        userData={{ handle: true, through: true }}
        {...drag}
        onPointerOver={(e: PEvent) => {
          drag.onPointerOver(e)
          setHot(true)
        }}
        onPointerOut={() => {
          drag.onPointerOut()
          setHot(false)
        }}
      />
      {hot && <Label position={[0, 1.8, 0]} text={pt.label} variant="name" />}
    </group>
  )
}

function Handles({ item }: { item: FurnitureItem }) {
  const view = useStore((s) => s.settings.view)
  return (
    <>
      {TYPES[item.type]?.points?.(item).map((pt) => <PointHandle key={pt.key} item={item} pt={pt} />)}
      <ResizeHandle item={item} axis="x" sign={1} />
      <ResizeHandle item={item} axis="x" sign={-1} />
      <ResizeHandle item={item} axis="z" sign={1} />
      <ResizeHandle item={item} axis="z" sign={-1} />
      <RotateHandle item={item} />
      {view === '3d' && <HeightHandle item={item} />}
      {view === '3d' && <ElevationHandle item={item} />}
    </>
  )
}

function DimensionLabels({ item }: { item: FurnitureItem }) {
  const view = useStore((s) => s.settings.view)
  const resize = useStore((s) => s.resizeItem)
  const update = useStore((s) => s.updateItem)
  const two = view === '2d'
  const y = item.height + 0.01
  // Empilhados no centro do tampo (em pixels): longe das alças e das cotas de distância
  return (
    <group userData={{ helper: true }}>
      <EditableLabel
        position={[0, y, 0]}
        offsetY={-11}
        value={item.width}
        prefix="L "
        dragItem={item.id}
        title="Largura — clique para digitar"
        onSubmit={(v) => resize(item.id, { width: v })}
      />
      <EditableLabel
        position={[0, y, 0]}
        offsetY={11}
        value={item.depth}
        prefix="P "
        dragItem={item.id}
        title="Profundidade — clique para digitar"
        onSubmit={(v) => resize(item.id, { depth: v })}
      />
      {!two && (
        <EditableLabel
          position={[-item.width / 2, item.height * 0.62, item.depth / 2]}
          value={item.height}
          prefix="A "
          dragItem={item.id}
          title="Altura — clique para digitar"
          onSubmit={(v) => resize(item.id, { height: v })}
        />
      )}
      {(!two || item.elevation > 0.005) && (
        <EditableLabel
          position={two ? [0, y, 0] : [-item.width / 2, 0, item.depth / 2]}
          offsetY={two ? 33 : 0}
          value={item.elevation}
          prefix="↕ do piso "
          dragItem={item.id}
          title="Distância do piso até a base do móvel — clique para digitar (ou arraste a seta verde)"
          onSubmit={(v) => update(item.id, { elevation: Math.max(0, v) })}
        />
      )}
    </group>
  )
}

/** Prévia do item sendo arrastado do catálogo (não recebe cliques). */
function PlacingPreview({ item }: { item: FurnitureItem }) {
  const obj = useItemObject(item)
  useEffect(() => {
    obj.traverse((o) => {
      o.raycast = noRaycast
    })
  }, [obj])
  return (
    <group position={[item.x, item.elevation, item.z]} rotation={[0, item.rotation, 0]}>
      <primitive object={obj} />
      <BoxOutline w={item.width} h={item.height} d={item.depth} color={COLORS.accent} strong />
    </group>
  )
}

/** Arraste de um móvel iniciado fora da cena (sobre os rótulos de medida dele). */
function useLabelDrag() {
  const get = useThree((s) => s.get)
  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    viewportApi.dragItem = (labelOwner, sx, sy, first) => {
      const st = useStore.getState()
      const owner = st.items.find((i) => i.id === labelOwner)
      // monitor preso a um braço: dobra só aquele braço (como arrastar o próprio monitor)
      const plate = !!owner?.attachedTo
      const it = owner
      if (!it || it.locked || st.settings.tool !== 'select') return
      if (plate && st.items.find((i) => i.id === it.attachedTo)?.locked) return
      const id = it.id
      const { camera, gl } = get()
      const controls = get().controls as unknown as ControlsLike
      const rect = gl.domElement.getBoundingClientRect()
      const ray = (cx: number, cy: number) => {
        ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1)
        raycaster.setFromCamera(ndc, camera)
        return raycaster.ray
      }
      // os rótulos ficam no tampo: arrasta no plano do tampo, sem "pular"
      const planeY = it.elevation + it.height
      const h0 = rayAtY(ray(sx, sy), planeY)
      if (!h0) return
      const off: Vec2 = [it.x - h0.x, it.z - h0.z]
      const skip = plate ? new Set<string>() : ridingIds(it, st.items)
      const pd = plate ? startPlate(it, ray(sx, sy), rayAtY(ray(sx, sy), planeY) ?? new THREE.Vector3(it.x, planeY, it.z)) : null
      if (plate && !pd) return
      if (controls) controls.enabled = false
      st.select({ kind: 'item', id: labelOwner })
      st.commit()
      st.setInteracting(true)
      document.body.style.cursor = 'grabbing'
      const move = (e: PointerEvent) => {
        const s = useStore.getState()
        const cur = s.items.find((i) => i.id === id)
        const hit = rayAtY(ray(e.clientX, e.clientY), planeY)
        if (!cur || !hit) return
        if (pd) {
          movePlate(pd, ray(e.clientX, e.clientY), !e.altKey)
          return
        }
        const r = snapPosition(cur, hit.x + off[0], hit.z + off[1], s.room, skip.size ? s.items.filter((i) => !skip.has(i.id)) : s.items, {
          thr: thrAt(get, hit),
          step: e.altKey ? 0 : s.settings.snapStep,
          magnet: s.settings.magnet && !e.altKey,
        })
        s.updateItem(id, { x: r.x, z: r.z }, false)
        s.setGuides(r.guides)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        if (controls) controls.enabled = true
        const s = useStore.getState()
        s.setInteracting(false)
        s.setGuides([])
        document.body.style.cursor = ''
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      move(first)
    }
    return () => {
      viewportApi.dragItem = undefined
    }
  }, [get])
}

export function FurnitureLayer({ colliding, flagged }: { colliding: Set<string>; flagged: Set<string> }) {
  const items = useViewItems()
  const placing = useStore((s) => s.placing)
  useLabelDrag()
  // Tapetes primeiro (ficam por baixo nos cliques em empate)
  const sorted = useMemo(() => [...items].sort((a, b) => Number(!TYPES[a.type]?.noCollide) - Number(!TYPES[b.type]?.noCollide)), [items])
  return (
    <group name="furniture">
      {sorted.map((it) => (
        <FurnitureView key={it.id} item={it} colliding={colliding.has(it.id)} flagged={flagged.has(it.id)} />
      ))}
      {placing && <PlacingPreview item={placing} />}
      <MultiBounds />
    </group>
  )
}

/** Retângulo tracejado no piso em volta do conjunto selecionado (ou do grupo em "Editar membros", em roxo). */
function MultiBounds() {
  const multi = useStore((s) => s.multi)
  const items = useStore((s) => s.items)
  const groups = useStore((s) => s.groups)
  const selGroup = useStore((s) => (s.selection?.kind === 'group' ? s.selection.id : null))
  const editing = useStore((s) => s.editingGroup)
  const ids = useMemo(() => {
    if (multi.length > 1) return multi
    const g = groups.find((x) => x.id === (editing ?? selGroup))
    return g ? g.members : []
  }, [multi, groups, selGroup, editing])
  const color = multi.length <= 1 && editing ? '#a855f7' : COLORS.accent
  const pts = useMemo(() => {
    const sel = items.filter((i) => ids.includes(i.id))
    if (sel.length < 2) return null
    const fp = sel.flatMap((i) => footprint(i))
    const m = 0.06
    const x0 = Math.min(...fp.map((p) => p[0])) - m
    const x1 = Math.max(...fp.map((p) => p[0])) + m
    const z0 = Math.min(...fp.map((p) => p[1])) - m
    const z1 = Math.max(...fp.map((p) => p[1])) + m
    const y = 0.006
    return [
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1],
      [x0, y, z0],
    ] as [number, number, number][]
  }, [ids, items])
  if (!pts) return null
  return (
    <group userData={{ helper: true }}>
      <Line points={pts} color={color} lineWidth={2} dashed dashSize={0.08} gapSize={0.05} raycast={noRaycast} />
    </group>
  )
}
