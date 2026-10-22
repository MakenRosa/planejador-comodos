import { useState } from 'react'
import type { CheckpointMeta } from '../lib/persist'
import { useStore } from '../store'
import { deleteCheckpoint, overwriteCheckpoint, renameCheckpoint, restoreCheckpoint, saveCheckpoint } from './checkpointStore'
import { TextField } from './fields'
import { Icon } from './Icon'

function when(iso: string) {
  const d = new Date(iso)
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return `hoje, ${hm}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}, ${hm}`
}

/** Conteúdo do menu "Checkpoints": salvar o estado atual, restaurar, atualizar, renomear e excluir. */
export function CheckpointsPanel() {
  const list = useStore((s) => s.checkpoints)
  const base = useStore((s) => s.cpBase)
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  const measurements = useStore((s) => s.measurements)
  const groups = useStore((s) => s.groups)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  // o estado atual é exatamente o do último checkpoint salvo/restaurado?
  const pristine = !!base && base.room === room && base.items === items && base.measurements === measurements && (base.groups === undefined || base.groups === groups)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  const restore = (c: CheckpointMeta) => run(() => restoreCheckpoint(c.id))

  return (
    <div className="cp-panel">
      <div className="cp-head">
        <b>Checkpoints</b>
        <span>Guarde o projeto como está agora (móveis, cores, papéis de parede, portas e medidas) para testar outra combinação e voltar quando quiser.</span>
      </div>
      <form
        className="cp-new"
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            await saveCheckpoint(name)
            setName('')
          })
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: sofá perto da janela)" maxLength={60} />
        <button className="btn primary" type="submit" disabled={busy || !room}>
          <Icon name="flag" size={15} /> Salvar
        </button>
      </form>

      {list.length === 0 ? (
        <p className="cp-empty">Nenhum checkpoint ainda. Salve o estado atual, mude o que quiser e compare.</p>
      ) : (
        <ul className="cp-list">
          {list.map((c) => {
            const current = base?.id === c.id
            return (
              <li key={c.id} className={current ? 'is-current' : ''}>
                <button className="cp-thumb" onClick={() => restore(c)} disabled={busy} title={`Restaurar “${c.name}”`}>
                  {c.thumb ? <img src={c.thumb} alt="" /> : <Icon name="image" size={20} />}
                </button>
                <div className="cp-info">
                  <TextField className="cp-name" value={c.name} onCommit={(v) => renameCheckpoint(c.id, v)} />
                  <span className="cp-meta">
                    {when(c.updatedAt)} · {c.itemCount} móveis
                    {current && <b className={pristine ? 'cp-tag' : 'cp-tag is-changed'}>{pristine ? 'atual' : 'alterado depois'}</b>}
                  </span>
                  <div className="cp-actions">
                    <button className="btn" onClick={() => restore(c)} disabled={busy || (current && pristine)}>
                      <Icon name="undo" size={14} /> Restaurar
                    </button>
                    <button
                      className="icon-btn"
                      disabled={busy}
                      title="Atualizar com o estado atual"
                      aria-label="Atualizar com o estado atual"
                      onClick={() => confirm(`Substituir “${c.name}” pelo estado atual do projeto?`) && run(() => overwriteCheckpoint(c.id))}
                    >
                      <Icon name="save" size={15} />
                    </button>
                    <button
                      className="icon-btn cp-del"
                      disabled={busy}
                      title="Excluir"
                      aria-label="Excluir"
                      onClick={() => confirm(`Excluir o checkpoint “${c.name}”?`) && run(() => deleteCheckpoint(c.id))}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="menu-note">Restaurar troca o projeto atual — Ctrl+Z desfaz. Atalho: Ctrl+Shift+S salva um checkpoint rápido.</div>
    </div>
  )
}
