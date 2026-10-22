import { useMemo, useState } from 'react'
import { CHECK_LABEL, fitIssues, inSpace, listChecks, shortWallName, stateOf, tolerance, type CheckEntry, type CheckState, type FitIssue } from '../lib/checks'
import { wallLength } from '../lib/geom'
import type { FurnitureItem, Room } from '../lib/types'
import { fmtCm } from '../lib/util'
import { useStore } from '../store'
import { NumberField, TextField } from './fields'
import { Icon } from './Icon'

const STATES: CheckState[] = ['scan', 'a-conferir', 'conferida']
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

/** Selo do estado (subtítulo dos painéis e listas). */
export function CheckTag({ room, checkKey }: { room: Room; checkKey: string }) {
  const st = stateOf(room.checks?.[checkKey])
  return <span className={`tag chk-tag chk-${st}`}>{st === 'conferida' ? '✓ conferida' : st === 'a-conferir' ? 'a conferir' : 'do scan'}</span>
}

/** Conferência com trena de uma medida: do scan → a conferir → conferida, com uma anotação. */
export function CheckControl({ room, checkKey, label = 'Conferência com trena' }: { room: Room; checkKey: string; label?: string }) {
  const c = room.checks?.[checkKey]
  const st = stateOf(c)
  const set = (s: CheckState) => useStore.getState().setCheck([checkKey], s === 'scan' ? null : { state: s, at: new Date().toISOString(), note: c?.note })
  return (
    <div className="chk">
      <div className="field-label">{label}</div>
      <div className="chk-seg" role="radiogroup" aria-label={label}>
        {STATES.map((s) => (
          <button key={s} role="radio" aria-checked={st === s} className={`chk-opt chk-${s}${st === s ? ' is-on' : ''}`} onClick={() => st !== s && set(s)}>
            {s === 'conferida' && <Icon name="check" size={13} />}
            {CHECK_LABEL[s]}
          </button>
        ))}
      </div>
      {c && (
        <div className="chk-note">
          <TextField
            allowEmpty
            value={c.note ?? ''}
            placeholder={c.state === 'conferida' ? 'Anotação (ex.: trena 116 cm)' : 'O que conferir (ex.: largura sem o batente)'}
            onCommit={(note) => useStore.getState().setCheck([checkKey], { ...c, note: note || undefined })}
          />
          <span className="muted small">
            {c.state === 'conferida' ? 'Conferida' : 'Marcada'} em {day(c.at)}
          </span>
        </div>
      )}
    </div>
  )
}

const axisName = (f: FitIssue) => (f.axis === 'x' ? 'na largura' : 'na profundidade')

