import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore, type ThemePref, type WallMode } from '../store'
import { useIsDark } from '../theme'
import { CheckpointsPanel } from './Checkpoints'
import { Check, NumberField } from './fields'
import { exportPng, exportProject, exportSvg, loadSample, newRectRoom, openFile, pickFile } from './fileOps'
import { Icon } from './Icon'

function Menu({ label, icon, children, title, wide }: { label: string; icon: string; children: (close: () => void) => ReactNode; title?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    // Esc fecha o menu (antes do atalho global, que tiraria a seleção com o menu ainda aberto)
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('pointerdown', h)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', h)
      window.removeEventListener('keydown', key, true)
    }
  }, [open])
  return (
    <div className="menu" ref={ref}>
      <button className={`tb-btn${open ? ' is-on' : ''}`} onClick={() => setOpen(!open)} title={title}>
        <Icon name={icon} />
        <span>{label}</span>
        <Icon name="chevron" size={14} />
      </button>
      {open && <div className={`menu-pop${wide ? ' wide' : ''}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

function Btn({ icon, label, onClick, on, disabled, title, kbd }: { icon: string; label?: string; onClick: () => void; on?: boolean; disabled?: boolean; title?: string; kbd?: string }) {
  return (
    <button className={`tb-btn${on ? ' is-on' : ''}`} onClick={onClick} disabled={disabled} title={title ? `${title}${kbd ? ` (${kbd})` : ''}` : undefined}>
      <Icon name={icon} />
      {label && <span>{label}</span>}
    </button>
  )
}

/** Enquanto um diálogo está aberto: Esc fecha e os atalhos da cena (Delete, R, setas…) não agem no que está selecionado por trás dele. */
function useModalKeys(onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
        return
      }
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (!typing) e.stopPropagation()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
}

export function NewRoomDialog({ onClose }: { onClose: () => void }) {
  useModalKeys(onClose)
  const [w, setW] = useState(4)
  const [d, setD] = useState(3)
  const [h, setH] = useState(2.6)
  const [name, setName] = useState('Cômodo')
  return (
    <div className="modal-back" onPointerDown={onClose}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <h2>Novo cômodo</h2>
        <p className="muted">Crie um cômodo retangular pelas medidas internas, ou volte ao scan do RoomPlan.</p>
        <label className="field">
          <span>Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid3">
          <NumberField label="Largura" value={w} onCommit={setW} min={0.5} max={30} />
          <NumberField label="Comprimento" value={d} onCommit={setD} min={0.5} max={30} />
          <NumberField label="Pé-direito" value={h} onCommit={setH} min={1.8} max={8} />
        </div>
        <div className="modal-actions">
          <button
            className="btn ghost"
            onClick={() => {
              if (useStore.getState().items.length && !confirm('Isto substitui o projeto atual. Continuar?')) return
              loadSample()
              onClose()
            }}
          >
            Recarregar a casa (scans)
          </button>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            onClick={() => {
              if (useStore.getState().items.length && !confirm('Isto substitui o projeto atual. Continuar?')) return
              newRectRoom(w, d, h, name || 'Cômodo')
              onClose()
            }}
          >
            Criar
          </button>
        </div>
      </div>
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Arrastar móvel', 'Mover (com ímã nas paredes e móveis)'],
  ['Alt + arrastar', 'Mover/redimensionar livre, sem ímã nem grade'],
  ['Alças brancas', 'Redimensionar largura/profundidade'],
  ['Anel azul', 'Girar (15° por passo; Shift = 45°; Alt = livre)'],
  ['Seta azul (3D)', 'Altura do móvel'],
  ['Seta verde dupla (3D)', 'Subir/descer o móvel (gruda no piso e no tampo do móvel de baixo)'],
  ['PgUp / PgDn  ou  Alt+↑ / Alt+↓', 'Subir/descer 1 cm (Shift = 10 cm)'],
  ['Clique numa cota', 'Digitar a medida ou distância exata'],
  ['R / Shift+R', 'Girar 90° / −90°'],
  ['← ↑ → ↓', 'Mover 1 cm (Shift = 10 cm)'],
  ['Shift + clique', 'Somar/tirar móveis da seleção (vários de uma vez)'],
  ['Shift + arrastar no vazio (planta)', 'Selecionar em retângulo os móveis cujo centro fica dentro'],
  ['Ctrl+A', 'Selecionar todos os móveis da vista (casa toda ou cômodo em foco)'],
  ['Arrastar um da seleção', 'Move o conjunto inteiro (um só Ctrl+Z desfaz)'],
  ['Clique num móvel de grupo', 'Seleciona o grupo todo (Editar membros mexe em um só; Esc volta ao grupo)'],
  ['Ctrl+D', 'Duplicar (com vários selecionados, duplica o conjunto)'],
  ['Ctrl+C / Ctrl+V', 'Copiar e colar o móvel, a seleção ou o grupo — cola embaixo do mouse (fora da cena, ao lado do original)'],
  ['Delete', 'Excluir seleção'],
  ['L', 'Travar/destravar móvel'],
  ['V / M', 'Selecionar / Trena'],
  ['Shift na trena', 'Travar no eixo X, Y ou Z (medida perpendicular)'],
  ['2 / 3', 'Planta 2D / Vista 3D'],
  ['Roda do mouse', 'Zoom (no 3D, em direção ao centro da vista; na planta, onde está o cursor)'],
  ['Ctrl + roda  ou  Alt + roda (3D)', 'Zoom em direção ao cursor'],
  ['F / duplo clique', 'Focar no móvel selecionado (a câmera gira em volta dele); sem seleção, enquadra o cômodo'],
  ['Ctrl+Z / Ctrl+Y', 'Desfazer / Refazer'],
  ['Ctrl+S', 'Salvar projeto em arquivo'],
  ['Ctrl+Shift+S', 'Salvar um checkpoint (versão para comparar)'],
  ['Esc', 'Cancelar medição / sair da trena / desmarcar (também a seleção de vários) / sair do modo andar'],
  ['W A S D (modo andar)', 'Andar em primeira pessoa (Shift corre, Q/E vira, arraste para olhar, duplo clique no piso vai até lá)'],
]

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useModalKeys(onClose)
  return (
    <div className="modal-back" onPointerDown={onClose}>
      <div className="modal wide" onPointerDown={(e) => e.stopPropagation()}>
        <h2>Atalhos e gestos</h2>
        <table className="kbd-table">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-actions">
          <span className="spacer" />
          <button className="btn primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

export function Toolbar() {
  const room = useStore((s) => s.room)
  const s = useStore((st) => st.settings)
  const set = useStore((st) => st.setSettings)
  const canUndo = useStore((st) => st.past.length > 0)
  const canRedo = useStore((st) => st.future.length > 0)
  const undo = useStore((st) => st.undo)
  const redo = useStore((st) => st.redo)
  const [dialog, setDialog] = useState<'new' | 'keys' | null>(null)
  const dark = useIsDark()
  const cpCount = useStore((st) => st.checkpoints.length)

  return (
    <header className="toolbar">
      <div className="brand">
        <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden>
          <rect x="3" y="3" width="26" height="26" rx="5" fill="none" stroke="currentColor" strokeWidth="2.6" />
          <rect x="8" y="15" width="10" height="9" rx="1.5" fill="currentColor" />
          <path d="M20 8h4v4" fill="none" stroke="currentColor" strokeWidth="2.2" />
        </svg>
        <div>
          <b>Planejador</b>
          <span className="brand-room">{room?.name ?? '—'}</span>
        </div>
      </div>

      <div className="tb-group">
        <Menu label="Arquivo" icon="open">
          {(close) => (
            <>
              <button
                className="menu-item"
                onClick={() => {
                  close()
                  pickFile('.json,.glb', openFile)
                }}
              >
                <Icon name="open" /> Abrir scan RoomPlan / projeto…
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  close()
                  setDialog('new')
                }}
              >
                <Icon name="home" /> Novo cômodo…
              </button>
              <div className="menu-sep" />
              <button
                className="menu-item"
                onClick={() => {
                  close()
                  exportProject()
                }}
              >
                <Icon name="save" /> Salvar projeto (.json) <kbd>Ctrl+S</kbd>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  close()
                  exportSvg()
                }}
              >
                <Icon name="file" /> Exportar planta em escala (SVG)
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  close()
                  exportPng()
                }}
              >
                <Icon name="image" /> Exportar imagem da vista (PNG)
              </button>
              <div className="menu-sep" />
              <div className="menu-note">O projeto é salvo automaticamente neste navegador.</div>
            </>
          )}
        </Menu>
        <Btn icon="undo" onClick={undo} disabled={!canUndo} title="Desfazer" kbd="Ctrl+Z" />
        <Btn icon="redo" onClick={redo} disabled={!canRedo} title="Refazer" kbd="Ctrl+Y" />
      </div>

      <div className="tb-group">
        <Menu label={`Checkpoints${cpCount ? ` (${cpCount})` : ''}`} icon="flag" title="Salvar e restaurar versões do projeto para comparar combinações" wide>
          {() => <CheckpointsPanel />}
        </Menu>
      </div>

      <div className="tb-group seg">
        <Btn icon="select" label="Selecionar" on={s.tool === 'select'} onClick={() => set({ tool: 'select' })} title="Selecionar e mover" kbd="V" />
        <Btn icon="ruler" label="Trena" on={s.tool === 'measure'} onClick={() => set({ tool: 'measure' })} title="Medir entre dois pontos" kbd="M" />
      </div>

      <div className="tb-group seg">
        <Btn icon="cube" label="3D" on={s.view === '3d'} onClick={() => set({ view: '3d' })} title="Vista 3D" kbd="3" />
        <Btn icon="plan" label="Planta" on={s.view === '2d'} onClick={() => set({ view: '2d' })} title="Planta baixa 2D" kbd="2" />
      </div>

      <div className="tb-group">
        <Btn icon="magnet" label="Ímã" on={s.magnet} onClick={() => set({ magnet: !s.magnet })} title="Encaixar em paredes e bordas de móveis (segure Alt para desligar momentaneamente)" />
        <label className="tb-select" title="Passo da grade ao mover">
          <Icon name="grid" />
          <select value={s.snapStep} onChange={(e) => set({ snapStep: Number(e.target.value) })}>
            <option value={0}>Livre</option>
            <option value={0.01}>1 cm</option>
            <option value={0.05}>5 cm</option>
            <option value={0.1}>10 cm</option>
          </select>
        </label>
      </div>

      <span className="spacer" />

      <div className="tb-group">
        <Menu label="Exibir" icon="eye">
          {() => (
            <div className="menu-checks">
              <Check label="Grade no piso" checked={s.showGrid} onChange={(v) => set({ showGrid: v })} />
              <Check label="Cotas das paredes e aberturas" checked={s.showRoomDims} onChange={(v) => set({ showRoomDims: v })} />
              <Check label="Distâncias do móvel selecionado" checked={s.showClearances} onChange={(v) => set({ showClearances: v })} />
              <Check label="Nome e medidas de todos os móveis" checked={s.showLabels} onChange={(v) => set({ showLabels: v })} />
              <Check label="Abertura das portas" checked={s.showSwings} onChange={(v) => set({ showSwings: v })} />
              <Check label="Objetos originais do scan" checked={s.showScan} onChange={(v) => set({ showScan: v })} />
              <Check
                label="Novo item segue o último do mesmo tipo"
                title="Ao adicionar do catálogo, usa a altura do piso, as medidas, as cores e as opções do último ajustado (ex.: tomadas na mesma altura, ao lado da anterior)"
                checked={s.followLast}
                onChange={(v) => set({ followLast: v })}
              />
              <div className="menu-sep" />
              <div className="menu-label">Paredes na vista 3D</div>
              <div className="seg-mini">
                {(
                  [
                    ['cutaway', 'Recorte'],
                    ['low', 'Baixas'],
                    ['transparent', 'Transparentes'],
                    ['full', 'Sólidas'],
                  ] as [WallMode, string][]
                ).map(([k, l]) => (
                  <button key={k} className={s.wallMode === k ? 'is-on' : ''} onClick={() => set({ wallMode: k })}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="menu-sep" />
              <div className="menu-label">Tema</div>
              <div className="seg-mini">
                {(
                  [
                    ['system', 'Automático'],
                    ['light', 'Claro'],
                    ['dark', 'Escuro'],
                  ] as [ThemePref, string][]
                ).map(([k, l]) => (
                  <button key={k} className={s.theme === k ? 'is-on' : ''} onClick={() => set({ theme: k })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Menu>
        <Btn icon={dark ? 'sun' : 'moon'} onClick={() => set({ theme: dark ? 'light' : 'dark' })} title={dark ? 'Modo claro' : 'Modo escuro'} />
        <Btn icon="keyboard" onClick={() => setDialog('keys')} title="Atalhos e gestos" />
      </div>
      {dialog === 'new' && <NewRoomDialog onClose={() => setDialog(null)} />}
      {dialog === 'keys' && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </header>
  )
}
