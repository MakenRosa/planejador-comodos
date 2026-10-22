import { useState } from 'react'
import { TYPES } from '../furniture/catalog'
import { footprint, pointInPoly, polyArea, wallLength, wallName } from '../lib/geom'
import { DEFAULT_WALL_COLOR, WALL_PAINTS } from '../lib/patterns'
import type { Room, Space } from '../lib/types'
import { fmtCm, fmtCmShort, fmtDim, fmtM2 } from '../lib/util'
import { FLOOR_TYPES } from '../scene/Room'
import { useStore } from '../store'
import { ColorField, Section, TextField } from './fields'
import { Icon } from './Icon'
import { BaseboardFields } from './BaseboardFields'
import { CheckControl, ChecksSummary } from './MeasureChecks'
import { heightKey, inSpace, listChecks, wallKey } from '../lib/checks'
import type { Baseboard } from '../lib/types'

const KIND_NAMES: Record<string, string> = {
  bedroom: 'Quarto',
  kitchen: 'Cozinha',
  bathroom: 'Banheiro',
  livingRoom: 'Sala',
  diningRoom: 'Sala de jantar',
  unidentified: 'Ambiente',
}

export function spaceDims(sp: Space) {
  const xs = sp.floor.map((p) => p[0])
  const zs = sp.floor.map((p) => p[1])
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) }
}

export function SpacePanel({ space, room }: { space: Space; room: Room }) {
  const updateSpace = useStore((s) => s.updateSpace)
  const updateWall = useStore((s) => s.updateWall)
  const items = useStore((s) => s.items)
  const select = useStore((s) => s.select)
  const setHovered = useStore((s) => s.setHovered)
  const focus = useStore((s) => s.focusSpace)
  const setFocus = useStore((s) => s.setFocusSpace)
  const walls = room.walls.filter((w) => w.spaceId === space.id)
  const [paint, setPaint] = useState(walls[0]?.paint ?? DEFAULT_WALL_COLOR)
  const area = polyArea(space.floor)
  const dims = spaceDims(space)
  const perimeter = space.floor.reduce((s, p, i) => {
    const q = space.floor[(i + 1) % space.floor.length]
    return s + Math.hypot(q[0] - p[0], q[1] - p[1])
  }, 0)
  const inside = items.filter((it) => pointInPoly([it.x, it.z], space.floor))
  const used = inside.filter((i) => !TYPES[i.type]?.noCollide && i.elevation < 0.05 && i.height >= 0.03).reduce((s, i) => s + polyArea(footprint(i)), 0)
  const pct = Math.min(100, (used / area) * 100)
  const doors = room.openings.filter((o) => !o.ghost && o.kind === 'door' && walls.some((w) => w.id === o.wallId)).length
  const ghosts = room.openings.filter((o) => o.ghost && walls.some((w) => w.id === o.wallId)).length
  const checks = listChecks(room).filter((c) => inSpace(c, space.id))

  return (
    <div className="panel">
      <div className="panel-head">
        <TextField className="title-input" value={space.name} onCommit={(v) => updateSpace(space.id, { name: v })} />
        <div className="panel-sub">
          {KIND_NAMES[space.kind] ?? 'Ambiente'} · {doors + ghosts} porta(s)
        </div>
        <div className="row-actions">
          {focus === space.id ? (
            <button className="btn is-on" onClick={() => setFocus(null)} title="Mostrar todos os cômodos de novo">
              <Icon name="eye" size={16} /> Ver a casa toda
            </button>
          ) : (
            <button className="btn" onClick={() => setFocus(space.id)} title="Esconde os outros cômodos para planejar este com calma">
              <Icon name="eye" size={16} /> Ver só este cômodo
            </button>
          )}
        </div>
      </div>

      <Section title="Medidas">
        <div className="stats">
          <div>
            <span>Área</span>
            <b>{fmtM2(area)}</b>
          </div>
          <div>
            <span>Largura × comprimento</span>
            <b>
              {fmtCmShort(dims.w)} × {fmtCmShort(dims.d)} cm
            </b>
          </div>
          <div>
            <span>Perímetro</span>
            <b>{fmtCm(perimeter)}</b>
          </div>
          <div>
            <span>Pé-direito</span>
            <b>{fmtCm(space.ceilingHeight)}</b>
          </div>
        </div>
        <div className="occ">
          <div className="occ-head">
            <span>Piso ocupado por móveis</span>
            <b>{pct.toFixed(0)}%</b>
          </div>
          <div className="occ-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className="muted small">Livre para circulação: {fmtM2(Math.max(0, area - used))}</span>
        </div>
        <CheckControl room={room} checkKey={heightKey(space.id)} label="Pé-direito conferido com trena?" />
      </Section>

      <Section title={`Conferência de medidas (${checks.filter((c) => c.check?.state === 'conferida').length}/${checks.length})`} defaultOpen={false}>
        <ChecksSummary room={room} spaceId={space.id} />
      </Section>

      <Section title="Piso">
        <div className="chip-row">
          {FLOOR_TYPES.map((f) => (
            <button key={f.id} className={`chip${(space.floorType ?? 'wood') === f.id ? ' is-on' : ''}`} onClick={() => updateSpace(space.id, { floorType: f.id })}>
              {f.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title={`Paredes (${walls.length})`}>
        <ColorField label="Pintar todas as paredes deste cômodo" palette={WALL_PAINTS} value={paint} onChange={setPaint} />
        <div className="btn-row">
          <button
            className="btn"
            onClick={() => {
              const st = useStore.getState()
              st.commit()
              walls.forEach((w) => updateWall(w.id, { paint }, false))
            }}
          >
            <Icon name="wall" size={16} /> Aplicar nas {walls.length} paredes
          </button>
        </div>
        <ul className="list" style={{ marginTop: 8 }}>
          {walls.map((w) => (
            <li key={w.id}>
              <button onClick={() => select({ kind: 'wall', id: w.id })} title="Pintar / papel de parede">
                <span className="dot" style={{ background: w.paint ?? DEFAULT_WALL_COLOR }} />
                <span className="list-name">{wallName(room, w).replace(/^Parede /, '').replace(` — ${space.name}`, '')}</span>
                <span className="list-meta">
                  {room.checks?.[wallKey(w.id)]?.state === 'conferida' && <span className="chk-ok" title="Conferida com trena">✓ </span>}
                  {fmtCmShort(wallLength(w))} cm
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Rodapé">
        <BaseboardFields
          label="Rodapé de poliestireno nas paredes do cômodo"
          value={walls.find((w) => w.baseboard)?.baseboard}
          onChange={(b: Baseboard | undefined) => {
            useStore.getState().commit()
            walls.forEach((w) => updateWall(w.id, { baseboard: b ? { ...b } : undefined }, false))
          }}
        />
        {walls.some((w) => w.baseboard) && walls.some((w) => !w.baseboard) && (
          <p className="hint warn">Algumas paredes deste cômodo estão sem rodapé — mexer aqui aplica em todas.</p>
        )}
      </Section>

      <Section title={`Móveis neste cômodo (${inside.length})`}>
        {inside.length === 0 && <p className="hint">Nenhum móvel aqui ainda. Arraste do catálogo para dentro do cômodo.</p>}
        <ul className="list">
          {inside.map((it) => (
            <li key={it.id}>
              <button onClick={() => select({ kind: 'item', id: it.id })} onPointerEnter={() => setHovered(it.id)} onPointerLeave={() => setHovered(null)}>
                <span className="dot" style={{ background: it.color }} />
                <span className="list-name">{it.name}</span>
                <span className="list-meta">{fmtDim(it.width, it.depth, it.height)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
