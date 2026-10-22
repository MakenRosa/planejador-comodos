import { create } from 'zustand'
import { armCount, armMonitorDepth, armSlots, armSlotsFull, armWithSlots, fitArmReach, isArm, monitorPanel, syncAttached, withStand } from './lib/arms'
import { focusItems, focusRoom, spaceOfPoint } from './lib/focus'
import { carryRiders, moveRidersTo, ridingIds } from './lib/stack'
import { entryToItem, findEntry, TYPES } from './furniture/catalog'
import { footprint, rotLocal, wallDir, wallLength } from './lib/geom'
import { loadSettings, type CheckpointMeta } from './lib/persist'
import { curtainPlacement, findFreeSpot, fitCurtainToWindow, fits, surfaceSpot, wallPlacement } from './lib/placement'
import type { Guide } from './lib/snap'
import type { FurnitureGroup, FurnitureItem, MeasureCheck, Measurement, Opening, Room, Selection, Space, Vec2, Vec3, Wall } from './lib/types'
import { normAngle, uid } from './lib/util'
import { withEdit, type MeasurePlan } from './lib/wallEdit'
import { clearOpeningClashes } from './lib/wallPlan'

export type ViewMode = '2d' | '3d'
export type Tool = 'select' | 'measure'
export type WallMode = 'full' | 'cutaway' | 'transparent' | 'low'
export type CameraKind = 'fit' | 'iso' | 'eye' | 'focus'
/** Tema da interface: Automático segue o sistema operacional. */
export type ThemePref = 'system' | 'light' | 'dark'

export interface Settings {
  view: ViewMode
  tool: Tool
  wallMode: WallMode
  showGrid: boolean
  showRoomDims: boolean
  showLabels: boolean
  showScan: boolean
  showSwings: boolean
  showClearances: boolean
  /** Passo da grade em metros (0 = livre). */
  snapStep: number
  magnet: boolean
  keepRatio: boolean
  theme: ThemePref
  /** Item novo do catálogo segue o último do mesmo tipo (altura do piso, medidas, cores e opções). */
  followLast: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  view: '3d',
  tool: 'select',
  wallMode: 'cutaway',
  showGrid: true,
  showRoomDims: true,
  showLabels: false,
  showScan: false,
  showSwings: true,
  showClearances: true,
  snapStep: 0.01,
  magnet: true,
  keepRatio: false,
  theme: 'system',
  followLast: true,
}

export interface AssetMeta {
  id: string
  name: string
  size: Vec3
}

interface Snapshot {
  room: Room | null
  items: FurnitureItem[]
  measurements: Measurement[]
  groups: FurnitureGroup[]
}

export interface AppState {
  room: Room | null
  items: FurnitureItem[]
  measurements: Measurement[]
  selection: Selection
  /** Seleção de vários móveis (ids). Com 2 ou mais, o painel mostra o conjunto e `selection` fica vazia. */
  multi: string[]
  /** "Selecionar vários" ligado: clicar num móvel inclui/tira da seleção (sem precisar do Shift). */
  multiMode: boolean
  /** Retângulo de seleção sendo desenhado na planta (coordenadas da janela). */
  marquee: [number, number, number, number] | null
  /** Grupos de móveis com nome (salvos no projeto). */
  groups: FurnitureGroup[]
  /** Grupo aberto em "Editar membros": clicar num membro seleciona só ele. */
  editingGroup: string | null
  /** Último ajuste de cada item do catálogo (altura, medidas, cores, opções) — o padrão dos próximos. */
  lastStyle: Record<string, ItemStyle>
  /** Móveis copiados (Ctrl+C); n = quantas vezes já foram colados. */
  clipboard: { items: FurnitureItem[]; groupName?: string; n: number } | null
  hovered: string | null
  settings: Settings
  assets: Record<string, AssetMeta>
  thumbs: Record<string, string>
  past: Snapshot[]
  future: Snapshot[]
  interacting: boolean
  guides: Guide[]
  /** Prévia da correção de parede pela trena: as paredes na posição nova (tracejado na cena). */
  wallPreview: { a: Vec2; b: Vec2; h: number }[] | null
  cursor: Vec2 | null
  cameraCmd: { kind: CameraKind; n: number; target?: { x: number; y: number; z: number; r: number } }
  toast: { msg: string; n: number } | null
  /** Cômodo isolado na vista ("ver só este cômodo"); null = casa toda. */
  focusSpace: string | null
  /** Modo primeira pessoa (andar pela casa). */
  walk: boolean
  checkpoints: CheckpointMeta[]
  /** Item sendo arrastado do catálogo (prévia na cena, ainda não faz parte do projeto). */
  placing: FurnitureItem | null
  /** Checkpoint salvo/restaurado por último e o estado exato dele (para saber se houve alteração). */
  cpBase: { id: string; room: Room | null; items: FurnitureItem[]; measurements: Measurement[]; groups?: FurnitureGroup[] } | null

