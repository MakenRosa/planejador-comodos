import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { PALETTE } from '../furniture/catalog'
import { fmtMeasure, MEASURE_EXAMPLE, parseMeasure } from '../lib/expr'
import { clamp, fmtNum } from '../lib/util'

interface NumberFieldProps {
  label: string
  /** Valor interno (metros, radianos...). */
  value: number
  onCommit: (v: number) => void
  unit?: string
  /** Fator de exibição (100 = metros → cm). */
  scale?: number
  step?: number
  min?: number
  max?: number
  disabled?: boolean
  title?: string
  /** Vários itens com valores diferentes: o campo fica vazio ("variados") até alguém digitar. */
  mixed?: boolean
}

/**
 * Campo numérico: aceita vírgula, unidades e contas (1,20 m · 850 mm · 120-3 — lib/expr.ts), Enter
 * confirma, ↑/↓ ajusta (Shift = ×10). Focado, mostra um exemplo e a prévia do resultado; uma conta
 * inválida fica no campo com a mensagem embaixo, para corrigir.
 */
export function NumberField({ label, value, onCommit, unit = 'cm', scale = 100, step = 1, min, max, disabled, title, mixed }: NumberFieldProps) {
  const show = (v: number) => fmtNum(Math.round(v * scale * 10) / 10)
  const [text, setText] = useState(show(value))
  const [focus, setFocus] = useState(false)
  // digitou algo desde que focou (antes disso, mostra o exemplo)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const tipId = useId()
  // valor a que o texto com erro se refere: se mudar por fora, o texto volta ao valor
  const errorFor = useRef(value)
  useEffect(() => {
    if (focus || (error !== null && errorFor.current === value)) return
    setError(null)
    setText(mixed ? '' : show(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focus, scale, mixed])

  const fail = (msg: string) => {
    errorFor.current = value
    setError(msg)
  }
  const commit = (raw: string) => {
    const r = parseMeasure(raw, unit)
    if (r === null) {
      setError(null)
      return setText(mixed ? '' : show(value))
    }
    if (!r.ok) return fail(r.error)
    setError(null)
    let m = r.value / scale
    if (min !== undefined || max !== undefined) m = clamp(m, min ?? -Infinity, max ?? Infinity)
    // valores variados: qualquer número digitado vale para todos
    if (mixed || Math.abs(m - value) > 1e-9) onCommit(m)
    setText(show(m))
  }
  // ainda digitando quando o painel some (clicou noutro móvel, desmarcou): grava como se tivesse saído do campo
  const pending = useRef<(() => void) | null>(null)
  pending.current = focus ? () => commit(text) : null
  useEffect(() => () => pending.current?.(), [])

  const length = unit === 'cm'
  const live = focus && touched ? parseMeasure(text, unit) : null
  let tip: string | null = null
  let preview = false
  if (focus && !error) {
    if (live?.ok && !live.plain) {
      tip = fmtMeasure(live.value, unit)
      preview = true
    } else if (length && (!touched || (live && !live.ok))) tip = MEASURE_EXAMPLE
  }
  // a dica fica numa linha só; no campo da direita, alinha pela direita para não sair do painel
  const tipRef = useRef<HTMLSpanElement>(null)
  const [tipRight, setTipRight] = useState(false)
  useLayoutEffect(() => {
    const el = tipRef.current
    if (!el || tipRight) return
    let clip: Element | null = el.parentElement
    while (clip && getComputedStyle(clip).overflowX === 'visible') clip = clip.parentElement
    const right = clip ? clip.getBoundingClientRect().right : window.innerWidth
    if (el.getBoundingClientRect().right > right - 4) setTipRight(true)
  }, [tip, tipRight])

  return (
    <label className={`nf${disabled ? ' is-disabled' : ''}${error ? ' has-error' : ''}`} title={title}>
      <span className="nf-label">{label}</span>
      <span className="nf-box">
        <input
          ref={ref}
          value={text}
          disabled={disabled}
          placeholder={mixed ? 'variados' : undefined}
          inputMode={length ? 'text' : 'decimal'}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || tip ? tipId : undefined}
          onFocus={(e) => {
            setFocus(true)
            setTouched(false)
            e.target.select()
          }}
          onBlur={() => {
            setFocus(false)
            commit(text)
          }}
          onChange={(e) => {
            setText(e.target.value)
            setTouched(true)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // conta inválida: fica no campo com a mensagem
              const r = parseMeasure(text, unit)
              if (r && !r.ok) fail(r.error)
              else ref.current?.blur()
            } else if (e.key === 'Escape') {
              setText(show(value))
              setError(null)
              setTimeout(() => ref.current?.blur())
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              const r = parseMeasure(text, unit)
              const cur = r?.ok ? r.value : value * scale
              const next = cur + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
              const s = fmtNum(Math.round(next * 10) / 10)
              setText(s)
              commit(s)
            }
          }}
        />
        <span className="nf-unit">{unit}</span>
        {tip && (
          <span ref={tipRef} id={tipId} className={`nf-tip${preview ? ' is-preview' : ''}${tipRight ? ' to-right' : ''}`}>
            {tip}
          </span>
        )}
      </span>
      {error && (
        <span id={tipId} className="nf-err" role="alert">
          {error}
        </span>
      )}
    </label>
  )
}

