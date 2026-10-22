/**
 * Vista atual na URL (no hash, sem recarregar nem criar histórico): ao recarregar ou abrir um link
 * salvo, a câmera volta exatamente para onde estava.
 *   #v=3d&c=x,y,z&t=x,y,z          órbita 3D: posição da câmera e ponto para onde ela olha
 *   #v=planta&c=x,z&z=zoom         planta: centro e zoom
 *   #v=andar&c=x,z&o=giro,inclin   primeira pessoa: onde está e para onde olha (radianos)
 *   &f=id                          cômodo isolado ("Só Banheiro")
 */
export interface SavedView {
  mode: '3d' | 'planta' | 'andar'
  c: number[]
  t?: number[]
  zoom?: number
  o?: number[]
  f?: string
}

const nums = (s: string | null, n: number) => {
  if (!s) return null
  const v = s.split(',').map(Number)
  return v.length === n && v.every(Number.isFinite) ? v : null
}

export function parseViewHash(hash: string): SavedView | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''))
  const mode = q.get('v')
  const f = q.get('f') ?? undefined
  if (mode === '3d') {
    const c = nums(q.get('c'), 3)
    const t = nums(q.get('t'), 3)
    return c && t ? { mode, c, t, f } : null
  }
  if (mode === 'planta') {
    const c = nums(q.get('c'), 2)
    const zoom = Number(q.get('z'))
    return c && Number.isFinite(zoom) && zoom > 0 ? { mode, c, zoom, f } : null
  }
  if (mode === 'andar') {
    const c = nums(q.get('c'), 2)
    const o = nums(q.get('o'), 2)
    return c && o ? { mode, c, o, f } : null
  }
  return null
}

const r3 = (v: number) => String(Math.round(v * 1000) / 1000)
const list = (v: number[]) => v.map(r3).join(',')

export function viewHash(v: SavedView): string {
  const q = [`v=${v.mode}`, `c=${list(v.c)}`]
  if (v.t) q.push(`t=${list(v.t)}`)
  if (v.zoom !== undefined) q.push(`z=${Math.round(v.zoom * 10) / 10}`)
  if (v.o) q.push(`o=${list(v.o)}`)
  if (v.f) q.push(`f=${encodeURIComponent(v.f)}`)
  return `#${q.join('&')}`
}

/**
 * Ponte entre o carregamento (App) e a câmera (cena): `pending` é a vista a restaurar — a câmera a
 * aplica no lugar do enquadramento padrão; `ready` libera a gravação na URL (só depois de carregar,
 * para não trocar o link salvo pela vista padrão).
 */
export const viewRestore: { pending: SavedView | null; ready: boolean; since: number } = { pending: null, ready: false, since: 0 }