  commit: () => void
  undo: () => void
  redo: () => void
  /** keepView: mantém câmera, cômodo em foco e seleção (sincronização com outra aba). */
  loadProject: (room: Room, items: FurnitureItem[], measurements?: Measurement[], assets?: AssetMeta[], keepView?: boolean, groups?: FurnitureGroup[]) => void
  addFromCatalog: (key: string, at?: Vec2) => void
  addCustom: (assetId: string, at?: Vec2) => void
  /** Adiciona cortina/persiana do catálogo já ajustada a uma janela. */
  addCurtainForWindow: (key: string, windowId: string) => void
  addItems: (items: FurnitureItem[]) => void
  updateItem: (id: string, patch: Partial<FurnitureItem>, commit?: boolean) => void
  resizeItem: (id: string, dims: Partial<Pick<FurnitureItem, 'width' | 'depth' | 'height'>>, commit?: boolean) => void
  removeItem: (id: string) => void
  duplicateItem: (id: string) => void
  deleteSelection: () => void
  select: (s: Selection) => void
  /** Inclui ou tira um móvel da seleção múltipla (Shift + clique). */
  toggleMulti: (id: string) => void
  /** Seleciona vários de uma vez (retângulo na planta, Ctrl+A); add = soma à seleção atual. */
  selectMany: (ids: string[], add?: boolean) => void
  /** Liga/desliga o modo "Selecionar vários" (começa com o móvel selecionado, se houver). */
  setMultiMode: (on: boolean) => void
  setMarquee: (r: [number, number, number, number] | null) => void
  /** Desloca vários móveis (e o que está em cima deles) — um passo só no histórico. */
  moveItems: (ids: string[], dx: number, dz: number, commit?: boolean) => void
  /** Gira o conjunto em volta do centro dele. */
  rotateItems: (ids: string[], dAngle: number) => void
  duplicateItems: (ids: string[]) => void
  removeItems: (ids: string[]) => void
  /** Mesma alteração (cor, altura do piso, trava…) em vários móveis. */
  updateItems: (ids: string[], patch: Partial<FurnitureItem>) => void
  /** Leva a câmera até o conjunto (F com vários selecionados). */
  focusGroup: (ids: string[]) => void
  /** Cria um grupo com os móveis (tirando-os de outros grupos) e seleciona o grupo. */
  createGroup: (ids: string[], name?: string) => void
  /** Desfaz o grupo (os móveis ficam onde estão). */
  ungroup: (id: string) => void
  renameGroup: (id: string, name: string) => void
  /** Desloca o grupo inteiro (membros, o que está em cima deles e o pivô). */
  moveGroup: (id: string, dx: number, dz: number, commit?: boolean) => void
  /** Gira o grupo em volta do pivô. */
  rotateGroup: (id: string, dAngle: number) => void
  duplicateGroup: (id: string) => void
  /** Põe o pivô no centro do grupo (sem mover nada). */
  centerGroupPivot: (id: string) => void
  /** Abre "Editar membros" (com um membro já selecionado, se vier). */
  editGroup: (id: string, memberId?: string) => void
  /** Tira um móvel do grupo (grupo que fica com menos de 2 deixa de existir). */
  removeFromGroup: (groupId: string, itemId: string) => void
  /** Padrão para um item novo do catálogo: o último ajuste dele (ou null para usar o padrão de fábrica). */
  styleFor: (entryKey: string) => { style: ItemStyle; ref: FurnitureItem | null } | null
  /** Ctrl+C: guarda o móvel, a seleção ou o grupo selecionado. */
  copySelection: () => boolean
  /** Ctrl+V: cola uma cópia; `place` posiciona as cópias (n = quantas colagens já houve). */
  pasteClipboard: (place?: (copies: FurnitureItem[], n: number) => FurnitureItem[]) => void
  setHovered: (id: string | null) => void
  setSettings: (p: Partial<Settings>) => void
  addMeasurement: (a: Vec3, b: Vec3) => void
  removeMeasurement: (id: string) => void
  clearMeasurements: () => void
  updateOpening: (id: string, patch: Partial<Opening>, commit?: boolean) => void
  removeOpening: (id: string) => void
  /** Nova porta ou janela no trecho mais livre da parede (porta entre cômodos ganha o recorte do outro lado). */
  addOpening: (wallId: string, kind: 'door' | 'window') => void
  updateWall: (id: string, patch: Partial<Wall>, commit?: boolean) => void
  updateSpace: (id: string, patch: Partial<Space>) => void
  /** Aplica a mesma alteração em todas as paredes. */
  updateAllWalls: (patch: Partial<Wall>) => void
  updateRoom: (patch: Partial<Pick<Room, 'name' | 'wallThickness' | 'ceilingHeight' | 'checkTolerance'>>) => void
  /** Marca medidas (lib/checks: wall:…, opening:…, height:…) como conferidas / a conferir; null volta a "do scan". */
  setCheck: (keys: string[], check: MeasureCheck | null) => void
  setGuides: (g: Guide[]) => void
  setWallPreview: (p: { a: Vec2; b: Vec2; h: number }[] | null) => void
  /**
   * Aplica a correção de parede pela trena (lib/wallEdit): paredes, piso, vizinho e móveis encostados
   * num passo só do histórico; a correção fica guardada em room.wallEdits. `check`: a parede medida
   * fica conferida no mesmo passo.
   */
  correctWall: (plan: MeasurePlan, check?: { key: string; note: string }) => void
  setInteracting: (v: boolean) => void
  setCursor: (c: Vec2 | null) => void
  requestCamera: (k: CameraKind) => void
  /** Leva a câmera até o móvel e passa a girar em volta dele. */
  focusItem: (id: string) => void
  setFocusSpace: (id: string | null) => void
  setWalk: (v: boolean) => void
  setPlacing: (it: FurnitureItem | null) => void
  /** Adiciona um item já posicionado (soltar do catálogo). */
  addPlaced: (it: FurnitureItem) => void
  /** Prende o monitor num braço articulado (sem pé, na placa VESA livre mais próxima). */
  attachToArm: (monitorId: string, armId: string) => void
  detachFromArm: (monitorId: string) => void
  /** Troca o móvel por outro do catálogo: mesma posição (traseira no lugar), giro e itens que estavam em cima. */
  replaceItem: (id: string, entryKey: string) => void
  setCheckpoints: (list: CheckpointMeta[]) => void
  setCpBase: (id: string | null) => void
  setThumb: (key: string, url: string) => void
  addAsset: (a: AssetMeta) => void
  removeAsset: (id: string) => void
  notify: (msg: string) => void
}

const snap = (s: AppState): Snapshot => ({ room: s.room, items: s.items, measurements: s.measurements, groups: s.groups })

function validSelection(sel: Selection, s: Snapshot): Selection {
  if (!sel) return null
  if (sel.kind === 'item') return s.items.some((i) => i.id === sel.id) ? sel : null
  if (sel.kind === 'measure') return s.measurements.some((m) => m.id === sel.id) ? sel : null
  if (sel.kind === 'wall') return s.room?.walls.some((w) => w.id === sel.id) ? sel : null
  if (sel.kind === 'space') return s.room?.spaces?.some((x) => x.id === sel.id) ? sel : null
  if (sel.kind === 'group') return s.groups.some((g) => g.id === sel.id) ? sel : null
  return s.room?.openings.some((o) => o.id === sel.id) ? sel : null
}

/** Aviso de que o item novo seguiu o padrão do último (só quando difere do padrão de fábrica). */
function patternNote(name: string, it: FurnitureItem, factory: Omit<FurnitureItem, 'id' | 'x' | 'z' | 'rotation'>) {
  const dims = Math.abs(it.width - factory.width) > 1e-4 || Math.abs(it.depth - factory.depth) > 1e-4 || Math.abs(it.height - factory.height) > 1e-4
  const look = it.color !== factory.color || it.color2 !== factory.color2 || JSON.stringify(it.options) !== JSON.stringify(factory.options)
  const elev = Math.abs(it.elevation - factory.elevation) > 1e-4
  const parts = [elev && `${Math.round(it.elevation * 1000) / 10} cm do piso`.replace('.', ','), dims && 'mesmas medidas', look && 'mesmo acabamento'].filter(Boolean)
  return parts.length ? `${name}: seguindo o último (${parts.join(', ')}) — ajuste o padrão em Exibir` : null
}

/** Grupo de um móvel (cada móvel está em no máximo um). */
export const groupOf = (groups: FurnitureGroup[], itemId: string) => groups.find((g) => g.members.includes(itemId)) ?? null

/** Centro da caixa que envolve os móveis. */
function bboxCenter(items: FurnitureItem[]): Vec2 {
  const fp = items.flatMap((i) => footprint(i))
  if (!fp.length) return [0, 0]
  return [(Math.min(...fp.map((p) => p[0])) + Math.max(...fp.map((p) => p[0]))) / 2, (Math.min(...fp.map((p) => p[1])) + Math.max(...fp.map((p) => p[1]))) / 2]
}

/** Tira dos grupos os móveis que não existem mais; grupo com menos de 2 móveis deixa de existir. */
function pruneGroups(groups: FurnitureGroup[], items: FurnitureItem[]): FurnitureGroup[] {
  const ids = new Set(items.map((i) => i.id))
  let changed = false
  const out = groups.flatMap((g) => {
    const members = g.members.filter((m) => ids.has(m))
    if (members.length === g.members.length) return [g]
    changed = true
    return members.length >= 2 ? [{ ...g, members }] : []
  })
  return changed ? out : groups
}

/**
 * Seleção que não aparece no cômodo em foco (ex.: escolhida na lista do painel): devolve o cômodo
 * onde ela está, para a vista ir até lá; undefined = já está visível.
 */
