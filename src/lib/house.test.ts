import { describe, expect, it } from 'vitest'
import { polyArea, wallLength } from './geom'
import { assembleHouse, type HouseDef } from './house'
import { itemsFromScan } from './placement'
import { isRoomPlan, parseRoomPlan } from './roomplan'

// a casa de exemplo (tools/gerar-exemplo.mjs): três scans, cada um no seu sistema de coordenadas
const files = import.meta.glob<{ default: unknown }>('../../public/rooms/*.json', { eager: true })
const read = (file: string) => files[`../../public/rooms/${file}`].default as Parameters<typeof parseRoomPlan>[0]
const def = read('casa.json') as unknown as HouseDef
const scans = def.rooms.map((r) => read(r.file))

describe('importador do RoomPlan', () => {
  it('alinha o cômodo aos eixos, com o piso em y = 0 e a origem no canto', () => {
    const json = read('quarto.json')
    expect(isRoomPlan(json)).toBe(true)
    const room = parseRoomPlan(json)
    for (const w of room.walls) {
      const axisAligned = Math.abs(w.a[0] - w.b[0]) < 1e-3 || Math.abs(w.a[1] - w.b[1]) < 1e-3
      expect(axisAligned).toBe(true)
    }
    const xs = room.walls.flatMap((w) => [w.a[0], w.b[0]])
    const zs = room.walls.flatMap((w) => [w.a[1], w.b[1]])
    expect(Math.min(...xs)).toBeCloseTo(0, 3)
    expect(Math.min(...zs)).toBeCloseTo(0, 3)
    expect(room.ceilingHeight).toBeCloseTo(2.6, 3)
    expect(polyArea(room.floor)).toBeCloseTo(3.2 * 3.4, 2)
  })

  it('prende portas e janelas na parede certa, com a altura do peitoril', () => {
    const room = parseRoomPlan(read('quarto.json'))
    const door = room.openings.find((o) => o.kind === 'door')!
    const win = room.openings.find((o) => o.kind === 'window')!
    expect(door.bottom).toBe(0)
    expect(win.bottom).toBeCloseTo(1.0, 3)
    expect(door.wallId).not.toBe(win.wallId)
    const wall = room.walls.find((w) => w.id === door.wallId)!
    expect(wallLength(wall)).toBeCloseTo(3.2, 3)
  })
})

describe('montagem da casa a partir de vários scans', () => {
  const house = assembleHouse(def, scans)

  it('divide o scan em L pelo vão e nomeia cada ambiente', () => {
    const areas = Object.fromEntries(house.spaces!.map((s) => [s.name, polyArea(s.floor)]))
    expect(Object.keys(areas).sort()).toEqual(['Banheiro', 'Cozinha', 'Quarto', 'Sala'])
    expect(areas.Sala).toBeCloseTo(4.2 * 4.6, 1)
    expect(areas.Cozinha).toBeCloseTo(2.4 * 3.0, 1)
    expect(areas.Quarto).toBeCloseTo(3.2 * 3.4, 1)
    expect(areas.Banheiro).toBeCloseTo(1.8 * 2.4, 1)
  })

  it('encaixa os cômodos pelas portas em comum, sem sobrepor', () => {
    const [sala, quarto] = ['Sala', 'Quarto'].map((n) => house.spaces!.find((s) => s.name === n)!)
    const zs = (f: [number, number][]) => f.map((p) => p[1])
    // o quarto fica atrás da sala, separado pela espessura da parede
    expect(Math.min(...zs(quarto.floor)) - Math.max(...zs(sala.floor))).toBeCloseTo(0.12, 2)
  })

  it('cada porta entre cômodos vira uma porta só, com o recorte do outro lado', () => {
    const ghosts = house.openings.filter((o) => o.ghost)
    expect(ghosts).toHaveLength(def.connections.length)
    for (const g of ghosts) {
      const primary = house.openings.find((o) => o.id === g.pairId)!
      expect(primary.kind).toBe('door')
      expect(primary.width).toBe(g.width)
    }
  })

  it('paredes vizinhas desenham metade da folga real cada uma', () => {
    const shared = house.walls.filter((w) => w.thicknessSpans?.length)
    expect(shared.length).toBeGreaterThan(0)
    for (const w of shared) for (const [, , t] of w.thicknessSpans!) expect(t).toBeCloseTo(0.06, 3)
  })

  it('transforma os objetos do scan em móveis do tipo certo para o ambiente', () => {
    const types = itemsFromScan(house).map((i) => i.type)
    const count = (t: string) => types.filter((x) => x === t).length
    expect(count('bed')).toBe(1)
    expect(count('sofa')).toBe(1)
    expect(count('chair')).toBe(4)
    expect(count('nightstand')).toBe(2)
    expect(count('fridge')).toBe(1)
    expect(count('toilet')).toBe(1)
    expect(count('bathVanity')).toBe(1)
    // a cuba sobre o balcão vira gabinete de pia (e some como objeto solto)
    const items = itemsFromScan(house)
    expect(items.some((i) => i.type === 'kitchenCabinet' && i.options?.sink)).toBe(true)
    expect(items).toHaveLength(house.scanned.length - 2)
  })
})
