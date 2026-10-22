/** Casa montada a partir dos scans e atualização de projetos/checkpoints salvos com geometria antiga. */
import { casaAvailable, casaTestMode } from '../lib/casaSync'
import { assembleHouse, HOUSE_GEOMETRY_VERSION, isHouseDef } from '../lib/house'
import type { ProjectData } from '../lib/persist'
import type { Room } from '../lib/types'
import { clearOpeningClashes } from '../lib/wallPlan'
import { applyWallEdits } from '../lib/wallEdit'

async function houseAt(base: string): Promise<Room | null> {
  const res = await fetch(`${base}casa.json`, { cache: 'no-store' }).catch(() => null)
  if (!res?.ok) return null
  // hospedagem estática pode responder a página do app no lugar de um arquivo que não existe
  const def: unknown = await res.json().catch(() => null)
  if (!isHouseDef(def)) return null
  const scans = await Promise.all(def.rooms.map((r) => fetch(base + r.file).then((x) => x.json())))
  return assembleHouse(def, scans)
}

/**
 * Monta a casa a partir de casa.json + scans (null se não houver definição de casa): primeiro a do
 * usuário (casa/scans, pelo servidor do Vite), senão a de exemplo (public/rooms).
 */
export async function buildHouseFromScans(): Promise<Room | null> {
  if (casaTestMode || (await casaAvailable())) {
    const mine = await houseAt(`${import.meta.env.BASE_URL}__casa/scans/`)
    if (mine) return mine
  }
  return houseAt(`${import.meta.env.BASE_URL}rooms/`)
}

/**
 * Projeto salvo com paredes geradas por uma versão antiga da montagem: refaz a geometria a partir
 * dos scans e reaplica o que o usuário mudou (correções de paredes pela trena, medidas conferidas,
 * pintura, papel de parede, portas, nomes, pisos). Móveis e medições não mudam.
 */
export async function upgradeSavedHouse(p: ProjectData): Promise<ProjectData> {
  const old = p.room
  if (!old.spaces || old.spaces.length < 2 || (old.houseVersion ?? 0) >= HOUSE_GEOMETRY_VERSION) return p
  const scanned = await buildHouseFromScans().catch(() => null)
  // scans de outra casa (ex.: a de exemplo, quando a pasta casa/scans falta): o projeto fica como está
  if (!scanned || !scanned.walls.some((w) => old.walls.some((o) => o.id === w.id))) return p
  // correções de paredes primeiro: o resto do que foi salvo (portas, azulejos) já está nessa geometria
  const fresh = applyWallEdits(scanned, old.wallEdits)
  const oldWalls = new Map(old.walls.map((w) => [w.id, w]))
  const oldOps = new Map(old.openings.map((o) => [o.id, o]))
  const oldSpaces = new Map(old.spaces.map((s) => [s.id, s]))
  const room: Room = {
    ...fresh,
    name: old.name,
    wallEdits: old.wallEdits,
    checks: old.checks,
    checkTolerance: old.checkTolerance,
    walls: fresh.walls.map((w) => {
      const o = oldWalls.get(w.id)
      return o ? { ...w, paint: o.paint, panels: o.panels, baseboard: o.baseboard } : w
    }),
    // aberturas que o usuário excluiu continuam excluídas; ajustes de porta/janela são mantidos,
    // e as que ele criou (ou mudou de parede) também
    openings: [
      ...fresh.openings
        .filter((o) => oldOps.has(o.id))
        .map((o) => {
          const u = oldOps.get(o.id)!
          const { id: _id, pairId: _pair, ghost: _ghost, ...mine } = u
          return { ...o, ...mine }
        }),
      ...old.openings.filter((o) => !fresh.openings.some((f) => f.id === o.id) && fresh.walls.some((w) => w.id === o.wallId)),
    ],
    spaces: fresh.spaces!.map((s) => {
      const o = oldSpaces.get(s.id)
      return o ? { ...s, name: o.name, floorType: o.floorType } : s
    }),
  }
  // posição salva + correção de vão encostado em parede vizinha
  room.openings = clearOpeningClashes(room)
  return { ...p, room }
}
