import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useAnalysis } from '../hooks'
import { roomBounds } from '../lib/geom'
import { useStore } from '../store'
import { useSceneColors } from '../theme'
import { FurnitureLayer } from './Furniture'
import { rayAtY, useViewRoom, viewportApi } from './helpers'
import { focusItems, focusRoom } from '../lib/focus'
import { dropPose } from '../lib/placement'
import { MeasureTool } from './MeasureTool'
import { Clearances, MeasurementsView, ScanGhosts, SnapGuides, WallPreview } from './Overlays'
import { RoomView } from './Room'
import { walkApi, WalkControls } from './Walk'
import { viewHash, viewRestore, type SavedView } from '../lib/viewUrl'

function useBounds() {
  const room = useViewRoom()
  return useMemo(() => (room ? roomBounds(room) : roomBounds({ floor: [], walls: [] } as never)), [room])
}

function SceneEnv() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.55
    return () => {
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

function Lights() {
  const b = useBounds()
  const ceiling = useStore((s) => s.room?.ceilingHeight ?? 2.6)
  const target = useMemo(() => new THREE.Object3D(), [])
  const span = Math.max(b.w, b.d) / 2 + 1.5
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cdbfae', 0.9]} />
      <ambientLight intensity={0.25} />
      <primitive object={target} position={[b.cx, 0, b.cz]} />
      <directionalLight
        castShadow
        target={target}
        position={[b.cx + 2.2, 8, b.cz + 3.2]}
        intensity={1.9}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-span, span, span, -span, 0.5, 25]} />
      </directionalLight>
      <pointLight position={[b.cx, ceiling - 0.15, b.cz]} intensity={2.2} distance={9} decay={1.2} color="#fff3e2" />
    </>
  )
}