function hiddenSelectionSpace(room: Room, items: FurnitureItem[], focus: string, sel: NonNullable<Selection>): string | null | undefined {
  if (sel.kind === 'item') {
    if (focusItems(items, room, focus).some((i) => i.id === sel.id)) return undefined
    const it = items.find((i) => i.id === sel.id)
    return it ? spaceOfPoint(room, [it.x, it.z])?.id ?? null : undefined
  }
  if (sel.kind === 'wall' || sel.kind === 'opening') {
    const fr = focusRoom(room, focus)
    if (sel.kind === 'wall' ? fr.walls.some((w) => w.id === sel.id) : fr.openings.some((o) => o.id === sel.id)) return undefined
    const wallId = sel.kind === 'wall' ? sel.id : room.openings.find((o) => o.id === sel.id)?.wallId
    return room.walls.find((w) => w.id === wallId)?.spaceId ?? null
  }
  return undefined
}

export type ItemStyle = Pick<FurnitureItem, 'elevation' | 'width' | 'depth' | 'height' | 'color' | 'color2' | 'options'>
const STYLE_KEYS = ['elevation', 'width', 'depth', 'height', 'color', 'color2', 'options'] as const
const pickStyle = (i: FurnitureItem): ItemStyle => ({ elevation: i.elevation, width: i.width, depth: i.depth, height: i.height, color: i.color, color2: i.color2, options: i.options })

/** Depois de um ajuste de altura/medida/cor/opção, guarda o estado como o padrão do item do catálogo. */
function rememberStyle(last: Record<string, ItemStyle>, items: FurnitureItem[], ids: string[], patch: Partial<FurnitureItem>) {
  if (!STYLE_KEYS.some((k) => k in patch)) return last
  let out = last
  for (const id of ids) {
    const it = items.find((i) => i.id === id)
    if (it?.entry) out = { ...out, [it.entry]: pickStyle(it) }
  }
  return out
}

/** Itens novos ficam ao lado do último do mesmo tipo na mesma parede (tomadas, interruptores…). */
function besideOnWall(base: FurnitureItem, ref: FurnitureItem, room: Room, items: FurnitureItem[]): FurnitureItem | null {
  const step = base.width + 0.25
  for (const k of [1, -1, 2, -2, 3, -3, 4, -4]) {
    const [dx, dz] = rotLocal(k * step, 0, ref.rotation)
    const c = { ...base, x: ref.x + dx, z: ref.z + dz, rotation: ref.rotation }
    if (fits(c, room, items) && !items.some((o) => o.id !== ref.id && o.entry === base.entry && Math.hypot(o.x - c.x, o.z - c.z) < base.width * 0.9)) return c
  }
  return null
}

/** Aplica um patch a um móvel, com os ajustes automáticos e levando junto o que está em cima dele. */
function patchItem(items: FurnitureItem[], id: string, patch: Partial<FurnitureItem>): FurnitureItem[] {
  const prev = items.find((it) => it.id === id)
  if (!prev) return items
  let next = { ...prev, ...patch }
  // ajustes automáticos ao trocar opções (ex.: girar o monitor troca largura e altura)
  const adj = patch.options && TYPES[prev.type]?.adjust?.(next, prev)
  if (adj) next = { ...next, ...adj }
  // o que está em cima (monitor, teclado…) acompanha o móvel; monitores seguem os braços
  return carryRiders(prev, next, items.map((it) => (it.id === id ? next : it)))
}

/** O que se move com um conjunto: os móveis escolhidos (menos os travados) e o que está em cima deles, sem repetir. */
function moveSet(ids: string[], items: FurnitureItem[]): Set<string> {
  const out = new Set<string>()
  for (const id of ids) {
    const it = items.find((i) => i.id === id)
    if (!it || it.locked) continue
    out.add(id)
    for (const r of ridingIds(it, items)) out.add(r)
  }
  return out
}

/** Posiciona um móvel novo: na parede (se for de parede) ou no espaço livre mais central. */
function place(item: FurnitureItem, room: Room | null, items: FurnitureItem[], at?: Vec2): FurnitureItem {
  if (at) return { ...item, x: at[0], z: at[1] }
  if (!room) return item
  if (item.type === 'curtain') {
    const c = curtainPlacement(item, room, items)
    if (c) return { ...item, ...c }
  }
  const def = TYPES[item.type]
  if (def?.wallMounted || item.elevation > 0.05) {
    const w = wallPlacement(item, room, items)
    if (w) return { ...item, ...w }
  }
  const [x, z] = findFreeSpot(item, room, items)
  return { ...item, x, z }
}

