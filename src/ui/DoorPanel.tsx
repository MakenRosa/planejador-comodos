/** Painel da porta: tipo (abrir/correr), folha (madeira ou vidro), acabamentos e maçaneta. */
import { useEffect, useRef, type ReactNode } from 'react'
import { DEFAULT_FRAME, DEFAULT_LEAF, defaultRailDepth, DOOR_FINISHES, finishInfo, GLASS_TINTS, HANDLE_FINISHES, HANDLE_MODELS, handleModelOf, toneWood, veinOf } from '../lib/doors'
import { isSliding, slidingLayout, wallLength, wallLeftIsA } from '../lib/geom'
import type { DoorType, Opening, Room } from '../lib/types'
import { fmtCm } from '../lib/util'
import { useStore } from '../store'
import { Check, NumberField, Section } from './fields'
import { Icon } from './Icon'

const woodSwatch = (w: [string, string]) => `repeating-linear-gradient(96deg, ${w[0]} 0 3px, ${w[1]} 3px 4px, ${w[0]} 4px 7px)`

/** Seletor de cor que só aplica quando a pessoa para de mexer (cada cor de madeira gera uma textura). */
function LazyColor({ value, onChange, children, title }: { value: string; onChange: (v: string) => void; children: ReactNode; title: string }) {
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <label className="colorf-custom" title={title}>
      <input
        type="color"
        value={value}
        onChange={(e) => {
          const v = e.target.value
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => onChange(v), 220)
        }}
      />
      {children}
    </label>
  )
}

/** Amostras de acabamento (madeiras com listras de veio), madeira na cor que quiser e cor lisa. */
function FinishField({ label, value, def, onChange }: { label: string; value?: string; def: string; onChange: (v: string) => void }) {
  const cur = finishInfo(value, def)
  const plain = cur.id.startsWith('#')
  const wood = cur.wood
  return (
    <div className="colorf">
      <div className="colorf-head">
        <span>
          {label}: <b>{cur.label}</b>
        </span>
      </div>
      <div className="swatches">
        {DOOR_FINISHES.map((f) => (
          <button key={f.id} className={`sw${f.id === cur.id ? ' is-on' : ''}`} style={{ background: f.wood ? woodSwatch(f.wood) : f.color }} title={f.label} onClick={() => onChange(f.id)} />
        ))}
      </div>
      <div className="finish-tools">
        <LazyColor value={wood ? wood[0] : '#7a3324'} onChange={(v) => onChange(`wood:${v}`)} title="Escolha a cor de fundo da madeira — o veio é gerado a partir dela">
          <span style={{ background: woodSwatch(wood ?? ['#7a3324', veinOf('#7a3324')]) }} />
          Madeira na cor…
        </LazyColor>
        {wood && (
          <>
            <button className="btn small" title="Mesma madeira, mais escura" onClick={() => onChange(`wood:${toneWood(wood[0], 0.82)}`)}>
              Mais escura
            </button>
            <button className="btn small" title="Mesma madeira, mais clara" onClick={() => onChange(`wood:${toneWood(wood[0], 1.18)}`)}>
              Mais clara
            </button>
          </>
        )}
        <LazyColor value={plain ? cur.color : '#ffffff'} onChange={onChange} title="Cor lisa (sem veio)">
          <span style={{ background: plain ? cur.color : '#ffffff' }} />
          Cor lisa…
        </LazyColor>
      </div>
    </div>
  )
}

/** A folha de correr cabe na parede e não passa por cima de outra abertura? */
function slidingProblem(op: Opening, room: Room): string | null {
  const wall = room.walls.find((w) => w.id === op.wallId)
  if (!wall) return null
  const { rail } = slidingLayout(op)
  const L = wallLength(wall)
  if (rail[0] < -0.01 || rail[1] > L + 0.01) return 'O trilho passa da ponta da parede deste lado — inverta o lado para onde a porta corre ou diminua a largura.'
  const clash = room.openings.find((o) => o.wallId === wall.id && o.id !== op.id && o.offset + o.width / 2 > rail[0] && o.offset - o.width / 2 < rail[1])
  if (clash) return `A folha aberta passa por cima ${clash.kind === 'window' ? 'da janela' : 'de outra abertura'} desta parede — inverta o lado para onde ela corre.`
  return null
}

