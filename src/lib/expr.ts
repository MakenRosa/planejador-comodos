/**
 * Medida digitada num campo: número na unidade do campo (cm), com unidade (1,20 m · 850 mm · 85 cm) e
 * contas (+ − × ÷ e parênteses: 120-3, 2×60, (250-12)/2). Parser próprio e restrito — o texto nunca é
 * executado; o que ele não reconhece vira mensagem de erro.
 */

export type MeasureResult =
  /** `plain`: só um número (sem unidade nem conta) — não precisa de prévia. */
  | { ok: true; value: number; plain: boolean }
  | { ok: false; error: string }

/** Exemplo curto mostrado ao focar um campo de medida. */
export const MEASURE_EXAMPLE = 'ex.: 1,20 m · 850 mm · 120-3'

/** Fator para centímetros. */
const LENGTH: Record<string, number> = { mm: 0.1, cm: 1, m: 100 }
const DEGREES = new Set(['°', 'grau', 'graus'])

type Tok = { k: 'num'; v: number } | { k: 'op'; v: string } | { k: 'unit'; v: string }

const OPS: Record<string, string> = { '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', '·': '*', '/': '/', '÷': '/', '(': '(', ')': ')' }

/** "1,20" "1.20" "1.200,5" (o último separador é o decimal; com dois iguais, é erro). */
function readNumber(raw: string): number | null {
  const seps = raw.replace(/\d/g, '')
  let t = raw
  if (seps.length > 1) {
    const dec = seps[seps.length - 1]
    const group = dec === ',' ? '.' : ','
    // só um decimal e os outros separadores de milhar diferentes dele
    if (seps.slice(0, -1).split('').some((c) => c !== group)) return null
    t = raw.split(group).join('')
  }
  t = t.replace(',', '.')
  const v = Number(t)
  return /^\d*\.?\d+$|^\d+\.$/.test(t) && Number.isFinite(v) ? v : null
}

function tokenize(s: string): Tok[] | string {
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[\d.,]/.test(c)) {
      const m = /^[\d.,]+/.exec(s.slice(i))![0]
      const v = readNumber(m)
      if (v === null) return `Número inválido: “${m}”`
      out.push({ k: 'num', v })
      i += m.length
      continue
    }
    if (c === '°') {
      out.push({ k: 'unit', v: '°' })
      i++
      continue
    }
    if (/[a-zA-Zµ]/.test(c)) {
      const w = /^[a-zA-Zµ]+/.exec(s.slice(i))![0].toLowerCase()
      // "2x60" = 2 × 60
      out.push(w === 'x' ? { k: 'op', v: '*' } : { k: 'unit', v: w })
      i += w.length
      continue
    }
    if (OPS[c]) {
      out.push({ k: 'op', v: OPS[c] })
      i++
      continue
    }
    return `Caractere não aceito: “${c}”`
  }
  return out
}

/**
 * Interpreta o texto de um campo de medida. `unit`: unidade do campo ('cm' aceita m/cm/mm; '°' aceita °
 * ou "graus"). Devolve o valor na unidade do campo, ou null se estiver vazio.
 */
export function parseMeasure(src: string, unit = 'cm'): MeasureResult | null {
  if (src.trim() === '') return null
  const toks = tokenize(src)
  if (typeof toks === 'string') return { ok: false, error: toks }
  const isLength = unit === 'cm'
  let p = 0
  const peek = () => toks[p]
  const fail = (msg: string): never => {
    throw new Error(msg)
  }

  const unitFactor = (u: string) => {
    if (isLength) {
      if (u in LENGTH) return LENGTH[u]
      if (DEGREES.has(u)) fail('Este campo é de medida (m, cm ou mm)')
      return fail(`Unidade “${u}” não reconhecida — use m, cm ou mm`)
    }
    if (u === unit || (unit === '°' && DEGREES.has(u))) return 1
    if (u in LENGTH) return fail(unit === '°' ? 'Este campo é em graus' : `Este campo é em ${unit}`)
    return fail(`Unidade “${u}” não reconhecida`)
  }

  // expr = term {(+|-) term}; term = unary {(*|/) unary}; unary = (+|-) unary | primary [unidade]
  const primary = (): number => {
    const t = peek()
    if (!t) return fail('A conta terminou no meio — falta um número')
    let v: number
    if (t.k === 'num') {
      p++
      v = t.v
    } else if (t.k === 'op' && t.v === '(') {
      p++
      v = expr()
      const close = peek()
      if (!close || close.k !== 'op' || close.v !== ')') fail('Falta fechar o parêntese')
      p++
    } else if (t.k === 'unit') return fail(`“${t.v}” sem número antes`)
    else return fail(`“${t.v}” fora do lugar`)
    const u = peek()
    if (u && u.k === 'unit') {
      p++
      v *= unitFactor(u.v)
    }
    return v
  }
  const unary = (): number => {
    const t = peek()
    if (t && t.k === 'op' && (t.v === '-' || t.v === '+')) {
      p++
      const v = unary()
      return t.v === '-' ? -v : v
    }
    return primary()
  }
  const term = (): number => {
    let v = unary()
    for (let t = peek(); t && t.k === 'op' && (t.v === '*' || t.v === '/'); t = peek()) {
      p++
      const r = unary()
      if (t.v === '/' && r === 0) fail('Divisão por zero')
      v = t.v === '*' ? v * r : v / r
    }
    return v
  }
  function expr(): number {
    let v = term()
    for (let t = peek(); t && t.k === 'op' && (t.v === '+' || t.v === '-'); t = peek()) {
      p++
      const r = term()
      v = t.v === '+' ? v + r : v - r
    }
    return v
  }

  try {
    const value = expr()
    const rest = peek()
    if (rest) fail(rest.k === 'num' ? 'Falta um sinal entre os números (+ − × ÷)' : `“${rest.v}” fora do lugar`)
    if (!Number.isFinite(value)) fail('Resultado inválido')
    const plain = toks.every((t) => t.k === 'num' || (t.k === 'op' && (t.v === '-' || t.v === '+'))) && toks.filter((t) => t.k === 'num').length === 1
    return { ok: true, value, plain }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

const f2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, useGrouping: false })

/** Prévia do resultado: "= 117 cm", "= 33,75 cm", "= 60°". */
export const fmtMeasure = (v: number, unit = 'cm') => `= ${f2.format(v)}${unit === '°' ? '°' : ` ${unit}`}`
