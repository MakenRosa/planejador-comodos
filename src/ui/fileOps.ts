import { renderThumb } from '../furniture/thumbnails'
import { getTemplate, instantiate, parseGlb, setTemplate } from '../lib/assets'
import { deleteModel, readModel, writeModel } from '../lib/casaSync'
import { exportPlanSvg } from '../lib/exportSvg'
import { b64ToBuf, bufToB64, idbDel, idbGet, idbPut, isProject, type ProjectData, APP_ID } from '../lib/persist'
import { itemsFromScan } from '../lib/placement'
import { focusItems, focusRoom } from '../lib/focus'
import { isRoomPlan, parseRoomPlan, rectangularRoom } from '../lib/roomplan'
import { downloadBlob, slug, uid } from '../lib/util'
import { viewportApi } from '../scene/helpers'
import { useStore, type AppState } from '../store'
import { allCheckpoints, importCheckpoints } from './checkpointStore'
import { buildHouseFromScans, upgradeSavedHouse } from './houseData'

export function projectData(s: AppState): ProjectData | null {
  if (!s.room) return null
  return {
    app: APP_ID,
    version: 1,
    savedAt: new Date().toISOString(),
    room: s.room,
    items: s.items,
    measurements: s.measurements,
    assets: Object.values(s.assets),
    groups: s.groups,
  }
}

/** Monta a casa (rooms/casa.json + scans) e converte os objetos detectados em móveis. */
export async function loadSample() {
  const base = `${import.meta.env.BASE_URL}rooms/`
  const house = await buildHouseFromScans().catch(() => null)
  if (house) {
    useStore.getState().loadProject(house, itemsFromScan(house), [], Object.values(useStore.getState().assets))
    return
  }
  const room = parseRoomPlan(await (await fetch(`${base}quarto.json`)).json())
  useStore.getState().loadProject(room, itemsFromScan(room), [], Object.values(useStore.getState().assets))
}

export function newRectRoom(w: number, d: number, h: number, name: string) {
  useStore.getState().loadProject(rectangularRoom(w, d, h, name), [], [], Object.values(useStore.getState().assets))
  useStore.getState().notify(`Cômodo ${name} criado`)
}

export function refreshAssetThumbs() {
  const st = useStore.getState()
  for (const a of Object.values(st.assets)) {
    getTemplate(a.id).then((tpl) => {
      if (tpl) st.setThumb(`asset:${a.id}`, renderThumb(instantiate(tpl, { width: a.size[0], height: a.size[1], depth: a.size[2] })))
    })
  }
}

async function importModel(file: File) {
  const st = useStore.getState()
  try {
    const buf = await file.arrayBuffer()
    const { obj, size } = await parseGlb(buf)
    const id = uid()
    await idbPut(id, buf)
    void writeModel(id, buf)
    setTemplate(id, obj)
    st.addAsset({ id, name: file.name.replace(/\.glb$/i, ''), size })
    st.setThumb(`asset:${id}`, renderThumb(instantiate(obj, { width: size[0], height: size[1], depth: size[2] })))
    st.addCustom(id)
    st.notify(`Modelo "${file.name}" importado — ajuste as medidas no painel à direita`)
  } catch (err) {
    console.error(err)
    st.notify('Não consegui ler esse .glb (modelos com compressão Draco não são suportados)')
  }
}

export async function loadProjectData(input: ProjectData, keepView = false) {
  const p = await upgradeSavedHouse(input)
  if (p !== input) useStore.getState().notify('Paredes, portas e janelas da casa atualizadas — seus móveis, cortinas e acabamentos foram mantidos')
  for (const a of p.assets ?? []) {
    if (a.data) {
      const buf = b64ToBuf(a.data)
      await idbPut(a.id, buf)
      void writeModel(a.id, buf)
    } else if (!(await idbGet(a.id).catch(() => undefined))) {
      // modelo que está só no repositório (casa/modelos/), ex.: projeto aberto em outro PC
      const buf = await readModel(a.id).catch(() => null)
      if (buf) await idbPut(a.id, buf)
    }
  }
  useStore.getState().loadProject(
    p.room,
    p.items,
    p.measurements ?? [],
    (p.assets ?? []).map(({ id, name, size }) => ({ id, name, size })),
    keepView,
    p.groups ?? [],
  )
  refreshAssetThumbs()
  if (p.checkpoints?.length) await importCheckpoints(p.checkpoints)
}