function CameraRig() {
  const view = useStore((s) => s.settings.view)
  const walk = useStore((s) => s.walk)
  const cmd = useStore((s) => s.cameraCmd)
  const b = useBounds()
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const anim = useRef<{ t0: number; fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; fromZ?: number; toZ?: number } | null>(null)

  // transição suave da câmera (focar num móvel)
  useFrame(() => {
    const a = anim.current
    if (!a || !controls) return
    const k = Math.min(1, (performance.now() - a.t0) / 450)
    const e = 1 - (1 - k) ** 3
    camera.position.lerpVectors(a.fromP, a.toP, e)
    controls.target.lerpVectors(a.fromT, a.toT, e)
    if (a.fromZ !== undefined && a.toZ !== undefined) {
      const c = camera as THREE.OrthographicCamera
      c.zoom = a.fromZ + (a.toZ - a.fromZ) * e
      c.updateProjectionMatrix()
    }
    controls.update()
    if (k >= 1) anim.current = null
  })

  // Ctrl (ou Alt) + roda: o zoom vai na direção do cursor; só a roda continua aproximando do centro.
  // Ouvinte em captura, antes do próprio OrbitControls tratar a roda.
  useEffect(() => {
    const orbit = controls as unknown as { zoomToCursor?: boolean; domElement?: HTMLElement } | null
    if (view !== '3d' || walk || !orbit?.domElement || orbit.zoomToCursor === undefined) return
    const el = orbit.domElement
    const onWheel = (e: WheelEvent) => {
      orbit.zoomToCursor = e.ctrlKey || e.altKey
    }
    el.addEventListener('wheel', onWheel, { capture: true, passive: true })
    return () => el.removeEventListener('wheel', onWheel, { capture: true })
  }, [controls, view, walk])

  // ao sair do modo andar, a órbita continua de onde se estava olhando
  const wasWalk = useRef(false)
  useEffect(() => {
    if (walk) {
      wasWalk.current = true
      return
    }
    // espera os OrbitControls voltarem (no mesmo instante ainda pode ser o controle do modo andar)
    if (!wasWalk.current || !controls || (controls as unknown as { isWalk?: boolean }).isWalk) return
    wasWalk.current = false
    if (walkApi.lastLook) controls.target.copy(walkApi.lastLook)
    controls.update()
  }, [walk, controls, camera])

  // cada comando de câmera roda uma vez só (trocar de controles — ex.: sair do modo andar — não repete o último)
  const handled = useRef<{ n: number; view: string } | null>(null)
  useEffect(() => {
    if (!controls) return
    if (handled.current && handled.current.n === cmd.n && handled.current.view === view) return
    if (useStore.getState().walk) {
      handled.current = { n: cmd.n, view }
      return
    }
    // a troca 3D ↔ planta monta outra câmera e outros controles: espera os novos chegarem (senão o
    // enquadramento ia para a câmera velha e a planta abria torta, olhando para a origem)
    const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera === true
    if ((controls as unknown as { object?: THREE.Camera }).object !== camera || isOrtho !== (view === '2d')) return
    handled.current = { n: cmd.n, view }
    anim.current = null
    // vista salva na URL (recarregou a página / abriu um link): volta exatamente para ela
    const saved = viewRestore.pending
    if (saved && saved.mode !== 'andar' && (saved.mode === 'planta') === (view === '2d')) {
      viewRestore.pending = null
      if (saved.mode === 'planta') {
        const cam = camera as THREE.OrthographicCamera
        cam.position.set(saved.c[0], 30, saved.c[1] + 1e-4)
        cam.zoom = Math.min(3000, Math.max(15, saved.zoom ?? 120))
        cam.updateProjectionMatrix()
        controls.target.set(saved.c[0], 0, saved.c[1])
      } else {
        camera.position.set(saved.c[0], saved.c[1], saved.c[2])
        controls.target.set(saved.t![0], saved.t![1], saved.t![2])
      }
      controls.update()
      return
    }
    const ceiling = useStore.getState().room?.ceilingHeight ?? 2.6
    if (cmd.kind === 'focus' && cmd.target) {
      // foca no móvel: a órbita passa a girar em volta dele (mantém o ângulo de visão atual)
      const t = new THREE.Vector3(cmd.target.x, cmd.target.y, cmd.target.z)
      if (view === '2d') {
        const c = camera as THREE.OrthographicCamera
        const z = Math.min(size.width, size.height) / (cmd.target.r * 2 * 2.4)
        // o alvo parte de baixo da câmera (e não do alvo antigo): a planta não inclina durante a animação
        const fromT = new THREE.Vector3(camera.position.x, 0, camera.position.z - 1e-4)
        anim.current = { t0: performance.now(), fromP: camera.position.clone(), toP: new THREE.Vector3(t.x, 30, t.z + 1e-4), fromT, toT: new THREE.Vector3(t.x, 0, t.z), fromZ: c.zoom, toZ: Math.min(3000, Math.max(15, z)) }
      } else {
        const cam = camera as THREE.PerspectiveCamera
        const vfov = THREE.MathUtils.degToRad(cam.fov ?? 50)
        const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / Math.max(1, size.height)))
        const dist = Math.max(0.6, (cmd.target.r / Math.sin(Math.min(vfov, hfov) / 2)) * 1.25)
        const dir = camera.position.clone().sub(controls.target)
        if (dir.lengthSq() < 1e-6) dir.set(0.5, 0.6, 0.9)
        dir.normalize()
        // nem rente ao chão nem de cima demais
        const el = Math.asin(Math.max(-1, Math.min(1, dir.y)))
        const elC = Math.max(0.25, Math.min(1.0, el))
        const hz = Math.hypot(dir.x, dir.z) || 1
        dir.set((dir.x / hz) * Math.cos(elC), Math.sin(elC), (dir.z / hz) * Math.cos(elC))
        anim.current = { t0: performance.now(), fromP: camera.position.clone(), toP: t.clone().addScaledVector(dir, dist), fromT: controls.target.clone(), toT: t }
      }
      return
    }
    if (view === '2d') {
      const cam = camera as THREE.OrthographicCamera
      cam.position.set(b.cx, 30, b.cz + 1e-4)
      cam.zoom = Math.min(size.width / (b.w + 1.8), size.height / (b.d + 1.8))
      cam.updateProjectionMatrix()
      controls.target.set(b.cx, 0, b.cz)
    } else if (cmd.kind === 'eye') {
      // Na porta principal (a mais larga), olhando para o centro do cômodo; senão, de um canto
      const st = useStore.getState()
      const room = focusRoom(st.room, st.focusSpace)
      const door = room?.openings.filter((o) => o.kind === 'door').sort((a, c) => c.width - a.width)[0]
      const wall = door && room?.walls.find((w) => w.id === door.wallId)
      const eyeY = Math.min(1.6, ceiling - 0.3)
      if (door && wall) {
        const L = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) || 1
        const ux = (wall.b[0] - wall.a[0]) / L
        const uz = (wall.b[1] - wall.a[1]) / L
        camera.position.set(wall.a[0] + ux * door.offset + wall.normal[0] * 0.25, eyeY, wall.a[1] + uz * door.offset + wall.normal[1] * 0.25)
        const dir = new THREE.Vector3(b.cx - camera.position.x, 0, b.cz - camera.position.z).normalize()
        controls.target.copy(camera.position).addScaledVector(dir, 0.6).setY(eyeY - 0.12)
      } else {
        const p = new THREE.Vector3(b.minX + 0.3, eyeY, b.maxZ - 0.3)
        const dir = new THREE.Vector3(b.maxX - b.minX, 0, b.minZ - b.maxZ).normalize()
        camera.position.copy(p)
        controls.target.copy(p).addScaledVector(dir, 0.6).setY(p.y - 0.12)
      }
    } else {
      // Enquadra a planta inteira considerando a proporção da tela (painel estreito = mais longe)
      const cam = camera as THREE.PerspectiveCamera
      const vfov = THREE.MathUtils.degToRad(cam.fov ?? 50)
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / Math.max(1, size.height)))
      const radius = Math.hypot(b.w, b.d) / 2 + 0.3
      const dist = Math.max(4, (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.92)
      const dir = new THREE.Vector3(0.5, 1.05, 0.95).normalize()
      controls.target.set(b.cx, 0.5, b.cz)
      camera.position.set(b.cx, 0.5, b.cz).addScaledVector(dir, dist)
    }
    controls.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd.n, view, controls, camera])

  return view === '3d' ? (
    <group key="3d">
      <PerspectiveCamera makeDefault fov={walk ? 70 : 50} near={0.03} far={200} position={[b.cx + 3, 5, b.cz + 6]} />
      {walk ? <WalkControls /> : <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.495} minDistance={0.2} maxDistance={40} />}
    </group>
  ) : (
    <group key="2d">
      <OrthographicCamera makeDefault near={0.1} far={200} position={[b.cx, 30, b.cz + 1e-4]} zoom={120} />
      <OrbitControls
        makeDefault
        enableRotate={false}
        enableDamping={false}
        screenSpacePanning
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
        minZoom={15}
        maxZoom={3000}
        zoomToCursor
      />
    </group>
  )
}

