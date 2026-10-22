import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { footprint, wallDir } from '../lib/geom'
import type { FurnitureItem, Measurement, Room, Vec3 } from '../lib/types'
import { focusItems, focusMeasurements, focusRoom } from '../lib/focus'
import { useStore } from '../store'
import { COLORS, isHelper, rayAtY } from './helpers'
import { Dot, MeasureLine } from './Overlays'

type SnapKind = 'vertex' | 'edge' | 'surface'
interface Hover {
  p: Vec3
  kind: SnapKind
  axis?: 'x' | 'y' | 'z'
}

/** Vértices e arestas "magnéticos" para a trena: cantos de móveis, paredes, portas e janelas. */
function snapCandidates(room: Room | null, items: FurnitureItem[], ms: Measurement[]) {
  const verts: Vec3[] = []
  const edges: [Vec3, Vec3][] = []
  const addEdge = (a: Vec3, b: Vec3, mid = true) => {
    edges.push([a, b])
    if (mid) verts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])
  }
  for (const it of items) {
    const fp = footprint(it)
    const y0 = it.elevation
    const y1 = it.elevation + it.height
    const lo = fp.map(([x, z]) => [x, y0, z] as Vec3)
    const hi = fp.map(([x, z]) => [x, y1, z] as Vec3)
    verts.push(...lo, ...hi)
    for (let i = 0; i < 4; i++) {
      addEdge(lo[i], lo[(i + 1) % 4])
      addEdge(hi[i], hi[(i + 1) % 4])
      addEdge(lo[i], hi[i], false)
    }
  }
  if (room) {
    for (const w of room.walls) {
      const a0: Vec3 = [w.a[0], 0, w.a[1]]
      const b0: Vec3 = [w.b[0], 0, w.b[1]]
      const a1: Vec3 = [w.a[0], w.height, w.a[1]]
      const b1: Vec3 = [w.b[0], w.height, w.b[1]]
      verts.push(a0, b0, a1, b1)
      addEdge(a0, b0)
      addEdge(a1, b1, false)
      addEdge(a0, a1, false)
    }
    for (const op of room.openings) {
      const w = room.walls.find((x) => x.id === op.wallId)
      if (!w) continue
      const u = wallDir(w)
      const P = (s: number, y: number): Vec3 => [w.a[0] + u[0] * s, y, w.a[1] + u[1] * s]
      const s0 = op.offset - op.width / 2
      const s1 = op.offset + op.width / 2
      const c = [P(s0, op.bottom), P(s1, op.bottom), P(s1, op.bottom + op.height), P(s0, op.bottom + op.height)]
      verts.push(...c)
      for (let i = 0; i < 4; i++) addEdge(c[i], c[(i + 1) % 4], false)
    }
  }
  for (const m of ms) verts.push(m.a, m.b)
  return { verts, edges }
}

function visibleChain(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
}

function opaqueEnough(o: THREE.Object3D) {
  const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
  if (!m) return false
  const mm = Array.isArray(m) ? m[0] : m
  return !mm.transparent || mm.opacity >= 0.5
}

