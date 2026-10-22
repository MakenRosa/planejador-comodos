import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { focusRoom } from '../lib/focus'
import { roomBounds } from '../lib/geom'
import type { Vec2 } from '../lib/types'
import { EYE, insideRoom, walkStart, walkStep } from '../lib/walk'
import { useStore } from '../store'
import { viewRestore } from '../lib/viewUrl'

/** Funções do modo andar usadas fora do Canvas (duplo clique no piso). */
export const walkApi: {
  goTo?: (p: Vec2) => void
  /** Para onde se olhava ao sair (a órbita continua dali). */
  lastLook?: THREE.Vector3
  /** Onde se está e para onde se olha agora (para gravar a vista na URL). */
  pose?: () => { x: number; z: number; yaw: number; pitch: number }
} = {}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}
const KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown'])

/**
 * Primeira pessoa: W A S D anda (Shift corre), arrastar olha em volta, Q/E vira, roda do mouse anda
 * para frente/trás, duplo clique no piso vai até lá. Não atravessa paredes (só portas e vãos).
 * Clicar continua selecionando e editando os móveis normalmente.
 */
export function WalkControls() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const set = useThree((s) => s.set)
  const pose = useRef({ x: 0, z: 0, yaw: 0, pitch: -0.06 })
  const turn = useRef<{ t0: number; y0: number; y1: number; p0: number; p1: number } | null>(null)
  const keys = useRef(new Set<string>())
  // objeto no lugar dos OrbitControls: quem arrasta móveis desliga `enabled` durante o arraste
  const ctl = useMemo(() => ({ enabled: true, isWalk: true, target: new THREE.Vector3(), update() {} }), [])
  const eyeY = () => Math.min(EYE, (useStore.getState().room?.ceilingHeight ?? 2.6) - 0.25)
  // vista salva na URL: lida aqui (sem consumir — o StrictMode pode renderizar duas vezes) e guardada
  // para esta montagem, porque a câmera troca logo depois de montar e o efeito de pose roda de novo
  const saved = useRef<{ x: number; z: number; yaw: number; pitch: number } | null>(null)
  if (!saved.current && viewRestore.pending?.mode === 'andar') {
    const v = viewRestore.pending
    saved.current = { x: v.c[0], z: v.c[1], yaw: v.o![0], pitch: Math.max(-1.35, Math.min(1.35, v.o![1])) }
  }

  useEffect(() => {
    set({ controls: ctl as never })
    return () => {
      // ponto 2,5 m à frente dos olhos: vira o centro da órbita ao sair do modo andar
      const p = pose.current
      walkApi.lastLook = new THREE.Vector3(p.x - Math.sin(p.yaw) * Math.cos(p.pitch) * 2.5, eyeY() + Math.sin(p.pitch) * 2.5, p.z - Math.cos(p.yaw) * Math.cos(p.pitch) * 2.5)
      set({ controls: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl, set])

  // ponto de partida: onde a câmera já está (se estiver dentro de um cômodo, na altura dos olhos)
  // ou na porta principal do cômodo em foco / da casa
  useEffect(() => {
    const st = useStore.getState()
    const room = st.room
    if (!room) return
    camera.rotation.order = 'YXZ'
    const here: Vec2 = [camera.position.x, camera.position.z]
    if (saved.current) {
      // vista salva na URL: mesmo lugar e mesma direção
      if (viewRestore.pending?.mode === 'andar') viewRestore.pending = null
      pose.current = { ...saved.current }
    } else if (camera.position.y < 2.2 && insideRoom(room, here)) {
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      pose.current = { x: here[0], z: here[1], yaw: Math.atan2(-dir.x, -dir.z), pitch: -0.06 }
    } else {
      const vr = focusRoom(room, st.focusSpace)
      const b = roomBounds(vr)
      const s = walkStart(vr, [b.cx, b.cz])
      pose.current = { x: s.p[0], z: s.p[1], yaw: s.yaw, pitch: -0.06 }
    }
    walkApi.pose = () => pose.current
    walkApi.goTo = (p) => {
      const r = useStore.getState().room
      if (r && insideRoom(r, p)) {
        pose.current.x = p[0]
        pose.current.z = p[1]
      }
    }
    return () => {
      walkApi.goTo = undefined
      walkApi.pose = undefined
    }
  }, [camera])

  // teclado
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey) return
      const k = e.key.toLowerCase()
      // setas para cima/baixo andam só quando não há móvel selecionado (senão movem o móvel)
      if ((k === 'arrowup' || k === 'arrowdown') && useStore.getState().selection) return
      if (KEYS.has(k)) {
        keys.current.add(k)
        if (k.startsWith('arrow')) e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    const clear = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  // arrastar para olhar; roda do mouse para andar
  useEffect(() => {
    const el = gl.domElement
    let last: [number, number] | null = null
    const pd = (e: PointerEvent) => {
      if (e.button === 0 || e.button === 2) last = [e.clientX, e.clientY]
    }
    const pm = (e: PointerEvent) => {
      if (!last) return
      if (!(e.buttons & 3)) {
        last = null
        return
      }
      const dx = e.clientX - last[0]
      const dy = e.clientY - last[1]
      last = [e.clientX, e.clientY]
      // arrastando um móvel/alça: não gira a vista
      if (!ctl.enabled || useStore.getState().interacting) return
      turn.current = null
      pose.current.yaw -= dx * 0.0045
      pose.current.pitch = Math.max(-1.35, Math.min(1.35, pose.current.pitch - dy * 0.0045))
    }
    const pu = () => {
      last = null
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = useStore.getState().room
      if (!r) return
      const step = Math.max(-0.6, Math.min(0.6, -e.deltaY * 0.0025))
      const { x, z, yaw } = pose.current
      const [nx, nz] = walkStep(r, [x, z], [-Math.sin(yaw) * step, -Math.cos(yaw) * step])
      pose.current.x = nx
      pose.current.z = nz
    }
    const ctx = (e: Event) => e.preventDefault()
    el.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', ctx)
    return () => {
      el.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', ctx)
    }
  }, [gl, ctl])

  // "Focar" no modo andar: vira para o móvel
  const cmdN = useStore((s) => s.cameraCmd.n)
  useEffect(() => {
    const cmd = useStore.getState().cameraCmd
    if (cmd.kind !== 'focus' || !cmd.target) return
    const { x, z, yaw, pitch } = pose.current
    const dx = cmd.target.x - x
    const dz = cmd.target.z - z
    let y1 = Math.atan2(-dx, -dz)
    // menor caminho
    while (y1 - yaw > Math.PI) y1 -= Math.PI * 2
    while (y1 - yaw < -Math.PI) y1 += Math.PI * 2
    const p1 = Math.max(-1.2, Math.min(1.2, Math.atan2(cmd.target.y - eyeY(), Math.hypot(dx, dz))))
    turn.current = { t0: performance.now(), y0: yaw, y1, p0: pitch, p1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmdN])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const k = keys.current
    const p = pose.current
    const tr = turn.current
    if (tr) {
      const a = Math.min(1, (performance.now() - tr.t0) / 350)
      const e = 1 - (1 - a) ** 3
      p.yaw = tr.y0 + (tr.y1 - tr.y0) * e
      p.pitch = tr.p0 + (tr.p1 - tr.p0) * e
      if (a >= 1) turn.current = null
    }
    if (k.has('q')) p.yaw += 1.8 * dt
    if (k.has('e')) p.yaw -= 1.8 * dt
    const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0)
    const sd = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0)
    const room = useStore.getState().room
    if ((f || sd) && room) {
      const sp = (k.has('shift') ? 3.2 : 1.5) * dt
      const fx = -Math.sin(p.yaw)
      const fz = -Math.cos(p.yaw)
      const rx = Math.cos(p.yaw)
      const rz = -Math.sin(p.yaw)
      const n = Math.hypot(f, sd)
      const [nx, nz] = walkStep(room, [p.x, p.z], [((fx * f + rx * sd) / n) * sp, ((fz * f + rz * sd) / n) * sp])
      p.x = nx
      p.z = nz
    }
    const y = eyeY()
    camera.position.set(p.x, y, p.z)
    camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ')
    ctl.target.set(p.x - Math.sin(p.yaw), y, p.z - Math.cos(p.yaw))
  })

  return null
}
