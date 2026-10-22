/**
 * Clicar e arrastar um item do catálogo para a cena: enquanto arrasta, a prévia 3D acompanha o cursor
 * já na posição final (sobre a escrivaninha, encostado na parede, na janela…); soltar sobre a vista
 * adiciona o item ali. Soltar fora da vista ou apertar Esc cancela.
 */
import type { PointerEvent as RPointerEvent } from 'react'
import type { FurnitureItem } from '../lib/types'
import { viewportApi } from '../scene/helpers'
import { useStore } from '../store'

let suppressUntil = 0
/** Logo depois de um arraste o navegador ainda dispara "click" no cartão — ignore. */
export const clickSuppressed = () => performance.now() < suppressUntil

export function startCatalogDrag(ev: RPointerEvent, make: () => FurnitureItem | null) {
  if (ev.button !== 0) return
  const sx = ev.clientX
  const sy = ev.clientY
  let base: FurnitureItem | null = null

  const finish = (commit: boolean) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key)
    if (!base) return
    document.body.classList.remove('is-placing')
    suppressUntil = performance.now() + 400
    const st = useStore.getState()
    const p = st.placing
    st.setPlacing(null)
    if (commit && p) st.addPlaced(p)
  }
  const move = (e: PointerEvent) => {
    if (!base) {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return
      base = make()
      if (!base) return finish(false)
      document.body.classList.add('is-placing')
      window.getSelection()?.removeAllRanges()
    }
    useStore.getState().setPlacing(viewportApi.dropPose?.(base, e.clientX, e.clientY) ?? null)
  }
  const up = () => finish(true)
  const cancel = () => finish(false)
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') finish(false)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key)
}