export function MeasureTool() {
  const tool = useStore((s) => s.settings.tool)
  const view = useStore((s) => s.settings.view)
  const { gl, camera, scene } = useThree()
  const [hover, setHover] = useState<Hover | null>(null)
  const [start, setStart] = useState<Vec3 | null>(null)
  const startRef = useRef<Vec3 | null>(null)
  startRef.current = start

  useEffect(() => {
    setStart(null)
    setHover(null)
  }, [tool, view])

  useEffect(() => {
    if (tool !== 'measure') return
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    let down: [number, number] | null = null
    const v = new THREE.Vector3()
    const seg = new THREE.Vector3()
    const A = new THREE.Vector3()
    const B = new THREE.Vector3()

    const compute = (ev: PointerEvent): Hover | null => {
      const rect = el.getBoundingClientRect()
      const mx = ev.clientX - rect.left
      const my = ev.clientY - rect.top
      raycaster.setFromCamera(new THREE.Vector2((mx / rect.width) * 2 - 1, -(my / rect.height) * 2 + 1), camera)
      const ray = raycaster.ray
      const targets = ['room', 'furniture'].map((n) => scene.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o)
      const hit = raycaster
        .intersectObjects(targets, true)
        .find((h) => !isHelper(h.object) && visibleChain(h.object) && opaqueEnough(h.object))
      const hitDepth = hit ? hit.distance : Infinity
      const toScreen = (p: THREE.Vector3) => {
        v.copy(p).project(camera)
        return [((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height]
      }
      const occluded = (p: THREE.Vector3) => view === '3d' && seg.copy(p).sub(ray.origin).dot(ray.direction) > hitDepth + 0.03
      const st = useStore.getState()
      // só o que está visível (cômodo em foco)
      const { verts, edges } = snapCandidates(
        focusRoom(st.room, st.focusSpace),
        focusItems(st.items, st.room, st.focusSpace),
        focusMeasurements(st.measurements, st.room, st.focusSpace),
      )

      let best: { p: THREE.Vector3; kind: SnapKind } | null = null
      let bestPx = 12
      for (const c of verts) {
        const p = new THREE.Vector3(c[0], c[1], c[2])
        if (p.clone().sub(ray.origin).dot(ray.direction) < 0 || occluded(p)) continue
        const [sx, sy] = toScreen(p)
        const d = Math.hypot(sx - mx, sy - my)
        if (d < bestPx) {
          bestPx = d
          best = { p, kind: 'vertex' }
        }
      }
      if (!best) {
        let bestE = 7
        for (const [a, b] of edges) {
          A.set(a[0], a[1], a[2])
          B.set(b[0], b[1], b[2])
          const onSeg = new THREE.Vector3()
          ray.distanceSqToSegment(A, B, undefined, onSeg)
          if (occluded(onSeg)) continue
          const [sx, sy] = toScreen(onSeg)
          const d = Math.hypot(sx - mx, sy - my)
          if (d < bestE) {
            bestE = d
            best = { p: onSeg, kind: 'edge' }
          }
        }
      }
      if (!best && hit) best = { p: hit.point.clone(), kind: 'surface' }
      if (!best && view === '2d') {
        const f = rayAtY(ray, 0)
        if (f) best = { p: f, kind: 'surface' }
      }
      if (!best) return null
      let p: Vec3 = [best.p.x, best.p.y, best.p.z]
      // Na planta, as medidas são horizontais
      if (view === '2d') p = [p[0], 0.02, p[2]]
      const s = startRef.current
      let axis: Hover['axis']
      if (s && ev.shiftKey) {
        const d = [p[0] - s[0], p[1] - s[1], p[2] - s[2]]
        const i = [0, 1, 2].reduce((m, k) => (Math.abs(d[k]) > Math.abs(d[m]) ? k : m), 0)
        const q: Vec3 = [s[0], s[1], s[2]]
        q[i] = s[i] + d[i]
        p = q
        axis = (['x', 'y', 'z'] as const)[i]
      }
      return { p, kind: best.kind, axis }
    }

    const onMove = (ev: PointerEvent) => setHover(compute(ev))
    const onDown = (ev: PointerEvent) => {
      if (ev.button === 0) down = [ev.clientX, ev.clientY]
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.button !== 0 || !down) return
      const moved = Math.hypot(ev.clientX - down[0], ev.clientY - down[1])
      down = null
      if (moved > 4) return
      const h = compute(ev)
      if (!h) return
      const s = startRef.current
      if (!s) setStart(h.p)
      else {
        if (Math.hypot(h.p[0] - s[0], h.p[1] - s[1], h.p[2] - s[2]) > 0.001) useStore.getState().addMeasurement(s, h.p)
        setStart(null)
      }
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && startRef.current) {
        ev.stopImmediatePropagation()
        setStart(null)
      }
    }
    const onLeave = () => setHover(null)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', onLeave)
    window.addEventListener('keydown', onKey, true)
    el.style.cursor = 'crosshair'
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('keydown', onKey, true)
      el.style.cursor = ''
    }
  }, [tool, view, gl, camera, scene])

  if (tool !== 'measure') return null
  const axisColor = hover?.axis === 'x' ? '#dc2626' : hover?.axis === 'y' ? '#16a34a' : hover?.axis === 'z' ? '#2563eb' : COLORS.measure
  const markColor = hover?.kind === 'vertex' ? '#f97316' : hover?.kind === 'edge' ? '#0ea5e9' : '#64748b'
  return (
    <group userData={{ helper: true }}>
      {hover && <Dot position={hover.p} color={markColor} px={hover.kind === 'surface' ? 3.5 : 6} />}
      {start && <Dot position={start} color={COLORS.measure} px={5} />}
      {start && hover && <MeasureLine a={start} b={hover.p} color={axisColor} />}
      {start && hover && hover.axis && (
        <Line points={[start, hover.p]} color={axisColor} lineWidth={4} transparent opacity={0.25} depthTest={false} renderOrder={5} />
      )}
    </group>
  )
}