export function DoorSection({ op, room }: { op: Opening; room: Room }) {
  const update = useStore((s) => s.updateOpening)
  const up = (p: Partial<Opening>) => update(op.id, p)
  const sliding = isSliding(op)
  const wall = room.walls.find((w) => w.id === op.wallId)
  // lado (visto de dentro do cômodo desta parede) para onde a folha corre
  const towardA = !op.hingeAtEnd
  const leftIsA = wall ? wallLeftIsA(wall) : true
  const runsLeft = towardA === leftIsA
  const problem = sliding ? slidingProblem(op, room) : null
  const models = HANDLE_MODELS.filter((h) => (sliding ? h.sliding : h.swing))
  return (
    <>
      <Section title="Porta">
        <div className="grid2">
          <label className="field">
            <span>Tipo</span>
            <select value={op.doorType ?? 'swing'} onChange={(e) => up({ doorType: e.target.value as DoorType })}>
              <option value="swing">De abrir</option>
              <option value="sliding">De correr (com trilho)</option>
            </select>
          </label>
          <label className="field">
            <span>Folha</span>
            <select value={op.glass ? 'vidro' : 'madeira'} onChange={(e) => up({ glass: e.target.value === 'vidro' })}>
              <option value="madeira">Madeira / MDF</option>
              <option value="vidro">Vidro temperado</option>
            </select>
          </label>
        </div>
        <Check label={sliding ? 'Mostrar porta aberta (corrida)' : 'Mostrar porta aberta (3D)'} checked={op.isOpen} onChange={(v) => up({ isOpen: v })} />
        <Check
          label={sliding ? (op.pairId ? 'Trilho do lado do outro cômodo' : 'Trilho do lado de fora do cômodo') : op.pairId ? 'Abre para o outro cômodo' : 'Abre para fora do cômodo'}
          checked={op.swingOut}
          onChange={(v) => up({ swingOut: v })}
        />
        <div className="btn-row">
          <button className="btn" onClick={() => up({ hingeAtEnd: !op.hingeAtEnd })}>
            <Icon name="rotR" size={16} /> {sliding ? `Correr para a ${runsLeft ? 'direita' : 'esquerda'}` : 'Trocar lado da dobradiça'}
          </button>
        </div>
        {sliding && (
          <NumberField
            label="Profundidade (trilho + porta)"
            value={op.railDepth ?? defaultRailDepth(op)}
            min={0.02}
            max={0.3}
            onCommit={(v) => up({ railDepth: v })}
            title="Quanto o trilho e a folha saem da parede (até a face de fora da folha, sem o puxador)"
          />
        )}
        {sliding ? (
          <p className={problem ? 'hint warn' : 'hint'}>
            {problem ??
              `A folha corre por fora da parede, para a ${runsLeft ? 'esquerda' : 'direita'} (vista de dentro do cômodo): precisa de ${fmtCm(op.width + 0.1)} de parede livre ao lado do vão. O tracejado no piso (Exibir → Giro das portas) mostra o curso.`}
          </p>
        ) : (
          <p className="hint">O arco tracejado no piso mostra a área de giro da porta. Móveis dentro dela geram alerta.</p>
        )}
      </Section>
      <Section title="Acabamento">
        {op.glass ? (
          <label className="field">
            <span>Vidro</span>
            <select value={op.glassTint ?? 'incolor'} onChange={(e) => up({ glassTint: e.target.value })}>
              {GLASS_TINTS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <FinishField label="Folha" value={op.leafFinish} def={DEFAULT_LEAF} onChange={(v) => up({ leafFinish: v })} />
        )}
        <FinishField label="Batente e alisar" value={op.frameFinish} def={DEFAULT_FRAME} onChange={(v) => up({ frameFinish: v })} />
        <div className="grid2">
          <label className="field">
            <span>{sliding || op.glass ? 'Puxador' : 'Maçaneta'}</span>
            <select value={handleModelOf(op)} onChange={(e) => up({ handle: e.target.value })}>
              {models.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Metal</span>
            <select value={op.handleFinish ?? (sliding && !op.glass ? 'preto' : op.glass ? 'inox' : 'cromado')} onChange={(e) => up({ handleFinish: e.target.value })}>
              {HANDLE_FINISHES.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {sliding && <p className="hint">Na porta de correr, o metal vale também para o trilho e as roldanas. Do lado da parede vai uma concha embutida (o puxador bateria no alisar).</p>}
      </Section>
    </>
  )
}