export const useStore = create<AppState>()((set, get) => ({
  room: null,
  items: [],
  measurements: [],
  selection: null,
  multi: [],
  multiMode: false,
  marquee: null,
  groups: [],
  editingGroup: null,
  lastStyle: {},
  clipboard: null,
  hovered: null,
  settings: { ...DEFAULT_SETTINGS, ...loadSettings<Settings>(), tool: 'select' },
  assets: {},
  thumbs: {},
  past: [],
  future: [],
  interacting: false,
  guides: [],
  wallPreview: null,
  cursor: null,
  cameraCmd: { kind: 'fit', n: 0 },
  toast: null,
  focusSpace: null,
  walk: false,
  checkpoints: [],
  cpBase: null,
  placing: null,

  commit: () => set((s) => ({ past: [...s.past.slice(-149), snap(s)], future: [] })),

  undo: () => {
    const s = get()
    const prev = s.past[s.past.length - 1]
    if (!prev) return
    set({
      past: s.past.slice(0, -1),
      future: [snap(s), ...s.future].slice(0, 150),
      ...prev,
      selection: validSelection(s.selection, prev),
      multi: s.multi.filter((id) => prev.items.some((i) => i.id === id)),
      editingGroup: prev.groups.some((g) => g.id === s.editingGroup) ? s.editingGroup : null,
    })
  },

  redo: () => {
    const s = get()
    const next = s.future[0]
    if (!next) return
    set({
      past: [...s.past, snap(s)],
      future: s.future.slice(1),
      ...next,
      selection: validSelection(s.selection, next),
      multi: s.multi.filter((id) => next.items.some((i) => i.id === id)),
      editingGroup: next.groups.some((g) => g.id === s.editingGroup) ? s.editingGroup : null,
    })
  },

  loadProject: (room, items, measurements = [], assets = [], keepView = false, groups = []) =>
    set((s) => {
      const snapNext: Snapshot = {
        room,
        // monitores presos a braço salvos por versões anteriores: profundidade com a curvatura
        items: syncAttached(
          items.map((i) => {
            const n = TYPES[i.type]?.normalize?.(i)
            const it = n ? { ...i, ...n } : i
            return it.attachedTo && it.type === 'monitor' ? { ...it, depth: armMonitorDepth(it) } : it
          }),
        ),
        measurements,
        groups: pruneGroups(groups, items),
      }
      return {
        ...snapNext,
        assets: Object.fromEntries(assets.map((a) => [a.id, a])),
        selection: keepView ? validSelection(s.selection, snapNext) : null,
        multi: keepView ? s.multi.filter((id) => snapNext.items.some((i) => i.id === id)) : [],
        multiMode: keepView ? s.multiMode : false,
        editingGroup: keepView && snapNext.groups.some((g) => g.id === s.editingGroup) ? s.editingGroup : null,
        // histórico antigo não vale para o projeto que chegou de outra aba
        past: [],
        future: [],
        focusSpace: keepView && room.spaces?.some((sp) => sp.id === s.focusSpace) ? s.focusSpace : null,
        cameraCmd: keepView ? s.cameraCmd : { kind: 'fit', n: s.cameraCmd.n + 1 },
      }
    }),

  addFromCatalog: (key, at) => {
    const entry = findEntry(key)
    if (!entry) return
    const s = get()
    // padrão: o último ajuste deste item do catálogo (altura, medidas, cores, opções)
    const pattern = s.styleFor(entry.key)
    const base: FurnitureItem = { id: uid(), x: 0, z: 0, rotation: 0, ...entryToItem(entry), ...(pattern?.style ?? {}) }
    // com um móvel de tampo selecionado (escrivaninha, balcão…), monitor/micro-ondas/etc. vão para cima dele
    const host = at ? null : selectedItem(s)
    const spot = host ? surfaceSpot(base, host, s.items) : null
    const room = focusRoom(s.room, s.focusSpace)
    // item de parede seguindo o padrão: vai para o lado do último, na mesma parede
    const beside = !spot && !at && pattern?.ref && room && TYPES[base.type]?.wallMounted ? besideOnWall(base, pattern.ref, room, s.items) : null
    const item = spot ? { ...base, ...spot } : beside ?? place(base, room, s.items, at)
    s.commit()
    set({ items: [...get().items, item], selection: { kind: 'item', id: item.id }, lastStyle: { ...get().lastStyle, [entry.key]: pickStyle(item) } })
    if (spot && host) s.notify(item.elevation < host.elevation + host.height - 0.01 ? `${base.name} fica no vão de ${host.name}` : `${base.name} fica em cima de ${host.name}`)
    else if (pattern) {
      const note = patternNote(base.name, item, entryToItem(entry))
      if (note) s.notify(note)
    }
  },

  addCustom: (assetId, at) => {
    const s = get()
    const a = s.assets[assetId]
    if (!a) return
    const base: FurnitureItem = {
      id: uid(),
      type: 'custom',
      name: a.name,
      x: 0,
      z: 0,
      elevation: 0,
      rotation: 0,
      width: a.size[0],
      height: a.size[1],
      depth: a.size[2],
      color: '#b8bcc2',
      color2: '#b8bcc2',
      options: {},
      assetId,
    }
    const item = place(base, focusRoom(s.room, s.focusSpace), s.items, at)
    s.commit()
    set({ items: [...get().items, item], selection: { kind: 'item', id: item.id } })
  },

  addCurtainForWindow: (key, windowId) => {
    const entry = findEntry(key)
    const s = get()
    const win = s.room?.openings.find((o) => o.id === windowId)
    if (!entry || !s.room || !win) return
    const base: FurnitureItem = { id: uid(), x: 0, z: 0, rotation: 0, ...entryToItem(entry) }
    const fit = fitCurtainToWindow(base, s.room, win)
    const item = fit ? { ...base, ...fit } : place(base, s.room, s.items)
    s.commit()
    set({ items: [...get().items, item], selection: { kind: 'item', id: item.id } })
  },

  addItems: (items) => {
    get().commit()
    set((s) => ({ items: [...s.items, ...items] }))
  },

  updateItem: (id, patch, commit = true) => {
    if (commit) get().commit()
    set((s) => {
      if (!s.items.some((it) => it.id === id)) return {}
      const items = syncAttached(patchItem(s.items, id, patch))
      return { items, lastStyle: rememberStyle(s.lastStyle, items, [id], patch) }
    })
  },

  resizeItem: (id, dims, commit = true) => {
    const it = get().items.find((i) => i.id === id)
    if (!it) return
    const patch: Partial<FurnitureItem> = {}
    let { width, depth, height } = { width: dims.width ?? it.width, depth: dims.depth ?? it.depth, height: dims.height ?? it.height }
    if (get().settings.keepRatio) {
      const k = dims.width !== undefined ? width / it.width : dims.depth !== undefined ? depth / it.depth : height / it.height
      if (dims.width === undefined) width = it.width * k
      if (dims.depth === undefined) depth = it.depth * k
      if (dims.height === undefined) height = it.height * k
    }
    width = Math.max(0.01, width)
    depth = Math.max(0.01, depth)
    height = Math.max(0.005, height)
    // Mantém a traseira fixa (móveis costumam estar encostados na parede)
    const dz = (depth - it.depth) / 2
    const [ox, oz] = rotLocal(0, dz, it.rotation)
    Object.assign(patch, { width, depth, height, x: it.x + ox, z: it.z + oz })
    get().updateItem(id, patch, commit)
  },

  removeItem: (id) => {
    get().commit()
    set((s) => ({ items: syncAttached(s.items.filter((i) => i.id !== id)), selection: s.selection?.id === id ? null : s.selection }))
  },

  duplicateItem: (id) => {
    const s = get()
    const it = s.items.find((i) => i.id === id)
    if (!it) return
    // a cópia de um monitor preso ao braço sai solta, com pé
    const copy: FurnitureItem = { ...(it.attachedTo ? withStand(it) : it), id: uid(), name: it.name.replace(/ \(scan\)$/, ''), fromScan: false, locked: false }
    let placed: FurnitureItem | null = null
    if (s.room) {
      for (const [lx, lz] of [
        [it.width + 0.02, 0],
        [-(it.width + 0.02), 0],
        [0, it.depth + 0.02],
        [0, -(it.depth + 0.02)],
      ]) {
        const [dx, dz] = rotLocal(lx, lz, it.rotation)
        const c = { ...copy, x: it.x + dx, z: it.z + dz }
        if (fits(c, s.room, s.items)) {
          placed = c
          break
        }
      }
      if (!placed) placed = place(copy, s.room, s.items)
    } else placed = { ...copy, x: it.x + 0.2, z: it.z + 0.2 }
    s.commit()
    set({ items: [...get().items, placed], selection: { kind: 'item', id: placed.id } })
  },

  deleteSelection: () => {
    if (get().multi.length) return get().removeItems(get().multi)
    const sel = get().selection
    if (!sel) return
    if (sel.kind === 'group') {
      const g = get().groups.find((x) => x.id === sel.id)
      if (g) get().removeItems(g.members)
      return
    }
    if (sel.kind === 'item') get().removeItem(sel.id)
    else if (sel.kind === 'measure') get().removeMeasurement(sel.id)
    else if (sel.kind === 'opening') get().removeOpening(sel.id)
  },

  select: (selection) => {
    const s = get()
    if (selection && s.focusSpace && s.room) {
      const target = hiddenSelectionSpace(s.room, s.items, s.focusSpace, selection)
      if (target !== undefined) s.setFocusSpace(target)
    }
    // selecionar uma coisa só (ou clicar no vazio) desfaz a seleção múltipla. Um membro de grupo
    // escolhido sozinho (lista, alerta, "Editar membros") abre a edição do grupo — com o caminho de
    // volta; voltar ao grupo (ou escolher outra coisa) encerra a edição
    const g = selection?.kind === 'item' ? groupOf(s.groups, selection.id) : null
    set({ selection, multi: [], multiMode: false, editingGroup: g ? g.id : null })
  },

  toggleMulti: (id) => {
    const s = get()
    const selGroup = s.selection?.kind === 'group' ? s.groups.find((g) => g.id === s.selection!.id) : null
    const base = s.multi.length || s.multiMode ? s.multi : s.selection?.kind === 'item' ? [s.selection.id] : selGroup ? selGroup.members : []
    // fora do "Editar membros", um móvel de grupo vem com o grupo inteiro
    const g = s.editingGroup ? null : groupOf(s.groups, id)
    const unit = g ? g.members : [id]
    const ids = base.includes(id) ? base.filter((x) => !unit.includes(x)) : [...base, ...unit.filter((x) => !base.includes(x))]
    if (!s.multiMode && ids.length <= 1) set({ multi: [], selection: ids.length ? { kind: 'item', id: ids[0] } : null })
    else set({ multi: ids, selection: null })
  },

  selectMany: (ids, add = false) => {
    const s = get()
    const base = add ? (s.multi.length ? s.multi : s.selection?.kind === 'item' ? [s.selection.id] : []) : []
    const all = [...new Set([...base, ...ids])].filter((id) => s.items.some((i) => i.id === id))
    if (!s.multiMode && all.length <= 1) set({ multi: [], selection: all.length ? { kind: 'item', id: all[0] } : null })
    else set({ multi: all, selection: null })
  },

  setMultiMode: (on) => {
    const s = get()
    if (on) set({ multiMode: true, multi: s.multi.length ? s.multi : s.selection?.kind === 'item' ? [s.selection.id] : [], selection: null })
    else if (s.multi.length === 1) set({ multiMode: false, multi: [], selection: { kind: 'item', id: s.multi[0] } })
    else set({ multiMode: false })
  },

  setMarquee: (marquee) => set({ marquee }),

  moveItems: (ids, dx, dz, commit = true) => {
    const s = get()
    const moving = moveSet(ids, s.items)
    if (!moving.size || (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9)) return
    if (commit) s.commit()
    set({ items: syncAttached(s.items.map((i) => (moving.has(i.id) ? { ...i, x: i.x + dx, z: i.z + dz } : i))) })
  },

  rotateItems: (ids, dAngle) => {
    const s = get()
    const moving = moveSet(ids, s.items)
    if (!moving.size) return
    // centro do conjunto: meio da caixa que envolve os móveis escolhidos
    const pts = s.items.filter((i) => ids.includes(i.id) && !i.locked).flatMap((i) => footprint(i))
    const cx = (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2
    const cz = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2
    s.commit()
    set({
      items: syncAttached(
        s.items.map((i) => {
          if (!moving.has(i.id)) return i
          const [ox, oz] = rotLocal(i.x - cx, i.z - cz, dAngle)
          return { ...i, x: cx + ox, z: cz + oz, rotation: normAngle(i.rotation + dAngle) }
        }),
      ),
    })
  },

  duplicateItems: (ids) => {
    const s = get()
    const src = s.items.filter((i) => ids.includes(i.id))
    if (!src.length) return
    // a cópia vai inteira para o lado (largura do conjunto + 20 cm), mantendo a arrumação
    const pts = src.flatMap((i) => footprint(i))
    const shift = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])) + 0.2
    const newId = new Map(src.map((i) => [i.id, uid()]))
    const copies = src.map((i): FurnitureItem => {
      // monitor preso: continua preso se o braço também foi copiado; senão sai com pé
      const keepArm = !!i.attachedTo && newId.has(i.attachedTo)
      const base = i.attachedTo && !keepArm ? withStand(i) : i
      return {
        ...base,
        id: newId.get(i.id)!,
        name: i.name.replace(/ \(scan\)$/, ''),
        fromScan: false,
        locked: false,
        x: i.x + shift,
        attachedTo: keepArm ? newId.get(i.attachedTo!) : base.attachedTo,
      }
    })
    s.commit()
    set({ items: syncAttached([...s.items, ...copies]), multi: copies.map((c) => c.id), selection: null })
    s.notify(`${copies.length} cópias criadas ao lado — já selecionadas para mover`)
  },

  removeItems: (ids) => {
    const s = get()
    if (!ids.length) return
    s.commit()
    set({ items: syncAttached(s.items.filter((i) => !ids.includes(i.id))), multi: [], multiMode: false, selection: null })
    s.notify(`${ids.length} móveis excluídos — Ctrl+Z desfaz`)
  },

  focusGroup: (ids) => {
    const sel = get().items.filter((i) => ids.includes(i.id))
    if (!sel.length) return
    const fp = sel.flatMap((i) => footprint(i))
    const x0 = Math.min(...fp.map((p) => p[0]))
    const x1 = Math.max(...fp.map((p) => p[0]))
    const z0 = Math.min(...fp.map((p) => p[1]))
    const z1 = Math.max(...fp.map((p) => p[1]))
    const top = Math.max(...sel.map((i) => i.elevation + i.height))
    const r = Math.max(0.4, Math.hypot(x1 - x0, z1 - z0, top) / 2)
    set((s) => ({ cameraCmd: { kind: 'focus', n: s.cameraCmd.n + 1, target: { x: (x0 + x1) / 2, y: top / 2, z: (z0 + z1) / 2, r } } }))
  },

  createGroup: (ids, name) => {
    const s = get()
    const members = ids.filter((id) => s.items.some((i) => i.id === id))
    if (members.length < 2) return
    const others = s.groups.map((g) => ({ ...g, members: g.members.filter((m) => !members.includes(m)) })).filter((g) => g.members.length >= 2)
    const n = s.groups.length + 1
    const g: FurnitureGroup = {
      id: uid(),
      name: name?.trim() || `Grupo ${n}`,
      members,
      pivot: bboxCenter(s.items.filter((i) => members.includes(i.id))),
      rotation: 0,
    }
    s.commit()
    set({ groups: [...others, g], selection: { kind: 'group', id: g.id }, multi: [], multiMode: false, editingGroup: null })
    s.notify(`“${g.name}” criado com ${members.length} móveis — clique em qualquer um para pegar o grupo todo`)
  },

  ungroup: (id) => {
    const s = get()
    const g = s.groups.find((x) => x.id === id)
    if (!g) return
    s.commit()
    set({ groups: s.groups.filter((x) => x.id !== id), multi: g.members, selection: null, editingGroup: null })
    s.notify(`“${g.name}” desagrupado — os móveis continuam selecionados`)
  },

  renameGroup: (id, name) => {
    const s = get()
    if (!name.trim()) return
    s.commit()
    set({ groups: s.groups.map((g) => (g.id === id ? { ...g, name: name.trim() } : g)) })
  },

  moveGroup: (id, dx, dz, commit = true) => {
    const s = get()
    const g = s.groups.find((x) => x.id === id)
    if (!g || (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9)) return
    const moving = moveSet(g.members, s.items)
    if (commit) s.commit()
    set({
      items: syncAttached(s.items.map((i) => (moving.has(i.id) ? { ...i, x: i.x + dx, z: i.z + dz } : i))),
      groups: s.groups.map((x) => (x.id === id ? { ...x, pivot: [x.pivot[0] + dx, x.pivot[1] + dz] } : x)),
    })
  },

  rotateGroup: (id, dAngle) => {
    const s = get()
    const g = s.groups.find((x) => x.id === id)
    if (!g) return
    const moving = moveSet(g.members, s.items)
    const [cx, cz] = g.pivot
    s.commit()
    set({
      items: syncAttached(
        s.items.map((i) => {
          if (!moving.has(i.id)) return i
          const [ox, oz] = rotLocal(i.x - cx, i.z - cz, dAngle)
          return { ...i, x: cx + ox, z: cz + oz, rotation: normAngle(i.rotation + dAngle) }
        }),
      ),
      groups: s.groups.map((x) => (x.id === id ? { ...x, rotation: normAngle(x.rotation + dAngle) } : x)),
    })
  },

  duplicateGroup: (id) => {
    const s = get()
    const g = s.groups.find((x) => x.id === id)
    if (!g) return
    const before = new Set(s.items.map((i) => i.id))
    s.duplicateItems(g.members)
    const after = get()
    const copies = after.items.filter((i) => !before.has(i.id)).map((i) => i.id)
    if (copies.length < 2) return
    const pivot = bboxCenter(after.items.filter((i) => copies.includes(i.id)))
    const ng: FurnitureGroup = { id: uid(), name: `${g.name} (cópia)`, members: copies, pivot, rotation: g.rotation }
    // a cópia dos móveis e o grupo novo entram no mesmo passo do histórico (o da cópia)
    set({ groups: [...after.groups, ng], selection: { kind: 'group', id: ng.id }, multi: [] })
  },

  centerGroupPivot: (id) => {
    const s = get()
    const g = s.groups.find((x) => x.id === id)
    if (!g) return
    s.commit()
    set({ groups: s.groups.map((x) => (x.id === id ? { ...x, pivot: bboxCenter(s.items.filter((i) => g.members.includes(i.id))) } : x)) })
  },

  styleFor: (entryKey) => {
    const s = get()
    if (!s.settings.followLast) return null
    const entry = findEntry(entryKey)
    // o último do mesmo item do catálogo no projeto (itens antigos, sem `entry`, pelo nome)
    let ref: FurnitureItem | null = null
    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i]
      if (it.entry === entryKey || (!it.entry && entry && it.type === entry.type && it.name === entry.label)) {
        ref = it
        break
      }
    }
    const style = s.lastStyle[entryKey] ?? (ref ? pickStyle(ref) : null)
    if (style) return { style, ref }
    // primeiro deste item, mas já há outro do mesmo tipo de parede (tomada dupla depois da simples):
    // leva só a altura — menos nos itens que têm altura própria (tomada de bancada, de ar-condicionado, de piso)
    const def = entry && TYPES[entry.type]
    if (!entry || !def?.wallMounted || entry.elevation !== undefined) return null
    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i]
      const e = it.entry ? findEntry(it.entry) : null
      if (it.type === entry.type && e && e.elevation === undefined) {
        const base = entryToItem(entry)
        return { style: { elevation: it.elevation, width: base.width, depth: base.depth, height: base.height, color: base.color, color2: base.color2, options: base.options }, ref: it }
      }
    }
    return null
  },

  copySelection: () => {
    const s = get()
    let items: FurnitureItem[] = []
    let groupName: string | undefined
    if (s.multi.length) items = s.items.filter((i) => s.multi.includes(i.id))
    else if (s.selection?.kind === 'group') {
      const g = s.groups.find((x) => x.id === s.selection!.id)
      if (g) {
        items = s.items.filter((i) => g.members.includes(i.id))
        groupName = g.name
      }
    } else if (s.selection?.kind === 'item') items = s.items.filter((i) => i.id === s.selection!.id)
    if (!items.length) return false
    set({ clipboard: { items, groupName, n: 0 } })
    s.notify(`Copiado: ${groupName ? `grupo “${groupName}”` : items.length === 1 ? items[0].name : `${items.length} móveis`} — Ctrl+V cola`)
    return true
  },

  pasteClipboard: (placeFn) => {
    const s = get()
    const clip = s.clipboard
    if (!clip?.items.length) return
    const n = clip.n + 1
    const newId = new Map(clip.items.map((i) => [i.id, uid()]))
    let copies = clip.items.map((i): FurnitureItem => {
      // monitor preso: continua preso se o braço também foi copiado; senão sai com pé
      const keepArm = !!i.attachedTo && newId.has(i.attachedTo)
      const base = i.attachedTo && !keepArm ? withStand(i) : i
      return { ...base, id: newId.get(i.id)!, name: i.name.replace(/ \(scan\)$/, ''), fromScan: false, locked: false, attachedTo: keepArm ? newId.get(i.attachedTo!) : base.attachedTo }
    })
    copies = placeFn ? placeFn(copies, n) : copies.map((c) => ({ ...c, x: c.x + 0.3 * n, z: c.z + 0.3 * n }))
    s.commit()
    const ids = copies.map((c) => c.id)
    const g: FurnitureGroup | null =
      clip.groupName && copies.length >= 2 ? { id: uid(), name: `${clip.groupName} (cópia)`, members: ids, pivot: bboxCenter(copies), rotation: 0 } : null
    set({
      items: syncAttached([...s.items, ...copies]),
      groups: g ? [...s.groups, g] : s.groups,
      selection: g ? { kind: 'group', id: g.id } : copies.length === 1 ? { kind: 'item', id: ids[0] } : null,
      multi: !g && copies.length > 1 ? ids : [],
      multiMode: false,
      editingGroup: null,
      clipboard: { ...clip, n },
    })
    s.notify(`Colado: ${g ? `“${g.name}”` : copies.length === 1 ? copies[0].name : `${copies.length} móveis`}`)
  },

  removeFromGroup: (groupId, itemId) => {
    const s = get()
    const g = s.groups.find((x) => x.id === groupId)
    if (!g) return
    const members = g.members.filter((m) => m !== itemId)
    s.commit()
    const groups = members.length >= 2 ? s.groups.map((x) => (x.id === groupId ? { ...x, members } : x)) : s.groups.filter((x) => x.id !== groupId)
    set({ groups, editingGroup: members.length >= 2 ? s.editingGroup : null })
    s.notify(members.length >= 2 ? `Tirado de “${g.name}”` : `“${g.name}” ficou com um móvel só e foi desfeito`)
  },

  editGroup: (id, memberId) => {
    const s = get()
    const g = s.groups.find((x) => x.id === id)
    if (!g) return
    set({ editingGroup: id, multi: [], multiMode: false, selection: memberId && g.members.includes(memberId) ? { kind: 'item', id: memberId } : { kind: 'group', id } })
  },

  updateItems: (ids, patch) => {
    const s = get()
    s.commit()
    let items = s.items
    for (const id of ids) items = patchItem(items, id, patch)
    items = syncAttached(items)
    set({ items, lastStyle: rememberStyle(s.lastStyle, items, ids, patch) })
  },
  setHovered: (hovered) => set({ hovered }),
  setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p }, walk: p.view === '2d' ? false : s.walk })),

  addMeasurement: (a, b) => {
    get().commit()
    set((s) => ({ measurements: [...s.measurements, { id: uid(), a, b }] }))
  },
  removeMeasurement: (id) => {
    get().commit()
    set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id), selection: s.selection?.id === id ? null : s.selection }))
  },
  clearMeasurements: () => {
    get().commit()
    set({ measurements: [] })
  },

  updateOpening: (id, patch, commit = true) => {
    const room = get().room
    if (!room) return
    if (commit) get().commit()
    let openings = room.openings.map((o) => (o.id === id ? { ...o, ...patch } : o))
    // Porta entre cômodos: o recorte do outro lado acompanha
    const op = openings.find((o) => o.id === id)
    if (op?.pairId && !op.ghost) {
      const pw = room.walls.find((w) => w.id === op.wallId)
      openings = openings.map((g) => {
        if (g.id !== op.pairId || !pw) return g
        const gw = room.walls.find((w) => w.id === g.wallId)
        if (!gw) return g
        const pu = wallDir(pw)
        const gu = wallDir(gw)
        const c: Vec2 = [pw.a[0] + pu[0] * op.offset, pw.a[1] + pu[1] * op.offset]
        return { ...g, kind: op.kind, width: op.width, height: op.height, bottom: op.bottom, casing: op.casing, offset: (c[0] - gw.a[0]) * gu[0] + (c[1] - gw.a[1]) * gu[1] }
      })
    }
    set({ room: { ...room, openings } })
  },

  updateSpace: (id, patch) => {
    const room = get().room
    if (!room?.spaces) return
    get().commit()
    set({ room: { ...room, spaces: room.spaces.map((s) => (s.id === id ? { ...s, ...patch } : s)) } })
  },

  updateWall: (id, patch, commit = true) => {
    const room = get().room
    if (!room) return
    if (commit) get().commit()
    set({ room: { ...room, walls: room.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) } })
  },

  updateAllWalls: (patch) => {
    const room = get().room
    if (!room) return
    get().commit()
    set({ room: { ...room, walls: room.walls.map((w) => ({ ...w, ...patch })) } })
  },

  addOpening: (wallId, kind) => {
    const room = get().room
    const wall = room?.walls.find((w) => w.id === wallId)
    if (!room || !wall) return
    const L = wallLength(wall)
    const u = wallDir(wall)
    const n = wall.normal
    // parede do cômodo vizinho encostada nesta (costas com costas): porta precisa furar as duas
    const backs = room.walls
      .filter((g) => g.id !== wall.id && g.normal[0] * n[0] + g.normal[1] * n[1] < -0.99)
      .map((g) => {
        const gap = (g.a[0] - wall.a[0]) * -n[0] + (g.a[1] - wall.a[1]) * -n[1]
        const s0 = (g.a[0] - wall.a[0]) * u[0] + (g.a[1] - wall.a[1]) * u[1]
        const s1 = (g.b[0] - wall.a[0]) * u[0] + (g.b[1] - wall.a[1]) * u[1]
        return { g, gap, lo: Math.min(s0, s1), hi: Math.max(s0, s1) }
      })
      .filter((b) => b.gap > 0.005 && b.gap < 0.36)
    const gu = (g: Wall) => wallDir(g)
    const toG = (g: Wall, sv: number) => {
      const p: Vec2 = [wall.a[0] + u[0] * sv, wall.a[1] + u[1] * sv]
      const d = gu(g)
      return (p[0] - g.a[0]) * d[0] + (p[1] - g.a[1]) * d[1]
    }
    const busy = room.openings.filter((o) => o.wallId === wall.id).map((o) => [o.offset - o.width / 2, o.offset + o.width / 2] as Vec2)
    const sizes = kind === 'door' ? [0.8, 0.7, 0.6] : [1.2, 1.0, 0.8, 0.6]
    let best: { c: number; w: number; score: number; back?: Wall } | null = null
    for (const w of sizes) {
      for (let c = w / 2 + 0.1; c <= L - w / 2 - 0.1 + 1e-6; c += 0.02) {
        const a = c - w / 2
        const b = c + w / 2
        let back: Wall | undefined
        let ok = true
        let score = Math.min(a, L - b)
        for (const [o0, o1] of busy) {
          if (a < o1 + 0.1 && b > o0 - 0.1) ok = false
          score = Math.min(score, a >= o1 ? a - o1 : o0 - b)
        }
        if (kind === 'door') {
          for (const bk of backs) {
            if (b <= bk.lo || a >= bk.hi) continue
            if (a < bk.lo + 0.05 || b > bk.hi - 0.05) ok = false
            else back = bk.g
          }
          if (back) {
            const g = back
            const ga = Math.min(toG(g, a), toG(g, b))
            const gb = Math.max(toG(g, a), toG(g, b))
            for (const o of room.openings.filter((x) => x.wallId === g.id)) if (ga < o.offset + o.width / 2 + 0.1 && gb > o.offset - o.width / 2 - 0.1) ok = false
          }
        }
        if (ok && (!best || score > best.score + 1e-6)) best = { c, w, score, back }
      }
      if (best) break
    }
    if (!best) {
      get().notify(`Não há espaço livre nesta parede para ${kind === 'door' ? 'uma porta' : 'uma janela'}`)
      return
    }
    get().commit()
    const op: Opening =
      kind === 'door'
        ? { id: uid(), wallId: wall.id, kind, offset: best.c, width: best.w, height: Math.min(2.1, wall.height - 0.1), bottom: 0, isOpen: true, hingeAtEnd: false, swingOut: false }
        : { id: uid(), wallId: wall.id, kind, offset: best.c, width: best.w, height: Math.min(1.2, wall.height - 1.2), bottom: 1.0, isOpen: false, hingeAtEnd: false, swingOut: false, windowType: 'sliding' }
    const add: Opening[] = [op]
    if (best.back) {
      const ghost: Opening = { ...op, id: uid(), wallId: best.back.id, offset: toG(best.back, best.c), isOpen: false, ghost: true, pairId: op.id }
      op.pairId = ghost.id
      add.push(ghost)
    }
    set({ room: { ...room, openings: [...room.openings, ...add] }, selection: { kind: 'opening', id: op.id } })
    get().notify(`${kind === 'door' ? 'Porta' : 'Janela'} criada — com ela selecionada, arraste para mudar de lugar`)
  },

  removeOpening: (id) => {
    const room = get().room
    if (!room) return
    get().commit()
    const pair = room.openings.find((o) => o.id === id)?.pairId
    set((s) => ({
      room: { ...room, openings: room.openings.filter((o) => o.id !== id && o.id !== pair) },
      selection: s.selection?.id === id ? null : s.selection,
    }))
  },

  updateRoom: (patch) => {
    const room = get().room
    if (!room) return
    get().commit()
    set({ room: { ...room, ...patch } })
  },

  setCheck: (keys, check) => {
    const room = get().room
    if (!room) return
    get().commit()
    const checks = { ...room.checks }
    for (const k of keys) {
      if (check) checks[k] = check
      else delete checks[k]
    }
    set({ room: { ...room, checks } })
  },

  setGuides: (guides) => set({ guides }),
  setWallPreview: (wallPreview) => set({ wallPreview }),
  correctWall: (plan, check) => {
    const s = get()
    if (!s.room) return
    s.commit()
    let room: Room = { ...plan.result.room, wallEdits: withEdit(s.room.wallEdits, plan.edit) }
    if (check) room.checks = { ...room.checks, [check.key]: { state: 'conferida', at: new Date().toISOString(), note: check.note } }
    // mesma regra da montagem da casa: porta que entrou na quina de uma parede vizinha desliza
    room = { ...room, openings: clearOpeningClashes(room) }
    // móveis encostados (e o que está em cima deles) andam junto
    const patches = new Map(plan.items)
    for (const it of s.items) {
      const p = plan.items.get(it.id)
      if (!p) continue
      const dx = (p.x ?? it.x) - it.x
      const dz = (p.z ?? it.z) - it.z
      for (const rid of ridingIds(it, s.items)) {
        const r = s.items.find((o) => o.id === rid)
        if (r && !patches.has(rid)) patches.set(rid, { x: r.x + dx, z: r.z + dz })
      }
    }
    set({ room, items: s.items.map((it) => (patches.has(it.id) ? { ...it, ...patches.get(it.id) } : it)), wallPreview: null })
  },
  setInteracting: (interacting) => set({ interacting }),
  setCursor: (cursor) => set({ cursor }),
  // outras vistas saem do modo andar
  requestCamera: (kind) => set((s) => ({ cameraCmd: { kind, n: s.cameraCmd.n + 1 }, walk: false })),
  setWalk: (walk) => set((s) => ({ walk, settings: walk ? { ...s.settings, view: '3d', wallMode: s.settings.wallMode === 'low' ? 'cutaway' : s.settings.wallMode } : s.settings })),
  focusItem: (id) => {
    const it = get().items.find((i) => i.id === id)
    if (!it) return
    const r = Math.max(0.25, Math.hypot(it.width, it.depth, it.height) / 2)
    set((s) => ({ cameraCmd: { kind: 'focus', n: s.cameraCmd.n + 1, target: { x: it.x, y: it.elevation + it.height / 2, z: it.z, r } } }))
  },
  setCheckpoints: (checkpoints) => set({ checkpoints }),
  setPlacing: (placing) => set({ placing }),
  attachToArm: (monId, armId) => {
    const s = get()
    const mon = s.items.find((i) => i.id === monId)
    const arm = s.items.find((i) => i.id === armId)
    if (!mon || !arm || mon.type !== 'monitor' || !isArm(arm)) return
    // placa VESA livre mais perto do monitor
    const used = new Set(s.items.filter((i) => i.attachedTo === armId && i.id !== monId).map((i) => i.attachSlot ?? 0))
    const free = armSlots(arm).map((_, k) => k).filter((k) => !used.has(k))
    if (!free.length) return s.notify(`${arm.name} já está com ${armCount(arm)} monitor(es)`)
    const dist = (k: number) => {
      const [dx, dz] = rotLocal(armSlots(arm)[k], arm.depth / 2, arm.rotation)
      return Math.hypot(arm.x + dx - mon.x, arm.z + dz - mon.z)
    }
    const slot = free.sort((a, b) => dist(a) - dist(b))[0]
    s.commit()
    const cur = monitorPanel(mon)
    let items = s.items.map((i) =>
      i.id === monId
        ? { ...i, attachedTo: armId, attachSlot: slot, width: cur.pw, height: cur.ph, depth: armMonitorDepth({ width: cur.pw, height: cur.ph, options: { ...i.options, mount: 'braco' } }), options: { ...i.options, mount: 'braco', standGap: cur.stand, standD: i.attachedTo ? i.options.standD ?? 0.22 : i.depth } }
        : i,
    )
    // braço duplo com os dois monitores: lado a lado (1 cm entre eles), centralizados no poste
    if (armCount(arm) === 2) {
      const att = items.filter((i) => i.attachedTo === armId)
      const left = att.find((i) => (i.attachSlot ?? 0) === 0)
      const right = att.find((i) => i.attachSlot === 1)
      items = items.map((i) => {
        if (i.id !== armId) return i
        if (left && right) {
          const total = left.width + right.width + 0.01
          const sl = armSlotsFull(i)
          sl[0] = { ...sl[0], x: -total / 2 + left.width / 2 }
          sl[1] = { ...sl[1], x: total / 2 - right.width / 2 }
          return { ...i, ...armWithSlots(i, sl) }
        }
        const one = left ?? right
        const a = one && one.width + 0.11 > i.width ? { ...i, width: one.width + 0.11 } : i
        return { ...a, ...fitArmReach(a) }
      })
    }
    set({ items: syncAttached(items) })
    s.notify(`${mon.name} preso ao ${arm.name.toLowerCase()} — o pé do monitor foi removido`)
  },
  replaceItem: (id, key) => {
    const s = get()
    const old = s.items.find((i) => i.id === id)
    const entry = findEntry(key)
    if (!old || !entry) return
    const base = entryToItem(entry)
    // traseira no mesmo lugar (encostada na parede), mesmo giro
    const [ox, oz] = rotLocal(0, (base.depth - old.depth) / 2, old.rotation)
    // em cima de algo (bancada, mesa, parede): fica na mesma altura do antigo, não na altura padrão do catálogo
    const next: FurnitureItem = { ...base, id: uid(), x: old.x + ox, z: old.z + oz, rotation: old.rotation, elevation: old.elevation > 0.05 ? old.elevation : base.elevation }
    s.commit()
    const items = moveRidersTo(old, next, s.items).map((i) => (i.id === id ? next : i))
    set({ items: syncAttached(items), selection: { kind: 'item', id: next.id } })
    s.notify(`Troca feita: ${old.name} → ${next.name}`)
  },
  detachFromArm: (monId) => {
    const s = get()
    const mon = s.items.find((i) => i.id === monId)
    if (!mon?.attachedTo) return
    const arm = s.items.find((i) => i.id === mon.attachedTo)
    s.commit()
    // volta com pé, apoiado na mesa onde está o braço
    set({ items: s.items.map((i) => (i.id === monId ? withStand(i, arm?.elevation) : i)) })
  },
  addPlaced: (it) => {
    get().commit()
    set((s) => ({ items: [...s.items, it], selection: { kind: 'item', id: it.id }, lastStyle: it.entry ? { ...s.lastStyle, [it.entry]: pickStyle(it) } : s.lastStyle }))
  },
  setCpBase: (id) => set((s) => ({ cpBase: id ? { id, room: s.room, items: s.items, measurements: s.measurements, groups: s.groups } : null })),
  setFocusSpace: (id) =>
    set((s) => {
      if (id === s.focusSpace) return {}
      // seleção que some da vista (móvel/parede de outro cômodo) é desfeita
      const vr = focusRoom(s.room, id)
      const vi = focusItems(s.items, s.room, id)
      const sel = s.selection
      const keep =
        !sel || !id || (sel.kind === 'item' ? vi.some((i) => i.id === sel.id) : sel.kind === 'wall' ? vr?.walls.some((w) => w.id === sel.id) : sel.kind === 'opening' ? vr?.openings.some((o) => o.id === sel.id) : sel.kind === 'space' ? sel.id === id : true)
      return { focusSpace: id, selection: keep ? sel : null, cameraCmd: { kind: s.settings.view === '2d' ? 'fit' : 'iso', n: s.cameraCmd.n + 1 } }
    }),
  setThumb: (key, url) => set((s) => ({ thumbs: { ...s.thumbs, [key]: url } })),
  addAsset: (a) => set((s) => ({ assets: { ...s.assets, [a.id]: a } })),
  removeAsset: (id) =>
    set((s) => {
      const assets = { ...s.assets }
      delete assets[id]
      return { assets }
    }),
  notify: (msg) => set((s) => ({ toast: { msg, n: (s.toast?.n ?? 0) + 1 } })),
}))

// qualquer seleção de uma coisa só (móvel novo, troca de modelo, porta criada…) desfaz a seleção múltipla
useStore.subscribe((s, prev) => {
  if (s.selection && s.selection !== prev.selection && (s.multi.length || s.multiMode)) useStore.setState({ multi: [], multiMode: false })
  // móvel excluído sai do grupo (e grupo com menos de 2 deixa de existir) — o histórico guarda o grupo inteiro
  if (s.items !== prev.items && s.groups.length) {
    const groups = pruneGroups(s.groups, s.items)
    if (groups !== s.groups) {
      const sel = s.selection?.kind === 'group' && !groups.some((g) => g.id === s.selection!.id) ? null : s.selection
      useStore.setState({ groups, selection: sel, editingGroup: groups.some((g) => g.id === s.editingGroup) ? s.editingGroup : null })
    }
  }
})

export const selectedItem = (s: AppState) =>
  s.selection?.kind === 'item' ? s.items.find((i) => i.id === s.selection!.id) ?? null : null
