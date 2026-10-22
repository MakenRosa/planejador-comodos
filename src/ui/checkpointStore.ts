/**
 * Checkpoints: fotografias do projeto (cômodos, acabamentos, móveis e medições) guardadas no
 * navegador (IndexedDB) para testar combinações e voltar a qualquer uma delas.
 * Restaurar entra no histórico — Ctrl+Z volta ao estado de antes.
 */
import { writeCheckpoints } from '../lib/casaSync'
import { APP_ID, cpAll, cpDel, cpGet, cpPut, type Checkpoint, type CheckpointMeta } from '../lib/persist'
import { uid } from '../lib/util'
import { viewportApi } from '../scene/helpers'
import { useStore } from '../store'
import { upgradeSavedHouse } from './houseData'

const meta = ({ data: _data, ...m }: Checkpoint): CheckpointMeta => m
const byNewest = (a: CheckpointMeta, b: CheckpointMeta) => b.createdAt.localeCompare(a.createdAt)

/** Grava a lista completa em casa/checkpoints.json (quando o app roda pelo servidor do repositório). */
async function saveToRepo() {
  await writeCheckpoints(await allCheckpoints())
}

/** Miniatura da vista atual (JPEG pequeno, recortado em 16:10). */
async function captureThumb(): Promise<string | undefined> {
  const url = viewportApi.capture?.()
  if (!url) return undefined
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const W = 240
    const H = 150
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    const k = Math.max(W / img.width, H / img.height)
    const w = img.width * k
    const h = img.height * k
    g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
    return c.toDataURL('image/jpeg', 0.8)
  } catch {
    return undefined
  }
}

export async function loadCheckpoints() {
  try {
    const all = await cpAll()
    useStore.getState().setCheckpoints(all.map(meta).sort(byNewest))
  } catch {
    /* IndexedDB indisponível (ex.: janela privada) — a lista fica vazia */
  }
}

function nextName() {
  const used = new Set(useStore.getState().checkpoints.map((c) => c.name))
  let n = useStore.getState().checkpoints.length + 1
  while (used.has(`Checkpoint ${n}`)) n++
  return `Checkpoint ${n}`
}

export async function saveCheckpoint(name?: string) {
  const st = useStore.getState()
  if (!st.room) return
  const now = new Date().toISOString()
  const cp: Checkpoint = {
    id: uid(),
    name: name?.trim() || nextName(),
    createdAt: now,
    updatedAt: now,
    thumb: await captureThumb(),
    itemCount: st.items.length,
    data: { room: st.room, items: st.items, measurements: st.measurements, groups: st.groups },
  }
  try {
    await cpPut(cp)
  } catch {
    st.notify('Não foi possível salvar o checkpoint neste navegador')
    return
  }
  const s = useStore.getState()
  s.setCheckpoints([meta(cp), ...s.checkpoints].sort(byNewest))
  // a base é o estado gravado (o usuário pode ter mexido enquanto a miniatura era gerada)
  useStore.setState({ cpBase: { id: cp.id, ...cp.data } })
  s.notify(`Checkpoint “${cp.name}” salvo`)
  void saveToRepo()
}

export async function restoreCheckpoint(id: string) {
  const cp = await cpGet(id).catch(() => undefined)
  const st = useStore.getState()
  if (!cp) return st.notify('Checkpoint não encontrado')
  let { room, items, measurements } = cp.data
  const groups = cp.data.groups ?? []
  // checkpoints da casa com geometria antiga são atualizados como os projetos salvos
  room = (await upgradeSavedHouse({ app: APP_ID, version: 1, savedAt: cp.updatedAt, room, items, measurements, assets: [] })).room
  st.commit()
  const sel = st.selection
  useStore.setState({
    room,
    items,
    measurements,
    groups,
    selection: (sel?.kind === 'item' && !items.some((i) => i.id === sel.id)) || (sel?.kind === 'group' && !groups.some((g) => g.id === sel.id)) ? null : sel,
    editingGroup: null,
  })
  useStore.setState({ cpBase: { id, room, items, measurements, groups } })
  st.notify(`“${cp.name}” restaurado — Ctrl+Z volta para como estava`)
}

/** Grava o estado atual por cima de um checkpoint existente. */
export async function overwriteCheckpoint(id: string) {
  const st = useStore.getState()
  const cp = await cpGet(id).catch(() => undefined)
  if (!cp || !st.room) return
  const next: Checkpoint = {
    ...cp,
    updatedAt: new Date().toISOString(),
    thumb: (await captureThumb()) ?? cp.thumb,
    itemCount: st.items.length,
    data: { room: st.room, items: st.items, measurements: st.measurements, groups: st.groups },
  }
  await cpPut(next)
  const s = useStore.getState()
  s.setCheckpoints(s.checkpoints.map((c) => (c.id === id ? meta(next) : c)))
  useStore.setState({ cpBase: { id, ...next.data } })
  s.notify(`“${cp.name}” atualizado com o estado atual`)
  void saveToRepo()
}

export async function renameCheckpoint(id: string, name: string) {
  const cp = await cpGet(id).catch(() => undefined)
  if (!cp || !name.trim()) return
  const next = { ...cp, name: name.trim() }
  await cpPut(next)
  const s = useStore.getState()
  s.setCheckpoints(s.checkpoints.map((c) => (c.id === id ? meta(next) : c)))
  void saveToRepo()
}

export async function deleteCheckpoint(id: string) {
  await cpDel(id).catch(() => undefined)
  const s = useStore.getState()
  s.setCheckpoints(s.checkpoints.filter((c) => c.id !== id))
  if (s.cpBase?.id === id) s.setCpBase(null)
  void saveToRepo()
}

/** Todos os checkpoints completos (para exportar junto com o projeto). */
export async function allCheckpoints(): Promise<Checkpoint[]> {
  return (await cpAll().catch(() => [])).sort(byNewest)
}

/** Checkpoints vindos de um arquivo de projeto: entram na lista (mesmo id = substitui). */
export async function importCheckpoints(list: Checkpoint[]) {
  for (const c of list) await cpPut(c).catch(() => undefined)
  await loadCheckpoints()
  void saveToRepo()
}

/**
 * Deixa o navegador com exatamente os checkpoints de casa/checkpoints.json (o arquivo do repositório
 * manda: os que não estão nele saem). Não regrava o arquivo.
 */
export async function replaceCheckpoints(list: Checkpoint[]) {
  const keep = new Set(list.map((c) => c.id))
  for (const c of await cpAll().catch(() => [])) if (!keep.has(c.id)) await cpDel(c.id).catch(() => undefined)
  for (const c of list) await cpPut(c).catch(() => undefined)
  await loadCheckpoints()
  const s = useStore.getState()
  if (s.cpBase && !keep.has(s.cpBase.id)) s.setCpBase(null)
}

/** Primeira vez neste repositório: leva os checkpoints do navegador para casa/checkpoints.json. */
export const exportCheckpointsToRepo = saveToRepo