export async function openFile(file: File) {
  const st = useStore.getState()
  const name = file.name.toLowerCase()
  if (name.endsWith('.glb')) return importModel(file)
  if (name.endsWith('.gltf')) return st.notify('Use o formato .glb (arquivo único)')
  let json: unknown
  try {
    json = JSON.parse(await file.text())
  } catch {
    return st.notify('Arquivo inválido')
  }
  if (isProject(json)) {
    await loadProjectData(json)
    return st.notify(`Projeto "${json.room.name}" aberto`)
  }
  if (isRoomPlan(json)) {
    if (st.items.length && !confirm('Abrir este scan substitui o projeto atual. Continuar?')) return
    const room = parseRoomPlan(json)
    const items = itemsFromScan(room)
    st.loadProject(room, items, [], Object.values(st.assets))
    return st.notify(`Scan importado: ${room.name}, ${room.walls.length} paredes, ${room.openings.length} aberturas, ${items.length} móveis detectados`)
  }
  st.notify('Formato não reconhecido. Use o JSON do RoomPlan, um projeto salvo ou um modelo .glb')
}

export function pickFile(accept: string, cb: (f: File) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = () => {
    const f = input.files?.[0]
    if (f) cb(f)
  }
  input.click()
}

export async function exportProject() {
  const st = useStore.getState()
  const p = projectData(st)
  if (!p) return
  const checkpoints = await allCheckpoints()
  if (checkpoints.length) p.checkpoints = checkpoints
  const used = new Set([...st.items, ...checkpoints.flatMap((c) => c.data.items)].map((i) => i.assetId).filter(Boolean))
  p.assets = await Promise.all(
    p.assets
      .filter((a) => used.has(a.id))
      .map(async (a) => {
        const buf = await idbGet(a.id)
        return { ...a, data: buf ? bufToB64(buf) : undefined }
      }),
  )
  downloadBlob(new Blob([JSON.stringify(p)], { type: 'application/json' }), `${slug(p.room.name)}-planejamento.json`)
  st.notify(checkpoints.length ? `Projeto salvo em arquivo (com ${checkpoints.length} checkpoint(s))` : 'Projeto salvo em arquivo')
}

export function exportPng() {
  const st = useStore.getState()
  const url = viewportApi.capture?.()
  if (!url) return
  fetch(url)
    .then((r) => r.blob())
    .then((b) => downloadBlob(b, `${slug(st.room?.name ?? 'comodo')}-${st.settings.view}.png`))
}

export function exportSvg() {
  const st = useStore.getState()
  if (!st.room) return
  // com um cômodo em foco, exporta só ele
  const room = focusRoom(st.room, st.focusSpace)
  const name = st.focusSpace ? room.spaces?.[0]?.name ?? st.room.name : st.room.name
  downloadBlob(new Blob([exportPlanSvg(room, focusItems(st.items, st.room, st.focusSpace))], { type: 'image/svg+xml' }), `${slug(name)}-planta.svg`)
  st.notify('Planta exportada (SVG em escala 1:50)')
}

export async function deleteAsset(id: string) {
  const st = useStore.getState()
  const used = st.items.filter((i) => i.assetId === id)
  if (used.length && !confirm(`Este modelo está em uso por ${used.length} móvel(is). Remover tudo?`)) return
  if (used.length) {
    st.commit()
    useStore.setState({ items: st.items.filter((i) => i.assetId !== id) })
  }
  st.removeAsset(id)
  await idbDel(id).catch(() => undefined)
  void deleteModel(id)
}
