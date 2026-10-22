import { Html } from '@react-three/drei'
import { useCallback, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { Vec3 } from '../lib/types'
import { viewportApi } from './helpers'
import { useStore } from '../store'
import { fmtMeasure, MEASURE_EXAMPLE, parseMeasure } from '../lib/expr'
import { fmtCm, toCm } from '../lib/util'

/**
 * Os rótulos são HTML por cima da cena. Clique aciona o rótulo (ex.: digitar a medida); arrastar a
 * partir dele repassa o gesto para a cena, que move o móvel que está embaixo (ou gira a câmera).
 * Sem isso, móveis pequenos (PC, criado-mudo…) ficam cobertos pelas cotas quando selecionados e não
 * dá para arrastá-los.
 */
function useDragThrough(dragItem?: string) {
  const dragged = useRef(false)
  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    e.stopPropagation()
    dragged.current = false
    if (e.button !== 0) return
    const { clientX: sx, clientY: sy, pointerId, pointerType, isPrimary } = e
    // Shift + clique: é para somar o móvel que está embaixo à seleção — o rótulo não abre o campo
    if (e.shiftKey) {
      dragged.current = true
      const id = viewportApi.itemAt?.(sx, sy)
      if (id) useStore.getState().toggleMulti(id)
      // o clique que vem depois (no rótulo) não pode chegar na cena: lá ele contaria como clique no vazio
      const swallow = (ev: MouseEvent) => {
        window.removeEventListener('click', swallow, true)
        ev.stopPropagation()
      }
      window.addEventListener('click', swallow, true)
      return
    }
    const done = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', done)
      window.removeEventListener('pointercancel', done)
    }
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return
      done()
      dragged.current = true
      if (dragItem && viewportApi.dragItem) return viewportApi.dragItem(dragItem, sx, sy, ev)
      const canvas = document.querySelector<HTMLCanvasElement>('.center canvas')
      if (!canvas) return
      const init = { bubbles: true, cancelable: true, composed: true, pointerId, pointerType, isPrimary }
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, button: 0, buttons: 1, clientX: sx, clientY: sy }))
      canvas.dispatchEvent(new PointerEvent('pointermove', { ...init, button: -1, buttons: 1, clientX: ev.clientX, clientY: ev.clientY }))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
  }
  /** true se o gesto foi um arraste (o clique deve ser ignorado). */
  const wasDrag = () => {
    const d = dragged.current
    dragged.current = false
    return d
  }
  return { onPointerDown, wasDrag }
}

interface LabelProps {
  position: Vec3
  text: string
  variant?: 'dim' | 'clear' | 'measure' | 'wall' | 'name' | 'opening' | 'ghost' | 'space'
  selected?: boolean
  onClick?: () => void
}

export function Label({ position, text, variant = 'dim', selected, onClick }: LabelProps) {
  const through = useDragThrough()
  return (
    <Html position={position} center zIndexRange={[30, 0]} wrapperClass="lbl-wrap" style={{ pointerEvents: onClick ? 'auto' : 'none' }}>
      <div
        className={`lbl lbl-${variant}${selected ? ' is-selected' : ''}${onClick ? ' is-clickable' : ''}`}
        onPointerDown={through.onPointerDown}
        onClick={(e) => {
          e.stopPropagation()
          if (!through.wasDrag()) onClick?.()
        }}
      >
        {text}
      </div>
    </Html>
  )
}

interface EditableProps {
  position: Vec3
  /** Valor em metros. */
  value: number
  variant?: 'dim' | 'clear'
  prefix?: string
  title?: string
  /** Deslocamento vertical em pixels (empilhar rótulos no mesmo ponto). */
  offsetY?: number
  /** Móvel dono do rótulo: arrastar a partir do rótulo move este móvel. */
  dragItem?: string
  onSubmit: (meters: number) => void
}

/**
 * Rótulo de medida que vira campo de texto ao clicar — digite o valor exato em cm (aceita unidades e
 * contas, como os campos do painel: 1,20 m · 850 mm · 120-3). Embaixo: exemplo, prévia ou o erro.
 */
export function EditableLabel({ position, value, variant = 'dim', prefix, title, offsetY = 0, dragItem, onSubmit }: EditableProps) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const through = useDragThrough(dragItem)
  const live = editing && touched ? parseMeasure(text) : null
  const tip = error ?? (live?.ok && !live.plain ? fmtMeasure(live.value) : !touched || (live && !live.ok) ? MEASURE_EXAMPLE : null)
  const tipKind = error ? ' is-error' : live?.ok && !live.plain ? ' is-preview' : ''
  // <Html> renderiza numa raiz React própria (assíncrona): foca quando o input monta de fato
  const input = useRef<HTMLInputElement | null>(null)
  const focusRef = useCallback((el: HTMLInputElement | null) => {
    input.current = el
    if (el) {
      el.focus()
      el.select()
    }
  }, [])
  return (
    // editando: por cima das outras cotas, para a dica embaixo não ficar coberta (o z-index do Html só é
    // recalculado quando a câmera anda — vai pela classe)
    <Html position={position} center zIndexRange={[40, 0]} wrapperClass={editing ? 'lbl-wrap is-editing' : 'lbl-wrap'} style={{ pointerEvents: 'auto' }}>
      {editing ? (
        <form
          className={`lbl lbl-${variant} lbl-edit`}
          style={{ position: 'relative', top: offsetY }}
          onPointerDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault()
            const r = parseMeasure(input.current?.value ?? text)
            // conta inválida ou negativa: continua editando, com a mensagem embaixo
            if (r && !r.ok) return setError(r.error)
            if (r && r.value < 0) return setError('A medida não pode ser negativa')
            if (r) onSubmit(r.value / 100)
            setEditing(false)
          }}
        >
          <input
            ref={focusRef}
            // não controlado: o texto volta do estado por outra raiz React, com atraso — digitando rápido
            // (ou colando), um campo controlado perdia letras
            defaultValue={text}
            // cresce um pouco com contas longas ("117,2-70,4-7")
            style={{ width: Math.min(140, Math.max(60, text.length * 7.5 + 12)) }}
            onChange={(e) => {
              setText(e.target.value)
              setTouched(true)
              setError(null)
            }}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false)
              e.stopPropagation()
            }}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
          />
          <span>cm</span>
          {tip && (
            <div className={`lbl-tip${tipKind}`} role={error ? 'alert' : undefined}>
              {tip}
            </div>
          )}
        </form>
      ) : (
        <div
          className={`lbl lbl-${variant} is-clickable`}
          style={{ position: 'relative', top: offsetY }}
          title={title ?? 'Clique para digitar o valor exato'}
          onPointerDown={through.onPointerDown}
          onClick={(e) => {
            e.stopPropagation()
            if (through.wasDrag()) return
            setText(String(toCm(value)).replace('.', ','))
            setTouched(false)
            setError(null)
            setEditing(true)
          }}
        >
          {prefix}
          {fmtCm(value)}
        </div>
      )}
    </Html>
  )
}
