import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { generateCatalogThumbs } from './furniture/thumbnails'
import { loadLocal, onProjectSavedElsewhere, saveLocal, saveSettings } from './lib/persist'
import { debounce, normAngle } from './lib/util'
import { Viewport } from './scene/Viewport'
import { selectedItem, useStore } from './store'
import { Catalog } from './ui/Catalog'
import { SaveAlert, StatusBar, Toast, ViewOverlay } from './ui/Chrome'
import { exportProject, loadProjectData, loadSample, openFile, projectData } from './ui/fileOps'
import { Inspector } from './ui/Inspector'
import { Toolbar } from './ui/Toolbar'
import { exportCheckpointsToRepo, loadCheckpoints, replaceCheckpoints, saveCheckpoint } from './ui/checkpointStore'
import { casaAvailable, casaTestMode, casaUnloadRisk, onCasaChanged, onCasaWriteState, readCheckpoints, readProject, retryCasaWrites, writeProject } from './lib/casaSync'
import { saveApi, updateSave, useSaveStatus } from './ui/saveStatus'
import type { ProjectData } from './lib/persist'
import { useThemeSync } from './theme'
import { motorRange } from './lib/stack'
import { focusItems } from './lib/focus'
import { footprint, rotLocal } from './lib/geom'
import type { FurnitureItem } from './lib/types'
import { viewportApi } from './scene/helpers'
import { parseViewHash, viewRestore } from './lib/viewUrl'

/** Restaura a vista do hash da URL: modo (3D, planta, andar), cômodo isolado e câmera. */
function applyViewFromUrl() {
  const v = parseViewHash(location.hash)
  if (!v) return
  viewRestore.pending = v
  viewRestore.since = performance.now()
  useStore.setState((s) => ({
    focusSpace: v.f && s.room?.spaces?.some((sp) => sp.id === v.f) ? v.f : null,
    walk: v.mode === 'andar',
    settings: {
      ...s.settings,
      view: v.mode === 'planta' ? '2d' : '3d',
      wallMode: v.mode === 'andar' && s.settings.wallMode === 'low' ? 'cutaway' : s.settings.wallMode,
    },
    cameraCmd: { kind: 'fit', n: s.cameraCmd.n + 1 },
  }))
}

