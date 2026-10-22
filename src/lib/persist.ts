import type { FurnitureGroup, FurnitureItem, Measurement, Room, Vec3 } from './types'

export const APP_ID = 'planejador-comodos'
// v2: casa com vários cômodos (o v1 era só o quarto). Com ?semsync (teste) fica numa chave à parte:
// senão o teste chegava às outras abas abertas (pelo aviso de "salvo em outra aba") e de lá ia para casa/
const KEY = `${APP_ID}:projeto:v2${typeof location !== 'undefined' && new URLSearchParams(location.search).has('semsync') ? ':teste' : ''}`
const SETTINGS_KEY = `${APP_ID}:config:v1`

export interface AssetRecord {
  id: string
  name: string
  size: Vec3
  /** base64 do .glb — só presente em arquivos exportados. */
  data?: string
}

export interface ProjectData {
  app: typeof APP_ID
  version: 1
  savedAt: string
  room: Room
  items: FurnitureItem[]
  measurements: Measurement[]
  assets: AssetRecord[]
  /** Grupos de móveis (conjunto de jantar, escritório…). */
  groups?: FurnitureGroup[]
  /** Só em arquivos exportados: os checkpoints guardados no navegador. */
  checkpoints?: Checkpoint[]
}

/** Estado salvo para comparar combinações e voltar depois. */
export interface CheckpointData {
  room: Room
  items: FurnitureItem[]
  measurements: Measurement[]
  groups?: FurnitureGroup[]
}

export interface Checkpoint {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  /** Miniatura JPEG da vista no momento em que foi salvo. */
  thumb?: string
  itemCount: number
  data: CheckpointData
}

export type CheckpointMeta = Omit<Checkpoint, 'data'>

export const isProject = (j: unknown): j is ProjectData => (j as ProjectData)?.app === APP_ID && !!(j as ProjectData).room

/** Grava no navegador; devolve o motivo se não der (armazenamento cheio ou bloqueado). */
export function saveLocal(p: ProjectData): string | null {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
    return null
  } catch (err) {
    return err instanceof DOMException && err.name === 'QuotaExceededError' ? 'o armazenamento do navegador está cheio' : 'o navegador não deixou gravar'
  }
}

export function loadLocal(): ProjectData | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const j = JSON.parse(raw)
    return isProject(j) ? j : null
  } catch {
    return null
  }
}

/** Outra aba deste navegador salvou o projeto (para manter as abas sincronizadas). */
export function onProjectSavedElsewhere(cb: (p: ProjectData) => void) {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return
    try {
      const j = JSON.parse(e.newValue)
      if (isProject(j)) cb(j)
    } catch {
      /* conteúdo inválido: ignora */
    }
  })
}

export function saveSettings(s: object) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export function loadSettings<T>(): Partial<T> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

// ---------- IndexedDB (modelos .glb importados) ----------

let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      // v2: checkpoints
      const req = indexedDB.open(APP_ID, 2)
      req.onupgradeneeded = () => {
        const d = req.result
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets')
        if (!d.objectStoreNames.contains('checkpoints')) d.createObjectStore('checkpoints', { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbp
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = 'assets'): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const r = fn(d.transaction(store, mode).objectStore(store))
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      }),
  )
}

export const idbPut = (id: string, data: ArrayBuffer) => tx('readwrite', (s) => s.put(data, id))
export const idbGet = (id: string) => tx<ArrayBuffer | undefined>('readonly', (s) => s.get(id))
export const idbDel = (id: string) => tx('readwrite', (s) => s.delete(id))

export const cpAll = () => tx<Checkpoint[]>('readonly', (s) => s.getAll(), 'checkpoints')
export const cpGet = (id: string) => tx<Checkpoint | undefined>('readonly', (s) => s.get(id), 'checkpoints')
export const cpPut = (c: Checkpoint) => tx('readwrite', (s) => s.put(c), 'checkpoints')
export const cpDel = (id: string) => tx('readwrite', (s) => s.delete(id), 'checkpoints')

export function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function b64ToBuf(b64: string): ArrayBuffer {
  const s = atob(b64)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes.buffer
}