/** Aviso no painel do móvel: encaixe justo que ainda depende de parede do scan. */
export function FitWarning({ item, room, items }: { item: FurnitureItem; room: Room; items: FurnitureItem[] }) {
  const issues = useMemo(() => fitIssues(item, room, items), [item, room, items])
  if (!issues.length) return null
  const tol = tolerance(room)
  const select = useStore.getState().select
  return (
    <div className="alerts">
      {issues.map((f) => (
        <div key={f.axis} className="alert alert-warn fit-alert">
          <Icon name="ruler" size={15} />
          <span>
            Encaixe justo {axisName(f)}: folga de {fmtCm(f.slack)} de parede a parede{f.via.length ? ` (junto com ${f.via.join(', ')})` : ''}, e o scan pode errar ±
            {fmtCm(tol)}. Antes de comprar ou mandar fazer,{' '}
            {f.span
              ? `meça de quina a quina ${f.walls.length > 1 ? 'uma destas paredes (o comprimento delas é o vão)' : 'esta parede (o comprimento dela é o vão)'} e marque como conferida:`
              : 'meça a distância entre estas paredes e marque-as como conferidas:'}
            <span className="fit-walls">
              {f.walls.map((id) => {
                const w = room.walls.find((x) => x.id === id)
                return (
                  w && (
                    <button key={id} className="link-btn" onClick={() => select({ kind: 'wall', id })}>
                      {shortWallName(room, w)}
                      {f.span && ` (${fmtCm(wallLength(w))})`}
                    </button>
                  )
                )
              })}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

/** Lista das medidas (de um cômodo ou da casa) para conferir: clique leva até a parede/porta/cômodo. */
function CheckList({ room, entries, grouped }: { room: Room; entries: CheckEntry[]; grouped: boolean }) {
  const select = useStore((s) => s.select)
  const groups = grouped ? (room.spaces ?? []).map((sp) => ({ id: sp.id, name: sp.name, list: entries.filter((e) => e.spaceId === sp.id) })) : [{ id: '', name: '', list: entries }]
  return (
    <>
      {groups
        .filter((g) => g.list.length)
        .map((g) => (
          <div key={g.id}>
            {g.name && <div className="field-label chk-group">{g.name}</div>}
            <ul className="list">
              {g.list.map((e) => {
                const st = stateOf(e.check)
                return (
                  <li key={e.key}>
                    <button onClick={() => e.select && select(e.select)} title={`${e.name} · ${e.value}\n${CHECK_LABEL[st]}${e.check?.note ? ` — ${e.check.note}` : ''}`}>
                      <span className={`dot chk-dot chk-${st}`} />
                      <span className="list-name">{e.name}</span>
                      <span className="list-meta">{e.value}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
    </>
  )
}

const pendingFirst = (a: CheckEntry, b: CheckEntry) => {
  const rank = (e: CheckEntry) => ({ 'a-conferir': 0, scan: 1, conferida: 2 })[stateOf(e.check)]
  return rank(a) - rank(b)
}

/**
 * "Conferência de medidas" (painel da casa ou do cômodo): quanto já foi conferido, a margem do scan,
 * os encaixes justos e a lista do que falta.
 */
export function ChecksSummary({ room, spaceId }: { room: Room; spaceId?: string }) {
  const items = useStore((s) => s.items)
  const select = useStore((s) => s.select)
  const updateRoom = useStore((s) => s.updateRoom)
  const [all, setAll] = useState(false)
  const entries = useMemo(() => listChecks(room).filter((e) => !spaceId || inSpace(e, spaceId)), [room, spaceId])
  const done = entries.filter((e) => e.check?.state === 'conferida').length
  const marked = entries.filter((e) => e.check?.state === 'a-conferir').length
  const shown = (all ? entries : entries.filter((e) => e.check?.state !== 'conferida')).slice().sort(pendingFirst)
  const fits = useMemo(() => {
    const mine = spaceId ? new Set(room.walls.filter((w) => w.spaceId === spaceId).map((w) => w.id)) : null
    return items
      .map((it) => ({ it, issues: fitIssues(it, room, items) }))
      .filter((x) => x.issues.length && (!mine || x.issues.some((f) => f.walls.some((id) => mine.has(id)))))
  }, [items, room, spaceId])
  const pct = entries.length ? (done / entries.length) * 100 : 0
  return (
    <div className="chk-sum">
      <div className="occ">
        <div className="occ-head">
          <span>
            {done} de {entries.length} medidas conferidas{marked ? ` · ${marked} a conferir` : ''}
          </span>
          <b>{pct.toFixed(0)}%</b>
        </div>
        <div className="occ-bar chk-bar">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      {!spaceId && (
        <NumberField
          label="Margem de erro do scan (±)"
          value={tolerance(room)}
          min={0.002}
          max={0.15}
          onCommit={(v) => updateRoom({ checkTolerance: v })}
          title="Quanto o scan pode errar. Móvel de parede a parede com folga menor que isso aparece como encaixe justo enquanto as paredes não forem conferidas."
        />
      )}
      {fits.length > 0 && (
        <>
          <div className="field-label">Encaixes justos (dependem de parede do scan)</div>
          <ul className="list">
            {fits.map(({ it, issues }) => (
              <li key={it.id}>
                <button onClick={() => select({ kind: 'item', id: it.id })} title="Abrir o móvel para ver quais paredes conferir">
                  <Icon name="ruler" size={14} />
                  <span className="list-name">{it.name}</span>
                  <span className="list-meta">folga {issues.map((f) => fmtCm(f.slack)).join(' / ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="chip-row chk-filter">
        <button className={`chip${all ? '' : ' is-on'}`} onClick={() => setAll(false)}>
          Falta conferir ({entries.length - done})
        </button>
        <button className={`chip${all ? ' is-on' : ''}`} onClick={() => setAll(true)}>
          Todas ({entries.length})
        </button>
      </div>
      {shown.length ? <CheckList room={room} entries={shown} grouped={!spaceId && (room.spaces?.length ?? 0) > 1} /> : <p className="hint">Tudo conferido com trena.</p>}
      <p className="hint">Abra uma parede, porta ou cômodo para marcar como conferida. Corrigir uma parede pela trena já a marca como conferida.</p>
    </div>
  )
}