/**
 * Grava a vista atual na URL (lib/viewUrl): quando a câmera para de mexer, troca o hash sem criar
 * histórico — recarregar ou abrir o link volta para a mesma vista. Confere num relógio (e não a cada
 * quadro), então vale também com a aba em segundo plano, e grava na hora ao sair/recarregar.
 */
function ViewUrlSync() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; isWalk?: boolean } | null
  useEffect(() => {
    let cand = { h: '', t: 0 }
    const current = (): string | null => {
      if (!viewRestore.ready || !controls) return null
      // vista salva ainda não aplicada (a câmera certa não montou): não troca o link por outra
      if (viewRestore.pending) {
        if (performance.now() - viewRestore.since < 4000) return null
        viewRestore.pending = null
      }
      const st = useStore.getState()
      let v: SavedView
      if (st.walk) {
        const p = walkApi.pose?.()
        if (!p || !controls.isWalk) return null
        v = { mode: 'andar', c: [p.x, p.z], o: [p.yaw, p.pitch] }
      } else if (controls.isWalk) return null
      else if (st.settings.view === '2d') v = { mode: 'planta', c: [controls.target.x, controls.target.z], zoom: (camera as THREE.OrthographicCamera).zoom }
      else v = { mode: '3d', c: camera.position.toArray(), t: controls.target.toArray() }
      v.f = st.focusSpace ?? undefined
      return viewHash(v)
    }
    const write = (h: string) => {
      if (h !== location.hash) history.replaceState(history.state, '', location.pathname + location.search + h)
    }
    const tick = setInterval(() => {
      const h = current()
      if (!h) return
      const now = performance.now()
      if (h !== cand.h) cand = { h, t: now }
      else if (now - cand.t >= 300) write(h)
    }, 150)
    const flush = () => {
      const h = current()
      if (h) write(h)
    }
    window.addEventListener('pagehide', flush)
    return () => {
      clearInterval(tick)
      window.removeEventListener('pagehide', flush)
    }
  }, [camera, controls])
  return null
}