export function Section({ title, children, right, defaultOpen = true }: { title: string; children: ReactNode; right?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`sec${open ? '' : ' is-closed'}`}>
      <header className="sec-head">
        <button className="sec-toggle" onClick={() => setOpen(!open)}>
          <span className="sec-caret">▾</span>
          {title}
        </button>
        {right}
      </header>
      {open && <div className="sec-body">{children}</div>}
    </section>
  )
}

export function Check({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label className="check" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check-box" />
      <span>{label}</span>
    </label>
  )
}

export function ColorField({
  label,
  value,
  onChange,
  palette = PALETTE,
  mixed,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  palette?: { name: string; hex: string }[]
  /** Vários itens com cores diferentes: nenhuma amostra marcada. */
  mixed?: boolean
}) {
  return (
    <div className="colorf">
      <div className="colorf-head">
        <span>{label}</span>
        <label className="colorf-custom" title="Cor personalizada">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
          <span style={mixed ? { background: 'conic-gradient(#e55, #ec5, #5c7, #59e, #c5e, #e55)' } : { background: value }} />
          {mixed ? 'Variadas' : value.toUpperCase()}
        </label>
      </div>
      <div className="swatches">
        {palette.map((c) => (
          <button
            key={c.hex}
            className={`sw${!mixed && c.hex.toLowerCase() === value.toLowerCase() ? ' is-on' : ''}`}
            style={{ background: c.hex }}
            title={c.name}
            onClick={() => onChange(c.hex)}
          />
        ))}
      </div>
    </div>
  )
}

export function TextField({
  value,
  onCommit,
  className,
  placeholder,
  allowEmpty,
}: {
  value: string
  onCommit: (v: string) => void
  className?: string
  placeholder?: string
  /** Deixa apagar o texto (anotações); nomes não ficam vazios. */
  allowEmpty?: boolean
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const save = () => (allowEmpty || text.trim()) && text.trim() !== value && onCommit(text.trim())
  // ainda digitando quando o painel some: grava no item a que o campo pertencia
  const pending = useRef<(() => void) | null>(null)
  pending.current = save
  useEffect(() => () => pending.current?.(), [])
  return (
    <input
      className={className}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setText(value)
          setTimeout(() => (e.target as HTMLInputElement).blur())
        }
      }}
    />
  )
}

/** Controle deslizante 0–100% (valor interno 0..1). Ao arrastar, grava um único passo no histórico. */
export function RangeField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number, commit: boolean) => void; hint?: string }) {
  const dragging = useRef(false)
  return (
    <label className="rangef">
      <span className="rangef-head">
        <span>{label}</span>
        <b>{Math.round(value * 100)}%</b>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onPointerDown={() => {
          dragging.current = true
          onChange(value, true)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
        onChange={(e) => onChange(Number(e.target.value) / 100, !dragging.current)}
      />
      {hint && <span className="rangef-hint">{hint}</span>}
    </label>
  )
}

/** Controle deslizante de ângulo em graus (valor interno em radianos). Ao arrastar, um passo no histórico. */
export function AngleField({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (rad: number, commit: boolean) => void; hint?: string }) {
  const dragging = useRef(false)
  const deg = Math.round((value * 180) / Math.PI)
  return (
    <label className="rangef">
      <span className="rangef-head">
        <span>{label}</span>
        <b>{deg > 0 ? `+${deg}` : deg}°</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={deg}
        onPointerDown={() => {
          dragging.current = true
          onChange(value, true)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
        onChange={(e) => onChange((Number(e.target.value) * Math.PI) / 180, !dragging.current)}
      />
      {hint && <span className="rangef-hint">{hint}</span>}
    </label>
  )
}

/** Controle deslizante de medida (valor em metros, mostrado em cm). Ao arrastar, um passo no histórico. */
export function LengthSlider({ label, value, min, max, step = 0.005, onChange, hint }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number, commit: boolean) => void; hint?: string }) {
  const dragging = useRef(false)
  return (
    <label className="rangef">
      <span className="rangef-head">
        <span>{label}</span>
        <b>{fmtNum(value * 100)} cm</b>
      </span>
      <input
        type="range"
        min={min}
        max={Math.max(min, max)}
        step={step}
        value={clamp(value, min, Math.max(min, max))}
        onPointerDown={() => {
          dragging.current = true
          onChange(value, true)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
        onChange={(e) => onChange(Number(e.target.value), !dragging.current)}
      />
      {hint && <span className="rangef-hint">{hint}</span>}
    </label>
  )
}
