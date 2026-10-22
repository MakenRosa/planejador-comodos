/**
 * Planta baixa em SVG, desenhada a partir dos dados (não da tela): pisos, paredes com a espessura real,
 * portas com arco de giro, janelas, móveis com nome e medidas, cotas e carimbo.
 * O viewBox está em centímetros e o tamanho físico em 1:50 — imprima em 100%.
 */
import { TYPES } from '../furniture/catalog'
import { aabbHalf, doorSwing, isSliding, openingDepth, slidingLayout, floorArea, floorPolys, footprint, polyArea, polyCentroid, roomBounds, wallDir, wallLength, wallThicknessAt } from './geom'
import { wallPieces } from './wallPlan'
import type { FurnitureItem, Room, Vec2 } from './types'
import { fmtCm, fmtCmShort, fmtM2 } from './util'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const FONT = 'font-family="Inter, Segoe UI, Arial, sans-serif"'

export function exportPlanSvg(room: Room, items: FurnitureItem[]): string {
  const S = 100
  const house = (room.spaces?.length ?? 0) > 1
  const b = roomBounds(room)
  const margin = room.wallThickness + 0.75
  const minX = b.minX - margin
  const minZ = b.minZ - margin
  const W = b.w + 2 * margin
  const titleH = house ? 0.95 + Math.ceil((room.spaces?.length ?? 0) / 3) * 0.16 : 0.95
  const H = b.d + 2 * margin + titleH
  const X = (x: number) => +((x - minX) * S).toFixed(2)
  const Z = (z: number) => +((z - minZ) * S).toFixed(2)
  const pts = (poly: Vec2[]) => poly.map(([x, z]) => `${X(x)},${Z(z)}`).join(' ')
  const line = (a: Vec2, c: Vec2, attrs: string) => `<line x1="${X(a[0])}" y1="${Z(a[1])}" x2="${X(c[0])}" y2="${Z(c[1])}" ${attrs}/>`
  const out: string[] = []

  out.push(`<rect x="0" y="0" width="${W * S}" height="${H * S}" fill="#ffffff"/>`)
  const FLOOR_FILL: Record<string, string> = { wood: '#f3eadc', porcelain: '#f1efeb', ceramic: '#eef1f3', cement: '#ecebe9' }
  if (room.spaces?.length) for (const sp of room.spaces) out.push(`<polygon points="${pts(sp.floor)}" fill="${FLOOR_FILL[sp.floorType ?? 'wood'] ?? '#f6f0e6'}"/>`)
  else for (const poly of floorPolys(room)) out.push(`<polygon points="${pts(poly)}" fill="#f6f0e6"/>`)

  // Móveis: tapetes, depois piso, depois suspensos
  const order = (it: FurnitureItem) => (TYPES[it.type]?.noCollide ? 0 : it.elevation > 0.05 ? 2 : 1)
  for (const it of [...items].sort((a, c) => order(a) - order(c))) {
    const fp = footprint(it)
    const dashed = it.elevation > 0.05 || it.type === 'curtain'
    const tiny = it.width < 0.2 && it.depth < 0.2
    out.push(
      `<polygon points="${pts(fp)}" fill="${it.color}" fill-opacity="${TYPES[it.type]?.noCollide ? 0.35 : 0.55}" stroke="#334155" stroke-width="0.8"${dashed ? ' stroke-dasharray="4 3"' : ''}/>`,
    )
    out.push(line(fp[3], fp[2], 'stroke="#0f172a" stroke-width="1.6"'))
    if (tiny) continue
    const [hx, hz] = aabbHalf(it.width, it.depth, it.rotation)
    const vertical = hz > hx * 1.15
    const span = (vertical ? hz : hx) * 2 * S
    const fs = Math.max(4, Math.min(9, span / Math.max(8, it.name.length * 0.62)))
    const cx = X(it.x)
    const cz = Z(it.z)
    const rot = vertical ? ` transform="rotate(-90 ${cx} ${cz})"` : ''
    out.push(
      `<g${rot} ${FONT} text-anchor="middle" fill="#0f172a">` +
        `<text x="${cx}" y="${cz - fs * 0.15}" font-size="${fs.toFixed(1)}" font-weight="600">${esc(it.name.replace(/ \(scan\)$/, ''))}</text>` +
        `<text x="${cx}" y="${cz + fs * 1.05}" font-size="${(fs * 0.85).toFixed(1)}" fill="#475569">${fmtCmShort(it.width)} × ${fmtCmShort(it.depth)}${it.elevation > 0.05 ? ` · h ${fmtCmShort(it.elevation)}` : ''}</text>` +
        `</g>`,
    )
  }

  // Paredes (espessura real por trecho) com recortes de portas/janelas
  for (const w of room.walls) {
    const L = wallLength(w)
    const u = wallDir(w)
    const n = w.normal
    const ops = room.openings.filter((o) => o.wallId === w.id).sort((a, c) => a.offset - c.offset)
    const P = (sv: number, k: number): Vec2 => [w.a[0] + u[0] * sv - n[0] * k, w.a[1] + u[1] * sv - n[1] * k]
    // Planta: paredes cortadas, vãos abertos; pontas em meia-esquadria
    for (const pc of wallPieces(room, w, ops.map((o) => [o.offset - o.width / 2, o.offset + o.width / 2] as [number, number]))) {
      // contorno da mesma cor: evita frestas de antialias entre os pedaços
      out.push(`<polygon points="${pts(pc.poly.map(([sv, k]) => P(sv, k)))}" fill="#2f3439" stroke="#2f3439" stroke-width="0.6" stroke-linejoin="round"/>`)
    }
    for (const o of ops) {
      if (o.ghost) continue
      const s0 = o.offset - o.width / 2
      const s1 = o.offset + o.width / 2
      const t = wallThicknessAt(room, w, o.offset)
      if (o.kind === 'window') {
        out.push(`<polygon points="${pts([P(s0, 0), P(s1, 0), P(s1, t), P(s0, t)])}" fill="#ffffff" stroke="#2f3439" stroke-width="1"/>`)
        for (const k of [t * 0.4, t * 0.6]) out.push(line(P(s0, k), P(s1, k), 'stroke="#2f3439" stroke-width="0.8"'))
      } else if (o.kind === 'door' && isSliding(o)) {
        // porta de correr: folha (fechada) rente à face do trilho e o curso tracejado
        const L2 = slidingLayout({ ...o, isOpen: false })
        const k = o.swingOut ? openingDepth(room, o) + 0.04 : -0.04
        out.push(line(P(L2.center - L2.lw / 2, k), P(L2.center + L2.lw / 2, k), 'stroke="#2f3439" stroke-width="2"'))
        out.push(line(P(L2.rail[0], k + (o.swingOut ? 0.03 : -0.03)), P(L2.rail[1], k + (o.swingOut ? 0.03 : -0.03)), 'stroke="#64748b" stroke-width="0.8" stroke-dasharray="5 4"'))
      } else if (o.kind === 'door') {
        const sw = doorSwing(room, o)
        if (!sw) continue
        const r = sw.radius
        const closed: Vec2 = [sw.hinge[0] + sw.closedDir[0] * r, sw.hinge[1] + sw.closedDir[1] * r]
        const open: Vec2 = [sw.hinge[0] + sw.openDir[0] * r, sw.hinge[1] + sw.openDir[1] * r]
        const cross = sw.closedDir[0] * sw.openDir[1] - sw.closedDir[1] * sw.openDir[0]
        out.push(line(sw.hinge, open, 'stroke="#2f3439" stroke-width="1.6"'))
        out.push(
          `<path d="M ${X(closed[0])} ${Z(closed[1])} A ${r * S} ${r * S} 0 0 ${cross > 0 ? 1 : 0} ${X(open[0])} ${Z(open[1])}" fill="none" stroke="#64748b" stroke-width="0.8" stroke-dasharray="5 4"/>`,
        )
      }
      const lp = P(o.offset, -0.2)
      const label = o.kind === 'door' ? `P ${fmtCmShort(o.width)}` : o.kind === 'window' ? `J ${fmtCmShort(o.width)}×${fmtCmShort(o.height)} / ${fmtCmShort(o.bottom)}` : `V ${fmtCmShort(o.width)}`
      out.push(`<text x="${X(lp[0])}" y="${Z(lp[1]) + 2}" font-size="6" text-anchor="middle" fill="#475569" ${FONT}>${label}</text>`)
    }

    const virtual = ops.some((o) => o.width >= 0.9 * L)
    if (house) {
      // cota interna, rente à face da parede
      if (L < 0.45 || virtual) continue
      const k = -0.2
      const a = P(0.02, k)
      const c = P(L - 0.02, k)
      out.push(line(a, c, 'stroke="#94a3b8" stroke-width="0.6"'))
      for (const p of [P(0.02, k - 0.05), P(L - 0.02, k - 0.05)]) out.push(line(p, [p[0] + n[0] * 0.1, p[1] + n[1] * 0.1], 'stroke="#64748b" stroke-width="0.8"'))
      const m = P(L / 2, k - 0.035)
      const ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI
      const up = ang > 90 || ang < -90 ? ang + 180 : ang
      out.push(`<text x="${X(m[0])}" y="${Z(m[1])}" font-size="7" text-anchor="middle" dominant-baseline="middle" fill="#334155" ${FONT} transform="rotate(${up.toFixed(2)} ${X(m[0])} ${Z(m[1])})">${fmtCmShort(L)}</text>`)
    } else {
      const t = room.wallThickness
      const off = t + 0.35
      const a = P(0, off)
      const c = P(L, off)
      out.push(line(a, c, 'stroke="#334155" stroke-width="0.7"'))
      out.push(line(P(0, t + 0.06), P(0, off + 0.08), 'stroke="#94a3b8" stroke-width="0.6"'))
      out.push(line(P(L, t + 0.06), P(L, off + 0.08), 'stroke="#94a3b8" stroke-width="0.6"'))
      for (const p of [a, c]) {
        const dx = (u[0] - n[0]) * 0.04
        const dz = (u[1] - n[1]) * 0.04
        out.push(line([p[0] - dx, p[1] - dz], [p[0] + dx, p[1] + dz], 'stroke="#0f172a" stroke-width="1.2"'))
      }
      const m = P(L / 2, off + 0.07)
      const ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI
      const up = ang > 90 || ang < -90 ? ang + 180 : ang
      out.push(`<text x="${X(m[0])}" y="${Z(m[1])}" font-size="9" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="#0f172a" ${FONT} transform="rotate(${up.toFixed(2)} ${X(m[0])} ${Z(m[1])})">${fmtCm(L)}</text>`)
    }
  }

  // Nome e área de cada cômodo
  for (const sp of room.spaces ?? []) {
    if (!house) break
    const c = polyCentroid(sp.floor)
    out.push(
      `<g ${FONT} text-anchor="middle"><text x="${X(c[0])}" y="${Z(c[1]) - 4}" font-size="11" font-weight="700" fill="#1e293b" opacity="0.85">${esc(sp.name)}</text>` +
        `<text x="${X(c[0])}" y="${Z(c[1]) + 9}" font-size="8" fill="#475569">${fmtM2(polyArea(sp.floor))}</text></g>`,
    )
  }

  // Carimbo
  const ty = (b.d + 2 * margin) * S + 10
  const area = floorArea(room)
  const date = new Date().toLocaleDateString('pt-BR')
  out.push(`<line x1="20" y1="${ty - 6}" x2="${W * S - 20}" y2="${ty - 6}" stroke="#cbd5e1" stroke-width="1"/>`)
  const info = house
    ? `${room.spaces!.length} cômodos · área útil ${fmtM2(area)} · envoltória ${fmtCm(b.w)} × ${fmtCm(b.d)} · pé-direito até ${fmtCm(room.ceilingHeight)} · ${items.length} móveis`
    : `${fmtCm(b.w)} × ${fmtCm(b.d)} · área ${fmtM2(area)} · pé-direito ${fmtCm(room.ceilingHeight)} · ${items.length} móveis`
  out.push(
    `<g ${FONT} fill="#0f172a">` +
      `<text x="20" y="${ty + 16}" font-size="16" font-weight="700">${esc(room.name)}</text>` +
      `<text x="20" y="${ty + 34}" font-size="9" fill="#334155">${info}</text>` +
      `<text x="20" y="${ty + 48}" font-size="8" fill="#64748b">Medidas internas em cm · Escala 1:50 (imprima em 100%) · Tracejado = suspenso · Linha grossa = frente do móvel · ${date}</text>` +
      (house
        ? room.spaces!
            .map((sp, i) => `<text x="${20 + (i % 3) * 190}" y="${ty + 66 + Math.floor(i / 3) * 14}" font-size="8.5" fill="#334155">${esc(sp.name)}: ${fmtM2(polyArea(sp.floor))}</text>`)
            .join('')
        : '') +
      `</g>`,
  )

  const wcm = W * S
  const hcm = H * S
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${(wcm / 50).toFixed(2)}cm" height="${(hcm / 50).toFixed(2)}cm" viewBox="0 0 ${wcm.toFixed(1)} ${hcm.toFixed(1)}">
${out.join('\n')}
</svg>`
}
