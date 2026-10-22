import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motorRange } from '../lib/stack'
import { CATALOG, TYPES } from '../furniture/catalog'
import { DESK_FRAME_MAX, DESK_FRAME_MIN } from '../furniture/extras'
import { showerSpots } from '../furniture/builders'
import { spaceOfPoint } from '../lib/focus'
import { useAnalysis } from '../hooks'
import { distanceAlong } from '../lib/clearance'
import { floorArea, footprint, polyArea, roomBounds, wallDir, wallLeftIsA, wallLength, wallName } from '../lib/geom'
import { elevationBelow, fitCurtainToWindow, itemsFromScan, nearestWindow, scanCategoryName, surfaceBelow } from '../lib/placement'
import { ARM_MAX, armCount, armReach, armSlots, armSlotsFull, isArm, keepApart, moveSlot, type ArmSlot } from '../lib/arms'
import type { FurnitureGroup, FurnitureItem, Measurement, Opening, OptionValue, Room, Vec2, WindowType } from '../lib/types'
import { fmtCm, fmtCmShort, fmtDim, fmtM, fmtM2, normAngle, toDeg } from '../lib/util'
import { measureText } from '../scene/Overlays'
import { selectedItem, useStore } from '../store'
import { AngleField, Check, ColorField, LengthSlider, NumberField, RangeField, Section, TextField } from './fields'
import { WallPanelView } from './WallPanel'
import { DoorSection } from './DoorPanel'
import { SpacePanel, spaceDims } from './SpacePanel'
import { Icon } from './Icon'
import { CheckControl, CheckTag, ChecksSummary, FitWarning } from './MeasureChecks'
import { listChecks, openingKey, stateOf } from '../lib/checks'

const DEG = 180 / Math.PI

function Alerts({ itemId }: { itemId?: string }) {
  const { warnings } = useAnalysis()
  const select = useStore((s) => s.select)
  const list = itemId ? warnings.filter((w) => w.itemId === itemId) : warnings
  if (!list.length) return null
  return (
    <div className="alerts">
      {list.map((w, i) => (
        <button key={i} className={`alert alert-${w.level}`} onClick={() => select({ kind: 'item', id: w.itemId })}>
          <Icon name="alert" size={15} />
          <span>{w.message}</span>
        </button>
      ))}
    </div>
  )
}

/** Giro para mostrar: 0–359° (um giro de 359,99° — comum no scan — aparecia como 360°). */
const shownRotation = (r: number) => {
  const n = normAngle(r)
  return n > 2 * Math.PI - 0.5 / DEG ? 0 : n
}

