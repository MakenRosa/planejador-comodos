import { create } from 'zustand'
import type { CasaWriteState } from '../lib/casaSync'
import { useStore } from '../store'

/**
 * Salvamento automático: o que a barra de status mostra ("Salvando…", "Salvo em casa/ às 14:32",
 * "Falha ao salvar") e o aviso que fica na tela enquanto uma gravação estiver falhando.
 */
export interface SaveStatus {
  /** Alteração feita, esperando a gravação (o intervalo curto entre edições). */
  dirty: boolean
  /** Cópia no navegador: quando gravou por último e, se falhou, por quê. */
  local: { at: number | null; error: string | null }
  /** Pasta casa/ do repositório; null sem ela (site estático ou ?semsync). */
  repo: CasaWriteState | null
  /** Aviso de falha fechado (volta a abrir numa falha nova ou pelo "Falha ao salvar" da barra). */
  dismissed: boolean
}

export const useSaveStatus = create<SaveStatus>(() => ({ dirty: false, local: { at: null, error: null }, repo: null, dismissed: false }))

export const saveFailed = (s: SaveStatus) => !!s.local.error || !!s.repo?.failed.length

/** Grava já (ligado no carregamento): o "Tentar novamente" do aviso usa. */
export const saveApi: { saveNow: (() => void) | null } = { saveNow: null }

export function updateSave(patch: Partial<SaveStatus>) {
  const was = saveFailed(useSaveStatus.getState())
  useSaveStatus.setState(patch)
  const now = saveFailed(useSaveStatus.getState())
  if (!was && now) useSaveStatus.setState({ dismissed: false })
  if (was && !now) useStore.getState().notify('Salvamento voltou a funcionar — está tudo gravado')
}

export const hhmm = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