let booted = false
async function boot() {
  if (booted) return
  booted = true
  const st = useStore.getState()
  const saved = loadLocal()
  // rodando pelo servidor do repositório: a casa da pasta casa/ manda sobre o que está no navegador
  // (no teste, ?semsync, também abre a casa atual de lá — só não grava)
  const repo = await casaAvailable()
  const fromRepo: ProjectData | null = repo || casaTestMode ? await readProject().catch(() => null) : null
  try {
    if (fromRepo) await loadProjectData(fromRepo)
    else if (saved) await loadProjectData(saved)
    else await loadSample()
  } catch (err) {
    console.error(err)
    st.notify('Não foi possível carregar o cômodo inicial')
  }
  // vista salva na URL (recarregou / abriu um link): volta para ela; depois disso a URL acompanha a vista
  applyViewFromUrl()
  viewRestore.ready = true
  window.addEventListener('hashchange', applyViewFromUrl)
  generateCatalogThumbs(st.setThumb)
  if (repo) {
    onCasaWriteState((r) => updateSave({ repo: r }))
    const cps = await readCheckpoints().catch(() => null)
    if (cps) await replaceCheckpoints(cps)
    else await exportCheckpointsToRepo()
    // primeira vez neste repositório: a casa que estava no navegador vira o arquivo
    if (!fromRepo) {
      const p = projectData(useStore.getState())
      if (p) await writeProject(p)
    }
  } else loadCheckpoints()

  // projeto alterado em outra aba: carrega aqui também (e não regrava o que acabou de chegar)
  let fromOtherTab = false
  onProjectSavedElsewhere(async (p) => {
    fromOtherTab = true
    await loadProjectData(p, true)
    st.notify('Projeto atualizado a partir de outra aba')
  })
  const storeLocal = (p: ProjectData) => {
    const error = saveLocal(p)
    updateSave({ local: error ? { ...useSaveStatus.getState().local, error } : { at: Date.now(), error: null } })
  }
  // grava um pouco depois da última alteração (arrastar um móvel não grava a cada quadro)
  let timer: ReturnType<typeof setTimeout> | undefined
  const saveNow = (force = false) => {
    clearTimeout(timer)
    timer = undefined
    updateSave({ dirty: false })
    if (fromOtherTab && !force) {
      fromOtherTab = false
      return
    }
    const p = projectData(useStore.getState())
    if (!p) return
    storeLocal(p)
    if (repo) void writeProject(p)
  }
  const persist = () => {
    clearTimeout(timer)
    timer = setTimeout(saveNow, 400)
    if (!useSaveStatus.getState().dirty) updateSave({ dirty: true })
  }
  saveApi.saveNow = () => {
    saveNow(true)
    retryCasaWrites()
  }
  // fechando ou recarregando (o Vite recarrega sozinho quando o servidor volta): grava já o que faltava
  // (a gravação termina mesmo com a página fechada); se a pasta casa/ está falhando, o navegador
  // pergunta antes de sair — ao abrir de novo, é a casa/ que vale
  window.addEventListener('beforeunload', (e) => {
    if (timer !== undefined) saveNow()
    if (useSaveStatus.getState().repo?.failed.length) retryCasaWrites()
    if (useSaveStatus.getState().local.error || (repo && casaUnloadRisk())) e.preventDefault()
  })
  // arquivo da casa alterado por fora (git pull, checkout): recarrega sem regravar o que chegou
  if (repo)
    onCasaChanged(async (file) => {
      if (file === 'projeto.json') {
        const p = await readProject().catch(() => null)
        if (!p) return
        fromOtherTab = true
        await loadProjectData(p, true)
        storeLocal(p)
        useStore.getState().notify('Casa atualizada a partir de casa/projeto.json (git)')
      } else if (file === 'checkpoints.json') {
        const cps = await readCheckpoints().catch(() => null)
        if (cps) await replaceCheckpoints(cps)
      }
    })
  const persistSettings = debounce(() => {
    const { tool: _tool, ...rest } = useStore.getState().settings
    saveSettings(rest)
  }, 400)
  useStore.subscribe((s, prev) => {
    if (s.room !== prev.room || s.items !== prev.items || s.measurements !== prev.measurements || s.assets !== prev.assets || s.groups !== prev.groups) persist()
    if (s.settings !== prev.settings) persistSettings()
  })
}

/**
 * Onde a cópia colada fica: com o mouse sobre a cena, embaixo do cursor (um item segue as mesmas
 * regras de soltar do catálogo: em cima da mesa, na parede…); fora dela, ao lado do original, um
 * passo a mais a cada Ctrl+V.
 */
