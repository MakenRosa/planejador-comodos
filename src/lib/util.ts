export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

const f1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, useGrouping: false })
const f2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })

/** metros -> centímetros arredondados a 1 mm */
export const toCm = (m: number) => Math.round(m * 1000) / 10
export const fmtNum = (v: number) => f1.format(v)
export const fmtCm = (m: number) => `${f1.format(toCm(m))} cm`
export const fmtCmShort = (m: number) => f1.format(toCm(m))
export const fmtM = (m: number) => `${f2.format(m)} m`
export const fmtM2 = (a: number) => `${f2.format(a)} m²`
export const fmtDim = (w: number, d: number, h?: number) =>
  [w, d, h].filter((v): v is number => v !== undefined).map(fmtCmShort).join(' × ') + ' cm'

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const TAU = Math.PI * 2
export const normAngle = (r: number) => ((r % TAU) + TAU) % TAU
export const toDeg = (r: number) => (r * 180) / Math.PI
export const toRad = (d: number) => (d * Math.PI) / 180
export const snapTo = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v)
export const round4 = (v: number) => Math.round(v * 1e4) / 1e4

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...a: A) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'projeto'
  )
}
