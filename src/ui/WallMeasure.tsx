import { useEffect, useMemo, useState } from 'react'
import { isChecked, wallKey } from '../lib/checks'
import { polyArea, wallLeftIsA, wallLength, wallName } from '../lib/geom'
import type { Room, Wall } from '../lib/types'
import { fmtCm, fmtCmShort, fmtM2 } from '../lib/util'
import { endWalls, neighborOf, planMeasuredLength } from '../lib/wallEdit'
import { useStore } from '../store'
import { NumberField } from './fields'
import { Icon } from './Icon'
import { spaceDims } from './SpacePanel'

/** Nome curto da parede (sem "· com porta…"). */
const short = (room: Room, w: Wall) => wallName(room, w).replace(/ · com .*$/, '')

/**
 * "Conferir e corrigir medida": a medida da trena desta parede (por dentro, de quina a quina) e qual
 * quina anda. Antes de aplicar, mostra num resumo só o que muda — cômodos, paredes, portas, móveis — e
 * a parede na posição nova, tracejada na cena. Ctrl+Z desfaz; a correção fica guardada sobre o scan.
 */
export function WallMeasure({ wall, room }: { wall: Wall; room: Room }) {
  const items = useStore((s) => s.items)
  const L = wallLength(wall)
  const ends = endWalls(room, wall)
  const choices = (['a', 'b'] as const).filter((k) => ends[k])
  const [open, setOpen] = useState(false)
  const [measured, setMeasured] = useState(L)
  // padrão: a quina com parede externa (não mexe no cômodo vizinho)
  const [end, setEnd] = useState<'a' | 'b' | null>(null)
  const pick = end && ends[end] ? end : (choices.find((k) => !neighborOf(room, ends[k]!)) ?? choices[0] ?? null)
  const plan = useMemo(
    () => (open && pick && Math.abs(measured - L) > 0.0005 ? planMeasuredLength(room, items, wall, measured, pick) : null),
    [open, pick, measured, L, room, items, wall],
  )

  // prévia na cena: as paredes que andam, na posição nova
  useEffect(() => {
    const st = useStore.getState()
    if (!plan) return st.setWallPreview(null)
    st.setWallPreview(
      plan.result.moved.map((m) => {
        const w = plan.result.room.walls.find((x) => x.id === m.wallId)!
        return { a: w.a, b: w.b, h: w.height }
      }),
    )
  }, [plan])
  useEffect(() => () => useStore.getState().setWallPreview(null), [])

  const edits = (room.wallEdits ?? []).filter((e) => {
    const w = room.walls.find((x) => x.id === e.wallId)
    return w && w.spaceId === wall.spaceId
  })

  if (!open)
    return (
      <>
        <p className="hint" style={{ marginTop: 0 }}>
          Por dentro, de quina a quina: <b>{fmtCm(L)}</b>. Se a trena der outro valor, corrija aqui — a parede da quina que você escolher anda, e o
          resto acompanha.
        </p>
        {edits.length > 0 && (
          <p className="hint">
            Já corrigido neste cômodo:{' '}
            {edits.map((e, i) => {
              const w = room.walls.find((x) => x.id === e.wallId)!
              return (
                <span key={i}>
                  {i > 0 && ', '}
                  {short(room, w)} {e.delta < 0 ? 'para fora' : 'para dentro'} {fmtCm(Math.abs(e.delta))}
                </span>
              )
            })}
            .
          </p>
        )}
        <div className="btn-row">
          <button
            className="btn"
            disabled={!choices.length}
            title={choices.length ? 'Digite a medida da trena e veja antes o que muda' : 'Esta parede não tem quinas com outras paredes do cômodo'}
            onClick={() => {
              setMeasured(L)
              setEnd(null)
              setOpen(true)
            }}
          >
            <Icon name="ruler" size={16} /> Conferir e corrigir medida…
          </button>
        </div>
      </>
    )

  const leftIsA = wallLeftIsA(wall)
  const side = (k: 'a' | 'b') => ((k === 'a') === leftIsA ? 'esquerda' : 'direita')
  const diff = measured - L
  const r = plan?.result
  const spaceName = (id: string) => room.spaces?.find((s) => s.id === id)?.name ?? 'Cômodo'
  // cômodos que mudam de tamanho (antes → depois)
  const resized = (r?.room.spaces ?? [])
    .map((s) => {
      const before = room.spaces?.find((x) => x.id === s.id)
      return before && before.floor !== s.floor
        ? { name: s.name, a: spaceDims(before), b: spaceDims(s), areaA: polyArea(before.floor), areaB: polyArea(s.floor) }
        : null
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
  const neighbors = r ? r.moved.filter((m) => m.wallId !== plan!.endWall.id).map((m) => room.walls.find((w) => w.id === m.wallId)!) : []
  const movedItems = plan ? [...plan.items.entries()].map(([id, p]) => ({ it: items.find((i) => i.id === id)!, p })) : []

  return (
    <div className="wm">
      <NumberField label="Medida da trena (por dentro, de quina a quina)" value={measured} min={0.1} max={50} onCommit={setMeasured} />
      {choices.length > 1 && (
        <>
          <div className="field-label">Qual quina anda</div>
          <div className="chip-row">
            {choices.map((k) => (
              <button key={k} className={`chip${pick === k ? ' is-on' : ''}`} onClick={() => setEnd(k)} title={wallName(room, ends[k]!)}>
                Quina da {side(k)}: {short(room, ends[k]!)}
              </button>
            ))}
          </div>
        </>
      )}
      {Math.abs(diff) <= 0.0005 ? (
        <>
          <p className="hint">Digite a medida da trena para ver o que muda. Se ela bate com a do scan, é só marcar como conferida.</p>
          {!isChecked(room, wallKey(wall.id)) && (
            <div className="btn-row">
              <button
                className="btn"
                onClick={() => {
                  useStore.getState().setCheck([wallKey(wall.id)], { state: 'conferida', at: new Date().toISOString(), note: `trena ${fmtCm(L)}` })
                  setOpen(false)
                }}
              >
                <Icon name="check" size={16} /> A medida bate — marcar como conferida
              </button>
            </div>
          )}
        </>
      ) : !plan ? (
        <p className="hint warn">Não dá para corrigir por esta quina.</p>
      ) : (
        <div className="wm-sum">
          <b>
            {short(room, plan.endWall)} anda {fmtCm(Math.abs(plan.edit.delta))} {plan.edit.delta < 0 ? 'para fora' : 'para dentro'}
          </b>
          <ul>
            {resized.map((x) => (
              <li key={x.name}>
                {x.name}: {fmtCmShort(x.a.w)} × {fmtCmShort(x.a.d)} cm ({fmtM2(x.areaA)}) →{' '}
                <b>
                  {fmtCmShort(x.b.w)} × {fmtCmShort(x.b.d)} cm ({fmtM2(x.areaB)})
                </b>
              </li>
            ))}
            {neighbors.length > 0 ? (
              <li>
                Do outro lado anda junto (mesma espessura): {neighbors.map((w) => short(room, w)).join(', ')}
              </li>
            ) : (
              <li>Parede externa: a casa {plan.edit.delta < 0 ? 'cresce' : 'diminui'} {fmtCm(Math.abs(plan.edit.delta))} desse lado.</li>
            )}
            {r!.stretched.length > 0 && (
              <li>
                {r!.stretched.length === 1 ? 'Muda de comprimento' : 'Mudam de comprimento'}:{' '}
                {r!.stretched
                  .map((s) => `${short(room, room.walls.find((w) => w.id === s.wallId)!)} (${fmtCmShort(s.from)} → ${fmtCmShort(s.to)})`)
                  .join(', ')}
                . Portas, janelas e azulejos delas ficam no mesmo lugar.
              </li>
            )}
            {movedItems.length > 0 && (
              <li>
                Móveis encostados que acompanham:{' '}
                {movedItems.map(({ it, p }) => `${it.name}${p.width !== undefined || p.depth !== undefined ? ' (estica)' : ''}`).join(', ')}
              </li>
            )}
          </ul>
          {r!.overflow.length > 0 && (
            <p className="hint warn">
              {r!.overflow.length === 1 ? 'Uma porta/janela não cabe' : `${r!.overflow.length} portas/janelas não cabem`} mais na parede encurtada — mude de lugar antes de
              corrigir.
            </p>
          )}
          {neighbors.length > 0 && (
            <p className="hint">
              {[...new Set(neighbors.map((w) => w.spaceId).filter(Boolean))].map((id) => spaceName(id!)).join(', ')} também muda de tamanho. Se o vizinho estiver certo e só este
              cômodo errado, corrija pela outra quina.
            </p>
          )}
        </div>
      )}
      <div className="btn-row">
        <button
          className="btn primary"
          disabled={!plan || r!.overflow.length > 0}
          onClick={() => {
            useStore.getState().correctWall(plan!, { key: wallKey(wall.id), note: `trena ${fmtCm(measured)}` })
            useStore.getState().notify(`Medida corrigida e marcada como conferida: ${fmtCm(measured)} — Ctrl+Z desfaz`)
            setOpen(false)
          }}
        >
          Aplicar correção
        </button>
        <button className="btn ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <p className="hint">Fica guardado como correção sobre o scan (o scan não muda) e vale também se a casa for remontada.</p>
    </div>
  )
}
