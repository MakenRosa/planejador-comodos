import { useEffect, useState } from 'react'
import { useAnalysis } from '../hooks'
import { fmtCmShort } from '../lib/util'
import { CASA_RETRY_MS } from '../lib/casaSync'
import { selectedItem, useStore } from '../store'
import { exportProject } from './fileOps'
import { Icon } from './Icon'
import { hhmm, saveApi, saveFailed, useSaveStatus } from './saveStatus'

/** Clique no contador de alertas: volta ao painel da casa e rola até a lista de alertas. */
function showAlerts() {
  useStore.getState().select(null)
  requestAnimationFrame(() => document.querySelector('.right .alerts')?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}

export function StatusBar() {
  const cursor = useStore((s) => s.cursor)
  const items = useStore((s) => s.items.length)
  const magnet = useStore((s) => s.settings.magnet)
  const step = useStore((s) => s.settings.snapStep)
  const { warnings } = useAnalysis()
  const errors = warnings.filter((w) => w.level === 'error').length
  return (
    <footer className="status">
      <span className="mono">{cursor ? `x ${fmtCmShort(cursor[0])} · z ${fmtCmShort(cursor[1])} cm` : 'x — · z —'}</span>
      <span>{items} móveis</span>
      {warnings.length ? (
        <button className={`st-link ${errors ? 'st-err' : 'st-warn'}`} onClick={showAlerts} title="Ver os alertas no painel à direita">
          {errors ? `${errors} conflito(s)` : `${warnings.length} alerta(s)`}
        </button>
      ) : (
        <span className="st-ok">Sem conflitos</span>
      )}
      <span>
        Ímã {magnet ? 'ligado' : 'desligado'} · grade {step ? `${Math.round(step * 100)} cm` : 'livre'}
      </span>
      <span className="spacer" />
      <SaveIndicator />
    </footer>
  )
}

const hhmmss = (t: number) => new Date(t).toLocaleTimeString('pt-BR')

/** Onde e quando gravou por último; em falha, vira o botão que reabre o aviso. */
function SaveIndicator() {
  const s = useSaveStatus()
  const where = s.repo ? 'em casa/' : 'neste navegador'
  const at = s.repo ? s.repo.lastOk : s.local.at
  const tip = [
    s.repo &&
      `Pasta casa/ do repositório (vale ao abrir): ${s.repo.failed.length ? `falhou — ${s.repo.error}` : s.repo.lastOk ? `gravado às ${hhmmss(s.repo.lastOk)}` : 'em dia'}`,
    `Navegador${s.repo ? ' (cópia de segurança)' : ''}: ${s.local.error ? `falhou — ${s.local.error}` : s.local.at ? `gravado às ${hhmmss(s.local.at)}` : 'em dia'}`,
  ]
    .filter(Boolean)
    .join('\n')
  if (saveFailed(s))
    return (
      <button className="st-link st-err st-save" onClick={() => useSaveStatus.setState({ dismissed: false })} title={`${tip}\n\nClique para ver o que fazer`}>
        <Icon name="alert" size={13} /> Falha ao salvar
      </button>
    )
  return (
    <span className="muted st-save" title={tip}>
      {s.dirty || s.repo?.busy ? 'Salvando…' : at ? `Salvo ${where} às ${hhmm(at)}` : `Salvo ${where}`}
    </span>
  )
}

/** Aviso que fica na tela enquanto uma gravação falhar: tentar de novo ou exportar uma cópia. */
export function SaveAlert() {
  const s = useSaveStatus()
  if (!saveFailed(s) || s.dismissed) return null
  const repoFail = !!s.repo?.failed.length
  const busy = !!s.repo?.busy
  return (
    <div className="save-alert" role="alert">
      <Icon name="alert" size={18} />
      <div className="sa-body">
        <b>{repoFail ? 'Não consegui gravar na pasta casa/' : 'Não consegui salvar neste navegador'}</b>
        {repoFail ? (
          <p>
            Motivo: {s.repo!.error}.{' '}
            {s.local.error
              ? 'O navegador também não gravou — exporte uma cópia para não perder o trabalho.'
              : `As alterações${s.repo!.lastOk ? ` desde ${hhmm(s.repo!.lastOk)}` : ''} estão só neste navegador; não recarregue antes de gravar.`}{' '}
            Tento de novo sozinho a cada {CASA_RETRY_MS / 1000} s.
          </p>
        ) : (
          <p>Motivo: {s.local.error}. Exporte uma cópia para não perder o trabalho.</p>
        )}
        <div className="btn-row">
          <button className="btn primary" disabled={busy} onClick={() => saveApi.saveNow?.()}>
            {busy ? 'Tentando…' : 'Tentar novamente'}
          </button>
          <button className="btn" onClick={() => void exportProject()} title="Baixa o projeto num arquivo .json (abre de volta pelo menu Arquivo)">
            <Icon name="save" size={15} /> Exportar cópia
          </button>
        </div>
      </div>
      <button className="icon-btn sa-close" onClick={() => useSaveStatus.setState({ dismissed: true })} title="Fechar (a barra de baixo continua avisando)">
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}

export function ViewOverlay() {
  const view = useStore((s) => s.settings.view)
  const tool = useStore((s) => s.settings.tool)
  const camera = useStore((s) => s.requestCamera)
  const item = useStore(selectedItem)
  const interacting = useStore((s) => s.interacting)
  const wallMode = useStore((s) => s.settings.wallMode)
  const setSettings = useStore((s) => s.setSettings)
  const spaces = useStore((s) => s.room?.spaces)
  const focus = useStore((s) => s.focusSpace)
  const setFocus = useStore((s) => s.setFocusSpace)
  const low = wallMode === 'low'
  const focused = spaces?.find((s) => s.id === focus)
  const walk = useStore((s) => s.walk)
  const setWalk = useStore((s) => s.setWalk)
  const selKind = useStore((s) => s.selection?.kind)
  const multiCount = useStore((s) => s.multi.length)
  const multiMode = useStore((s) => s.multiMode)
  const marquee = useStore((s) => s.marquee)
  const editingGroup = useStore((s) => s.editingGroup)

  let hint = 'Clique num móvel para selecionar (Shift soma vários) · arraste para mover · arraste o fundo para girar a câmera (botão direito: deslocar) · Ctrl + roda: zoom no cursor'
  if (view === '2d') hint = 'Clique num móvel para selecionar (Shift soma vários) · arraste para mover · arraste o fundo para deslocar · Shift + arrastar no vazio: seleção em retângulo'
  if (multiMode) hint = 'Selecionar vários: clique nos móveis para incluir ou tirar · na planta, arraste um retângulo · Esc termina'
  else if (multiCount > 1) hint = `${multiCount} selecionados · arraste qualquer um para mover todos · setas movem · R gira · Ctrl+D duplica · Delete exclui · Esc desmarca`
  if (selKind === 'group') hint = 'Grupo selecionado · arraste qualquer móvel dele para mover todos · setas movem · R gira em volta do pivô · Ctrl+D duplica · Delete exclui · Esc desmarca'
  if (selKind === 'opening') hint = 'Arraste a porta/janela ao longo da parede ou para outra parede do cômodo · Alt solta o ímã · Delete exclui · Esc desmarca'
  if (selKind === 'wall') hint = 'Parede selecionada: pinte, ponha azulejo ou papel de parede e crie portas/janelas no painel à direita · Esc desmarca'
  if (item) hint = item.locked ? 'Móvel travado (L para destravar)' : 'Arraste para mover · alças: redimensionar/girar · seta verde (3D) ou PgUp/PgDn: subir/descer · R gira 90° · Alt desliga o ímã'
  if (item && editingGroup) hint = 'Editando um membro do grupo — o que mudar vale só para ele · Esc volta ao grupo'
  if (walk && !item) hint = 'Primeira pessoa · W A S D anda (Shift corre) · arraste para olhar · Q/E vira · roda: frente/trás · duplo clique no piso: ir até lá · Esc sai'
  if (tool === 'measure') hint = 'Trena: clique no ponto inicial e no final · gruda em cantos (laranja) e bordas (azul) · Shift trava o eixo · Esc cancela'
  if (interacting) hint = 'Solte para confirmar · Alt: sem ímã · Ctrl+Z desfaz'

  return (
    <>
      <div className="vo-top">
        {(spaces?.length ?? 0) > 1 && (
          <label className={`vo-btn vo-select${focused ? ' is-on' : ''}`} title="Ver só um cômodo (os outros ficam ocultos)">
            <Icon name="home" size={16} />
            <select value={focused ? focus! : ''} onChange={(e) => setFocus(e.target.value || null)}>
              <option value="">Casa toda</option>
              {spaces!.map((s) => (
                <option key={s.id} value={s.id}>
                  Só {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {focused && (
          <button className="vo-btn" onClick={() => setFocus(null)} title="Voltar a ver a casa toda">
            <Icon name="x" size={14} /> Casa toda
          </button>
        )}
        {item && (
          <button className="vo-btn" onClick={() => useStore.getState().focusItem(item.attachedTo ?? item.id)} title="Levar a câmera até o móvel selecionado e girar em volta dele (F ou duplo clique no móvel)">
            <Icon name="center" size={16} /> Focar em {item.name.length > 22 ? item.name.slice(0, 21) + '…' : item.name}
          </button>
        )}
        {view === '3d' ? (
          <>
            <button className="vo-btn" onClick={() => camera('iso')} title="Vista geral">
              <Icon name="iso" size={16} /> Geral
            </button>
            <button
              className={`vo-btn${walk ? ' is-on' : ''}`}
              onClick={() => setWalk(!walk)}
              title={walk ? 'Sair do modo primeira pessoa (Esc)' : 'Andar pela casa em primeira pessoa (altura dos olhos, 1,60 m) — W A S D, arraste para olhar'}
            >
              <Icon name="person" size={16} /> {walk ? 'Sair do modo andar' : 'Andar (1ª pessoa)'}
            </button>
            {!walk && <button
              className={`vo-btn${low ? ' is-on' : ''}`}
              onClick={() => setSettings({ wallMode: low ? 'cutaway' : 'low' })}
              title={low ? 'Paredes cortadas a 1,10 m para ver todos os cômodos — clique para paredes inteiras' : 'Cortar as paredes a 1,10 m para ver todos os cômodos de cima'}
            >
              <Icon name="wall" size={16} /> {low ? 'Paredes baixas' : 'Paredes inteiras'}
            </button>}
          </>
        ) : (
          <button className="vo-btn" onClick={() => camera('fit')} title="Enquadrar (F)">
            <Icon name="fit" size={16} /> Enquadrar
          </button>
        )}
      </div>
      <div className="vo-hint">{hint}</div>
      {marquee && (
        <div
          className="marquee"
          style={{
            left: Math.min(marquee[0], marquee[2]),
            top: Math.min(marquee[1], marquee[3]),
            width: Math.abs(marquee[2] - marquee[0]),
            height: Math.abs(marquee[3] - marquee[1]),
          }}
        />
      )}
    </>
  )
}

export function Toast() {
  const toast = useStore((s) => s.toast)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 3200)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast || !visible) return null
  return <div className="toast">{toast.msg}</div>
}
