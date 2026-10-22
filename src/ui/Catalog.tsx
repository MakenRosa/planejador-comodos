import { useMemo, useState } from 'react'
import { CATALOG, entryToItem, findEntry, TYPES } from '../furniture/catalog'
import type { FurnitureItem } from '../lib/types'
import { fmtDim, uid } from '../lib/util'
import { useStore } from '../store'
import { deleteAsset, openFile, pickFile } from './fileOps'
import { clickSuppressed, startCatalogDrag } from './catalogDrag'
import { Icon } from './Icon'

const fromEntry = (key: string): FurnitureItem | null => {
  const e = findEntry(key)
  // arrastando do catálogo: já sai com o padrão do último (ex.: tomada na mesma altura)
  return e ? { id: uid(), x: 0, z: 0, rotation: 0, ...entryToItem(e), ...(useStore.getState().styleFor(e.key)?.style ?? {}) } : null
}

const fromAsset = (id: string): FurnitureItem | null => {
  const a = useStore.getState().assets[id]
  if (!a) return null
  const [width, height, depth] = a.size
  return { id: uid(), type: 'custom', name: a.name, x: 0, z: 0, elevation: 0, rotation: 0, width, height, depth, color: '#b8bcc2', color2: '#b8bcc2', options: {}, assetId: id }
}

// sem acentos e sem pontuação: "micro-ondas", "microondas" e "micro ondas" dão no mesmo
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export function Catalog() {
  const [q, setQ] = useState('')
  const thumbs = useStore((s) => s.thumbs)
  const assets = useStore((s) => s.assets)
  const add = useStore((s) => s.addFromCatalog)
  const addCustom = useStore((s) => s.addCustom)

  const groups = useMemo(() => {
    // cada palavra pode estar em qualquer parte do nome ("mesa branca" acha "Mesa elétrica … (branca …)")
    const words = norm(q).split(' ').filter(Boolean)
    return CATALOG.map((c) => ({
      ...c,
      entries: c.entries.filter((e) => {
        if (!words.length) return true
        const hay = norm(`${e.label} ${c.category} ${TYPES[e.type]?.name ?? ''}`)
        const flat = hay.replace(/ /g, '')
        return words.every((w) => hay.includes(w) || flat.includes(w))
      }),
    })).filter((c) => c.entries.length)
  }, [q])

  return (
    <div className="catalog">
      <div className="cat-head">
        <h2>Móveis</h2>
        <p>Clique para adicionar ou arraste até o lugar. Com uma mesa ou balcão selecionado, monitor, micro-ondas e afins vão para cima dele.</p>
        <label className="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && q && (e.stopPropagation(), setQ(''))} placeholder="Buscar (cama, rack, mesa…)" />
          {q && (
            <button onClick={() => setQ('')} aria-label="Limpar">
              <Icon name="x" size={14} />
            </button>
          )}
        </label>
      </div>
      <div className="cat-scroll">
        {groups.length === 0 && <p className="hint cat-empty">Nada no catálogo para “{q.trim()}”. Tente outra palavra (ex.: sofá, rack, geladeira).</p>}
        {groups.map((g) => (
          <div className="cat-group" key={g.category}>
            <h3>{g.category}</h3>
            <div className="cat-grid">
              {g.entries.map((e) => {
                const it = entryToItem(e)
                return (
                  <button
                    key={e.key}
                    className="cat-card"
                    onPointerDown={(ev) => startCatalogDrag(ev, () => fromEntry(e.key))}
                    onClick={() => !clickSuppressed() && add(e.key)}
                    title={`${e.label}\n${fmtDim(it.width, it.depth, it.height)} (L × P × A)\nClique para adicionar ou arraste até o lugar`}
                  >
                    <span className="cat-thumb">{thumbs[e.key] ? <img src={thumbs[e.key]} alt="" draggable={false} /> : <span className="ph" />}</span>
                    <span className="cat-name">{e.label}</span>
                    <span className="cat-dim">{fmtDim(it.width, it.depth, it.height)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="cat-group">
          <h3>Meus modelos 3D</h3>
          <button className="import-btn" onClick={() => pickFile('.glb', openFile)}>
            <Icon name="upload" size={16} /> Importar modelo .glb
          </button>
          <p className="hint">
            Traga modelos baixados de lojas ou bibliotecas (IKEA, Sketchfab, Poly Haven…) em <b>.glb</b>. O modelo é ajustado às medidas que você
            definir.
          </p>
          {Object.values(assets).length > 0 && (
            <div className="cat-grid">
              {Object.values(assets).map((a) => (
                <div key={a.id} className="cat-card custom">
                  <button
                    className="cat-card-main"
                    onPointerDown={(ev) => startCatalogDrag(ev, () => fromAsset(a.id))}
                    onClick={() => !clickSuppressed() && addCustom(a.id)}
                    title={a.name}
                  >
                    <span className="cat-thumb">{thumbs[`asset:${a.id}`] ? <img src={thumbs[`asset:${a.id}`]} alt="" draggable={false} /> : <span className="ph" />}</span>
                    <span className="cat-name">{a.name}</span>
                    <span className="cat-dim">{fmtDim(a.size[0], a.size[2], a.size[1])}</span>
                  </button>
                  <button className="cat-del" title="Remover modelo" onClick={() => deleteAsset(a.id)}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