/** Expõe projeção tela→piso e captura de imagem para a UI; acompanha o cursor no piso. */
function ViewportBridge() {
  const { gl, camera, scene } = useThree()
  const setCursor = useStore((s) => s.setCursor)
  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    viewportApi.screenToFloor = (cx, cy) => {
      const r = gl.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera)
      const p = rayAtY(raycaster.ray, 0)
      return p ? [p.x, p.z] : null
    }
    viewportApi.dropPose = (base, cx, cy) => {
      const r = gl.domElement.getBoundingClientRect()
      if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null
      raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera)
      const st = useStore.getState()
      const room = focusRoom(st.room, st.focusSpace)
      if (!room) return null
      return dropPose(base, room, focusItems(st.items, st.room, st.focusSpace), (y) => {
        const p = rayAtY(raycaster.ray, y)
        return p ? [p.x, p.z] : null
      })
    }
    viewportApi.itemAt = (cx, cy) => {
      const r = gl.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera)
      const furn = scene.getObjectByName('furniture')
      if (!furn) return null
      const hits = raycaster.intersectObject(furn, true).filter((h) => h.object.userData.itemId)
      const real = hits.find((h) => !h.object.userData.proxy)
      return (real ?? hits[0])?.object.userData.itemId ?? null
    }
    viewportApi.capture = () => {
      gl.render(scene, camera)
      return gl.domElement.toDataURL('image/png')
    }
    const el = gl.domElement
    let raf = 0
    const onMove = (ev: PointerEvent) => {
      viewportApi.pointer = [ev.clientX, ev.clientY]
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setCursor(viewportApi.screenToFloor?.(ev.clientX, ev.clientY) ?? null))
    }
    const onLeave = () => {
      viewportApi.pointer = null
      cancelAnimationFrame(raf)
      setCursor(null)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [gl, camera, scene, setCursor])
  return null
}

/**
 * Retângulo de seleção na planta: Shift + arrastar num lugar vazio (ou só arrastar, com "Selecionar
 * vários" ligado) seleciona os móveis cujo centro fica dentro. Sem Shift, arrastar o fundo continua
 * deslocando a planta.
 */
function MarqueeSelect() {
  const { gl, camera, scene } = useThree()
  const connected = useThree((s) => s.events.connected) as HTMLElement | null | undefined
  useEffect(() => {
    const el = connected ?? gl.domElement
    const raycaster = new THREE.Raycaster()
    let start: [number, number] | null = null
    const overItem = (cx: number, cy: number) => {
      const r = gl.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera)
      const furn = scene.getObjectByName('furniture')
      return !!furn && raycaster.intersectObject(furn, true).some((h) => !!h.object.userData.itemId)
    }
    const swallow = (e: Event) => e.stopPropagation()
    const onMove = (e: PointerEvent) => {
      if (start) useStore.getState().setMarquee([start[0], start[1], e.clientX, e.clientY])
    }
    const onUp = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      const st = useStore.getState()
      st.setMarquee(null)
      if (!start) return
      const [x0, y0] = start
      start = null
      e.stopPropagation()
      if (Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return
      const a = viewportApi.screenToFloor?.(x0, y0)
      const b = viewportApi.screenToFloor?.(e.clientX, e.clientY)
      if (!a || !b) return
      const [minX, maxX] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])]
      const [minZ, maxZ] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])]
      const ids = focusItems(st.items, st.room, st.focusSpace)
        .filter((i) => i.x >= minX && i.x <= maxX && i.z >= minZ && i.z <= maxZ)
        .map((i) => i.id)
      st.selectMany(ids, true)
    }
    const onDown = (e: PointerEvent) => {
      const st = useStore.getState()
      if (e.button !== 0 || st.settings.view !== '2d' || st.settings.tool !== 'select' || st.walk) return
      if (!e.shiftKey && !st.multiMode) return
      if (overItem(e.clientX, e.clientY)) return
      // não deixa a planta deslocar nem a cena desmarcar
      e.stopPropagation()
      e.preventDefault()
      start = [e.clientX, e.clientY]
      st.setMarquee([e.clientX, e.clientY, e.clientX, e.clientY])
      window.addEventListener('pointermove', onMove, true)
      window.addEventListener('pointerup', onUp, true)
      el.addEventListener('click', swallow, { capture: true, once: true })
    }
    el.addEventListener('pointerdown', onDown, true)
    return () => {
      el.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
    }
  }, [gl, camera, scene, connected])
  return null
}

export function Viewport() {
  const { colliding, flagged } = useAnalysis()
  const colors = useSceneColors()
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onPointerMissed={() => {
        const st = useStore.getState()
        if (st.settings.tool === 'select') st.select(null)
      }}
    >
      <color attach="background" args={[colors.background]} />
      <SceneEnv />
      <CameraRig />
      <Lights />
      <RoomView />
      <FurnitureLayer colliding={colliding} flagged={flagged} />
      <ScanGhosts />
      <Clearances />
      <SnapGuides />
      <WallPreview />
      <MeasurementsView />
      <MeasureTool />
      <ViewportBridge />
      <ViewUrlSync />
      <MarqueeSelect />
    </Canvas>
  )
}
