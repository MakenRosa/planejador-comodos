import { useEffect, useState } from 'react'
import { panelSpan, wallLength, wallName } from '../lib/geom'
import { DEFAULT_WALL_COLOR, findPattern, PATTERNS, patternThumb, WALL_PAINTS } from '../lib/patterns'
import { GROUT_COLORS, TILE_COLORS, TILES } from '../lib/tiles'
import type { Opening, Room, Wall, WallPanel, WallPanelKind } from '../lib/types'
import { fmtCm, fmtCmShort, fmtM2, uid } from '../lib/util'
import { useStore } from '../store'
import { ColorField, NumberField, Section } from './fields'
import { Icon } from './Icon'
import { BaseboardFields } from './BaseboardFields'
import { WallMeasure } from './WallMeasure'
import { CheckControl, CheckTag } from './MeasureChecks'
import { wallKey } from '../lib/checks'
import type { Baseboard } from '../lib/types'

/** Área do retângulo [s0,s1]×[v0,v1] descontando portas e janelas da parede. */
function netArea(wall: Wall, ops: Opening[], s0: number, s1: number, v0: number, v1: number) {
  let a = Math.max(0, s1 - s0) * Math.max(0, v1 - v0)
  for (const o of ops) {
    const ow = Math.min(s1, o.offset + o.width / 2) - Math.max(s0, o.offset - o.width / 2)
    const oh = Math.min(v1, o.bottom + o.height, wall.height) - Math.max(v0, o.bottom)
    if (ow > 0 && oh > 0) a -= ow * oh
  }
  return Math.max(0, a)
}

function panelArea(wall: Wall, ops: Opening[], p: WallPanel) {
  const L = wallLength(wall)
  const [a, b] = panelSpan(wall, p.left, p.width)
  return netArea(wall, ops, Math.max(0, a), Math.min(L, b), Math.max(0, p.bottom), Math.min(wall.height, p.bottom + p.height))
}

/** Rolos padrão de papel de parede (0,53 × 10 m = 5,3 m²), com 10% de sobra para emendas. */
const rolls = (area: number) => Math.max(1, Math.ceil((area * 1.1) / 5.3))

/** Tamanho da peça (largura × altura) de um azulejo, em metros. */
function tileSize(p: WallPanel): [number, number] {
  const def = findPattern(p.pattern)
  const w = p.scale / (def.across ?? 1)
  return [w, w * (def.ratio ?? 1)]
}

/** Peças para cobrir a área, com 10% de quebra. */
function tilePieces(p: WallPanel, area: number) {
  const [w, h] = tileSize(p)
  return Math.max(1, Math.ceil((area * 1.1) / (w * h)))
}

function TileFields({ p, onChange }: { p: WallPanel; onChange: (c: Partial<WallPanel>) => void }) {
  const def = findPattern(p.pattern)
  const [w, h] = tileSize(p)
  const [l1, l2] = def.labels ?? ['Cor do azulejo', 'Cor do rejunte']
  const across = def.across ?? 1
  return (
    <>
      <div className="field-label">Modelo</div>
      <div className="pattern-grid">
        {TILES.map((pt) => (
          <button key={pt.id} className={`pt${pt.id === p.pattern ? ' is-on' : ''}`} title={pt.name} onClick={() => onChange({ pattern: pt.id, color: pt.c1, color2: pt.c2, scale: pt.scale })}>
            <span style={{ backgroundImage: `url(${patternThumb(pt.id, pt.c1, pt.c2)})` }} />
            <small>{pt.name}</small>
          </button>
        ))}
      </div>
      <ColorField label={l1} value={p.color} palette={TILE_COLORS} onChange={(c) => onChange({ color: c })} />
      <ColorField label={l2} value={p.color2} palette={l2 === 'Cor do rejunte' ? GROUT_COLORS : TILE_COLORS} onChange={(c) => onChange({ color2: c })} />
      <NumberField label="Largura da peça" value={w} min={0.01} max={3 / across} onCommit={(v) => onChange({ scale: v * across })} title="A altura acompanha a proporção do modelo" />
      <p className="hint" style={{ marginTop: 4 }}>
        Peça de {fmtCmShort(w)} × {fmtCmShort(h)} cm. As peças começam inteiras no canto de baixo à esquerda da área.
      </p>
    </>
  )
}

