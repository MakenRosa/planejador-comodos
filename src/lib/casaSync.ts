/**
 * Cliente da pasta casa/ do repositório (servidor em tools/casa-sync.ts): lê e grava o projeto, os
 * checkpoints e os modelos 3D em arquivos versionados com git. Só existe com o servidor do Vite
 * (npm run dev / npm run preview); num site estático o app segue só com o armazenamento do navegador.
 * Abrir com ?semsync na URL desliga a sincronização (para testar sem mexer nos arquivos).
 */
import type { Checkpoint, ProjectData } from './persist'

const BASE = `${import.meta.env.BASE_URL}__casa/`
const disabled = typeof location !== 'undefined' && new URLSearchParams(location.search).has('semsync')
/** ?semsync: abre a casa atual da pasta casa/, mas nunca grava nela. */
export const casaTestMode = disabled

let available: Promise<boolean> | null = null
// a resposta já conhecida: com ela, gravar começa na hora (dá tempo mesmo ao fechar a página)
let known: boolean | null = null
/** O servidor com a pasta casa/ está disponível? */
export function casaAvailable(): Promise<boolean> {
  if (disabled) return Promise.resolve(false)
  available ??= fetch(`${BASE}status`, { cache: 'no-store' })
    .then(async (r) => r.ok && (await r.json()).ok === true)
    .catch(() => false)
    .then((ok) => (known = ok))
  return available
}

async function getJson<T>(what: string): Promise<T | null> {
  const r = await fetch(BASE + what, { cache: 'no-store' })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`casa/${what}: ${r.status}`)
  return (await r.json()) as T
}

export const readProject = () => getJson<ProjectData>('projeto')
export const readCheckpoints = () => getJson<Checkpoint[]>('checkpoints')

export async function readModel(id: string): Promise<ArrayBuffer | null> {
  const r = await fetch(`${BASE}modelos/${id}`, { cache: 'no-store' })
  return r.ok ? r.arrayBuffer() : null
}

/** Situação das gravações na pasta casa/, para a barra de status e o aviso de falha. */
export interface CasaWriteState {
  /** Alguma gravação na fila ou em andamento. */
  busy: boolean
  /** Arquivos cuja última gravação falhou (relativos a casa/: projeto, checkpoints, modelos/…). */
  failed: string[]
  /** Última gravação que deu certo (Date.now()). */
  lastOk: number | null
  /** Motivo da falha mais recente, para mostrar. */
  error: string | null
}

type Job = { body: BodyInit; type: string; method: string }
// uma gravação por vez em cada arquivo, e só a mais recente fica na fila
const pending = new Map<string, Job>()
const running = new Set<string>()
// a última tentativa que falhou em cada arquivo — "Tentar novamente" (ou a nova tentativa automática) reenvia
const failedJobs = new Map<string, Job>()
let lastOk: number | null = null
let lastError: string | null = null
let listener: ((s: CasaWriteState) => void) | null = null
let retryTimer: ReturnType<typeof setTimeout> | undefined
/** Enquanto houver falha, tenta de novo sozinho a cada tanto (o servidor pode ter voltado). */
export const CASA_RETRY_MS = 15000

/** Acompanha as gravações na pasta casa/ (uma função só: a da barra de status). */
export function onCasaWriteState(cb: (s: CasaWriteState) => void) {
  listener = cb
  emit()
}

function emit() {
  listener?.({ busy: running.size > 0 || pending.size > 0, failed: [...failedJobs.keys()], lastOk, error: failedJobs.size ? lastError : null })
}

const reason = (err: unknown) =>
  err instanceof TypeError ? 'o servidor não respondeu (npm run dev está rodando?)' : err instanceof Error ? err.message : String(err)

async function flush(what: string) {
  if (running.has(what)) return
  running.add(what)
  emit()
  try {
    for (let job = pending.get(what); job; job = pending.get(what)) {
      pending.delete(what)
      try {
        const body = job.method === 'DELETE' ? undefined : job.body
        // keepalive: termina mesmo se a página fechar ou recarregar no meio (só aceita corpo pequeno)
        const keepalive = typeof body === 'string' && new TextEncoder().encode(body).length < 64000
        if (!keepalive) fragile.add(what)
        const r = await fetch(BASE + what, { method: job.method, body, keepalive, headers: { 'Content-Type': job.type } }).finally(() => fragile.delete(what))
        if (!r.ok) throw new Error(`o servidor recusou a gravação (${r.status})`)
        failedJobs.delete(what)
        lastOk = Date.now()
      } catch (err) {
        console.error(`casa/${what}:`, err)
        // se uma gravação mais nova já está na fila, é ela que vale
        if (!pending.has(what)) failedJobs.set(what, job)
        lastError = reason(err)
      }
    }
  } finally {
    running.delete(what)
    clearTimeout(retryTimer)
    if (failedJobs.size) retryTimer = setTimeout(retryCasaWrites, CASA_RETRY_MS)
    emit()
  }
}

// gravações em andamento que não sobrevivem a fechar a página (grandes demais para keepalive)
const fragile = new Set<string>()
/** Fechar a página agora pode perder algo? (falhou e não gravou de novo, ou gravação grande em andamento) */
export const casaUnloadRisk = () => failedJobs.size > 0 || fragile.size > 0

/** Reenvia o que falhou (o mais recente de cada arquivo). */
export function retryCasaWrites() {
  clearTimeout(retryTimer)
  for (const [what, job] of failedJobs) {
    if (!pending.has(what)) pending.set(what, job)
    void flush(what)
  }
}

async function send(what: string, body: BodyInit, type = 'application/json', method = 'PUT') {
  if (!(known ?? (await casaAvailable()))) return
  pending.set(what, { body, type, method })
  await flush(what)
}

export const writeProject = (p: ProjectData) => {
  // os checkpoints e os modelos têm arquivos próprios
  const { checkpoints: _cps, ...rest } = p
  return send('projeto', JSON.stringify({ ...rest, assets: rest.assets.map(({ id, name, size }) => ({ id, name, size })) }))
}
export const writeCheckpoints = (list: Checkpoint[]) => send('checkpoints', JSON.stringify(list))
export const writeModel = (id: string, buf: ArrayBuffer) => send(`modelos/${id}`, buf, 'model/gltf-binary')
export const deleteModel = (id: string) => send(`modelos/${id}`, '', 'text/plain', 'DELETE')

/** Um arquivo da casa mudou por fora (git pull, checkout…): `file` relativo à pasta casa/. */
export function onCasaChanged(cb: (file: string) => void) {
  import.meta.hot?.on('casa:changed', (d: { file: string }) => cb(d.file))
}
