/**
 * Modo primeira pessoa: colisão com as paredes (só se passa por portas e vãos abertos) e ponto de
 * partida na porta principal do cômodo.
 */
import { pointInPoly, wallDir, wallLength } from './geom'
import type { Room, Vec2 } from './types'

export const EYE = 1.6
export const BODY_R = 0.22

/** Interseção dos segmentos p→q e a→b: fração ao longo de a→b, ou null. */
function crossAt(p: Vec2, q: Vec2, a: Vec2, b: Vec2): number | null {
  const rx = q[0] - p[0]
  const rz = q[1] - p[1]
  const sx = b[0] - a[0]
  const sz = b[1] - a[1]
  const den = rx * sz - rz * sx
  if (Math.abs(den) < 1e-12) return null
  const t = ((a[0] - p[0]) * sz - (a[1] - p[1]) * sx) / den
  const u = ((a[0] - p[0]) * rz - (a[1] - p[1]) * rx) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return u
}

/** O passo p→q bate numa parede (fora de porta/vão)? Considera o raio do corpo à frente. */
function blocked(room: Room, p: Vec2, q: Vec2, r: number): boolean {
  const dx = q[0] - p[0]
  const dz = q[1] - p[1]
  const len = Math.hypot(dx, dz)
  if (len < 1e-9) return false
  const e: Vec2 = [q[0] + (dx / len) * r, q[1] + (dz / len) * r]
  for (const w of room.walls) {
    const u = crossAt(p, e, w.a, w.b)
    if (u === null) continue
    const s = u * wallLength(w)
    const free = room.openings.some(
      (o) => o.wallId === w.id && o.kind !== 'window' && o.bottom < 0.3 && o.height > 1.6 && s > o.offset - o.width / 2 + r * 0.55 && s < o.offset + o.width / 2 - r * 0.55,
    )
    if (!free) return true
  }
  return false
}

/** Anda de p por d, deslizando ao longo da parede quando bater. */
export function walkStep(room: Room, p: Vec2, d: Vec2, r = BODY_R): Vec2 {
  const q: Vec2 = [p[0] + d[0], p[1] + d[1]]
  if (!blocked(room, p, q, r)) return q
  const qx: Vec2 = [p[0] + d[0], p[1]]
  if (Math.abs(d[0]) > 1e-9 && !blocked(room, p, qx, r)) return qx
  const qz: Vec2 = [p[0], p[1] + d[1]]
  if (Math.abs(d[1]) > 1e-9 && !blocked(room, p, qz, r)) return qz
  return p
}

/** Está dentro de algum cômodo? */
export const insideRoom = (room: Room, p: Vec2) => (room.spaces?.length ? room.spaces : [{ floor: room.floor }]).some((s) => pointInPoly(p, s.floor))

/**
 * Onde começar: na porta mais larga (do cômodo em foco ou da casa), 35 cm para dentro, olhando para o
 * centro do cômodo. yaw = ângulo no plano (0 = olhando para −Z, como a câmera do three.js).
 */
export function walkStart(room: Room, center: Vec2): { p: Vec2; yaw: number } {
  const door = room.openings.filter((o) => o.kind === 'door' && !o.ghost).sort((a, b) => b.width - a.width)[0] ?? room.openings.filter((o) => o.kind === 'door').sort((a, b) => b.width - a.width)[0]
  const wall = door && room.walls.find((w) => w.id === door.wallId)
  let p: Vec2 = center
  if (door && wall) {
    const u = wallDir(wall)
    p = [wall.a[0] + u[0] * door.offset + wall.normal[0] * 0.35, wall.a[1] + u[1] * door.offset + wall.normal[1] * 0.35]
  }
  const dx = center[0] - p[0]
  const dz = center[1] - p[1]
  return { p, yaw: Math.hypot(dx, dz) > 0.05 ? Math.atan2(-dx, -dz) : 0 }
}
