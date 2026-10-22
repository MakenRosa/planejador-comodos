import { Line } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { computeClearances } from '../lib/clearance'
import { scanCategoryName } from '../lib/placement'
import type { ScannedObject, Vec3 } from '../lib/types'
import { fmtCm, fmtCmShort, fmtDim } from '../lib/util'
import { selectedItem, useStore } from '../store'
import { spaceOfPoint } from '../lib/focus'
import { COLORS, noRaycast, useScreenScale, useViewMeasurements } from './helpers'
import { EditableLabel, Label } from './Label'

export function Clearances() {
  const item = useStore(selectedItem)
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  const tool = useStore((s) => s.settings.tool)
  const show = useStore((s) => s.settings.showClearances)
  const update = useStore((s) => s.updateItem)
  if (!item || !room || tool !== 'select' || !show) return null
  const rays = computeClearances(item, room, items)
  const y = item.elevation + 0.012
  return (
    <group userData={{ helper: true }}>
      {rays.map((r, i) => {
        const a: Vec3 = [r.o[0], y, r.o[1]]
        const b: Vec3 = [r.o[0] + r.d[0] * r.dist, y, r.o[1] + r.d[1] * r.dist]
        const mid: Vec3 = [(a[0] + b[0]) / 2, y, (a[2] + b[2]) / 2]
        const px = -r.d[1] * 0.03
        const pz = r.d[0] * 0.03
        return (
          <group key={i}>
            <Line points={[a, b]} color={COLORS.clearance} lineWidth={1.6} dashed dashSize={0.035} gapSize={0.022} depthTest={false} renderOrder={4} />
            <Line
              points={[
                [b[0] - px, y, b[2] - pz],
                [b[0] + px, y, b[2] + pz],
              ]}
              color={COLORS.clearance}
              lineWidth={2}
              depthTest={false}
              renderOrder={4}
            />
            {!item.locked ? (
              <EditableLabel
                position={mid}
                value={r.dist}
                variant="clear"
                dragItem={item.id}
                title={`Distância até ${r.target === 'wall' ? 'a parede' : r.targetName} — clique para digitar a distância desejada`}
                onSubmit={(v) => {
                  const delta = r.dist - v
                  update(item.id, { x: item.x + r.d[0] * delta, z: item.z + r.d[1] * delta })
                }}
              />
            ) : (
              <Label position={mid} text={fmtCm(r.dist)} variant="clear" />
            )}
          </group>
        )
      })}
    </group>
  )
}

export function SnapGuides() {
  const guides = useStore((s) => s.guides)
  return (
    <group userData={{ helper: true }}>
      {guides.map((g, i) => (
        <Line
          key={i}
          points={
            g.axis === 'x'
              ? [
                  [g.value, 0.015, g.from - 0.3],
                  [g.value, 0.015, g.to + 0.3],
                ]
              : [
                  [g.from - 0.3, 0.015, g.value],
                  [g.to + 0.3, 0.015, g.value],
                ]
          }
          color={COLORS.guide}
          lineWidth={1.5}
          dashed
          dashSize={0.05}
          gapSize={0.03}
          depthTest={false}
          renderOrder={4}
        />
      ))}
    </group>
  )
}

/** Prévia da correção de parede pela trena: o contorno da face de cada parede na posição nova, tracejado. */
export function WallPreview() {
  const walls = useStore((s) => s.wallPreview)
  if (!walls?.length) return null
  return (
    <group userData={{ helper: true }}>
      {walls.map((w, i) => (
        <Line
          key={i}
          points={[
            [w.a[0], 0.02, w.a[1]],
            [w.b[0], 0.02, w.b[1]],
            [w.b[0], w.h, w.b[1]],
            [w.a[0], w.h, w.a[1]],
            [w.a[0], 0.02, w.a[1]],
          ]}
          color={COLORS.accent}
          lineWidth={2.5}
          dashed
          dashSize={0.08}
          gapSize={0.05}
          depthTest={false}
          renderOrder={5}
          raycast={noRaycast}
        />
      ))}
    </group>
  )
}

export function Dot({ position, color, px = 4 }: { position: Vec3; color: string; px?: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useScreenScale(ref, px)
  return (
    <mesh ref={ref} position={position} renderOrder={8} raycast={noRaycast}>
      <sphereGeometry args={[1, 12, 10]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  )
}

export function measureText(a: Vec3, b: Vec3) {
  const dx = Math.abs(b[0] - a[0])
  const dy = Math.abs(b[1] - a[1])
  const dz = Math.abs(b[2] - a[2])
  const dist = Math.hypot(dx, dy, dz)
  const parts = (
    [
      ['x', dx],
      ['y', dy],
      ['z', dz],
    ] as const
  ).filter(([, v]) => v > 0.002)
  const detail = parts.length > 1 ? `  (${parts.map(([k, v]) => `${k} ${fmtCmShort(v)}`).join(' · ')})` : ''
  return { dist, text: fmtCm(dist) + detail }
}

export function MeasureLine({ a, b, color, selected, onClick, width = 2 }: { a: Vec3; b: Vec3; color: string; selected?: boolean; onClick?: () => void; width?: number }) {
  const { text } = measureText(a, b)
  return (
    <>
      <Line points={[a, b]} color={color} lineWidth={selected ? width + 1.5 : width} depthTest={false} renderOrder={6} />
      <Dot position={a} color={color} />
      <Dot position={b} color={color} />
      <Label position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} text={text} variant="measure" selected={selected} onClick={onClick} />
    </>
  )
}

export function MeasurementsView() {
  const ms = useViewMeasurements()
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  return (
    <group userData={{ helper: true }}>
      {ms.map((m) => (
        <MeasureLine
          key={m.id}
          a={m.a}
          b={m.b}
          color={selection?.id === m.id ? COLORS.accent : COLORS.measure}
          selected={selection?.id === m.id}
          onClick={() => select({ kind: 'measure', id: m.id })}
        />
      ))}
    </group>
  )
}

function Ghost({ o }: { o: ScannedObject }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...o.size)), [o.size])
  useEffect(() => () => edges.dispose(), [edges])
  return (
    <group position={o.position} rotation={[0, o.rotation, 0]}>
      <mesh position-y={o.size[1] / 2} raycast={noRaycast}>
        <boxGeometry args={o.size} />
        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.14} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} position-y={o.size[1] / 2} raycast={noRaycast}>
        <lineBasicMaterial color="#7c3aed" />
      </lineSegments>
      <Label position={[0, o.size[1] + 0.06, 0]} text={`${scanCategoryName(o.category)} (scan) · ${fmtDim(o.size[0], o.size[2], o.size[1])}`} variant="ghost" />
    </group>
  )
}

export function ScanGhosts() {
  const room = useStore((s) => s.room)
  const focus = useStore((s) => s.focusSpace)
  const show = useStore((s) => s.settings.showScan)
  if (!room || !show) return null
  const list = focus ? room.scanned.filter((o) => spaceOfPoint(room, [o.position[0], o.position[2]])?.id === focus) : room.scanned
  return (
    <group userData={{ helper: true }}>
      {list.map((o) => (
        <Ghost key={o.id} o={o} />
      ))}
    </group>
  )
}