function ItemPanel({ item }: { item: FurnitureItem }) {
  const def = TYPES[item.type] ?? TYPES.box
  const update = useStore((s) => s.updateItem)
  const resize = useStore((s) => s.resizeItem)
  const remove = useStore((s) => s.removeItem)
  const duplicate = useStore((s) => s.duplicateItem)
  const replace = useStore((s) => s.replaceItem)
  const keepRatio = useStore((s) => s.settings.keepRatio)
  const setSettings = useStore((s) => s.setSettings)
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  const asset = useStore((s) => (item.assetId ? s.assets[item.assetId] : undefined))
  const up = (p: Partial<FurnitureItem>) => update(item.id, p)

  const preset = def.presets?.find(
    (p) => Math.abs(p.w - item.width) < 0.0005 && Math.abs(p.d - item.depth) < 0.0005 && Math.abs(p.h - item.height) < 0.0005,
  )

  const push = (dir: Vec2) => {
    if (!room) return
    const d = distanceAlong(item, dir, room, items)
    if (d === null || Math.abs(d) < 0.0005) return
    up({ x: item.x + dir[0] * d, z: item.z + dir[1] * d })
  }
  const b = room ? roomBounds(room) : null

  return (
    <div className="panel">
      <div className="panel-head">
        <TextField className="title-input" value={item.name} onCommit={(v) => up({ name: v })} />
        <div className="panel-sub">
          {def.name}
          {item.fromScan && <span className="tag">do scan</span>}
          {item.locked && <span className="tag">travado</span>}
        </div>
        <div className="row-actions">
          <button className="btn" onClick={() => useStore.getState().focusItem(item.attachedTo ?? item.id)} title="Levar a câmera até este móvel e girar em volta dele (F ou duplo clique)">
            <Icon name="center" size={16} /> Focar
          </button>
          <button className="btn" onClick={() => duplicate(item.id)} title="Duplicar (Ctrl+D)">
            <Icon name="copy" size={16} /> Duplicar
          </button>
          <button className={`btn${item.locked ? ' is-on' : ''}`} onClick={() => up({ locked: !item.locked })} title="Travar posição (L)">
            <Icon name={item.locked ? 'lock' : 'unlock'} size={16} /> {item.locked ? 'Travado' : 'Travar'}
          </button>
          <button className="btn danger" onClick={() => remove(item.id)} title="Excluir (Delete)">
            <Icon name="trash" size={16} />
          </button>
        </div>
        <button className="link-btn multi-start" onClick={() => useStore.getState().setMultiMode(true)} title="Escolher outros móveis junto com este para mover, girar, duplicar ou editar de uma vez (atalho: Shift + clique)">
          <Icon name="select" size={14} /> Selecionar vários
        </button>
        {item.type !== 'custom' && (
          <label className="field swap-field" title="Troca este móvel por outro do catálogo no mesmo lugar (traseira encostada onde está), levando junto o que está em cima">
            <span>Trocar por outro modelo</span>
            <select value="" onChange={(e) => e.target.value && replace(item.id, e.target.value)}>
              <option value="">Escolher no catálogo…</option>
              {CATALOG.map((c) => (
                <optgroup key={c.category} label={c.category}>
                  {c.entries.map((en) => (
                    <option key={en.key} value={en.key}>
                      {en.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
      </div>
      <Alerts itemId={item.id} />
      {room && <FitWarning item={item} room={room} items={items} />}
      {item.type === 'standingDesk' && <DeskHeight item={item} />}

      <Section
        title="Dimensões"
        right={
          <button className={`icon-btn${keepRatio ? ' is-on' : ''}`} title="Manter proporção ao redimensionar" onClick={() => setSettings({ keepRatio: !keepRatio })}>
            <Icon name="link" size={15} />
          </button>
        }
      >
        {def.presets && (
          <label className="field">
            <span>Tamanho padrão</span>
            <select
              value={preset?.label ?? ''}
              onChange={(e) => {
                const p = def.presets!.find((x) => x.label === e.target.value)
                if (p) update(item.id, { width: p.w, depth: p.d, height: p.h })
              }}
            >
              <option value="">Personalizado</option>
              {def.presets.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label} — {fmtDim(p.w, p.d, p.h)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid3">
          <NumberField label="Largura" value={item.width} min={0.01} onCommit={(v) => resize(item.id, { width: v })} />
          <NumberField label="Profundidade" value={item.depth} min={0.01} onCommit={(v) => resize(item.id, { depth: v })} />
          <NumberField label="Altura" value={item.height} min={0.005} onCommit={(v) => resize(item.id, { height: v })} />
        </div>
        <p className="hint">
          Ocupa {fmtM2(item.width * item.depth)} de piso.
          {asset && ` Tamanho original do modelo: ${fmtDim(asset.size[0], asset.size[2], asset.size[1])}.`}
        </p>
      </Section>

      <Section title="Posição">
        <div className="grid2">
          <NumberField label="Centro X" value={item.x} onCommit={(v) => up({ x: v })} disabled={item.locked} title="Distância do centro do móvel até a origem (canto superior esquerdo da planta)" />
          <NumberField label="Centro Z" value={item.z} onCommit={(v) => up({ z: v })} disabled={item.locked} />
          <NumberField
            label="Distância do piso"
            value={item.elevation}
            min={0}
            onCommit={(v) => up({ elevation: v })}
            disabled={item.locked || !!item.attachedTo}
            title={item.attachedTo ? 'Preso ao braço: ajuste a altura no braço articulado' : 'Elevação da base do móvel — para móveis suspensos, prateleiras, TVs, ar-condicionado'}
          />
          <NumberField label="Rotação" unit="°" scale={DEG} step={1} value={shownRotation(item.rotation)} onCommit={(v) => up({ rotation: normAngle(v) })} disabled={item.locked} />
        </div>
        <div className="btn-row">
          <span className="align-label">Altura</span>
          <button className="btn" disabled={item.locked || !!item.attachedTo || item.elevation === 0} onClick={() => up({ elevation: 0 })} title="Colocar no piso">
            <Icon name="down" size={16} /> No piso
          </button>
          <button
            className="btn"
            disabled={item.locked || !!item.attachedTo}
            title="Apoiar em cima do móvel que está embaixo (ex.: TV sobre o rack)"
            onClick={() => {
              const top = surfaceBelow(item, items)
              if (top === null) useStore.getState().notify('Não há móvel embaixo deste — mova-o por cima de outro primeiro')
              else up({ elevation: top })
            }}
          >
            <Icon name="up" size={16} /> Sobre o móvel abaixo
          </button>
          <button
            className="btn"
            disabled={item.locked || !!item.attachedTo}
            title="Encostar o topo no fundo do móvel aéreo que está em cima (ex.: micro-ondas sob o armário aéreo)"
            onClick={() => {
              const el = elevationBelow(item, items)
              if (el === null) useStore.getState().notify('Não há móvel aéreo acima deste com espaço embaixo — mova-o para baixo de um armário suspenso primeiro')
              else up({ elevation: el })
            }}
          >
            <Icon name="down" size={16} /> Abaixo do móvel
          </button>
        </div>
        <div className="btn-row">
          <button className="btn" disabled={item.locked} onClick={() => up({ rotation: normAngle(item.rotation + Math.PI / 2) })} title="Girar 90° anti-horário (R)">
            <Icon name="rotL" size={16} /> 90°
          </button>
          <button className="btn" disabled={item.locked} onClick={() => up({ rotation: normAngle(item.rotation - Math.PI / 2) })} title="Girar 90° horário (Shift+R)">
            <Icon name="rotR" size={16} /> 90°
          </button>
          <span className="muted small">{Math.round(toDeg(shownRotation(item.rotation)))}° · frente = linha grossa na planta</span>
        </div>
        <div className="align">
          <span className="align-label">Encostar</span>
          <div className="align-pad">
            <button className="btn icon" disabled={item.locked} onClick={() => push([0, -1])} title="Encostar para cima (na planta)">
              <Icon name="up" size={16} />
            </button>
            <button className="btn icon" disabled={item.locked} onClick={() => push([-1, 0])} title="Encostar à esquerda">
              <Icon name="left" size={16} />
            </button>
            <button className="btn icon" disabled={item.locked} onClick={() => push([1, 0])} title="Encostar à direita">
              <Icon name="right" size={16} />
            </button>
            <button className="btn icon" disabled={item.locked} onClick={() => push([0, 1])} title="Encostar para baixo (na planta)">
              <Icon name="down" size={16} />
            </button>
          </div>
          <span className="align-label">Centralizar</span>
          <div className="align-pad">
            <button className="btn" disabled={item.locked || !b} onClick={() => b && up({ x: b.cx })} title="Centralizar na largura do cômodo">
              ↔
            </button>
            <button className="btn" disabled={item.locked || !b} onClick={() => b && up({ z: b.cz })} title="Centralizar no comprimento do cômodo">
              ↕
            </button>
          </div>
        </div>
        <p className="hint">Dica: clique nas cotas azul-claras da cena para digitar a distância exata até a parede ou o móvel vizinho.</p>
      </Section>

      {(item.type === 'monitor' || isArm(item)) && <ArmSection item={item} />}
      {item.type === 'shower' && <ShowerSection item={item} />}

      {item.type !== 'custom' && (
        <Section title="Acabamento">
          <ColorField label={def.colorLabel} value={item.color} onChange={(c) => up({ color: c })} />
          {def.color2Label && (!def.showColor2 || def.showColor2(item.options)) && (
            <ColorField label={def.color2Label} value={item.color2} onChange={(c) => up({ color2: c })} />
          )}
        </Section>
      )}

      {item.type === 'curtain' && room && (
        <Section title="Janela">
          <div className="btn-row" style={{ marginTop: 0 }}>
            <button
              className="btn"
              disabled={item.locked}
              onClick={() => {
                const win = nearestWindow(item, room)
                const fit = win && fitCurtainToWindow(item, room, win)
                if (fit) up(fit)
                else useStore.getState().notify('Este cômodo não tem janela')
              }}
            >
              <Icon name="window" size={16} /> Ajustar à janela mais próxima
            </button>
          </div>
          <p className="hint">Cortina de tecido: do teto ao piso, 20 cm além de cada lado da janela. Persiana: cobre o vão com 5 cm de sobra.</p>
        </Section>
      )}

      {def.options && def.options.length > 0 && (
        <Section title="Opções do modelo">
          {def.options.map((o) => {
            if (o.visibleIf && !o.visibleIf(item.options)) return null
            const v = item.options[o.key] ?? o.default
            const setOpt = (val: typeof v, commit = true) => update(item.id, { options: { ...item.options, [o.key]: val } }, commit)
            if (o.kind === 'bool') return <Check key={o.key} label={o.label} checked={!!v} onChange={setOpt} />
            if (o.kind === 'range') return <RangeField key={o.key} label={o.label} value={Number(v)} hint={o.hint} onChange={(val, commit) => setOpt(val, commit)} />
            if (o.kind === 'length')
              return <NumberField key={o.key} label={o.label} value={Number(v)} min={o.min} max={o.max} onCommit={setOpt} />
            return (
              <label key={o.key} className="field">
                <span>{o.label}</span>
                <select value={String(v)} onChange={(e) => setOpt(typeof o.default === 'number' ? Number(e.target.value) : e.target.value)}>
                  {o.choices!.map((c) => (
                    <option key={String(c.value)} value={String(c.value)}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </Section>
      )}
    </div>
  )
}

/** Botão que repete enquanto pressionado (como os botões ▲/▼ do motor da mesa). */
function HoldButton({ onStep, children, title, disabled }: { onStep: (first: boolean) => void; children: ReactNode; title?: string; disabled?: boolean }) {
  const timer = useRef<number | null>(null)
  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])
  return (
    <button
      className="btn desk-key"
      title={title}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        onStep(true)
        stop()
        timer.current = window.setInterval(() => onStep(false), 50)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {children}
    </button>
  )
}

/**
 * Mesa elétrica: painel como o do controle real — display com a altura, ▲/▼ (segure: 20 mm/s,
 * como o motor) e memórias 1·2·3 (M + número grava a altura atual). O que está em cima acompanha.
 */
/** Box: posição do chuveiro e do ralo (também arrastáveis na cena). */
function ShowerSection({ item }: { item: FurnitureItem }) {
  const update = useStore((s) => s.updateItem)
  const sp = showerSpots(item.width, item.depth, item.options)
  const W = item.width
  const D = item.depth
  const set = (o: Record<string, OptionValue>, commit: boolean) => update(item.id, { options: { ...item.options, ...o } }, commit)
  const wallName = { fundo: 'do fundo', esquerda: 'da esquerda', direita: 'da direita' }[sp.wall]
  const dl = sp.drainLen
  return (
    <Section title="Chuveiro e ralo">
      <LengthSlider label="Chuveiro — da lateral esquerda" value={sp.head[0] + W / 2} min={0.08} max={W - 0.08} onChange={(v, c) => set({ headX: v - W / 2 }, c)} />
      <LengthSlider label="Chuveiro — da parede do fundo" value={sp.head[2] + D / 2} min={0.06} max={D - 0.12} onChange={(v, c) => set({ headZ: v - D / 2 }, c)} />
      <LengthSlider label="Altura do chuveiro" value={sp.head[1]} min={1.6} max={2.6} onChange={(v, c) => set({ headY: v }, c)} />
      <LengthSlider label="Ralo — da lateral esquerda" value={sp.drain[0] + W / 2} min={0.03 + dl / 2} max={W - 0.03 - dl / 2} onChange={(v, c) => set({ drainX: v - W / 2 }, c)} />
      <LengthSlider label="Ralo — da parede do fundo" value={sp.drain[1] + D / 2} min={0.07} max={D - 0.07} onChange={(v, c) => set({ drainZ: v - D / 2 }, c)} />
      <div className="btn-row">
        <button className="btn" onClick={() => set({ headX: 0 }, true)}>
          Chuveiro no meio
        </button>
        <button className="btn" onClick={() => set({ drainX: 0, drainZ: 0 }, true)}>
          Ralo no centro
        </button>
        <button className="btn" onClick={() => set({ drainX: sp.head[0], drainZ: sp.head[2] }, true)}>
          Ralo sob o chuveiro
        </button>
      </div>
      <p className="hint">
        Também dá para arrastar na cena as bolinhas azul (chuveiro) e cinza (ralo) com o box selecionado. O braço e o registro ficam na parede mais próxima
        do chuveiro (agora, a {wallName}). Esquerda/direita: olhando o box de frente.
      </p>
    </Section>
  )
}

function DeskHeight({ item }: { item: FurnitureItem }) {
  const update = useStore((s) => s.updateItem)
  const notify = useStore((s) => s.notify)
  const [saving, setSaving] = useState(false)
  const r = motorRange(item) ?? { lo: 0.745, hi: 1.205 }
  const t = typeof item.options.topT === 'number' ? item.options.topT : 0.025
  const clampH = (h: number) => Math.min(r.hi, Math.max(r.lo, h))
  const step = (dir: 1 | -1) => (first: boolean) => {
    const cur = useStore.getState().items.find((i) => i.id === item.id)
    if (!cur) return
    // 20 mm/s (50 ms por passo = 1 mm); o primeiro toque entra no histórico
    update(item.id, { height: Math.round(clampH(cur.height + dir * 0.001) * 1000) / 1000 }, first)
  }
  const mem = (k: 1 | 2 | 3) => {
    const def = k === 1 ? r.lo : k === 2 ? 1.08 + t : r.hi
    const v = item.options[`mem${k}`]
    return typeof v === 'number' ? v : def
  }
  const pressMem = (k: 1 | 2 | 3) => {
    if (saving) {
      update(item.id, { options: { ...item.options, [`mem${k}`]: item.height } })
      setSaving(false)
      notify(`Memória ${k} gravada: ${fmtCmShort(item.height)} cm`)
    } else update(item.id, { height: clampH(mem(k)) })
  }
  const out = item.height < r.lo - 0.0005 || item.height > r.hi + 0.0005
  return (
    <Section title="Altura (motor)">
      <div className="desk-panel">
        <div className="desk-display" title="Altura do tampo">
          {(item.height * 100).toFixed(1).replace('.', ',')}
          <small>cm</small>
        </div>
        <HoldButton onStep={step(1)} title="Subir (segure)" disabled={item.locked || item.height >= r.hi - 1e-4}>
          ▲
        </HoldButton>
        <HoldButton onStep={step(-1)} title="Descer (segure)" disabled={item.locked || item.height <= r.lo + 1e-4}>
          ▼
        </HoldButton>
        <button className={`btn desk-key${saving ? ' is-on' : ''}`} title="Gravar memória: toque M e depois 1, 2 ou 3" onClick={() => setSaving(!saving)}>
          M
        </button>
        {([1, 2, 3] as const).map((k) => (
          <button
            key={k}
            className={`btn desk-key${!saving && Math.abs(item.height - mem(k)) < 0.0005 ? ' is-on' : ''}`}
            title={saving ? `Gravar ${fmtCmShort(item.height)} cm na memória ${k}` : `Ir para ${fmtCmShort(mem(k))} cm`}
            disabled={item.locked}
            onClick={() => pressMem(k)}
          >
            {k}
          </button>
        ))}
      </div>
      <NumberField label="Altura do tampo (exata)" value={item.height} min={r.lo} max={r.hi} onCommit={(v) => update(item.id, { height: clampH(v) })} disabled={item.locked} />
      <p className="hint">
        {saving
          ? 'Toque 1, 2 ou 3 para gravar a altura atual nessa memória.'
          : `Segure ▲/▼ (ou a seta verde no 3D, PgUp/PgDn). Memórias: 1 = ${fmtCmShort(mem(1))} · 2 = ${fmtCmShort(mem(2))} · 3 = ${fmtCmShort(mem(3))} cm. Curso: ${fmtCmShort(DESK_FRAME_MIN)}–${fmtCmShort(DESK_FRAME_MAX)} cm + tampo de ${fmtCm(t)}; o que está em cima sobe e desce junto.`}
        {out && ' Esta altura está fora do curso do motor.'}
      </p>
    </Section>
  )
}

/**
 * Cada braço (placa VESA) ajustado separadamente: altura, para o lado e para frente — o cotovelo
 * dobra sozinho para chegar lá. Também dá para arrastar o monitor preso no 3D.
 */
function ArmSides({ arm }: { arm: FurnitureItem }) {
  const update = useStore((s) => s.updateItem)
  const items = useStore((s) => s.items)
  const slots = armSlotsFull(arm)
  const dual = slots.length === 2
  const mons = slots.map((_, k) => items.find((m) => m.attachedTo === arm.id && (m.attachSlot ?? 0) === k))
  const set = (k: number, patch: Partial<ArmSlot>, commit = true) => {
    // telas na mesma profundidade não se atravessam
    const next = { ...slots[k], ...patch }
    if (patch.x !== undefined || patch.reach !== undefined) next.x = keepApart(arm, k, next.x, next.reach, items)
    update(arm.id, moveSlot(arm, k, next), commit)
  }
  // coloca a tela deste lado encostada (1 cm) na do outro
  const join = (k: number) => {
    const o = 1 - k
    const mk = mons[k]
    const mo = mons[o]
    const wk = mk?.width ?? 0.6
    const wo = mo?.width ?? 0.6
    const side = k === 0 ? -1 : 1
    set(k, { x: slots[o].x + side * (wo / 2 + wk / 2 + 0.01), reach: slots[o].reach })
  }
  return (
    <div className={dual ? 'arm-sides' : ''} style={{ marginTop: 10 }}>
      {slots.map((sl, k) => {
        const side = dual ? (k === 0 ? -1 : 1) : 1
        const r = armReach(arm, k)
        const latMax = ARM_MAX * 0.95
        return (
          <div key={k} className="arm-side">
            {dual && (
              <div className="arm-side-title">
                {k === 0 ? 'Braço esquerdo' : 'Braço direito'}
                <small>{mons[k]?.name ?? 'sem monitor'}</small>
              </div>
            )}
            <LengthSlider label="Altura da tela" value={sl.vesa} min={0.15} max={arm.height + 0.3} onChange={(v, c) => set(k, { vesa: v }, c)} />
            {dual ? (
              <LengthSlider
                label="Afastamento do poste"
                value={sl.x * side}
                min={-0.1}
                max={latMax}
                onChange={(v, c) => set(k, { x: v * side }, c)}
              />
            ) : (
              <LengthSlider label="Para o lado" value={sl.x} min={-latMax} max={latMax} onChange={(v, c) => set(k, { x: v }, c)} />
            )}
            <LengthSlider label="Para frente" value={sl.reach} min={r.min} max={r.max} onChange={(v, c) => set(k, { reach: v }, c)} />
            <div className="btn-row" style={{ marginTop: 2 }}>
              {dual && (
                <button className="btn" disabled={arm.locked} onClick={() => join(k)} title="Encostar esta tela na do outro braço (1 cm)">
                  Juntar ao outro
                </button>
              )}
              <button className="btn" disabled={arm.locked} onClick={() => set(k, { x: side * 0.08, reach: r.min })} title="Dobrar o braço até perto do poste">
                Recolher
              </button>
              {dual && (
                <button className="btn" disabled={arm.locked} onClick={() => set(1 - k, { vesa: sl.vesa })} title="O outro braço fica na mesma altura deste">
                  Igualar altura
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Inclinação (eixo X) e, no braço, giro para os lados (eixo Y) da tela. */
function ScreenAngles({ item, onArm }: { item: FurnitureItem; onArm: boolean }) {
  const update = useStore((s) => s.updateItem)
  const tilt = typeof item.options.tilt === 'number' ? item.options.tilt : 0
  const swivel = typeof item.options.swivel === 'number' ? item.options.swivel : 0
  const set = (k: 'tilt' | 'swivel', v: number, commit: boolean) => update(item.id, { options: { ...item.options, [k]: v } }, commit)
  return (
    <div style={{ marginBottom: 10 }}>
      <AngleField
        label="Inclinação (eixo X)"
        value={tilt}
        min={onArm ? -25 : -5}
        max={onArm ? 25 : 20}
        hint="Positivo: topo para trás, a tela olha para cima"
        onChange={(v, c) => set('tilt', v, c)}
      />
      {onArm && <AngleField label="Giro para os lados (eixo Y)" value={swivel} min={-45} max={45} onChange={(v, c) => set('swivel', v, c)} />}
      {(Math.abs(tilt) > 1e-4 || Math.abs(swivel) > 1e-4) && (
        <button className="link-btn" onClick={() => update(item.id, { options: { ...item.options, tilt: 0, swivel: 0 } })}>
          Endireitar a tela
        </button>
      )}
    </div>
  )
}

/** Vincular monitor ↔ braço articulado (o monitor perde o pé e acompanha o braço). */
function ArmSection({ item }: { item: FurnitureItem }) {
  const items = useStore((s) => s.items)
  const attach = useStore((s) => s.attachToArm)
  const detach = useStore((s) => s.detachFromArm)
  const select = useStore((s) => s.select)
  const dist = (a: FurnitureItem, b: FurnitureItem) => Math.hypot(a.x - b.x, a.z - b.z)
  const side = (arm: FurnitureItem, slot = 0) => (armCount(arm) === 2 ? (slot === 0 ? ' (lado esquerdo)' : ' (lado direito)') : '')

  if (item.type === 'monitor') {
    const arm = item.attachedTo ? items.find((i) => i.id === item.attachedTo) : undefined
    const screen = <ScreenAngles item={item} onArm={!!arm} />
    if (arm)
      return (
        <Section title="Suporte">
          {screen}
          <p className="hint" style={{ marginTop: 0 }}>
            Preso ao <b>{arm.name}</b>
            {side(arm, item.attachSlot)} — sem o pé. Arraste o monitor para dobrar este braço (ele encosta no outro monitor) e use a seta verde para subir/descer; para mover o conjunto, arraste o braço.
          </p>
          <div className="btn-row">
            <button className="btn" onClick={() => select({ kind: 'item', id: arm.id })}>
              Ver o braço
            </button>
            <button className="btn" onClick={() => detach(item.id)} title="O monitor volta a ter pé, apoiado na mesa">
              Soltar do braço
            </button>
          </div>
        </Section>
      )
    const arms = items
      .filter((a) => isArm(a) && items.filter((m) => m.attachedTo === a.id).length < armCount(a))
      .sort((a, b) => dist(a, item) - dist(b, item))
    return (
      <Section title="Suporte">
        {screen}
        {arms.length === 0 ? (
          <p className="hint" style={{ marginTop: 0 }}>
            Com pé próprio. Para usar braço articulado, adicione um (Escritório → Braço articulado) e volte aqui para prender o monitor nele.
          </p>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              Com pé próprio. Prenda num braço articulado: o pé some e o monitor vai para a placa do braço.
            </p>
            <div className="btn-row">
              {arms.slice(0, 4).map((a) => (
                <button key={a.id} className="btn" onClick={() => attach(item.id, a.id)}>
                  <Icon name="link" size={15} /> Prender no {a.name.toLowerCase()} ({fmtCm(dist(a, item))})
                </button>
              ))}
            </div>
          </>
        )}
      </Section>
    )
  }

  // braço: placas e monitores presos
  const slots = armSlots(item)
  const attached = items.filter((m) => m.attachedTo === item.id)
  const loose = items.filter((m) => m.type === 'monitor' && !m.attachedTo).sort((a, b) => dist(a, item) - dist(b, item))
  return (
    <Section title="Monitores">
      <ul className="list">
        {slots.map((_, k) => {
          const m = attached.find((x) => (x.attachSlot ?? 0) === k)
          return (
            <li key={k}>
              {m ? (
                <button onClick={() => select({ kind: 'item', id: m.id })}>
                  <Icon name="link" size={14} />
                  <span className="list-name">{m.name}</span>
                  <span className="list-meta">{slots.length === 2 ? (k === 0 ? 'esquerda' : 'direita') : 'placa VESA'}</span>
                </button>
              ) : (
                <span className="list-static muted">
                  <span className="list-name">{slots.length === 2 ? (k === 0 ? 'Esquerda: livre' : 'Direita: livre') : 'Placa livre'}</span>
                </span>
              )}
              {m && (
                <button className="list-act" title="Soltar este monitor" aria-label="Soltar este monitor" onClick={() => detach(m.id)}>
                  <Icon name="x" size={14} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {attached.length < slots.length && loose.length > 0 && (
        <div className="btn-row">
          <button className="btn" onClick={() => attach(loose[0].id, item.id)}>
            <Icon name="link" size={15} /> Prender {loose[0].name} ({fmtCm(dist(loose[0], item))})
          </button>
        </div>
      )}
      <ArmSides arm={item} />
      <p className="hint">Arraste um monitor preso para dobrar só aquele braço (ele gruda encostado no outro); arraste o braço para mover o conjunto. A seta verde no monitor sobe/desce só aquele lado.</p>
    </Section>
  )
}

function FurnitureList({ items, colliding, flagged }: { items: FurnitureItem[]; colliding: Set<string>; flagged: Set<string> }) {
  const select = useStore((s) => s.select)
  const multi = useStore((s) => s.multi)
  const setHovered = useStore((s) => s.setHovered)
  const groups = useStore((s) => s.groups)
  const selGroup = useStore((s) => (s.selection?.kind === 'group' ? s.selection.id : null))
  const all = useStore((s) => s.items)
  const [open, setOpen] = useState<string[]>([])
  const here = new Set(items.map((i) => i.id))
  // cada grupo aparece uma vez, na lista onde está o primeiro membro
  const shown = groups.filter((g) => here.has(g.members[0]))
  const grouped = new Set(groups.flatMap((g) => g.members))
  return (
    <ul className="list">
      {shown.map((g) => {
        const isOpen = open.includes(g.id)
        const members = all.filter((i) => g.members.includes(i.id))
        const bad = members.some((m) => colliding.has(m.id))
        const warn = members.some((m) => flagged.has(m.id))
        return (
          <li key={g.id} className="group-li">
            <div className={`group-row${selGroup === g.id ? ' is-picked' : ''}${bad ? ' is-error' : warn ? ' is-warn' : ''}`}>
              <button className="group-caret" onClick={() => setOpen(isOpen ? open.filter((x) => x !== g.id) : [...open, g.id])} aria-label={isOpen ? 'Recolher' : 'Mostrar membros'} title={isOpen ? 'Recolher' : 'Mostrar membros'}>
                {isOpen ? '▾' : '▸'}
              </button>
              <button className="group-main" onClick={() => select({ kind: 'group', id: g.id })} title="Grupo — clique para selecionar o conjunto">
                <Icon name="layers" size={14} />
                <span className="list-name">{g.name}</span>
                <span className="list-meta">{members.length} móveis</span>
              </button>
            </div>
            {isOpen && (
              <ul className="list group-members">
                {members.map((m) => (
                  <li key={m.id}>
                    <button onClick={() => useStore.getState().editGroup(g.id, m.id)} onPointerEnter={() => setHovered(m.id)} onPointerLeave={() => setHovered(null)} title="Mexer só neste (com o caminho de volta ao grupo)">
                      <span className="dot" style={{ background: m.color }} />
                      <span className="list-name">{m.name}</span>
                      <span className="list-meta">{fmtDim(m.width, m.depth, m.height)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
      {items.filter((it) => !grouped.has(it.id)).map((it) => (
        <li key={it.id}>
          <button
            onClick={(e) => (e.shiftKey || e.ctrlKey || e.metaKey ? useStore.getState().toggleMulti(it.id) : select({ kind: 'item', id: it.id }))}
            onPointerEnter={() => setHovered(it.id)}
            onPointerLeave={() => setHovered(null)}
            className={`${colliding.has(it.id) ? 'is-error' : flagged.has(it.id) ? 'is-warn' : ''}${multi.includes(it.id) ? ' is-picked' : ''}`}
            title="Clique para selecionar · Shift ou Ctrl + clique soma à seleção"
          >
            <span className="dot" style={{ background: it.color }} />
            <span className="list-name">{it.name}</span>
            <span className="list-meta">{fmtDim(it.width, it.depth, it.height)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

const CLOSED_KEY = 'planejador-comodos:moveis-fechados'
function loadClosed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** Móveis agrupados por cômodo, cada grupo recolhível (o estado fica salvo neste navegador). */
function FurnitureByRoom({ room, items, colliding, flagged }: { room: Room; items: FurnitureItem[]; colliding: Set<string>; flagged: Set<string> }) {
  const [closed, setClosed] = useState<string[]>(loadClosed)
  const toggle = (id: string) => {
    const next = closed.includes(id) ? closed.filter((x) => x !== id) : [...closed, id]
    setClosed(next)
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify(next))
    } catch {
      /* sem armazenamento: só nesta sessão */
    }
  }
  const groups = new Map<string, FurnitureItem[]>()
  for (const it of items) {
    const sp = spaceOfPoint(room, [it.x, it.z])
    const k = sp?.id ?? '_fora'
    groups.set(k, [...(groups.get(k) ?? []), it])
  }
  const list = [...(room.spaces ?? []).map((sp) => ({ id: sp.id, name: sp.name })), { id: '_fora', name: 'Fora dos cômodos' }].filter((g) => groups.has(g.id))
  const allClosed = list.every((g) => closed.includes(g.id))
  return (
    <div className="rgroups">
      {list.length > 1 && (
        <button className="link-btn rg-all" onClick={() => {
          const next = allClosed ? closed.filter((x) => !list.some((g) => g.id === x)) : [...new Set([...closed, ...list.map((g) => g.id)])]
          setClosed(next)
          try {
            localStorage.setItem(CLOSED_KEY, JSON.stringify(next))
          } catch {
            /* ignore */
          }
        }}>
          {allClosed ? 'Abrir todos' : 'Recolher todos'}
        </button>
      )}
      {list.map((g) => {
        const its = groups.get(g.id)!
        const open = !closed.includes(g.id)
        const bad = its.filter((i) => colliding.has(i.id)).length
        return (
          <div key={g.id} className={`rg${open ? '' : ' is-closed'}`}>
            <button className="rg-head" onClick={() => toggle(g.id)} aria-expanded={open}>
              <span className="sec-caret">▾</span>
              <span className="rg-title">{g.name}</span>
              {bad > 0 && <span className="rg-bad" title="Móveis com conflito">{bad}</span>}
              <span className="rg-count">{its.length}</span>
            </button>
            {open && <FurnitureList items={its} colliding={colliding} flagged={flagged} />}
          </div>
        )
      })}
    </div>
  )
}

const KIND: Record<Opening['kind'], string> = { door: 'Porta', window: 'Janela', opening: 'Vão aberto' }

/**
 * Distância da borda do vão até cada quina da parede, como se vê de dentro do cômodo — e, numa porta
 * entre cômodos, também do outro lado (de dentro do vizinho), para conferir com a trena de qualquer lado.
 */
function CornerDistances({ op, room }: { op: Opening; room: Room }) {
  const update = useStore((s) => s.updateOpening)
  const pw = room.walls.find((w) => w.id === op.wallId)!
  const pair = op.pairId ? room.openings.find((o) => o.id === op.pairId) : undefined
  const gw = pair && room.walls.find((w) => w.id === pair.wallId)
  const spaceName = (w: typeof pw) => room.spaces?.find((s) => s.id === w.spaceId)?.name
  // um lado: offset (centro) nesta parede ↔ distâncias às quinas; ao mudar, leva o centro para a parede da porta
  const side = (w: typeof pw, offset: number, title: string | undefined) => {
    const L = wallLength(w)
    const fromA = offset - op.width / 2
    const fromB = L - offset - op.width / 2
    const leftIsA = wallLeftIsA(w)
    const set = (newOffset: number) => {
      const c: Vec2 = [w.a[0] + wallDir(w)[0] * newOffset, w.a[1] + wallDir(w)[1] * newOffset]
      const u = wallDir(pw)
      const o = (c[0] - pw.a[0]) * u[0] + (c[1] - pw.a[1]) * u[1]
      const Lp = wallLength(pw)
      update(op.id, { offset: Math.min(Math.max(o, op.width / 2), Lp - op.width / 2) })
    }
    const fields = [
      { label: 'Até a quina da esquerda', v: leftIsA ? fromA : fromB, toOffset: (d: number) => (leftIsA ? d + op.width / 2 : L - d - op.width / 2) },
      { label: 'Até a quina da direita', v: leftIsA ? fromB : fromA, toOffset: (d: number) => (leftIsA ? L - d - op.width / 2 : d + op.width / 2) },
    ]
    return (
      <>
        {title && <div className="field-label">{title}</div>}
        <div className="grid2">
          {fields.map((f) => (
            <NumberField
              key={f.label}
              label={f.label}
              value={f.v}
              min={0}
              max={L - op.width}
              onCommit={(d) => set(f.toOffset(d))}
              title="Da borda do vão (sem o alisar) até a quina, como se vê de dentro do cômodo"
            />
          ))}
        </div>
      </>
    )
  }
  return (
    <>
      {side(pw, op.offset, gw ? `Visto de dentro: ${spaceName(pw) ?? 'este cômodo'}` : undefined)}
      {pair && gw && side(gw, pair.offset, `Visto do outro lado: ${spaceName(gw) ?? 'cômodo vizinho'}`)}
      {op.kind === 'door' && <p className="hint">Medido até a borda do vão; o alisar ({fmtCm(op.casing ?? 0.07)} de moldura) fica por fora dele.</p>}
    </>
  )
}

function OpeningPanel({ op, room }: { op: Opening; room: Room }) {
  const update = useStore((s) => s.updateOpening)
  const removeOpening = useStore((s) => s.removeOpening)
  const addCurtain = useStore((s) => s.addCurtainForWindow)
  const wall = room.walls.find((w) => w.id === op.wallId)
  const L = wall ? wallLength(wall) : 0
  const up = (p: Partial<Opening>) => update(op.id, p)
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="title-static">
          <Icon name={op.kind === 'window' ? 'window' : 'door'} /> {KIND[op.kind]}
        </div>
        <div className="panel-sub">
          Na parede de {fmtCm(L)} <CheckTag room={room} checkKey={openingKey(op)} />
        </div>
        <div className="row-actions">
          <button className="btn danger" onClick={() => removeOpening(op.id)} title="Remover esta abertura (Delete). Use quando o scan detectou algo que não existe.">
            <Icon name="trash" size={16} /> Excluir {KIND[op.kind].toLowerCase()}
          </button>
        </div>
      </div>
      <Section title="Medidas">
        <div className="grid2">
          <NumberField label="Largura" value={op.width} min={0.2} max={L} onCommit={(v) => up({ width: v, offset: Math.min(Math.max(op.offset, v / 2), L - v / 2) })} />
          <NumberField label="Altura" value={op.height} min={0.2} max={room.ceilingHeight} onCommit={(v) => up({ height: v })} />
          {op.kind !== 'door' && <NumberField label="Peitoril" value={op.bottom} min={0} onCommit={(v) => up({ bottom: v })} title="Altura da base da janela até o piso" />}
          {op.kind === 'door' && (
            <NumberField label="Alisar (moldura)" value={op.casing ?? 0.07} min={0.01} max={0.2} onCommit={(v) => up({ casing: v })} title="Largura da moldura na face da parede, por fora do vão (dos dois lados)" />
          )}
        </div>
        {wall && <CornerDistances room={room} op={op} />}
        <CheckControl room={room} checkKey={openingKey(op)} label="Medidas conferidas com trena?" />
        {stateOf(room.checks?.[openingKey(op)]) !== 'conferida' && (
          <p className="hint">Vêm do scan LiDAR e podem variar alguns centímetros: confira largura, altura e as distâncias até as quinas, ajuste aqui e marque como conferida.</p>
        )}
      </Section>
      {op.kind === 'window' && (
        <Section title="Janela">
          <label className="field">
            <span>Tipo</span>
            <select value={op.windowType ?? 'sliding'} onChange={(e) => up({ windowType: e.target.value as WindowType })}>
              <option value="sliding">De correr (2 folhas)</option>
              <option value="casement">De abrir (2 folhas)</option>
              <option value="awning">Basculante</option>
              <option value="fixed">Fixa</option>
            </select>
          </label>
          {(op.windowType ?? 'sliding') !== 'fixed' && <Check label="Janela aberta" checked={op.isOpen} onChange={(v) => up({ isOpen: v })} />}
          <div className="btn-row">
            <button className="btn" onClick={() => addCurtain('curtain:Cortina', op.id)}>
              <Icon name="plus" size={16} /> Cortina
            </button>
            <button className="btn" onClick={() => addCurtain('curtain:Cortina dupla (voil + blackout)', op.id)}>
              <Icon name="plus" size={16} /> Cortina dupla
            </button>
            <button className="btn" onClick={() => addCurtain('curtain:Persiana rolô', op.id)}>
              <Icon name="plus" size={16} /> Persiana
            </button>
          </div>
          <p className="hint">A cortina/persiana entra já ajustada a esta janela; depois dá para mudar tamanho, tipo, abertura e varão.</p>
        </Section>
      )}
      {op.kind === 'door' && !op.ghost && <DoorSection op={op} room={room} />}
      {op.kind === 'door' && !op.ghost && (
        <div className="btn-row">
          <button className="btn" onClick={() => up({ kind: 'opening' })} title="Tira a folha e o batente: fica só o vão aberto na parede">
            Tirar a porta (deixar só o vão)
          </button>
        </div>
      )}
      {op.kind === 'opening' && op.bottom < 0.05 && !op.ghost && (
        <Section title="Vão">
          <div className="btn-row">
            <button className="btn" onClick={() => up({ kind: 'door', isOpen: true, height: Math.min(op.height, 2.1) })}>
              <Icon name="plus" size={16} /> Colocar porta neste vão
            </button>
          </div>
          <p className="hint">Depois escolha se é de abrir ou de correr, de madeira ou de vidro.</p>
        </Section>
      )}
      {op.kind !== 'opening' && (
        <p className="hint">Com {op.kind === 'door' ? 'a porta' : 'a janela'} selecionada, arraste-a na cena para mudar de lugar{op.kind === 'window' ? ' (para os lados, para cima/baixo ou para outra parede do cômodo)' : op.pairId ? ' ao longo da parede' : ' (ao longo da parede ou para outra parede do cômodo)'}. Alt solta o ímã.</p>
      )}
    </div>
  )
}

function MeasurePanel({ m }: { m: Measurement }) {
  const remove = useStore((s) => s.removeMeasurement)
  const { dist } = measureText(m.a, m.b)
  const d = [Math.abs(m.b[0] - m.a[0]), Math.abs(m.b[1] - m.a[1]), Math.abs(m.b[2] - m.a[2])]
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="title-static">
          <Icon name="ruler" /> Medição
        </div>
        <div className="big-number">{fmtCm(dist)}</div>
      </div>
      <Section title="Componentes">
        <table className="kv">
          <tbody>
            <tr>
              <td>Horizontal X</td>
              <td>{fmtCm(d[0])}</td>
            </tr>
            <tr>
              <td>Horizontal Z</td>
              <td>{fmtCm(d[2])}</td>
            </tr>
            <tr>
              <td>Vertical (Y)</td>
              <td>{fmtCm(d[1])}</td>
            </tr>
            <tr>
              <td>No plano do piso</td>
              <td>{fmtCm(Math.hypot(d[0], d[2]))}</td>
            </tr>
          </tbody>
        </table>
        <div className="btn-row">
          <button className="btn danger" onClick={() => remove(m.id)}>
            <Icon name="trash" size={16} /> Excluir medição
          </button>
        </div>
      </Section>
    </div>
  )
}

function RoomPanel() {
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  const measurements = useStore((s) => s.measurements)
  const select = useStore((s) => s.select)
  const updateRoom = useStore((s) => s.updateRoom)
  const removeMeasurement = useStore((s) => s.removeMeasurement)
  const clearMeasurements = useStore((s) => s.clearMeasurements)
  const addItems = useStore((s) => s.addItems)
  const showScan = useStore((s) => s.settings.showScan)
  const setSettings = useStore((s) => s.setSettings)
  const { warnings, colliding, flagged } = useAnalysis()
  const focus = useStore((s) => s.focusSpace)
  const setFocus = useStore((s) => s.setFocusSpace)
  if (!room) return <div className="panel empty">Carregando cômodo…</div>

  const b = roomBounds(room)
  const area = floorArea(room)
  const house = (room.spaces?.length ?? 0) > 1
  const perimeter = room.walls.reduce((s, w) => s + wallLength(w), 0)
  const floorItems = items.filter((i) => !TYPES[i.type]?.noCollide && i.elevation < 0.05 && i.height >= 0.03)
  const used = floorItems.reduce((s, i) => s + polyArea(footprint(i)), 0)
  const pct = Math.min(100, (used / area) * 100)
  const checks = listChecks(room)

  return (
    <div className="panel">
      <div className="panel-head">
        <TextField className="title-input" value={room.name} onCommit={(v) => updateRoom({ name: v })} />
        <div className="panel-sub">
          {house ? `${room.spaces!.length} cômodos · clique num cômodo, parede, porta ou móvel` : 'Nada selecionado — clique num móvel, porta ou janela'}
        </div>
      </div>

      {house && (
        <Section title={`Cômodos (${room.spaces!.length})`}>
          <ul className="list">
            {room.spaces!.map((sp) => {
              const dm = spaceDims(sp)
              return (
                <li key={sp.id}>
                  <button onClick={() => select({ kind: 'space', id: sp.id })}>
                    <Icon name="home" size={14} />
                    <span className="list-name">{sp.name}</span>
                    <span className="list-meta">
                      {fmtM2(polyArea(sp.floor))} · {fmtCmShort(dm.w)}×{fmtCmShort(dm.d)}
                    </span>
                  </button>
                  <button
                    className={`list-act${focus === sp.id ? ' is-on' : ''}`}
                    onClick={() => setFocus(focus === sp.id ? null : sp.id)}
                    title={focus === sp.id ? 'Ver a casa toda' : `Ver só ${sp.name}`}
                    aria-label={focus === sp.id ? 'Ver a casa toda' : `Ver só ${sp.name}`}
                  >
                    <Icon name="eye" size={15} />
                  </button>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      <Section title={house ? 'Casa' : 'Cômodo'}>
        <div className="stats">
          <div>
            <span>{house ? 'Dimensões externas' : 'Medidas internas'}</span>
            <b>
              {fmtCmShort(b.w)} × {fmtCmShort(b.d)} cm
            </b>
          </div>
          <div>
            <span>{house ? 'Área útil (soma dos cômodos)' : 'Área'}</span>
            <b>{fmtM2(area)}</b>
          </div>
          <div>
            <span>{house ? 'Paredes (comprimento total)' : 'Perímetro'}</span>
            <b>{house ? fmtM(perimeter) : fmtCm(perimeter)}</b>
          </div>
          <div>
            <span>Pé-direito</span>
            <b>{fmtCm(room.ceilingHeight)}</b>
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
        <NumberField
          label={house ? 'Espessura das paredes externas (visual)' : 'Espessura das paredes (visual)'}
          value={room.wallThickness}
          min={0.05}
          max={0.4}
          onCommit={(v) => {
            updateRoom({ wallThickness: v })
            if (house) useStore.setState((st) => ({ room: st.room && { ...st.room, walls: st.room.walls.map((w) => ({ ...w, thickness: v })) } }))
          }}
        />
      </Section>

      {warnings.length > 0 && (
        <Section title={`Alertas (${warnings.length})`}>
          <Alerts />
        </Section>
      )}

      <Section title={`Conferência de medidas (${checks.filter((c) => c.check?.state === 'conferida').length}/${checks.length})`} defaultOpen={false}>
        <ChecksSummary room={room} />
      </Section>

      <Section title={`Móveis (${items.length})`}>
        {items.length === 0 && <p className="hint">Adicione móveis pelo catálogo à esquerda.</p>}
        {house ? (
          <FurnitureByRoom room={room} items={items} colliding={colliding} flagged={flagged} />
        ) : (
          <FurnitureList items={items} colliding={colliding} flagged={flagged} />
        )}
      </Section>

      <Section title={`Medições (${measurements.length})`} right={measurements.length > 0 ? <button className="link-btn" onClick={clearMeasurements}>Limpar</button> : undefined}>
        {measurements.length === 0 && <p className="hint">Use a Trena (M) e clique em dois pontos. Ela gruda em cantos e bordas; segure Shift para medir num eixo.</p>}
        <ul className="list">
          {measurements.map((m, i) => (
            <li key={m.id}>
              <button onClick={() => select({ kind: 'measure', id: m.id })}>
                <Icon name="ruler" size={14} />
                <span className="list-name">Medição {i + 1}</span>
                <span className="list-meta">{fmtCm(measureText(m.a, m.b).dist)}</span>
              </button>
              <button className="list-del" onClick={() => removeMeasurement(m.id)} title="Excluir">
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={house ? 'Portas e janelas' : 'Paredes e aberturas'}>
        <p className="hint" style={{ marginTop: 0, marginBottom: 6 }}>
          {house ? 'As paredes de cada cômodo ficam no painel do cômodo. Clique numa parede da cena para pintar ou pôr papel de parede.' : 'Clique numa parede (aqui ou na cena) para pintar ou colocar papel de parede.'}
        </p>
        <ul className="list">
          {!house && room.walls.map((w) => (
            <li key={w.id}>
              <button onClick={() => select({ kind: 'wall', id: w.id })} title="Pintar / papel de parede">
                <span className="dot" style={{ background: w.paint ?? '#f1eee8' }} />
                <span className="list-name">{wallName(room, w).replace(/^Parede /, '')}</span>
                <span className="list-meta">{fmtCmShort(wallLength(w))} cm</span>
              </button>
            </li>
          ))}
          {room.openings.filter((o) => !o.ghost).map((o) => (
            <li key={o.id}>
              <button onClick={() => select({ kind: 'opening', id: o.id })}>
                <Icon name={o.kind === 'window' ? 'window' : 'door'} size={14} />
                <span className="list-name">{KIND[o.kind]}</span>
                <span className="list-meta">
                  {fmtCmShort(o.width)} × {fmtCmShort(o.height)}
                  {o.kind === 'window' && ` · peitoril ${fmtCmShort(o.bottom)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {room.scanned.length > 0 && (
        <Section title="Objetos do scan" defaultOpen={false}>
          <ul className="list">
            {room.scanned.map((o) => (
              <li key={o.id}>
                <div className="list-static">
                  <span className="dot" style={{ background: '#8b5cf6' }} />
                  <span className="list-name">{scanCategoryName(o.category)}</span>
                  <span className="list-meta">{fmtDim(o.size[0], o.size[2], o.size[1])}</span>
                </div>
              </li>
            ))}
          </ul>
          <Check label="Mostrar posição original (fantasma)" checked={showScan} onChange={(v) => setSettings({ showScan: v })} />
          <div className="btn-row">
            <button className="btn" onClick={() => addItems(itemsFromScan(room))}>
              <Icon name="plus" size={16} /> Adicionar de novo como móveis
            </button>
          </div>
        </Section>
      )}
    </div>
  )
}



/** Faixa no alto do painel de um membro em edição: deixa claro como voltar ao grupo. */
function GroupReturn({ group, itemId }: { group: FurnitureGroup; itemId: string }) {
  const st = useStore.getState
  return (
    <div className="group-return">
      <button className="btn is-on" onClick={() => st().select({ kind: 'group', id: group.id })} title="Voltar ao grupo (Esc)">
        <Icon name="left" size={15} /> Voltar ao grupo “{group.name}”
      </button>
      <span className="muted small">
        Editando um membro: o que mudar aqui vale só para ele.{' '}
        <button className="link-btn" onClick={() => st().removeFromGroup(group.id, itemId)}>
          Tirar do grupo
        </button>
      </span>
    </div>
  )
}

/** Grupo selecionado: o mesmo jeito do painel do móvel, para o conjunto (pivô, giro, membros). */
function GroupPanel({ group }: { group: FurnitureGroup }) {
  const all = useStore((s) => s.items)
  const editing = useStore((s) => s.editingGroup === group.id)
  const { warnings } = useAnalysis()
  const st = useStore.getState
  const members = all.filter((i) => group.members.includes(i.id))
  const ids = members.map((i) => i.id)
  const locked = members.filter((i) => i.locked).length
  const alerts = warnings.filter((w) => ids.includes(w.itemId))
  const same = (k: 'elevation' | 'color') => members.every((i) => i[k] === members[0]?.[k])
  if (!members.length) return null
  return (
    <div className="panel">
      <div className="panel-head">
        <TextField className="title-input" value={group.name} onCommit={(v) => st().renameGroup(group.id, v)} />
        <div className="panel-sub">
          Grupo · {members.length} móveis
          {locked > 0 && <span className="tag">{locked === members.length ? 'travado' : `${locked} travado(s)`}</span>}
        </div>
        <div className="row-actions">
          <button className="btn" onClick={() => st().focusGroup(ids)} title="Levar a câmera até o grupo (F)">
            <Icon name="center" size={16} /> Focar
          </button>
          <button className="btn" onClick={() => st().duplicateGroup(group.id)} title="Duplicar o grupo ao lado (Ctrl+D)">
            <Icon name="copy" size={16} /> Duplicar
          </button>
          <button className={`btn${locked === members.length ? ' is-on' : ''}`} onClick={() => st().updateItems(ids, { locked: locked < members.length })} title="Travar/destravar todos (L)">
            <Icon name={locked === members.length ? 'lock' : 'unlock'} size={16} /> {locked === members.length ? 'Travado' : 'Travar'}
          </button>
          <button className="btn danger" onClick={() => st().removeItems(ids)} title="Excluir o grupo e os móveis dele (Delete)">
            <Icon name="trash" size={16} />
          </button>
        </div>
        <div className="btn-row group-actions">
          <button className={`btn${editing ? ' is-on' : ''}`} onClick={() => (editing ? st().select({ kind: 'group', id: group.id }) : st().editGroup(group.id))} title="Mexer em um móvel do grupo sem desfazer o grupo">
            <Icon name="select" size={15} /> {editing ? 'Concluir edição' : 'Editar membros'}
          </button>
          <button className="btn" onClick={() => st().ungroup(group.id)} title="Desfaz o grupo; os móveis ficam onde estão (e selecionados)">
            <Icon name="layers" size={15} /> Desagrupar
          </button>
        </div>
      </div>
      {editing && (
        <div className="group-edit">
          Editando os membros: clique num móvel do grupo (na cena ou na lista abaixo) para mexer só nele. Esc ou “Concluir edição” volta ao grupo.
        </div>
      )}
      {alerts.length > 0 && (
        <div className="alerts">
          {alerts.map((w, k) => (
            <button key={k} className={`alert alert-${w.level}`} onClick={() => st().select({ kind: 'item', id: w.itemId })}>
              <Icon name="alert" size={15} />
              <span>{w.message}</span>
            </button>
          ))}
        </div>
      )}
      <Section title="Posição do grupo">
        <div className="grid2">
          <NumberField label="Pivô X" value={group.pivot[0]} onCommit={(v) => st().moveGroup(group.id, v - group.pivot[0], 0)} disabled={locked === members.length} />
          <NumberField label="Pivô Z" value={group.pivot[1]} onCommit={(v) => st().moveGroup(group.id, 0, v - group.pivot[1])} disabled={locked === members.length} />
        </div>
        <div className="grid2">
          <NumberField label="Rotação" unit="°" scale={DEG} step={1} value={shownRotation(group.rotation)} onCommit={(v) => st().rotateGroup(group.id, normAngle(v - group.rotation))} disabled={locked === members.length} />
          <div className="field">
            <span>&nbsp;</span>
            <button className="btn" onClick={() => st().centerGroupPivot(group.id)} title="Põe o pivô no centro do grupo (nada se move)">
              Pivô no centro
            </button>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => st().rotateGroup(group.id, Math.PI / 2)} title="Girar 90° anti-horário em volta do pivô (R)">
            <Icon name="rotL" size={16} /> 90°
          </button>
          <button className="btn" onClick={() => st().rotateGroup(group.id, -Math.PI / 2)} title="Girar 90° horário em volta do pivô (Shift+R)">
            <Icon name="rotR" size={16} /> 90°
          </button>
        </div>
        <p className="hint">
          Arraste qualquer móvel do grupo na cena para levar todos — as distâncias entre eles não mudam. O que está em cima deles (monitor, abajur…) vai junto, como sempre.
        </p>
      </Section>
      <Section title={`Membros (${members.length})`}>
        <ul className="list">
          {members.map((m) => (
            <li key={m.id}>
              <button onClick={() => st().editGroup(group.id, m.id)} onPointerEnter={() => st().setHovered(m.id)} onPointerLeave={() => st().setHovered(null)} title="Mexer só neste (com o caminho de volta ao grupo)">
                <span className="dot" style={{ background: m.color }} />
                <span className="list-name">{m.name}</span>
                <span className="list-meta">{fmtDim(m.width, m.depth, m.height)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Propriedades em comum" defaultOpen={false}>
        <NumberField label="Distância do piso" value={members[0].elevation} mixed={!same('elevation')} min={0} max={3} onCommit={(v) => st().updateItems(ids, { elevation: v })} />
        <ColorField label="Cor principal" value={members[0].color} mixed={!same('color')} onChange={(c) => st().updateItems(ids, { color: c })} />
      </Section>
    </div>
  )
}

/** Vários móveis selecionados: ações em lote e só as propriedades que todos têm. */
function MultiPanel() {
  const multi = useStore((s) => s.multi)
  const multiMode = useStore((s) => s.multiMode)
  const all = useStore((s) => s.items)
  const { warnings } = useAnalysis()
  const [step, setStep] = useState(0.1)
  const st = useStore.getState
  const items = all.filter((i) => multi.includes(i.id))
  const ids = items.map((i) => i.id)
  const n = items.length
  const types = new Set(items.map((i) => i.type))
  const sameType = n && types.size === 1 ? TYPES[items[0].type] : null
  const locked = items.filter((i) => i.locked).length
  const same = (k: 'elevation' | 'color' | 'color2') => items.every((i) => i[k] === items[0][k])
  const alerts = warnings.filter((w) => ids.includes(w.itemId))
  const move = (dx: number, dz: number) => st().moveItems(ids, dx * step, dz * step)
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="title-static">
          <Icon name="select" /> {n === 0 ? 'Selecionar vários' : n === 1 ? '1 item selecionado' : `${n} itens selecionados`}
        </div>
        <div className="panel-sub">
          {multiMode
            ? 'Clique nos móveis da cena para incluir ou tirar da seleção. Na planta, arraste um retângulo.'
            : 'Shift + clique inclui ou tira. Na planta, Shift + arrastar no vazio seleciona em retângulo.'}
        </div>
        <div className="row-actions">
          {multiMode && (
            <button className="btn is-on" onClick={() => st().setMultiMode(false)} title="Sair do modo de selecionar vários (a seleção continua)">
              <Icon name="check" size={16} /> Concluir
            </button>
          )}
          {n > 0 && (
            <button className="btn" onClick={() => st().focusGroup(ids)} title="Levar a câmera até o conjunto (F)">
              <Icon name="center" size={16} /> Focar
            </button>
          )}
          {n > 1 && (
            <button className="btn" onClick={() => st().createGroup(ids)} title="Agrupar: vira um conjunto com nome que se move junto e fica salvo no projeto">
              <Icon name="layers" size={16} /> Agrupar
            </button>
          )}
          {n > 0 && (
            <button className="btn" onClick={() => st().duplicateItems(ids)} title="Duplicar o conjunto ao lado (Ctrl+D)">
              <Icon name="copy" size={16} /> Duplicar
            </button>
          )}
          {n > 0 && (
            <button className="btn danger" onClick={() => st().removeItems(ids)} title={`Excluir os ${n} (Delete)`}>
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
        <button className="link-btn multi-clear" onClick={() => st().select(null)} title="Esc">
          Limpar seleção
        </button>
      </div>
      {n > 0 && (
        <>
          <div className="multi-chips">
            {items.map((i) => (
              <span key={i.id} className="multi-chip">
                <button onClick={() => st().select({ kind: 'item', id: i.id })} title="Selecionar só este">
                  {i.name}
                </button>
                <button className="multi-x" onClick={() => st().toggleMulti(i.id)} aria-label={`Tirar ${i.name} da seleção`} title="Tirar da seleção">
                  ×
                </button>
              </span>
            ))}
          </div>
          {alerts.length > 0 && (
            <div className="alerts">
              {alerts.map((w, k) => (
                <button key={k} className={`alert alert-${w.level}`} onClick={() => st().select({ kind: 'item', id: w.itemId })}>
                  <Icon name="alert" size={15} />
                  <span>{w.message}</span>
                </button>
              ))}
            </div>
          )}
          <Section title="Mover e girar o conjunto">
            <div className="align">
              <span className="align-label">Mover</span>
              <div className="align-pad">
                <button className="btn icon" onClick={() => move(0, -1)} title="Para cima (na planta)">
                  <Icon name="up" size={16} />
                </button>
                <button className="btn icon" onClick={() => move(-1, 0)} title="Para a esquerda">
                  <Icon name="left" size={16} />
                </button>
                <button className="btn icon" onClick={() => move(1, 0)} title="Para a direita">
                  <Icon name="right" size={16} />
                </button>
                <button className="btn icon" onClick={() => move(0, 1)} title="Para baixo (na planta)">
                  <Icon name="down" size={16} />
                </button>
              </div>
              <select className="step-select" value={step} onChange={(e) => setStep(Number(e.target.value))} title="Quanto cada clique move">
                <option value={0.01}>1 cm</option>
                <option value={0.1}>10 cm</option>
                <option value={0.5}>50 cm</option>
              </select>
            </div>
            <div className="btn-row">
              <button className="btn" onClick={() => st().rotateItems(ids, Math.PI / 2)} title="Girar o conjunto 90° anti-horário (R)">
                <Icon name="rotL" size={16} /> 90°
              </button>
              <button className="btn" onClick={() => st().rotateItems(ids, -Math.PI / 2)} title="Girar o conjunto 90° horário (Shift+R)">
                <Icon name="rotR" size={16} /> 90°
              </button>
              <span className="muted small">gira em volta do centro do conjunto</span>
            </div>
            <p className="hint">
              Arraste qualquer um deles na cena para levar todos (Alt solta a grade). No teclado: setas (Shift = 10 cm), R / Shift+R gira, Ctrl+Z desfaz tudo de uma vez.
              {locked > 0 && ` ${locked === 1 ? '1 travado fica parado' : `${locked} travados ficam parados`}.`}
            </p>
          </Section>
          <Section title="Propriedades em comum">
            <NumberField label="Distância do piso" value={items[0].elevation} mixed={!same('elevation')} min={0} max={3} onCommit={(v) => st().updateItems(ids, { elevation: v })} />
            <ColorField label={sameType?.colorLabel ?? 'Cor principal'} value={items[0].color} mixed={!same('color')} onChange={(c) => st().updateItems(ids, { color: c })} />
            {sameType?.color2Label && (
              <ColorField label={sameType.color2Label} value={items[0].color2} mixed={!same('color2')} onChange={(c) => st().updateItems(ids, { color2: c })} />
            )}
            <Check
              label={locked > 0 && locked < n ? `Travar posição (${locked} de ${n} travados)` : 'Travar posição'}
              checked={locked === n}
              onChange={(v) => st().updateItems(ids, { locked: v })}
            />
            <p className="hint">
              {sameType
                ? `Todos são “${sameType.name}”. Medidas e opções de cada um ficam no painel dele (clique no nome acima).`
                : `Tipos diferentes — aqui ficam só as propriedades que todos têm. Medidas e opções de cada um ficam no painel dele (clique no nome acima).`}
            </p>
          </Section>
        </>
      )}
    </div>
  )
}

export function Inspector() {
  const sel = useStore((s) => s.selection)
  const multiActive = useStore((s) => s.multi.length > 1 || s.multiMode)
  const groups = useStore((s) => s.groups)
  const editingGroup = useStore((s) => s.editingGroup)
  const item = useStore(selectedItem)
  const room = useStore((s) => s.room)
  const measurements = useStore((s) => s.measurements)
  if (multiActive) return <MultiPanel />
  if (sel?.kind === 'group') {
    const g = groups.find((x) => x.id === sel.id)
    if (g) return <GroupPanel key={g.id} group={g} />
  }
  // key: cada seleção monta o seu painel (um campo em edição não grava no próximo móvel clicado)
  if (sel?.kind === 'item' && item) {
    const eg = groups.find((x) => x.id === editingGroup && x.members.includes(item.id))
    return (
      <>
        {eg && <GroupReturn group={eg} itemId={item.id} />}
        <ItemPanel key={item.id} item={item} />
      </>
    )
  }
  if (sel?.kind === 'opening' && room) {
    const op = room.openings.find((o) => o.id === sel.id)
    if (op) return <OpeningPanel key={op.id} op={op} room={room} />
  }
  if (sel?.kind === 'space' && room) {
    const sp = room.spaces?.find((x) => x.id === sel.id)
    if (sp) return <SpacePanel key={sp.id} space={sp} room={room} />
  }
  if (sel?.kind === 'wall' && room) {
    const w = room.walls.find((x) => x.id === sel.id)
    if (w) return <WallPanelView key={w.id} wall={w} room={room} />
  }
  if (sel?.kind === 'measure') {
    const m = measurements.find((x) => x.id === sel.id)
    if (m) return <MeasurePanel key={m.id} m={m} />
  }
  return <RoomPanel />
}