function placeCopies(copies: FurnitureItem[], n: number): FurnitureItem[] {
  const ptr = viewportApi.pointer
  if (ptr) {
    if (copies.length === 1) {
      const pose = viewportApi.dropPose?.(copies[0], ptr[0], ptr[1])
      if (pose) return [pose]
    }
    const f = viewportApi.screenToFloor?.(ptr[0], ptr[1])
    if (f) {
      const fp = copies.flatMap((c) => footprint(c))
      const cx = (Math.min(...fp.map((p) => p[0])) + Math.max(...fp.map((p) => p[0]))) / 2
      const cz = (Math.min(...fp.map((p) => p[1])) + Math.max(...fp.map((p) => p[1]))) / 2
      return copies.map((c) => ({ ...c, x: c.x + f[0] - cx, z: c.z + f[1] - cz }))
    }
  }
  if (copies.length === 1) {
    const c = copies[0]
    const [dx, dz] = rotLocal((c.width + 0.05) * n, 0, c.rotation)
    return [{ ...c, x: c.x + dx, z: c.z + dz }]
  }
  const fp = copies.flatMap((c) => footprint(c))
  const w = Math.max(...fp.map((p) => p[0])) - Math.min(...fp.map((p) => p[0])) + 0.2
  return copies.map((c) => ({ ...c, x: c.x + w * n }))
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const st = useStore.getState()
      const k = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      const item = selectedItem(st)
      const multi = st.multi
      const grp = st.selection?.kind === 'group' ? st.groups.find((g) => g.id === st.selection!.id) ?? null : null
      if (mod) {
        if (k === 'd' && grp) {
          e.preventDefault()
          st.duplicateGroup(grp.id)
          return
        }
        if (k === 'c') {
          if (st.copySelection()) e.preventDefault()
          return
        }
        if (k === 'v' && st.clipboard) {
          e.preventDefault()
          st.pasteClipboard(placeCopies)
          return
        }
        if (k === 'a') {
          // Ctrl+A: todos os móveis do que está à vista (casa toda ou o cômodo em foco)
          e.preventDefault()
          st.selectMany(focusItems(st.items, st.room, st.focusSpace).map((i) => i.id))
          return
        }
        if (k === 'd' && multi.length) {
          e.preventDefault()
          st.duplicateItems(multi)
          return
        }
        if (k === 'z') {
          e.preventDefault()
          if (e.shiftKey) st.redo()
          else st.undo()
        } else if (k === 'y') {
          e.preventDefault()
          st.redo()
        } else if (k === 'd' && item) {
          e.preventDefault()
          st.duplicateItem(item.id)
        } else if (k === 's') {
          e.preventDefault()
          if (e.shiftKey) saveCheckpoint()
          else exportProject()
        }
        return
      }
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          st.deleteSelection()
          return
        case 'Escape':
          if (st.settings.tool === 'measure') st.setSettings({ tool: 'select' })
          else if (st.multi.length || st.multiMode) st.select(null)
          // editando um membro: Esc volta para o grupo (o caminho de volta)
          else if (st.editingGroup && st.selection?.kind === 'item') st.select({ kind: 'group', id: st.editingGroup })
          else if (st.selection) st.select(null)
          else if (st.walk) st.setWalk(false)
          return
      }
      // grupo selecionado: mover, girar em volta do pivô, travar e focar valem para o grupo
      if (grp) {
        if (k === 'r') return st.rotateGroup(grp.id, (e.shiftKey ? -1 : 1) * (Math.PI / 2))
        if (k === 'l') {
          const sel = st.items.filter((i) => grp.members.includes(i.id))
          return st.updateItems(grp.members, { locked: sel.some((i) => !i.locked) })
        }
        if (k === 'f') return st.focusGroup(grp.members)
        if (e.key.startsWith('Arrow') && !e.altKey) {
          e.preventDefault()
          const d = e.shiftKey ? 0.1 : 0.01
          const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
          const dz = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
          return st.moveGroup(grp.id, dx, dz, !e.repeat)
        }
      }
      // seleção de vários móveis: as mesmas teclas valem para o conjunto
      if (multi.length) {
        if (k === 'r') return st.rotateItems(multi, (e.shiftKey ? -1 : 1) * (Math.PI / 2))
        if (k === 'l') {
          const sel = st.items.filter((i) => multi.includes(i.id))
          return st.updateItems(multi, { locked: sel.some((i) => !i.locked) })
        }
        if (k === 'f') return st.focusGroup(multi)
        if (e.key.startsWith('Arrow') && !e.altKey) {
          e.preventDefault()
          const d = e.shiftKey ? 0.1 : 0.01
          const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
          const dz = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
          return st.moveItems(multi, dx, dz, !e.repeat)
        }
      }
      if (k === 'v') st.setSettings({ tool: 'select' })
      else if (k === 'm') st.setSettings({ tool: 'measure' })
      else if (k === '2') st.setSettings({ view: '2d' })
      else if (k === '3') st.setSettings({ view: '3d' })
      else if (k === 'f') {
        // F: foca no móvel selecionado (a câmera gira em volta dele); sem seleção, enquadra o cômodo
        if (item) st.focusItem(item.attachedTo ?? item.id)
        else st.requestCamera('fit')
      }
      else if (item && k === 'r' && !item.locked) st.updateItem(item.id, { rotation: normAngle(item.rotation + (e.shiftKey ? -1 : 1) * (Math.PI / 2)) })
      else if (item && k === 'l') st.updateItem(item.id, { locked: !item.locked })
      else if (item && !item.locked && (e.key === 'PageUp' || e.key === 'PageDown' || (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')))) {
        // Subir/descer (elevação)
        e.preventDefault()
        const up = e.key === 'PageUp' || e.key === 'ArrowUp'
        const d = e.shiftKey ? 0.1 : 0.01
        // mesa elétrica: sobe/desce o tampo pelo motor
        const motor = motorRange(item)
        if (motor) {
          const h = Math.min(motor.hi, Math.max(motor.lo, item.height + (up ? d : -d)))
          st.updateItem(item.id, { height: Math.round(h * 1000) / 1000 }, !e.repeat)
          return
        }
        const ceiling = st.room?.ceilingHeight ?? 3
        const elevation = Math.min(Math.max(0, item.elevation + (up ? d : -d)), Math.max(0, ceiling - item.height))
        st.updateItem(item.id, { elevation: Math.round(elevation * 1000) / 1000 }, !e.repeat)
      } else if (item && !item.locked && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const d = e.shiftKey ? 0.1 : 0.01
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
        const dz = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
        st.updateItem(item.id, { x: item.x + dx, z: item.z + dz }, !e.repeat)
      }
    }
    // Shift apertado: os rótulos de medida deixam o clique passar (Shift + clique num móvel embaixo de uma cota)
    const shift = (e: KeyboardEvent | PointerEvent) => document.body.classList.toggle('mod-shift', e.shiftKey)
    const unshift = () => document.body.classList.remove('mod-shift')
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', shift)
    window.addEventListener('keyup', shift)
    window.addEventListener('pointermove', shift, { passive: true })
    window.addEventListener('blur', unshift)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', shift)
      window.removeEventListener('keyup', shift)
      window.removeEventListener('pointermove', shift)
      window.removeEventListener('blur', unshift)
    }
  }, [])
}