function PanelCard({
  wall,
  ops,
  p,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  wall: Wall
  ops: Opening[]
  p: WallPanel
  open: boolean
  onToggle: () => void
  onChange: (c: Partial<WallPanel>) => void
  onRemove: () => void
}) {
  const L = wallLength(wall)
  const H = wall.height
  const full = p.left <= 0.001 && Math.abs(p.width - L) < 0.003 && p.bottom <= 0.001 && Math.abs(p.height - H) < 0.003
  const area = panelArea(wall, ops, p)
  const summary = full
    ? 'Parede inteira'
    : `${fmtCmShort(p.width)} × ${fmtCmShort(p.height)} cm · ${fmtCmShort(p.left)} cm da esquerda, ${fmtCmShort(p.bottom)} cm do piso`
  return (
    <div className={`wp-card${open ? ' is-open' : ''}`} data-panel={p.id}>
      <button className="wp-head" onClick={onToggle}>
        <span
          className="wp-swatch"
          style={p.kind !== 'paint' ? { backgroundImage: `url(${patternThumb(p.pattern, p.color, p.color2)})` } : { background: p.color }}
        />
        <span className="wp-title">
          <b>{p.kind === 'wallpaper' ? `Papel: ${findPattern(p.pattern).name}` : p.kind === 'tile' ? `Azulejo: ${findPattern(p.pattern).name}` : 'Faixa de tinta'}</b>
          <small>{summary}</small>
        </span>
        <span className="sec-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="wp-body">
          {p.kind === 'tile' ? (
            <TileFields p={p} onChange={onChange} />
          ) : p.kind === 'wallpaper' ? (
            <>
              <div className="field-label">Estampa</div>
              <div className="pattern-grid">
                {PATTERNS.map((pt) => (
                  <button
                    key={pt.id}
                    className={`pt${pt.id === p.pattern ? ' is-on' : ''}`}
                    title={pt.name}
                    onClick={() => onChange({ pattern: pt.id, color: pt.c1, color2: pt.c2, scale: pt.scale })}
                  >
                    <span style={{ backgroundImage: `url(${patternThumb(pt.id, pt.c1, pt.c2)})` }} />
                    <small>{pt.name}</small>
                  </button>
                ))}
              </div>
              <ColorField label="Cor de fundo" value={p.color} palette={WALL_PAINTS} onChange={(c) => onChange({ color: c })} />
              <ColorField label="Cor do desenho" value={p.color2} palette={WALL_PAINTS} onChange={(c) => onChange({ color2: c })} />
              <NumberField label="Tamanho da estampa (repetição)" value={p.scale} min={0.05} max={3} onCommit={(v) => onChange({ scale: v })} />
            </>
          ) : (
            <ColorField label="Cor da faixa" value={p.color} palette={WALL_PAINTS} onChange={(c) => onChange({ color: c, color2: c })} />
          )}

          <div className="field-label">Área coberta</div>
          <div className="chip-row">
            <button className="chip" onClick={() => onChange({ left: 0, width: L, bottom: 0, height: H })}>
              Parede inteira
            </button>
            <button className="chip" onClick={() => onChange({ left: 0, width: L, bottom: 0, height: Math.min(1.1, H) })}>
              Meia-parede (até 1,10 m)
            </button>
            <button className="chip" onClick={() => onChange({ left: 0, width: L, bottom: Math.min(1.1, H - 0.1), height: Math.max(0.1, H - 1.1) })}>
              Parte de cima
            </button>
            <button
              className="chip"
              onClick={() => {
                const w = Math.min(1.6, L)
                onChange({ left: (L - w) / 2, width: w, bottom: 0, height: H })
              }}
            >
              Faixa central 1,60 m
            </button>
          </div>
          <div className="grid2">
            <NumberField label="Início (da esquerda)" value={p.left} min={0} max={L - 0.01} onCommit={(v) => onChange({ left: v, width: Math.min(p.width, L - v) })} />
            <NumberField label="Largura" value={p.width} min={0.01} max={L} onCommit={(v) => onChange({ width: Math.min(v, L - p.left) })} />
            <NumberField label="Altura do piso" value={p.bottom} min={0} max={H - 0.01} onCommit={(v) => onChange({ bottom: v, height: Math.min(p.height, H - v) })} />
            <NumberField label="Altura" value={p.height} min={0.01} max={H} onCommit={(v) => onChange({ height: Math.min(v, H - p.bottom) })} />
          </div>
          <p className="hint">
            Área: <b>{fmtM2(area)}</b> (sem portas/janelas)
            {p.kind === 'wallpaper' && ` · ≈ ${rolls(area)} rolo(s) de 0,53 × 10 m com 10% de sobra`}
            {p.kind === 'tile' && ` · ≈ ${tilePieces(p, area)} peças com 10% de quebra`}. "Esquerda" = como você vê a parede de dentro do cômodo.
          </p>
          <div className="btn-row">
            <button className="btn danger" onClick={onRemove}>
              <Icon name="trash" size={16} /> Remover
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function WallPanelView({ wall, room }: { wall: Wall; room: Room }) {
  const updateWall = useStore((s) => s.updateWall)
  const updateAll = useStore((s) => s.updateAllWalls)
  const addOpening = useStore((s) => s.addOpening)
  const select = useStore((s) => s.select)
  const L = wallLength(wall)
  const H = wall.height
  const panels = wall.panels ?? []
  const ops = room.openings.filter((o) => o.wallId === wall.id)
  const [openId, setOpenId] = useState<string | null>(panels.length ? panels[panels.length - 1].id : null)
  const setPanels = (p: WallPanel[]) => updateWall(wall.id, { panels: p })
  const patch = (id: string, c: Partial<WallPanel>) => setPanels(panels.map((p) => (p.id === id ? { ...p, ...c } : p)))

  const add = (kind: WallPanelKind) => {
    const pt = kind === 'tile' ? TILES[0] : PATTERNS[0]
    const p: WallPanel =
      kind !== 'paint'
        ? { id: uid(), kind, pattern: pt.id, color: pt.c1, color2: pt.c2, scale: pt.scale, left: 0, width: L, bottom: 0, height: H }
        : { id: uid(), kind, pattern: '', color: '#a9b8a0', color2: '#a9b8a0', scale: 1, left: 0, width: L, bottom: 0, height: Math.min(1.1, H) }
    setPanels([...panels, p])
    setOpenId(p.id)
    setReveal(p.id)
  }
  // o editor do item novo abre embaixo, fora da vista: rola até ele
  const [reveal, setReveal] = useState<string | null>(null)
  useEffect(() => {
    if (!reveal) return
    document.querySelector(`[data-panel="${reveal}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setReveal(null)
  }, [reveal])

  const wallArea = netArea(wall, ops, 0, L, 0, H)
  const roomWalls = wall.spaceId ? room.walls.filter((w) => w.spaceId === wall.spaceId) : [wall]
  // um passo só no histórico para várias paredes
  const applyBaseboard = (walls: Wall[], b: Baseboard | undefined) => {
    useStore.getState().commit()
    for (const w of walls) updateWall(w.id, { baseboard: b ? { ...b } : undefined }, false)
  }
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="title-static">
          <Icon name="wall" /> {wallName(room, wall)}
        </div>
        <div className="panel-sub">
          {fmtCm(L)} × {fmtCm(H)} · {fmtM2(wallArea)} de parede (sem portas/janelas) <CheckTag room={room} checkKey={wallKey(wall.id)} />
        </div>
      </div>

      {/* recolhida: quem só pinta não entra no ajuste da geometria sem querer */}
      <Section title="Medida e correção" defaultOpen={false}>
        <CheckControl room={room} checkKey={wallKey(wall.id)} label="Comprimento conferido com trena?" />
        <WallMeasure key={wall.id} wall={wall} room={room} />
      </Section>

      <Section title={`Portas e janelas (${ops.filter((o) => !o.ghost).length})`}>
        <div className="btn-row">
          <button className="btn" onClick={() => addOpening(wall.id, 'door')} title="Cria uma porta no trecho mais livre desta parede (entre cômodos, abre a parede do vizinho também)">
            <Icon name="plus" size={16} /> Porta
          </button>
          <button className="btn" onClick={() => addOpening(wall.id, 'window')} title="Cria uma janela de correr no trecho mais livre desta parede">
            <Icon name="plus" size={16} /> Janela
          </button>
        </div>
        {ops.some((o) => !o.ghost) && (
          <div className="btn-row">
            {ops
              .filter((o) => !o.ghost)
              .map((o) => (
                <button key={o.id} className="btn ghost" onClick={() => select({ kind: 'opening', id: o.id })}>
                  <Icon name={o.kind === 'window' ? 'window' : 'door'} size={14} /> {o.kind === 'door' ? 'Porta' : o.kind === 'window' ? 'Janela' : 'Vão'} {fmtCm(o.width)}
                </button>
              ))}
          </div>
        )}
        <p className="hint">Para mudar de lugar: selecione a porta/janela e arraste na cena (janelas também passam para outra parede).</p>
      </Section>

      <Section title="Pintura">
        <ColorField label="Cor da tinta" palette={WALL_PAINTS} value={wall.paint ?? DEFAULT_WALL_COLOR} onChange={(c) => updateWall(wall.id, { paint: c })} />
        <div className="btn-row">
          <button className="btn" onClick={() => updateAll({ paint: wall.paint ?? DEFAULT_WALL_COLOR })}>
            Aplicar em todas as paredes
          </button>
          <button className="btn ghost" onClick={() => updateWall(wall.id, { paint: undefined })}>
            Voltar ao branco
          </button>
        </div>
      </Section>

      <Section title="Rodapé">
        <BaseboardFields value={wall.baseboard} onChange={(b) => updateWall(wall.id, { baseboard: b })} />
        <div className="btn-row">
          {roomWalls.length > 1 && (
            <button className="btn" onClick={() => applyBaseboard(roomWalls, wall.baseboard)} title="Mesmo rodapé (ou nenhum) em todas as paredes deste cômodo">
              Aplicar no cômodo ({roomWalls.length} paredes)
            </button>
          )}
          <button className="btn ghost" onClick={() => applyBaseboard(room.walls, wall.baseboard)} title="Mesmo rodapé (ou nenhum) em todas as paredes da casa">
            Aplicar na casa toda
          </button>
        </div>
        <p className="hint">O rodapé para sozinho nas portas (encosta no alisar) e nas passagens até o piso.</p>
      </Section>

      <Section title={`Azulejo, papel de parede e faixas (${panels.length})`}>
        {panels.length === 0 && (
          <p className="hint" style={{ marginTop: 0 }}>
            Cubra a parede inteira ou só uma parte — por exemplo, azulejo até o teto no box, papel de parede atrás da cama ou uma meia-parede pintada.
            Portas e janelas ficam livres automaticamente.
          </p>
        )}
        <div className="wp-list">
          {panels.map((p) => (
            <PanelCard
              key={p.id}
              wall={wall}
              ops={ops}
              p={p}
              open={openId === p.id}
              onToggle={() => setOpenId(openId === p.id ? null : p.id)}
              onChange={(c) => patch(p.id, c)}
              onRemove={() => setPanels(panels.filter((x) => x.id !== p.id))}
            />
          ))}
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => add('tile')}>
            <Icon name="plus" size={16} /> Azulejo
          </button>
          <button className="btn" onClick={() => add('wallpaper')}>
            <Icon name="plus" size={16} /> Papel de parede
          </button>
          <button className="btn" onClick={() => add('paint')}>
            <Icon name="plus" size={16} /> Faixa de tinta
          </button>
        </div>
      </Section>
    </div>
  )
}
