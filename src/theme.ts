/**
 * Tema claro/escuro. A preferência fica nas configurações (Automático segue o sistema); o tema
 * resolvido vai para <html data-theme> (CSS) e para as cores da cena 3D/planta.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { useStore } from './store'

export type { ThemePref } from './store'

const query = '(prefers-color-scheme: dark)'
const mq = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null)

function subscribe(cb: () => void) {
  const m = mq()
  m?.addEventListener('change', cb)
  return () => m?.removeEventListener('change', cb)
}

export function useSystemDark() {
  return useSyncExternalStore(subscribe, () => !!mq()?.matches, () => false)
}

export function useIsDark() {
  const pref = useStore((s) => s.settings.theme)
  const sys = useSystemDark()
  return pref === 'dark' || (pref === 'system' && sys)
}

/** Mantém <html data-theme> e color-scheme em dia com a preferência. */
export function useThemeSync() {
  const dark = useIsDark()
  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = dark ? 'dark' : 'light'
    el.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark])
}

/** Cores da cena que dependem do fundo (o resto — paredes, pisos, móveis — é material real). */
const SCENE = {
  light: {
    background: '#e9ecf0',
    grid: '#1e293b',
    gridMinor: 0.08,
    gridMajor: 0.22,
    /** Tampa das paredes (corte): escura no 3D e na planta. */
    cap: '#3f444c',
    capPlan: '#3f444c',
    /** Cotas externas, desenhadas sobre o fundo. */
    dimLine: '#64748b',
    dimExt: '#94a3b8',
    dimTick: '#475569',
  },
  dark: {
    background: '#161b22',
    grid: '#cbd5e1',
    gridMinor: 0.06,
    gridMajor: 0.16,
    cap: '#3f444c',
    // na planta escura: tom médio, que se destaca do fundo escuro e também dos pisos claros
    capPlan: '#7f8a9a',
    dimLine: '#8b96a6',
    dimExt: '#5d6878',
    dimTick: '#aab4c2',
  },
}

export type SceneColors = (typeof SCENE)['light']

export function useSceneColors(): SceneColors {
  return SCENE[useIsDark() ? 'dark' : 'light']
}