export default function App() {
  const [dropping, setDropping] = useState(false)

  // trocar a seleção abre o painel do começo (antes ficava na rolagem do painel anterior, no meio
  // das medidas); ao voltar para o painel da casa, volta para onde a lista estava
  const rightRef = useRef<HTMLElement>(null)
  const homeScroll = useRef(0)
  const selKey = useStore((s) => (s.selection ? `${s.selection.kind}:${s.selection.id}` : ''))
  useLayoutEffect(() => {
    const el = rightRef.current
    if (el) el.scrollTop = selKey ? 0 : homeScroll.current
  }, [selKey])
  useEffect(() => {
    boot()
  }, [])
  useKeyboard()
  useThemeSync()

  // Pinça do touchpad / Ctrl+roda ampliam a página inteira (fica com rolagem para os lados e o
  // Ctrl+0 não volta). Aqui o zoom é só da cena; se a página já estiver ampliada, deixa só reduzir.
  useEffect(() => {
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      const vv = window.visualViewport
      if (vv && vv.scale > 1.01 && e.deltaY > 0) return
      e.preventDefault()
    }
    const gesture = (e: Event) => e.preventDefault()
    // a página nunca rola (só os painéis): se algo rolar a raiz, volta
    const unscroll = () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    }
    window.addEventListener('scroll', unscroll)
    unscroll()
    document.scrollingElement?.scrollTo(0, 0)
    window.addEventListener('wheel', wheel, { passive: false })
    document.addEventListener('gesturestart', gesture)
    document.addEventListener('gesturechange', gesture)
    return () => {
      window.removeEventListener('scroll', unscroll)
      window.removeEventListener('wheel', wheel)
      document.removeEventListener('gesturestart', gesture)
      document.removeEventListener('gesturechange', gesture)
    }
  }, [])

  // Arquivos soltos em qualquer lugar da janela
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        setDropping(true)
      }
    }
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDropping(false)
    }
    const drop = (e: DragEvent) => {
      setDropping(false)
      const f = e.dataTransfer?.files?.[0]
      if (f) {
        e.preventDefault()
        openFile(f)
      }
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return (
    <div className="app">
      <Toolbar />
      <aside className="left">
        <Catalog />
      </aside>
      <main className="center">
        <Viewport />
        <ViewOverlay />
      </main>
      <aside
        className="right"
        ref={rightRef}
        onScroll={(e) => {
          if (!useStore.getState().selection) homeScroll.current = e.currentTarget.scrollTop
        }}
      >
        <Inspector />
      </aside>
      <StatusBar />
      <SaveAlert />
      <Toast />
      {dropping && (
        <div className="drop-hint">
          <div>
            Solte para abrir
            <small>JSON do RoomPlan, projeto salvo (.json) ou modelo 3D (.glb)</small>
          </div>
        </div>
      )}
    </div>
  )
}
