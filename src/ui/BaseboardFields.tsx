import { BASEBOARD_COLORS, BASEBOARD_HEIGHTS, BASEBOARD_TOPS, DEFAULT_BASEBOARD } from '../lib/baseboard'
import type { Baseboard } from '../lib/types'
import { fmtNum } from '../lib/util'
import { Check, ColorField, NumberField } from './fields'

/** Liga/desliga e personaliza o rodapé de poliestireno (altura, espessura, frisos, topo e cor). */
export function BaseboardFields({ value, onChange, label = 'Rodapé de poliestireno' }: { value?: Baseboard; onChange: (b: Baseboard | undefined) => void; label?: string }) {
  const b = value
  const set = (p: Partial<Baseboard>) => onChange({ ...(b ?? DEFAULT_BASEBOARD), ...p })
  return (
    <>
      <Check label={label} checked={!!b} onChange={(v) => onChange(v ? { ...DEFAULT_BASEBOARD } : undefined)} />
      {b && (
        <>
          <div className="field">
            <span>Altura</span>
            <div className="chip-row">
              {BASEBOARD_HEIGHTS.map((h) => (
                <button key={h} className={`chip${Math.abs(b.height - h) < 1e-4 ? ' is-on' : ''}`} onClick={() => set({ height: h })}>
                  {fmtNum(Math.round(h * 1000) / 10)} cm
                </button>
              ))}
            </div>
          </div>
          <div className="grid2">
            <NumberField label="Altura" value={b.height} min={0.03} max={0.3} onCommit={(v) => set({ height: v })} />
            <NumberField label="Espessura" value={b.thickness} min={0.005} max={0.03} step={0.1} onCommit={(v) => set({ thickness: v })} />
          </div>
          <div className="grid2">
            <label className="field">
              <span>Frisos</span>
              <select value={b.grooves} onChange={(e) => set({ grooves: Number(e.target.value) })}>
                <option value={0}>Liso (sem frisos)</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} friso{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Topo</span>
              <select value={b.top} onChange={(e) => set({ top: e.target.value as Baseboard['top'] })}>
                {BASEBOARD_TOPS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {b.grooves > 0 && (
            <label className="field">
              <span>Posição dos frisos</span>
              <select value={b.groovePos} onChange={(e) => set({ groovePos: e.target.value as Baseboard['groovePos'] })}>
                <option value="topo">Juntos, perto do topo (frisado clássico)</option>
                <option value="distribuidos">Distribuídos pela altura</option>
              </select>
            </label>
          )}
          <ColorField label="Cor" palette={BASEBOARD_COLORS} value={b.color} onChange={(c) => set({ color: c })} />
        </>
      )}
    </>
  )
}
