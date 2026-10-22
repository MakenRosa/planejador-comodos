import type * as THREE from 'three'
import { armMonitorDepth, fitArmReach, monitorPanel } from '../lib/arms'
import type { FurnitureItem, OptionValue } from '../lib/types'
import * as B from './builders'
import * as X from './extras'
import * as S from './setup'
import * as CH from './chairs'
import type { BuildParams } from './builders'
import type { Solid } from './parts'

export interface OptionDef {
  key: string
  label: string
  /** range = fração 0..1 exibida em %. */
  kind: 'select' | 'bool' | 'length' | 'range'
  choices?: { value: OptionValue; label: string }[]
  default: OptionValue
  min?: number
  max?: number
  hint?: string
  /** Mostra a opção só quando fizer sentido para as outras opções. */
  visibleIf?: (o: Record<string, OptionValue>) => boolean
}

export interface Preset {
  label: string
  w: number
  d: number
  h: number
}

export interface ItemPoint {
  key: string
  label: string
  color: string
  /** Posição local (x, y, z) no móvel. */
  at: [number, number, number]
  /** Opções para o ponto ir para (x, z) locais (já limitado ao móvel). */
  move: (x: number, z: number) => Record<string, OptionValue>
}

/** Nome padrão do box para as opções (os do catálogo). */
function showerName(o: Record<string, OptionValue>) {
  const layout = (o.layout as string) ?? 'canto'
  const door = (o.door as string) ?? 'correr'
  if (layout === 'walkin') return 'Box walk-in (vidro fixo)'
  const corner = layout === 'canto'
  if (door === 'abrir') return corner ? 'Box de vidro de canto de abrir' : 'Box de vidro de abrir'
  if (door === 'fixo') return corner ? 'Box de vidro de canto fixo' : 'Box de vidro fixo'
  return corner ? 'Box de vidro de canto' : 'Box de vidro frontal de correr'
}
const SHOWER_NAMES = new Set<string>(
  ['canto', 'frontal'].flatMap((layout) => ['correr', 'abrir', 'fixo'].map((door) => showerName({ layout, door }))).concat('Box walk-in (vidro fixo)'),
)

export interface FurnitureType {
  name: string
  w: number
  d: number
  h: number
  elevation?: number
  color: string
  color2: string
  colorLabel: string
  color2Label?: string
  /** Mostra a segunda cor só em certas combinações de opções. */
  showColor2?: (o: Record<string, OptionValue>) => boolean
  presets?: Preset[]
  options?: OptionDef[]
  /** Não entra na detecção de colisão (ex.: tapete). */
  noCollide?: boolean
  /** Vão aberto onde cabem outras coisas (nicho): o que estiver inteiro dentro dele não colide. */
  container?: boolean
  /**
   * Partes sólidas para a colisão, quando o móvel não é um bloco cheio: a cadeira com o assento e os
   * braços abaixo do tampo, a mesa com o vão das pernas livre. Sem isso, a caixa inteira do móvel.
   */
  solids?: (it: FurnitureItem) => Solid[]
  /** Ao adicionar, encosta na parede. */
  wallMounted?: boolean
  /** Ao converter do scan, gira para que a traseira fique na parede. */
  backToWall?: boolean
  /** Tem tampo onde se apoiam outros itens (mesa, escrivaninha, cômoda, balcão…). */
  surface?: boolean
  /** Costuma ficar sobre outro móvel (monitor, micro-ondas…): com um móvel de tampo selecionado, vai para cima dele. */
  onSurface?: boolean
  /** Ajustes automáticos quando uma opção muda (ex.: girar o monitor troca largura e altura). */
  adjust?: (next: FurnitureItem, prev: FurnitureItem) => Partial<FurnitureItem> | null
  /** Correção ao abrir um projeto salvo (ex.: nome padrão que não bate mais com as opções). */
  normalize?: (it: FurnitureItem) => Partial<FurnitureItem> | null
  /** Pontos arrastáveis dentro do móvel quando selecionado (ex.: chuveiro e ralo do box). */
  points?: (it: FurnitureItem) => ItemPoint[]
  build: (p: BuildParams) => THREE.Group
}

const autoCount = (max: number, label = 'Automático') => [
  { value: 0, label },
  ...Array.from({ length: max }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
]
const shapeOpt = (def: 'rect' | 'round'): OptionDef => ({
  key: 'shape',
  label: 'Formato',
  kind: 'select',
  default: def,
  choices: [
    { value: 'rect', label: 'Retangular' },
    { value: 'round', label: 'Redondo / oval' },
  ],
})

const PLATE = [
  { value: 'embutir', label: 'Embutida (caixa 4×2/4×4 na parede)' },
  { value: 'sobrepor', label: 'De sobrepor (caixa externa)' },
]

export const TYPES: Record<string, FurnitureType> = {
  bed: {
    name: 'Cama',
    w: 1.42, d: 1.96, h: 1.0,
    color: '#c49a6c', color2: '#8fa3b8',
    colorLabel: 'Estrutura', color2Label: 'Roupa de cama',
    backToWall: true,
    presets: [
      { label: 'Solteiro — colchão 88×188', w: 0.92, d: 1.96, h: 0.95 },
      { label: 'Solteirão — colchão 96×203', w: 1.0, d: 2.11, h: 0.95 },
      { label: 'Viúva — colchão 128×188', w: 1.32, d: 1.96, h: 1.0 },
      { label: 'Casal — colchão 138×188', w: 1.42, d: 1.96, h: 1.0 },
      { label: 'Queen — colchão 158×198', w: 1.62, d: 2.06, h: 1.1 },
      { label: 'King — colchão 193×203', w: 1.97, d: 2.11, h: 1.1 },
    ],
    options: [
      { key: 'headboard', label: 'Cabeceira', kind: 'bool', default: true },
      { key: 'mattressHeight', label: 'Altura do colchão (topo)', kind: 'length', default: 0.55, min: 0.15, max: 1.2 },
    ],
    build: B.bed,
  },
  crib: {
    name: 'Berço',
    w: 1.36, d: 0.72, h: 0.95,
    color: '#f2efe8', color2: '#d7e3ea',
    colorLabel: 'Estrutura', color2Label: 'Colchão',
    presets: [{ label: 'Berço americano — colchão 130×70', w: 1.36, d: 0.72, h: 0.95 }],
    build: B.crib,
  },
  wardrobe: {
    name: 'Guarda-roupa',
    w: 1.35, d: 0.55, h: 2.3,
    color: '#f4f4f2', color2: '#f4f4f2',
    colorLabel: 'Corpo', color2Label: 'Portas',
    backToWall: true,
    presets: [
      { label: '2 portas', w: 0.9, d: 0.55, h: 2.1 },
      { label: '3 portas', w: 1.35, d: 0.55, h: 2.3 },
      { label: '4 portas', w: 1.8, d: 0.55, h: 2.3 },
      { label: '6 portas', w: 2.4, d: 0.55, h: 2.3 },
      { label: 'Casal de correr', w: 2.0, d: 0.6, h: 2.3 },
    ],
    options: [
      { key: 'doors', label: 'Portas', kind: 'select', default: 0, choices: autoCount(8) },
      { key: 'sliding', label: 'Portas de correr', kind: 'bool', default: false },
      { key: 'mirror', label: 'Porta(s) com espelho', kind: 'bool', default: false },
    ],
    build: B.wardrobe,
  },
  dresser: {
    name: 'Cômoda',
    w: 0.9, d: 0.45, h: 1.0,
    color: '#f4f4f2', color2: '#c49a6c',
    colorLabel: 'Corpo', color2Label: 'Gavetas',
    backToWall: true,
    presets: [
      { label: 'Cômoda 4 gavetas', w: 0.9, d: 0.45, h: 1.0 },
      { label: 'Cômoda 8 gavetas', w: 1.2, d: 0.45, h: 0.9 },
      { label: 'Sapateira', w: 0.8, d: 0.35, h: 1.0 },
    ],
    options: [
      { key: 'drawers', label: 'Linhas de gavetas', kind: 'select', default: 0, choices: autoCount(8) },
      { key: 'columns', label: 'Colunas', kind: 'select', default: 0, choices: autoCount(3) },
      { key: 'legs', label: 'Pés (senão rodapé)', kind: 'bool', default: true },
    ],
    surface: true,
    build: B.dresser,
  },
  nightstand: {
    name: 'Criado-mudo',
    w: 0.45, d: 0.35, h: 0.55,
    color: '#c49a6c', color2: '#f4f4f2',
    colorLabel: 'Corpo', color2Label: 'Gavetas',
    backToWall: true,
    presets: [
      { label: 'Padrão', w: 0.45, d: 0.35, h: 0.55 },
      { label: 'Compacto', w: 0.4, d: 0.3, h: 0.5 },
      { label: 'Largo', w: 0.55, d: 0.4, h: 0.6 },
    ],
    options: [{ key: 'drawers', label: 'Gavetas', kind: 'select', default: 0, choices: autoCount(4) }],
    surface: true,
    build: B.nightstand,
  },
  vanity: {
    name: 'Penteadeira',
    w: 1.0, d: 0.45, h: 1.5,
    color: '#f4f4f2', color2: '#c49a6c',
    colorLabel: 'Corpo', color2Label: 'Gaveta',
    backToWall: true,
    surface: true,
    build: B.vanity,
  },
  bench: {
    name: 'Baú / Banco',
    w: 1.2, d: 0.42, h: 0.45,
    color: '#d8c8ab', color2: '#f4f4f2',
    colorLabel: 'Estofado', color2Label: 'Corpo',
    surface: true,
    build: B.bench,
  },
  mirror: {
    name: 'Espelho de chão',
    w: 0.6, d: 0.04, h: 1.7,
    color: '#2b2b2b', color2: '#2b2b2b',
    colorLabel: 'Moldura',
    backToWall: true,
    wallMounted: true,
    build: B.mirror,
  },
  sofa: {
    name: 'Sofá',
    w: 2.1, d: 0.95, h: 0.85,
    color: '#8c8f93', color2: '#6e4b33',
    colorLabel: 'Tecido', color2Label: 'Pés',
    backToWall: true,
    presets: [
      { label: '2 lugares', w: 1.6, d: 0.9, h: 0.85 },
      { label: '3 lugares', w: 2.1, d: 0.95, h: 0.85 },
      { label: '4 lugares', w: 2.5, d: 0.95, h: 0.85 },
    ],
    options: [{ key: 'seats', label: 'Assentos', kind: 'select', default: 0, choices: autoCount(6) }],
    build: B.sofa,
  },
  armchair: {
    name: 'Poltrona',
    w: 0.8, d: 0.8, h: 0.85,
    color: '#c06c4c', color2: '#6e4b33',
    colorLabel: 'Tecido', color2Label: 'Pés',
    build: B.armchair,
  },
  pouf: {
    name: 'Puff',
    w: 0.45, d: 0.45, h: 0.42,
    color: '#d1a33c', color2: '#d1a33c',
    colorLabel: 'Tecido',
    options: [shapeOpt('round')],
    build: B.pouf,
  },
  tvRack: {
    name: 'Rack',
    w: 1.8, d: 0.4, h: 0.5,
    color: '#f4f4f2', color2: '#a87a4f',
    colorLabel: 'Corpo', color2Label: 'Portas',
    backToWall: true,
    presets: [
      { label: 'Rack 1,36 m', w: 1.36, d: 0.4, h: 0.5 },
      { label: 'Rack 1,80 m', w: 1.8, d: 0.4, h: 0.5 },
      { label: 'Rack 2,20 m', w: 2.2, d: 0.42, h: 0.5 },
    ],
    options: [{ key: 'legs', label: 'Pés', kind: 'bool', default: true }],
    surface: true,
    build: B.tvRack,
  },
  tv: {
    name: 'TV',
    w: 1.12, d: 0.06, h: 0.65,
    elevation: 0.9,
    color: '#15171a', color2: '#15171a',
    colorLabel: 'Moldura',
    backToWall: true,
    wallMounted: true,
    presets: [
      { label: '32"', w: 0.73, d: 0.06, h: 0.44 },
      { label: '43"', w: 0.97, d: 0.06, h: 0.57 },
      { label: '50"', w: 1.12, d: 0.06, h: 0.65 },
      { label: '55"', w: 1.24, d: 0.06, h: 0.72 },
      { label: '65"', w: 1.46, d: 0.06, h: 0.84 },
    ],
    options: [{ key: 'stand', label: 'Com pedestal (senão parede)', kind: 'bool', default: false }],
    onSurface: true,
    build: B.tv,
  },
  coffeeTable: {
    name: 'Mesa de centro',
    w: 0.9, d: 0.6, h: 0.4,
    color: '#a87a4f', color2: '#2b2b2b',
    colorLabel: 'Tampo', color2Label: 'Pés',
    options: [shapeOpt('rect')],
    surface: true,
    build: B.coffeeTable,
  },
  diningTable: {
    name: 'Mesa de jantar',
    w: 1.2, d: 0.8, h: 0.76,
    color: '#c49a6c', color2: '#2b2b2b',
    colorLabel: 'Tampo', color2Label: 'Pés',
    presets: [
      { label: '4 lugares', w: 1.2, d: 0.8, h: 0.76 },
      { label: '6 lugares', w: 1.6, d: 0.9, h: 0.76 },
      { label: 'Redonda 4 lugares', w: 1.0, d: 1.0, h: 0.76 },
    ],
    options: [shapeOpt('rect')],
    surface: true,
    solids: (it) => B.tableSolids({ w: it.width, h: it.height, d: it.depth, options: it.options }),
    build: B.diningTable,
  },
  chair: {
    name: 'Cadeira',
    w: 0.45, d: 0.52, h: 0.9,
    color: '#a87a4f', color2: '#d8c8ab',
    colorLabel: 'Madeira', color2Label: 'Assento',
    solids: (it) => B.chairSolids({ w: it.width, h: it.height, d: it.depth }),
    build: B.chair,
  },
  desk: {
    name: 'Escrivaninha',
    w: 1.2, d: 0.6, h: 0.75,
    color: '#f4f4f2', color2: '#2b2b2b',
    colorLabel: 'Tampo', color2Label: 'Pés',
    backToWall: true,
    presets: [
      { label: 'Pequena 90×50', w: 0.9, d: 0.5, h: 0.75 },
      { label: 'Padrão 120×60', w: 1.2, d: 0.6, h: 0.75 },
      { label: 'Grande 150×70', w: 1.5, d: 0.7, h: 0.75 },
    ],
    options: [{ key: 'drawers', label: 'Gaveteiro', kind: 'bool', default: true }],
    surface: true,
    solids: (it) => B.deskSolids({ w: it.width, h: it.height, d: it.depth, options: it.options }, it.elevation > FLOATING_MIN),
    build: B.desk,
  },
  officeChair: {
    name: 'Cadeira de escritório',
    w: 0.62, d: 0.62, h: 1.1,
    color: '#2f3e5c', color2: '#2b2b2b',
    colorLabel: 'Estofado', color2Label: 'Base',
    presets: [
      { label: 'Padrão (62 × 62 cm)', w: 0.62, d: 0.62, h: 1.1 },
      { label: 'Elements Vertta Pro (68 × 66 cm, até 137 cm)', w: 0.68, d: 0.66, h: 1.3 },
    ],
    options: [
      {
        key: 'model',
        label: 'Modelo',
        kind: 'select',
        default: 'generico',
        choices: [
          { value: 'generico', label: 'Genérica (estofada)' },
          { value: 'vertta-pro', label: 'Elements Vertta Pro (tela, apoio de cabeça)' },
        ],
      },
    ],
    // assento e braços entram sob o tampo da mesa; o encosto bate na borda
    solids: (it) => (it.options.model === 'vertta-pro' ? CH.verttaProSolids : B.officeChairSolids)({ w: it.width, h: it.height, d: it.depth }),
    // na Vertta Pro: cor 1 = estrutura, cor 2 = tela
    build: (p) => (p.options.model === 'vertta-pro' ? CH.verttaPro(p) : B.officeChair(p)),
  },
  bookshelf: {
    name: 'Estante',
    w: 0.8, d: 0.3, h: 1.8,
    color: '#c49a6c', color2: '#c49a6c',
    colorLabel: 'Madeira',
    backToWall: true,
    presets: [
      { label: 'Estreita 60×180', w: 0.6, d: 0.3, h: 1.8 },
      { label: 'Padrão 80×180', w: 0.8, d: 0.3, h: 1.8 },
      { label: 'Larga 120×200', w: 1.2, d: 0.32, h: 2.0 },
      { label: 'Baixa 80×90', w: 0.8, d: 0.3, h: 0.9 },
    ],
    options: [
      { key: 'shelves', label: 'Prateleiras', kind: 'select', default: 0, choices: autoCount(10) },
      { key: 'books', label: 'Livros decorativos', kind: 'bool', default: true },
    ],
    surface: true,
    build: B.bookshelf,
  },
  wallShelf: {
    name: 'Prateleira de parede',
    w: 0.8, d: 0.22, h: 0.025,
    elevation: 1.5,
    color: '#c49a6c', color2: '#c49a6c',
    colorLabel: 'Madeira',
    backToWall: true,
    wallMounted: true,
    surface: true,
    build: B.wallShelf,
  },
  rug: {
    name: 'Tapete',
    w: 2.0, d: 1.5, h: 0.012,
    color: '#d8c8ab', color2: '#8c8f93',
    colorLabel: 'Base', color2Label: 'Faixa',
    noCollide: true,
    presets: [
      { label: '100×150', w: 1.5, d: 1.0, h: 0.012 },
      { label: '150×200', w: 2.0, d: 1.5, h: 0.012 },
      { label: '200×250', w: 2.5, d: 2.0, h: 0.012 },
      { label: 'Redondo Ø150', w: 1.5, d: 1.5, h: 0.012 },
    ],
    options: [shapeOpt('rect')],
    build: B.rug,
  },
  floorLamp: {
    name: 'Luminária de piso',
    w: 0.4, d: 0.4, h: 1.6,
    color: '#2b2b2b', color2: '#efe8da',
    colorLabel: 'Base', color2Label: 'Cúpula',
    build: B.floorLamp,
  },
  plant: {
    name: 'Planta',
    w: 0.45, d: 0.45, h: 1.1,
    color: '#c06c4c', color2: '#5f8a4f',
    colorLabel: 'Vaso', color2Label: 'Folhagem',
    onSurface: true,
    build: B.plant,
  },
  curtain: {
    name: 'Cortina / persiana',
    w: 2.0, d: 0.15, h: 2.5,
    color: '#ece6da', color2: '#f7f5f0',
    colorLabel: 'Tecido / persiana', color2Label: 'Voil (camada de trás)',
    showColor2: (o) => (o.style ?? 'tecido') === 'tecido' && o.layers === 'dupla',
    noCollide: true,
    wallMounted: true,
    options: [
      {
        key: 'style',
        label: 'Tipo',
        kind: 'select',
        default: 'tecido',
        choices: [
          { value: 'tecido', label: 'Cortina de tecido' },
          { value: 'rolo', label: 'Persiana rolô' },
          { value: 'horizontal', label: 'Persiana horizontal' },
        ],
      },
      {
        key: 'layers',
        label: 'Camadas',
        kind: 'select',
        default: 'simples',
        choices: [
          { value: 'simples', label: 'Simples' },
          { value: 'dupla', label: 'Dupla (voil atrás + tecido na frente)' },
        ],
        visibleIf: (o) => (o.style ?? 'tecido') === 'tecido',
      },
      { key: 'openness', label: 'Abertura', kind: 'range', default: 0.7, hint: '0% = fechada (baixada) · 100% = totalmente aberta / recolhida' },
      {
        key: 'tilt',
        label: 'Inclinação das lâminas',
        kind: 'range',
        default: 0.7,
        hint: '0% = lâminas fechadas · 100% = lâminas na horizontal (passa mais luz)',
        visibleIf: (o) => o.style === 'horizontal',
      },
      {
        key: 'slat',
        label: 'Lâminas',
        kind: 'select',
        default: '25',
        choices: [
          { value: '25', label: '25 mm (alumínio)' },
          { value: '50', label: '50 mm (madeira / PVC)' },
        ],
        visibleIf: (o) => o.style === 'horizontal',
      },
      {
        key: 'side',
        label: 'Recolher para',
        kind: 'select',
        default: 'ambos',
        choices: [
          { value: 'ambos', label: 'Os dois lados' },
          { value: 'esquerda', label: 'A esquerda' },
          { value: 'direita', label: 'A direita' },
        ],
        visibleIf: (o) => (o.style ?? 'tecido') === 'tecido',
      },
      {
        key: 'sheerOpenness',
        label: 'Abertura do voil',
        kind: 'range',
        default: 0,
        visibleIf: (o) => (o.style ?? 'tecido') === 'tecido' && o.layers === 'dupla',
      },
      {
        key: 'rod',
        label: 'Suporte',
        kind: 'select',
        default: 'varao',
        choices: [
          { value: 'varao', label: 'Varão com ponteiras' },
          { value: 'trilho', label: 'Trilho (no teto)' },
          { value: 'nenhum', label: 'Sem suporte aparente' },
        ],
        visibleIf: (o) => (o.style ?? 'tecido') === 'tecido',
      },
      {
        key: 'heading',
        label: 'Fixação no varão',
        kind: 'select',
        default: 'ilhos',
        choices: [
          { value: 'ilhos', label: 'Ilhós (anéis na própria cortina)' },
          { value: 'argolas', label: 'Argolas soltas no varão' },
        ],
        visibleIf: (o) => (o.style ?? 'tecido') === 'tecido' && (o.rod ?? 'varao') === 'varao',
      },
      {
        key: 'rodColor',
        label: 'Cor do varão / trilho',
        kind: 'select',
        default: '#f2f2f0',
        choices: [
          { value: '#2b2b2b', label: 'Preto' },
          { value: '#f2f2f0', label: 'Branco' },
          { value: '#b8bcc0', label: 'Inox' },
          { value: '#b8963e', label: 'Dourado' },
          { value: '#8a5a3b', label: 'Madeira' },
        ],
        visibleIf: (o) => (o.style ?? 'tecido') === 'tecido' && o.rod !== 'nenhum',
      },
    ],
    build: B.curtain,
  },
  airConditioner: {
    name: 'Ar-condicionado split',
    w: 0.9, d: 0.22, h: 0.3,
    elevation: 2.0,
    color: '#f7f7f5', color2: '#f7f7f5',
    colorLabel: 'Corpo',
    backToWall: true,
    wallMounted: true,
    presets: [
      { label: '9.000 BTUs', w: 0.8, d: 0.2, h: 0.29 },
      { label: '12.000 BTUs', w: 0.9, d: 0.22, h: 0.3 },
      { label: '18.000 BTUs', w: 1.0, d: 0.23, h: 0.32 },
    ],
    build: B.airConditioner,
  },
  fridge: {
    name: 'Geladeira',
    w: 0.7, d: 0.72, h: 1.85,
    color: '#d5d8db', color2: '#d5d8db',
    colorLabel: 'Acabamento',
    backToWall: true,
    presets: [
      { label: 'Duplex 400 L', w: 0.7, d: 0.72, h: 1.85 },
      { label: 'Frost free 300 L', w: 0.6, d: 0.7, h: 1.7 },
      { label: 'Side by side', w: 0.91, d: 0.75, h: 1.78 },
    ],
    options: [
      {
        key: 'layout',
        label: 'Portas',
        kind: 'select',
        default: 'duplex',
        choices: [
          { value: 'duplex', label: 'Duplex (freezer em cima)' },
          { value: 'side', label: 'Side by side' },
        ],
      },
      {
        key: 'model',
        label: 'Modelo',
        kind: 'select',
        default: 'generico',
        choices: [
          { value: 'generico', label: 'Genérico' },
          { value: 'electrolux', label: 'Electrolux Inverter duplex inox (painel vertical)' },
        ],
        visibleIf: (o) => (o.layout ?? 'duplex') === 'duplex',
      },
      {
        key: 'finish',
        label: 'Acabamento',
        kind: 'select',
        default: 'cor',
        choices: [
          { value: 'cor', label: 'Pintura (cor escolhida)' },
          { value: 'inox-look', label: 'Inox look (pintado, escovado)' },
          { value: 'inox', label: 'Inox escovado' },
          { value: 'black-inox', label: 'Black inox' },
        ],
      },
      {
        key: 'handle',
        label: 'Puxadores',
        kind: 'select',
        default: 'padrao',
        choices: [
          { value: 'padrao', label: 'Padrão do modelo' },
          { value: 'esquerda', label: 'À esquerda (abre para a direita)' },
          { value: 'direita', label: 'À direita (abre para a esquerda)' },
        ],
        visibleIf: (o) => (o.layout ?? 'duplex') === 'duplex',
      },
    ],
    build: B.fridge,
  },
  stove: {
    name: 'Fogão',
    w: 0.55, d: 0.6, h: 0.88,
    color: '#d5d8db', color2: '#d5d8db',
    colorLabel: 'Acabamento',
    backToWall: true,
    presets: [
      { label: '4 bocas', w: 0.55, d: 0.6, h: 0.88 },
      { label: '5 bocas', w: 0.76, d: 0.66, h: 0.9 },
    ],
    options: [
      {
        key: 'top',
        label: 'Mesa',
        kind: 'select',
        default: 'gas',
        choices: [
          { value: 'gas', label: 'A gás (queimadores)' },
          { value: 'inducao', label: 'Indução (vidro)' },
        ],
      },
    ],
    build: B.stove,
  },
  kitchenCabinet: {
    name: 'Balcão de cozinha',
    w: 1.2, d: 0.6, h: 0.9,
    color: '#f4f4f2', color2: '#3a3c3f',
    colorLabel: 'Portas e gavetas', color2Label: 'Tampo',
    backToWall: true,
    presets: [
      { label: 'Gabinete de pia 1,20 m', w: 1.2, d: 0.6, h: 0.9 },
      { label: 'Gabinete de pia 1,50 m', w: 1.5, d: 0.6, h: 0.9 },
      { label: 'Balcão 0,80 m', w: 0.8, d: 0.6, h: 0.9 },
    ],
    options: [
      {
        key: 'front',
        label: 'Frente',
        kind: 'select',
        default: 'auto',
        choices: [
          { value: 'auto', label: 'Automática (portas e gavetas)' },
          { value: 'porta', label: '1 porta' },
          { value: 'portas', label: '2 portas' },
          { value: 'gavetas', label: '3 gavetas' },
          { value: 'portas-gavetas', label: '2 portas + 3 gavetas' },
          { value: 'porta-pano', label: 'Porta-pano deslizante (módulo estreito)' },
          { value: 'nicho', label: 'Vão aberto (forno de embutir)' },
        ],
      },
      {
        key: 'handle',
        label: 'Maçaneta da porta',
        kind: 'select',
        default: 'direita',
        choices: [
          { value: 'direita', label: 'À direita' },
          { value: 'esquerda', label: 'À esquerda' },
        ],
        visibleIf: (o) => o.front === 'porta',
      },
      {
        key: 'drawerSide',
        label: 'Coluna de gavetas',
        kind: 'select',
        default: 'direita',
        choices: [
          { value: 'direita', label: 'À direita das portas' },
          { value: 'esquerda', label: 'À esquerda das portas' },
        ],
        visibleIf: (o) => o.front === 'portas-gavetas',
      },
      { key: 'drawerWidth', label: 'Largura das gavetas', kind: 'length', default: 0.6, min: 0.2, max: 1.0, visibleIf: (o) => o.front === 'portas-gavetas' },
      { key: 'open', label: 'Mostrar porta-pano puxado', kind: 'bool', default: false, visibleIf: (o) => o.front === 'porta-pano' },
      { key: 'nicheW', label: 'Largura do vão do forno', kind: 'length', default: 0.59, min: 0.3, max: 1.2, visibleIf: (o) => o.front === 'nicho' },
      { key: 'nicheH', label: 'Altura do vão do forno', kind: 'length', default: 0.6, min: 0.15, max: 0.9, visibleIf: (o) => o.front === 'nicho' },
      {
        key: 'frontH',
        label: 'Altura das portas/gavetas (0 = até o tampo)',
        kind: 'length',
        default: 0,
        min: 0,
        max: 1.2,
        hint: 'Com 3 gavetas, cada uma fica com 1/3 dessa altura',
        visibleIf: (o) => ['porta', 'portas', 'gavetas', 'portas-gavetas'].includes(String(o.front)),
      },
      {
        key: 'doorStyle',
        label: 'Estilo das portas',
        kind: 'select',
        default: 'lisa',
        choices: [
          { value: 'lisa', label: 'Lisa' },
          { value: 'provencal', label: 'Provençal (com moldura)' },
        ],
        visibleIf: (o) => ['porta', 'portas', 'gavetas', 'portas-gavetas'].includes(String(o.front)),
      },
      {
        key: 'pull',
        label: 'Puxador',
        kind: 'select',
        default: 'barra',
        choices: [
          { value: 'barra', label: 'Barra' },
          { value: 'concha', label: 'Concha' },
        ],
        visibleIf: (o) => ['porta', 'portas', 'gavetas', 'portas-gavetas'].includes(String(o.front)),
      },
      {
        key: 'pullColor',
        label: 'Cor do puxador',
        kind: 'select',
        default: 'inox',
        choices: [
          { value: 'inox', label: 'Inox' },
          { value: 'cromado', label: 'Cromado' },
          { value: 'dourado', label: 'Dourado' },
          { value: 'preto', label: 'Preto' },
          { value: 'branco', label: 'Branco' },
        ],
        visibleIf: (o) => ['porta', 'portas', 'gavetas', 'portas-gavetas'].includes(String(o.front)),
      },
      {
        key: 'top',
        label: 'Tampo',
        kind: 'select',
        default: 'pedra',
        choices: [
          { value: 'pedra', label: 'Pedra (cor lisa)' },
          { value: 'madeira', label: 'Madeira (na cor do tampo)' },
        ],
      },
      { key: 'sink', label: 'Cuba (pia) com torneira', kind: 'bool', default: false, visibleIf: (o) => !['gavetas', 'porta-pano', 'nicho'].includes(String(o.front ?? 'auto')) },
      { key: 'sinkLeft', label: 'Início da cuba (da ponta esquerda; 0 = centrada)', kind: 'length', default: 0, min: 0, max: 2, visibleIf: (o) => !!o.sink && (o.front ?? 'auto') !== 'auto' },
      { key: 'sinkWidth', label: 'Largura da cuba (0 = automática)', kind: 'length', default: 0, min: 0, max: 1.2, visibleIf: (o) => !!o.sink && (o.front ?? 'auto') !== 'auto' },
      {
        key: 'sinkColor',
        label: 'Cor da cuba',
        kind: 'select',
        default: 'inox',
        choices: [
          { value: 'inox', label: 'Inox' },
          { value: 'preto', label: 'Preta' },
          { value: 'grafite', label: 'Grafite' },
          { value: 'branco', label: 'Branca' },
          { value: 'dourado', label: 'Dourada' },
        ],
        visibleIf: (o) => !!o.sink,
      },
      {
        key: 'faucet',
        label: 'Torneira',
        kind: 'select',
        default: 'bica',
        choices: [
          { value: 'bica', label: 'Bica simples (bancada)' },
          { value: 'gourmet', label: 'Gourmet com mola (bancada)' },
          { value: 'gourmet-parede', label: 'Gourmet com mola (de parede)' },
        ],
        visibleIf: (o) => !!o.sink,
      },
      {
        key: 'faucetColor',
        label: 'Cor da torneira',
        kind: 'select',
        default: 'cromado',
        choices: [
          { value: 'cromado', label: 'Cromada' },
          { value: 'inox', label: 'Inox escovado' },
          { value: 'dourado', label: 'Dourada' },
          { value: 'preto', label: 'Preta' },
        ],
        visibleIf: (o) => !!o.sink,
      },
      {
        key: 'bay',
        label: 'Vão embaixo do tampo',
        kind: 'select',
        default: 'nenhum',
        // só na frente automática (nas outras, o vão é a própria frente: "Vão aberto")
        visibleIf: (o) => (o.front ?? 'auto') === 'auto',
        choices: [
          { value: 'nenhum', label: 'Nenhum (todo fechado)' },
          { value: 'forno', label: 'Para forno de embutir (com gaveta)' },
          { value: 'aberto', label: 'Aberto até o piso (fogão, lava-louças)' },
        ],
      },
      { key: 'bayWidth', label: 'Largura do vão', kind: 'length', default: 0.6, min: 0.3, max: 1.2, visibleIf: (o) => (o.front ?? 'auto') === 'auto' && o.bay !== 'nenhum' },
      {
        key: 'bayPos',
        label: 'Posição do vão',
        kind: 'select',
        default: 'direita',
        choices: [
          { value: 'esquerda', label: 'Esquerda' },
          { value: 'centro', label: 'Centro' },
          { value: 'direita', label: 'Direita' },
        ],
        visibleIf: (o) => (o.front ?? 'auto') === 'auto' && o.bay !== 'nenhum',
      },
    ],
    surface: true,
    build: B.kitchenCabinet,
  },
  toilet: {
    name: 'Vaso sanitário',
    w: 0.38, d: 0.65, h: 0.78,
    color: '#f7f7f5', color2: '#f7f7f5',
    colorLabel: 'Louça',
    backToWall: true,
    presets: [{ label: 'Com caixa acoplada', w: 0.38, d: 0.65, h: 0.78 }],
    build: B.toilet,
  },
  bathVanity: {
    name: 'Gabinete de banheiro',
    w: 0.8, d: 0.48, h: 0.85,
    color: '#f4f4f2', color2: '#e8e4dc',
    colorLabel: 'Gabinete', color2Label: 'Tampo',
    backToWall: true,
    presets: [
      { label: '60 cm', w: 0.6, d: 0.45, h: 0.85 },
      { label: '80 cm', w: 0.8, d: 0.48, h: 0.85 },
      { label: '1,00 m', w: 1.0, d: 0.5, h: 0.85 },
    ],
    options: [
      {
        key: 'basin',
        label: 'Cuba',
        kind: 'select',
        default: 'embutida',
        choices: [
          { value: 'embutida', label: 'Embutida no tampo' },
          { value: 'sobrepor', label: 'De sobrepor (sobre o tampo)' },
        ],
      },
    ],
    surface: true,
    build: B.bathVanity,
  },
  shower: {
    name: 'Box de banheiro',
    w: 0.9, d: 0.9, h: 1.9,
    color: '#cfe3ee', color2: '#c3c7cb',
    colorLabel: 'Vidro', color2Label: 'Perfis e ferragens',
    backToWall: true,
    presets: [
      { label: '80 × 80', w: 0.8, d: 0.8, h: 1.9 },
      { label: '90 × 90', w: 0.9, d: 0.9, h: 1.9 },
      { label: '1,20 × 0,90', w: 1.2, d: 0.9, h: 1.9 },
    ],
    options: [
      {
        key: 'layout',
        label: 'Formato',
        kind: 'select',
        default: 'canto',
        choices: [
          { value: 'canto', label: 'De canto (2 vidros)' },
          { value: 'frontal', label: 'Frontal (1 vidro, entre paredes)' },
          { value: 'walkin', label: 'Walk-in (vidro fixo, sem porta)' },
        ],
      },
      {
        key: 'door',
        label: 'Porta',
        kind: 'select',
        default: 'correr',
        choices: [
          { value: 'correr', label: 'De correr' },
          { value: 'abrir', label: 'De abrir (pivotante)' },
          { value: 'fixo', label: 'Sem porta (vidro fixo)' },
        ],
        visibleIf: (o) => o.layout !== 'walkin',
      },
      {
        key: 'fixed',
        label: 'Vidro fixo (visto de fora do box)',
        kind: 'select',
        default: 'direita',
        choices: [
          { value: 'direita', label: 'À direita — a porta corre para a direita' },
          { value: 'esquerda', label: 'À esquerda — a porta corre para a esquerda' },
        ],
        visibleIf: (o) => o.layout !== 'walkin' && (o.door ?? 'correr') === 'correr',
      },
      {
        key: 'handle',
        label: 'Puxador',
        kind: 'select',
        default: 'ponta',
        choices: [
          { value: 'ponta', label: 'Na ponta (junto à parede)' },
          { value: 'meio', label: 'No meio (encontro dos vidros)' },
        ],
        visibleIf: (o) => o.layout !== 'walkin' && (o.door ?? 'correr') === 'correr',
      },
      {
        key: 'hinge',
        label: 'Dobradiças (visto de fora do box)',
        kind: 'select',
        default: 'esquerda',
        choices: [
          { value: 'esquerda', label: 'À esquerda' },
          { value: 'direita', label: 'À direita' },
        ],
        visibleIf: (o) => o.layout !== 'walkin' && o.door === 'abrir',
      },
      { key: 'open', label: 'Mostrar porta aberta', kind: 'bool', default: false, visibleIf: (o) => o.layout !== 'walkin' && o.door !== 'fixo' },
      {
        key: 'drain',
        label: 'Ralo',
        kind: 'select',
        default: 'redondo',
        choices: [
          { value: 'redondo', label: 'Redondo' },
          { value: 'quadrado', label: 'Quadrado' },
          { value: 'linear', label: 'Linear (oculto)' },
        ],
      },
      {
        key: 'showerHead',
        label: 'Chuveiro',
        kind: 'select',
        default: 'redondo',
        choices: [
          { value: 'redondo', label: 'Ducha redonda cromada (braço da parede)' },
          { value: 'quadratta', label: 'Ducha elétrica Zagonel Quadratta' },
        ],
      },
      {
        key: 'showerColor',
        label: 'Cor da ducha',
        kind: 'select',
        default: 'branca',
        choices: [
          { value: 'branca', label: 'Branca' },
          { value: 'preta', label: 'Preta (black)' },
        ],
        visibleIf: (o) => o.showerHead === 'quadratta',
      },
      { key: 'hose', label: 'Mangueirinha com chuveirinho', kind: 'bool', default: true, visibleIf: (o) => o.showerHead === 'quadratta' },
    ],
    // nome padrão acompanha as opções (ex.: "de abrir" que virou de correr)
    adjust: (next, prev) => (SHOWER_NAMES.has(prev.name) && showerName(next.options) !== prev.name ? { name: showerName(next.options) } : null),
    normalize: (it) => (SHOWER_NAMES.has(it.name) && showerName(it.options) !== it.name ? { name: showerName(it.options) } : null),
    points: (it) => {
      const sp = B.showerSpots(it.width, it.depth, it.options)
      const at = (o: Record<string, OptionValue>) => B.showerSpots(it.width, it.depth, { ...it.options, ...o })
      return [
        {
          key: 'head',
          label: 'Chuveiro',
          color: '#0ea5e9',
          at: sp.head,
          move: (x, z) => {
            const q = at({ headX: x, headZ: z })
            return { headX: q.head[0], headZ: q.head[2] }
          },
        },
        {
          key: 'drain',
          label: 'Ralo',
          color: '#475569',
          at: [sp.drain[0], 0.03, sp.drain[1]],
          move: (x, z) => {
            const q = at({ drainX: x, drainZ: z })
            return { drainX: q.drain[0], drainZ: q.drain[1] }
          },
        },
      ]
    },
    build: B.shower,
  },
  washer: {
    name: 'Máquina de lavar',
    w: 0.6, d: 0.65, h: 0.85,
    color: '#f2f3f4', color2: '#f2f3f4',
    colorLabel: 'Acabamento',
    backToWall: true,
    options: [
      {
        key: 'load',
        label: 'Abertura',
        kind: 'select',
        default: 'frontal',
        choices: [
          { value: 'frontal', label: 'Frontal' },
          { value: 'superior', label: 'Superior' },
        ],
      },
    ],
    surface: true,
    build: B.washer,
  },
  wallSwitch: {
    name: 'Interruptor',
    w: 0.075, d: 0.012, h: 0.118,
    elevation: 1.04,
    color: '#f5f5f3', color2: '#fbfbfa',
    colorLabel: 'Placa', color2Label: 'Teclas',
    noCollide: true,
    backToWall: true,
    wallMounted: true,
    presets: [
      { label: 'Placa 4×2', w: 0.075, d: 0.012, h: 0.118 },
      { label: 'Placa 4×4', w: 0.118, d: 0.012, h: 0.118 },
      { label: 'Sobrepor 4×2', w: 0.078, d: 0.035, h: 0.122 },
    ],
    options: [
      {
        key: 'type',
        label: 'Tipo',
        kind: 'select',
        default: 'simples',
        choices: [
          { value: 'simples', label: 'Simples (1 tecla)' },
          { value: 'duplo', label: 'Duplo (2 teclas)' },
          { value: 'triplo', label: 'Triplo (3 teclas)' },
          { value: 'quadruplo', label: '4 teclas (placa 4×4)' },
          { value: 'sextuplo', label: '6 teclas (placa 4×4)' },
          { value: 'paralelo', label: 'Paralelo / three-way' },
          { value: 'dimmer', label: 'Dimmer (giratório)' },
          { value: 'campainha', label: 'Pulsador de campainha' },
          { value: 'combo', label: 'Interruptor + tomada' },
        ],
      },
      { key: 'mount', label: 'Instalação', kind: 'select', default: 'embutir', choices: PLATE },
    ],
    build: B.wallSwitch,
  },
  outlet: {
    name: 'Tomada',
    w: 0.075, d: 0.012, h: 0.118,
    elevation: 0.24,
    color: '#f5f5f3', color2: '#fbfbfa',
    colorLabel: 'Placa', color2Label: 'Módulos',
    noCollide: true,
    backToWall: true,
    wallMounted: true,
    presets: [
      { label: 'Placa 4×2', w: 0.075, d: 0.012, h: 0.118 },
      { label: 'Placa 4×4', w: 0.118, d: 0.012, h: 0.118 },
      { label: 'Sobrepor (condulete)', w: 0.08, d: 0.045, h: 0.13 },
      { label: 'De piso', w: 0.11, d: 0.11, h: 0.015 },
    ],
    options: [
      { key: 'count', label: 'Tomadas na placa', kind: 'select', default: 1, choices: [1, 2, 3, 4, 6].map((n) => ({ value: n, label: n > 3 ? `${n} (placa 4×4)` : String(n) })) },
      {
        key: 'type',
        label: 'Tipo',
        kind: 'select',
        default: 'padrao',
        choices: [
          { value: 'padrao', label: '10 A (padrão)' },
          { value: '20A', label: '20 A (vermelha)' },
          { value: 'usb', label: 'Com carregador USB' },
          { value: 'externa', label: 'Externa, com tampa' },
          { value: 'piso', label: 'De piso' },
        ],
      },
      { key: 'mount', label: 'Instalação', kind: 'select', default: 'embutir', choices: PLATE, visibleIf: (o) => o.type !== 'piso' && o.type !== 'externa' },
    ],
    build: B.outlet,
  },
  microwave: {
    name: 'Micro-ondas',
    w: 0.46, d: 0.36, h: 0.27,
    elevation: 0.9,
    color: '#c9ccd0', color2: '#1d1f22',
    colorLabel: 'Corpo', color2Label: 'Porta',
    backToWall: true,
    presets: [
      { label: '20 L', w: 0.44, d: 0.33, h: 0.26 },
      { label: '30 L', w: 0.52, d: 0.4, h: 0.3 },
      { label: '32 L', w: 0.53, d: 0.43, h: 0.31 },
      { label: 'Embutir 60 cm', w: 0.595, d: 0.4, h: 0.39 },
    ],
    options: [
      {
        key: 'mount',
        label: 'Instalação',
        kind: 'select',
        default: 'bancada',
        choices: [
          { value: 'bancada', label: 'De bancada' },
          { value: 'embutir', label: 'De embutir (com moldura)' },
        ],
      },
      {
        key: 'model',
        label: 'Modelo',
        kind: 'select',
        default: 'generico',
        choices: [
          { value: 'generico', label: 'Genérico' },
          { value: 'midea-espelhado', label: 'Midea espelhado (painel de toque)' },
        ],
        visibleIf: (o) => (o.mount ?? 'bancada') === 'bancada',
      },
    ],
    onSurface: true,
    build: X.microwave,
  },
  airfryer: {
    name: 'Airfryer',
    w: 0.28, d: 0.34, h: 0.32,
    elevation: 0.9,
    color: '#26272a', color2: '#3a3c41',
    colorLabel: 'Corpo', color2Label: 'Cesto',
    backToWall: true,
    presets: [
      { label: '3,5 L', w: 0.26, d: 0.32, h: 0.3 },
      { label: '5 L', w: 0.29, d: 0.36, h: 0.32 },
      { label: '12 L (forno)', w: 0.32, d: 0.36, h: 0.36 },
      { label: 'Kitchen Art KAF16A 16 L (360 × 345 × 375 mm)', w: 0.36, d: 0.345, h: 0.375 },
    ],
    options: [
      {
        key: 'style',
        label: 'Modelo',
        kind: 'select',
        default: 'cesto',
        choices: [
          { value: 'cesto', label: 'Cesto (gaveta)' },
          { value: 'forno', label: 'Forno (porta de vidro)' },
          { value: 'kaf16a', label: 'Kitchen Art KAF16A Redstone (forno 16 L, inox)' },
        ],
      },
    ],
    showColor2: (o) => o.style !== 'forno' && o.style !== 'kaf16a',
    onSurface: true,
    build: X.airfryer,
  },
  cooktop: {
    name: 'Cooktop de indução',
    w: 0.6, d: 0.52, h: 0.012,
    elevation: 0.9,
    color: '#2b2b2b', color2: '#2b2b2b',
    colorLabel: 'Corpo (portátil)',
    backToWall: true,
    presets: [
      { label: '4 zonas 60 cm', w: 0.6, d: 0.52, h: 0.012 },
      { label: '2 zonas dominó 30 cm', w: 0.29, d: 0.52, h: 0.012 },
      { label: '5 zonas 77 cm', w: 0.77, d: 0.52, h: 0.012 },
      { label: 'Portátil 1 zona', w: 0.29, d: 0.36, h: 0.06 },
    ],
    options: [
      {
        key: 'model',
        label: 'Modelo',
        kind: 'select',
        default: 'generico',
        choices: [
          { value: 'generico', label: 'Genérico (zonas em círculo)' },
          { value: 'dako-supreme', label: 'Dako Supreme (4 zonas, 59 × 52)' },
        ],
        visibleIf: (o) => !o.portable,
      },
      { key: 'zones', label: 'Zonas (bocas)', kind: 'select', default: 0, choices: autoCount(5), visibleIf: (o) => o.model !== 'dako-supreme' },
      { key: 'portable', label: 'Portátil (com corpo, fora da bancada)', kind: 'bool', default: false },
    ],
    onSurface: true,
    build: X.cooktop,
  },
  oven: {
    name: 'Forno',
    w: 0.595, d: 0.55, h: 0.595,
    elevation: 0.27,
    color: '#b8bcc0', color2: '#16171a',
    colorLabel: 'Painel / corpo', color2Label: 'Porta (vidro)',
    backToWall: true,
    presets: [
      { label: 'Embutir 60 cm', w: 0.595, d: 0.55, h: 0.595 },
      { label: 'Bancada 45 L', w: 0.52, d: 0.42, h: 0.33 },
    ],
    options: [
      {
        key: 'style',
        label: 'Tipo',
        kind: 'select',
        default: 'embutir',
        choices: [
          { value: 'embutir', label: 'De embutir' },
          { value: 'bancada', label: 'Elétrico de bancada' },
        ],
      },
    ],
    showColor2: (o) => o.style !== 'bancada',
    onSurface: true,
    build: X.oven,
  },
  pcTower: {
    name: 'PC Gamer',
    w: 0.23, d: 0.45, h: 0.48,
    color: '#1c1e22', color2: '#7c5cff',
    colorLabel: 'Gabinete', color2Label: 'Iluminação RGB',
    showColor2: (o) => o.rgb !== false && o.model !== 'mirage',
    presets: [
      { label: 'Mid tower', w: 0.23, d: 0.45, h: 0.48 },
      { label: 'Full tower', w: 0.24, d: 0.55, h: 0.56 },
      { label: 'Mini ITX', w: 0.2, d: 0.33, h: 0.3 },
      { label: 'Aerocool Mirage (216 × 499 × 417,5 mm)', w: 0.216, d: 0.4175, h: 0.499 },
    ],
    options: [
      {
        key: 'model',
        label: 'Modelo',
        kind: 'select',
        default: 'generico',
        choices: [
          { value: 'generico', label: 'Genérico' },
          { value: 'mirage', label: 'Aerocool Mirage (MSI B550 Gaming Plus, RTX 5070, XPG)' },
        ],
      },
      {
        key: 'gpu',
        label: 'Placa de vídeo (MSI RTX 5070)',
        kind: 'select',
        default: 'ventus2x',
        choices: [
          { value: 'ventus2x', label: 'Ventus 2X (236 mm, 2 ventoinhas)' },
          { value: 'ventus3x', label: 'Ventus 3X (302 mm, 3 ventoinhas)' },
        ],
        visibleIf: (o) => o.model === 'mirage',
      },
      {
        key: 'glassSide',
        label: 'Lado do vidro (visto de frente)',
        kind: 'select',
        default: 'esquerda',
        choices: [
          { value: 'esquerda', label: 'Esquerda' },
          { value: 'direita', label: 'Direita' },
        ],
        visibleIf: (o) => o.model === 'mirage',
      },
      { key: 'rgb', label: 'Iluminação RGB', kind: 'bool', default: true, visibleIf: (o) => o.model !== 'mirage' },
      { key: 'glass', label: 'Lateral de vidro', kind: 'bool', default: true, visibleIf: (o) => o.model !== 'mirage' },
    ],
    onSurface: true,
    build: X.pcTower,
  },
  monitor: {
    name: 'Monitor',
    w: 0.615, d: 0.22, h: 0.46,
    elevation: 0.75,
    color: '#1d1f23', color2: '#1d1f23',
    colorLabel: 'Moldura e base',
    backToWall: true,
    presets: [
      { label: '24"', w: 0.54, d: 0.2, h: 0.42 },
      { label: '27"', w: 0.615, d: 0.22, h: 0.46 },
      { label: '32"', w: 0.71, d: 0.24, h: 0.5 },
      { label: '34" ultrawide', w: 0.81, d: 0.25, h: 0.46 },
    ],
    options: [
      {
        key: 'orientation',
        label: 'Posição da tela',
        kind: 'select',
        default: 'horizontal',
        choices: [
          { value: 'horizontal', label: 'Horizontal (paisagem)' },
          { value: 'vertical', label: 'Vertical (retrato)' },
        ],
      },
      { key: 'curved', label: 'Tela curva', kind: 'bool', default: false, visibleIf: (o) => o.orientation !== 'vertical' },
    ],
    // girar a tela troca largura e altura do painel (o pé continua igual)
    adjust: (next, prev) => {
      let out: Partial<FurnitureItem> = {}
      if ((next.options.orientation ?? 'horizontal') !== (prev.options.orientation ?? 'horizontal')) {
        const cur = monitorPanel(prev)
        out = { width: cur.ph, height: cur.stand + cur.pw }
      }
      // preso ao braço: a profundidade inclui a curvatura da tela
      if (next.options.mount === 'braco') {
        const d = armMonitorDepth({ ...next, ...out })
        if (Math.abs(d - next.depth) > 1e-4) out.depth = d
      }
      return Object.keys(out).length ? out : null
    },
    onSurface: true,
    build: X.monitor,
  },
  portableMonitor: {
    name: 'Monitor portátil',
    w: 0.366, d: 0.113, h: 0.223,
    elevation: 0.75,
    color: '#8e9196', color2: '#8e9196',
    colorLabel: 'Alumínio',
    presets: [
      { label: 'Arzopa Z3FC 16,1" (366 × 228 mm)', w: 0.366, d: 0.113, h: 0.223 },
      { label: '15,6" (356 × 222 mm)', w: 0.356, d: 0.11, h: 0.217 },
      { label: '13,3" (305 × 191 mm)', w: 0.305, d: 0.095, h: 0.186 },
    ],
    options: [
      {
        key: 'orientation',
        label: 'Posição da tela',
        kind: 'select',
        default: 'horizontal',
        choices: [
          { value: 'horizontal', label: 'Horizontal (paisagem)' },
          { value: 'vertical', label: 'Vertical (retrato)' },
        ],
      },
      {
        key: 'tilt',
        label: 'Inclinação (descanso)',
        kind: 'select',
        default: 15,
        choices: [8, 12, 15, 20, 25, 30, 35].map((v) => ({ value: v, label: `${v}°` })),
      },
    ],
    // girar troca largura e altura do painel; a inclinação muda a altura e a profundidade ocupadas
    adjust: (next, prev) => {
      const tp = Number(prev.options.tilt ?? 15)
      const tn = Number(next.options.tilt ?? 15)
      const p0 = X.portableGeom(prev.width, 1, tp)
      const prevPH = (prev.height - X.PORTABLE_T * Math.sin(p0.th)) / Math.cos(p0.th)
      const rotated = (next.options.orientation ?? 'horizontal') !== (prev.options.orientation ?? 'horizontal')
      if (!rotated && tp === tn) return null
      const pw = rotated ? prevPH : next.width
      const ph = rotated ? prev.width : prevPH
      const g = X.portableGeom(pw, ph, tn)
      return { width: pw, height: g.height, depth: g.depth }
    },
    onSurface: true,
    build: X.portableMonitor,
  },
  soundbar2in1: {
    name: 'Soundbar 2 em 1',
    w: 0.375, d: 0.085, h: 0.066,
    elevation: 0.75,
    color: '#0e0f10', color2: '#ff2a1c',
    colorLabel: 'Corpo',
    options: [
      {
        key: 'mode',
        label: 'Montagem',
        kind: 'select',
        default: 'barra',
        choices: [
          { value: 'barra', label: 'Barra (as duas juntas, deitadas)' },
          { value: 'separadas', label: 'Duas caixinhas em pé (a largura é a distância entre elas)' },
        ],
      },
    ],
    // barra ↔ separadas: medidas de cada montagem (o centro fica onde está)
    adjust: (next, prev) => {
      const m = (o: Record<string, OptionValue>) => o.mode ?? 'barra'
      if (m(next.options) === m(prev.options)) return null
      return m(next.options) === 'barra' ? { width: 0.375, depth: 0.085, height: 0.066 } : { width: 0.75, depth: 0.11, height: 0.21 }
    },
    onSurface: true,
    build: S.orpheusSoundbar,
  },
  mousepad: {
    name: 'Mousepad',
    w: 0.9, d: 0.3, h: 0.003,
    elevation: 0.75,
    color: '#111214', color2: '#d8231b',
    colorLabel: 'Tecido', color2Label: 'Costura e logo',
    noCollide: true,
    surface: true,
    presets: [
      { label: 'Havit HV-MP830 (900 × 300 mm)', w: 0.9, d: 0.3, h: 0.003 },
      { label: '700 × 300 mm', w: 0.7, d: 0.3, h: 0.003 },
      { label: '800 × 400 mm', w: 0.8, d: 0.4, h: 0.004 },
      { label: 'Médio 450 × 400 mm', w: 0.45, d: 0.4, h: 0.003 },
    ],
    options: [
      {
        key: 'brand',
        label: 'Estampa',
        kind: 'select',
        default: 'havit',
        choices: [
          { value: 'havit', label: 'Havit (garra no canto)' },
          { value: 'liso', label: 'Liso' },
        ],
      },
    ],
    onSurface: true,
    build: S.mousepad,
  },
  keyboard: {
    name: 'Teclado',
    w: 0.353, d: 0.123, h: 0.038,
    elevation: 0.75,
    color: '#141517', color2: '#141517',
    colorLabel: 'Corpo',
    presets: [{ label: 'Redragon Kumara K552 (TKL, 353 × 123 mm)', w: 0.353, d: 0.123, h: 0.038 }],
    options: [{ key: 'rgb', label: 'Iluminação RGB', kind: 'bool', default: true }],
    onSurface: true,
    build: S.keyboardKumara,
  },
  mouse: {
    name: 'Mouse',
    w: 0.068, d: 0.124, h: 0.043,
    elevation: 0.75,
    color: '#151618', color2: '#151618',
    colorLabel: 'Corpo',
    presets: [{ label: 'Logitech G703 (124 × 68 × 43 mm)', w: 0.068, d: 0.124, h: 0.043 }],
    onSurface: true,
    build: S.mouseG703,
  },
  headset: {
    name: 'Headset',
    w: 0.21, d: 0.15, h: 0.33,
    elevation: 0.75,
    color: '#3a3c40', color2: '#3a3c40',
    colorLabel: 'Conchas',
    presets: [{ label: 'Corsair HS80 RGB no suporte', w: 0.21, d: 0.15, h: 0.33 }],
    options: [{ key: 'stand', label: 'No suporte de headset', kind: 'bool', default: true }],
    // com/sem suporte muda a altura ocupada
    adjust: (next, prev) => {
      const st = (o: Record<string, OptionValue>) => o.stand !== false
      if (st(next.options) === st(prev.options)) return null
      return { height: st(next.options) ? prev.height + 0.11 : Math.max(0.2, prev.height - 0.11) }
    },
    onSurface: true,
    build: S.headsetHS80,
  },
  peripheral: {
    name: 'Periférico',
    w: 0.8, d: 0.3, h: 0.04,
    elevation: 0.75,
    color: '#25272b', color2: '#2f3440',
    colorLabel: 'Cor', color2Label: 'Mousepad / detalhe',
    options: [
      {
        key: 'kind',
        label: 'Tipo',
        kind: 'select',
        default: 'teclado-mouse',
        choices: [
          { value: 'teclado-mouse', label: 'Teclado + mouse + mousepad' },
          { value: 'teclado', label: 'Teclado' },
          { value: 'mouse', label: 'Mouse e mousepad' },
          { value: 'headset', label: 'Headset com suporte' },
          { value: 'caixa', label: 'Caixa de som' },
          { value: 'soundbar', label: 'Soundbar (barra de som)' },
          { value: 'microfone', label: 'Microfone de mesa' },
        ],
      },
    ],
    showColor2: (o) => o.kind !== 'teclado',
    onSurface: true,
    build: X.peripheral,
  },
  standingDesk: {
    name: 'Mesa com regulagem de altura',
    w: 1.6, d: 0.7, h: 0.745,
    color: '#c9a27a', color2: '#f2f2f0',
    colorLabel: 'Tampo (MDF)', color2Label: 'Estrutura',
    backToWall: true,
    surface: true,
    presets: [
      { label: 'Tampo 120×60', w: 1.2, d: 0.6, h: 0.745 },
      { label: 'Tampo 140×70', w: 1.4, d: 0.7, h: 0.745 },
      { label: 'Tampo 160×80', w: 1.6, d: 0.8, h: 0.745 },
      { label: 'Tampo 170×70', w: 1.7, d: 0.7, h: 0.745 },
    ],
    options: [{ key: 'topT', label: 'Espessura do tampo', kind: 'length', default: 0.025, min: 0.01, max: 0.08 }],
    // trocar a espessura do tampo mantém a altura da estrutura
    adjust: (next, prev) => {
      const t = (o: Record<string, unknown>) => (typeof o.topT === 'number' ? o.topT : 0.025)
      const dt = t(next.options) - t(prev.options)
      return Math.abs(dt) > 1e-6 ? { height: prev.height + dt } : null
    },
    solids: (it) => X.standingDeskSolids({ w: it.width, h: it.height, d: it.depth, options: it.options }),
    build: X.standingDesk,
  },
  monitorArm: {
    name: 'Braço articulado para monitor',
    w: 0.15, d: 0.35, h: 0.5,
    elevation: 0.75,
    color: '#2b2d31', color2: '#2b2d31',
    colorLabel: 'Cor',
    noCollide: true,
    backToWall: true,
    onSurface: true,
    options: [
      {
        key: 'count',
        label: 'Monitores',
        kind: 'select',
        default: 1,
        choices: [
          { value: 1, label: '1 (simples)' },
          { value: 2, label: '2 (duplo)' },
        ],
      },
      {
        key: 'mount',
        label: 'Fixação na mesa',
        kind: 'select',
        default: 'garra',
        choices: [
          { value: 'garra', label: 'Garra (na borda da mesa)' },
          { value: 'furo', label: 'Furo no tampo (passa-fio)' },
        ],
      },
      { key: 'vesa', label: 'Altura das telas (os dois braços)', kind: 'length', default: 0.38, min: 0.15, max: 0.8 },
    ],
    // duplo precisa de largura para dois monitores
    adjust: (next, prev) => {
      const n = (o: Record<string, unknown>) => (Number(o.count) >= 2 ? 2 : 1)
      const strip = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.some((p) => k.startsWith(p))))
      if (n(next.options) !== n(prev.options)) {
        const options = strip(next.options, ['armX', 'reach', 'vesa0', 'vesa1']) as typeof next.options
        const a = { ...next, options, width: n(next.options) === 2 ? Math.max(next.width, 0.72) : 0.15 }
        return { width: a.width, options, ...fitArmReach(a) }
      }
      // "Altura do centro da tela" (geral) vale para os dois braços
      if (next.options.vesa !== prev.options.vesa) return { options: strip(next.options, ['vesa0', 'vesa1']) as typeof next.options }
      return null
    },
    build: X.monitorArm,
  },
  bathAccessory: {
    name: 'Acessório de banheiro',
    w: 0.6, d: 0.08, h: 0.45,
    elevation: 1.0,
    color: '#d7dadd', color2: '#8fb3c9',
    colorLabel: 'Metal', color2Label: 'Toalha',
    showColor2: (o) => (o.kind === 'toalheiro' || o.kind === 'argola') && o.towel !== false,
    noCollide: true,
    backToWall: true,
    wallMounted: true,
    options: [
      {
        key: 'kind',
        label: 'Tipo',
        kind: 'select',
        default: 'toalheiro',
        choices: [
          { value: 'toalheiro', label: 'Toalheiro de barra' },
          { value: 'argola', label: 'Porta-toalha de argola' },
          { value: 'ganchos', label: 'Ganchos / cabide' },
          { value: 'papel', label: 'Porta papel higiênico' },
          { value: 'porta-shampoo', label: 'Porta-shampoo' },
        ],
      },
      { key: 'towel', label: 'Com toalha', kind: 'bool', default: true, visibleIf: (o) => o.kind === 'toalheiro' || o.kind === 'argola' },
      { key: 'count', label: 'Ganchos', kind: 'select', default: 0, choices: autoCount(6), visibleIf: (o) => o.kind === 'ganchos' },
      { key: 'bottles', label: 'Com frascos', kind: 'bool', default: true, visibleIf: (o) => o.kind === 'porta-shampoo' },
    ],
    build: X.bathAccessory,
  },
  bathSink: {
    name: 'Pia de banheiro',
    w: 0.5, d: 0.42, h: 0.85,
    color: '#f7f7f5', color2: '#e8e4dc',
    colorLabel: 'Louça', color2Label: 'Bancada (pedra)',
    showColor2: (o) => o.style === 'bancada' || o.style === 'esculpida',
    backToWall: true,
    wallMounted: true,
    options: [
      {
        key: 'style',
        label: 'Modelo',
        kind: 'select',
        default: 'coluna',
        choices: [
          { value: 'coluna', label: 'De coluna (pedestal)' },
          { value: 'suspensa', label: 'Lavatório suspenso' },
          { value: 'bancada', label: 'Bancada suspensa com cuba' },
          { value: 'esculpida', label: 'Bancada esculpida (cuba com rampa, quartzo)' },
        ],
      },
      { key: 'splash', label: 'Altura do frontão (parte de trás que sobe)', kind: 'length', default: 0.078, min: 0, max: 0.3, visibleIf: (o) => o.style === 'esculpida' },
      {
        key: 'sideSplash',
        label: 'Frontão na lateral',
        kind: 'select',
        default: 'nenhum',
        choices: [
          { value: 'nenhum', label: 'Só atrás' },
          { value: 'direita', label: 'Também na lateral direita' },
          { value: 'esquerda', label: 'Também na lateral esquerda' },
          { value: 'ambos', label: 'Nas duas laterais' },
        ],
        visibleIf: (o) => o.style === 'esculpida',
      },
      { key: 'basinW', label: 'Largura da cuba', kind: 'length', default: 0.45, min: 0.2, max: 1.2, visibleIf: (o) => o.style === 'esculpida' },
      { key: 'basinLeft', label: 'Cuba a partir da ponta esquerda', kind: 'length', default: 0.24, min: 0.05, max: 1.2, visibleIf: (o) => o.style === 'esculpida' },
      {
        key: 'faucet',
        label: 'Torneira',
        kind: 'select',
        default: 'mesa',
        choices: [
          { value: 'mesa', label: 'De mesa (atrás da cuba, no meio)' },
          { value: 'nenhuma', label: 'Sem torneira (de parede à parte)' },
        ],
        visibleIf: (o) => o.style === 'esculpida',
      },
      {
        key: 'basin',
        label: 'Cuba',
        kind: 'select',
        default: 'apoio',
        choices: [
          { value: 'apoio', label: 'De apoio (sobre a bancada)' },
          { value: 'embutida', label: 'Embutida (sob a bancada)' },
        ],
        visibleIf: (o) => o.style === 'bancada',
      },
    ],
    build: X.bathSink,
  },
  niche: {
    name: 'Nicho',
    w: 0.6, d: 0.3, h: 0.35,
    elevation: 1.5,
    color: '#c49a6c', color2: '#f4f4f2',
    colorLabel: 'Estrutura', color2Label: 'Fundo',
    backToWall: true,
    wallMounted: true,
    container: true,
    options: [
      {
        key: 'layout',
        label: 'Formato',
        kind: 'select',
        default: 'simples',
        choices: [
          { value: 'simples', label: 'Simples (prateleiras)' },
          { value: 'coluna', label: 'Compartimento + coluna de prateleiras (micro-ondas)' },
        ],
      },
      { key: 'shelves', label: 'Prateleiras internas', kind: 'select', default: 0, choices: [0, 1, 2, 3].map((n) => ({ value: n, label: n ? String(n) : 'Nenhuma' })), visibleIf: (o) => o.layout !== 'coluna' },
      { key: 'divider', label: 'Divisória no meio', kind: 'bool', default: false, visibleIf: (o) => o.layout !== 'coluna' },
      {
        key: 'side',
        label: 'Coluna de prateleiras',
        kind: 'select',
        default: 'direita',
        choices: [
          { value: 'direita', label: 'À direita' },
          { value: 'esquerda', label: 'À esquerda' },
        ],
        visibleIf: (o) => o.layout === 'coluna',
      },
      { key: 'sideWidth', label: 'Largura da coluna (vão)', kind: 'length', default: 0.17, min: 0.06, max: 0.6, visibleIf: (o) => o.layout === 'coluna' },
      { key: 'sideCells', label: 'Compartimentos na coluna', kind: 'select', default: 2, choices: [1, 2, 3, 4].map((n) => ({ value: n, label: String(n) })), visibleIf: (o) => o.layout === 'coluna' },
      {
        key: 'shelfOut',
        label: 'Avanço da base do compartimento',
        kind: 'length',
        default: 0,
        min: 0,
        max: 0.3,
        hint: 'A profundidade do nicho inclui esse avanço',
        visibleIf: (o) => o.layout === 'coluna',
      },
    ],
    build: X.niche,
  },
  wallCabinet: {
    name: 'Armário aéreo',
    w: 0.8, d: 0.35, h: 0.7,
    elevation: 1.5,
    color: '#f4f4f2', color2: '#f4f4f2',
    colorLabel: 'Caixa', color2Label: 'Portas',
    backToWall: true,
    wallMounted: true,
    options: [
      {
        key: 'front',
        label: 'Frente',
        kind: 'select',
        default: 'portas',
        choices: [
          { value: 'porta', label: '1 porta' },
          { value: 'portas', label: '2 portas' },
          { value: 'basculante', label: 'Porta elevadiça (basculante)' },
          { value: 'aberto', label: 'Aberto (sem porta)' },
        ],
      },
      {
        key: 'handle',
        label: 'Puxador da porta',
        kind: 'select',
        default: 'direita',
        choices: [
          { value: 'direita', label: 'À direita (dobradiça à esquerda)' },
          { value: 'esquerda', label: 'À esquerda (dobradiça à direita)' },
        ],
        visibleIf: (o) => o.front === 'porta',
      },
      {
        key: 'doorStyle',
        label: 'Estilo das portas',
        kind: 'select',
        default: 'lisa',
        choices: [
          { value: 'lisa', label: 'Lisa' },
          { value: 'provencal', label: 'Provençal (com moldura)' },
        ],
        visibleIf: (o) => o.front !== 'aberto',
      },
      {
        key: 'pull',
        label: 'Puxador',
        kind: 'select',
        default: 'botao',
        choices: [
          { value: 'botao', label: 'Botão' },
          { value: 'concha', label: 'Concha' },
          { value: 'barra', label: 'Barra' },
          { value: 'nenhum', label: 'Sem puxador (toque)' },
        ],
        visibleIf: (o) => o.front !== 'aberto',
      },
      {
        key: 'pullColor',
        label: 'Cor do puxador',
        kind: 'select',
        default: 'dourado',
        choices: [
          { value: 'dourado', label: 'Dourado' },
          { value: 'inox', label: 'Inox' },
          { value: 'cromado', label: 'Cromado' },
          { value: 'preto', label: 'Preto' },
          { value: 'branco', label: 'Branco' },
        ],
        visibleIf: (o) => o.front !== 'aberto' && o.pull !== 'nenhum',
      },
      { key: 'open', label: 'Mostrar aberto', kind: 'bool', default: false, visibleIf: (o) => o.front !== 'aberto' },
    ],
    build: B.wallCabinet,
  },
  dishTowelRack: {
    name: 'Porta pano de prato',
    w: 0.14, d: 0.42, h: 0.36,
    elevation: 0.95,
    color: '#d7dadd', color2: '#e9c46a',
    colorLabel: 'Metal', color2Label: 'Panos',
    showColor2: (o) => o.cloths !== false,
    noCollide: true,
    backToWall: true,
    wallMounted: true,
    options: [
      {
        key: 'style',
        label: 'Modelo',
        kind: 'select',
        default: 'articulado',
        choices: [
          { value: 'articulado', label: 'Articulado (braços giratórios)' },
          { value: 'barra', label: 'De barra' },
          { value: 'ganchos', label: 'De ganchos' },
        ],
      },
      { key: 'arms', label: 'Braços', kind: 'select', default: 0, choices: autoCount(5), visibleIf: (o) => o.style === 'articulado' },
      { key: 'count', label: 'Ganchos', kind: 'select', default: 0, choices: autoCount(5), visibleIf: (o) => o.style === 'ganchos' },
      { key: 'cloths', label: 'Com panos', kind: 'bool', default: true },
    ],
    build: X.dishTowelRack,
  },
  box: {
    name: 'Objeto genérico',
    w: 0.5, d: 0.5, h: 0.5,
    color: '#b8bcc2', color2: '#b8bcc2',
    colorLabel: 'Cor',
    surface: true,
    onSurface: true,
    build: B.genericBox,
  },
  custom: {
    name: 'Modelo importado',
    w: 1, d: 1, h: 1,
    color: '#b8bcc2', color2: '#b8bcc2',
    colorLabel: 'Cor',
    build: B.genericBox,
  },
}

export interface CatalogEntry {
  key: string
  type: string
  label: string
  preset?: string
  options?: Record<string, OptionValue>
  color?: string
  color2?: string
  elevation?: number
  /** Sobrescreve dimensões do preset. */
  w?: number
  d?: number
  h?: number
}

const e = (type: string, label: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({
  key: `${type}:${label}`,
  type,
  label,
  ...extra,
})

export const CATALOG: { category: string; entries: CatalogEntry[] }[] = [
  {
    category: 'Quarto',
    entries: [
      e('bed', 'Cama de solteiro', { preset: 'Solteiro — colchão 88×188' }),
      e('bed', 'Cama de casal', { preset: 'Casal — colchão 138×188' }),
      e('bed', 'Cama queen', { preset: 'Queen — colchão 158×198' }),
      e('bed', 'Cama king', { preset: 'King — colchão 193×203' }),
      e('crib', 'Berço'),
      e('wardrobe', 'Guarda-roupa 3 portas', { preset: '3 portas' }),
      e('wardrobe', 'Guarda-roupa 6 portas', { preset: '6 portas' }),
      e('wardrobe', 'Guarda-roupa de correr', { preset: 'Casal de correr', options: { sliding: true, mirror: true } }),
      e('dresser', 'Cômoda', { preset: 'Cômoda 4 gavetas' }),
      e('nightstand', 'Criado-mudo'),
      e('vanity', 'Penteadeira'),
      e('vanity', 'Penteadeira suspensa', { w: 0.9, d: 0.4, h: 0.95, elevation: 0.6, preset: 'suspensa' }),
      e('wardrobe', 'Armário aéreo', { w: 1.2, d: 0.35, h: 0.6, elevation: 1.6, preset: 'aereo' }),
      e('bench', 'Baú / Banco'),
      e('mirror', 'Espelho de chão'),
    ],
  },
  {
    category: 'Sala',
    entries: [
      e('sofa', 'Sofá 2 lugares', { preset: '2 lugares' }),
      e('sofa', 'Sofá 3 lugares', { preset: '3 lugares' }),
      e('armchair', 'Poltrona'),
      e('pouf', 'Puff'),
      e('tvRack', 'Rack', { preset: 'Rack 1,80 m' }),
      e('tvRack', 'Rack suspenso', { w: 1.8, d: 0.35, h: 0.35, elevation: 0.35, preset: 'suspenso' }),
      e('tv', 'TV 50" (parede)', { preset: '50"' }),
      e('tv', 'TV 55" (pedestal)', { preset: '55"', options: { stand: true }, elevation: 0.5, d: 0.25, h: 0.78 }),
      e('coffeeTable', 'Mesa de centro'),
      e('diningTable', 'Mesa de jantar', { preset: '4 lugares' }),
      e('diningTable', 'Mesa redonda', { preset: 'Redonda 4 lugares', options: { shape: 'round' } }),
      e('chair', 'Cadeira'),
    ],
  },
  {
    category: 'Escritório',
    entries: [
      e('desk', 'Escrivaninha', { preset: 'Padrão 120×60' }),
      e('standingDesk', 'Mesa elétrica BlackAir (branca, tampo 170×70)', { preset: 'Tampo 170×70' }),
      e('standingDesk', 'Mesa elétrica (preta, tampo 140×70)', { preset: 'Tampo 140×70', color: '#3d3f43', color2: '#2b2b2b' }),
      e('desk', 'Escrivaninha compacta', { preset: 'Pequena 90×50', options: { drawers: false } }),
      e('desk', 'Bancada suspensa', { w: 1.2, d: 0.5, h: 0.16, elevation: 0.6, preset: 'suspensa' }),
      e('officeChair', 'Cadeira de escritório'),
      e('officeChair', 'Cadeira Elements Vertta Pro (preta)', { preset: 'Elements Vertta Pro (68 × 66 cm, até 137 cm)', color: '#1b1c1e', color2: '#3a3c40', options: { model: 'vertta-pro' } }),
      e('pcTower', 'PC Gamer'),
      e('pcTower', 'PC Gamer branco', { color: '#eceef0', color2: '#4cc9f0' }),
      e('pcTower', 'PC Aerocool Mirage (RTX 5070, B550 Gaming Plus)', { preset: 'Aerocool Mirage (216 × 499 × 417,5 mm)', color: '#141518', options: { model: 'mirage' } }),
      e('monitor', 'Monitor 24"', { preset: '24"' }),
      e('monitor', 'Monitor 27"', { preset: '27"' }),
      e('monitor', 'Monitor ultrawide curvo 34"', { preset: '34" ultrawide', options: { curved: true } }),
      e('portableMonitor', 'Monitor portátil Arzopa Z3FC 16,1"', { preset: 'Arzopa Z3FC 16,1" (366 × 228 mm)' }),
      e('monitor', 'Monitor 24" vertical', { w: 0.315, d: 0.2, h: 0.62, options: { orientation: 'vertical' } }),
      e('peripheral', 'Teclado + mouse + mousepad', { w: 0.8, d: 0.3, h: 0.04 }),
      e('peripheral', 'Teclado', { w: 0.44, d: 0.14, h: 0.035, options: { kind: 'teclado' } }),
      e('peripheral', 'Mouse e mousepad', { w: 0.27, d: 0.22, h: 0.04, options: { kind: 'mouse' } }),
      e('peripheral', 'Headset com suporte', { w: 0.16, d: 0.13, h: 0.28, color2: '#3a3d42', options: { kind: 'headset' } }),
      e('peripheral', 'Caixa de som', { w: 0.12, d: 0.15, h: 0.2, color2: '#9aa0a6', options: { kind: 'caixa' } }),
      e('peripheral', 'Soundbar Redragon (Adiemus GS560)', { w: 0.4, d: 0.075, h: 0.067, color: '#1d1e21', color2: '#ff2d6f', options: { kind: 'soundbar' } }),
      e('soundbar2in1', 'Soundbar Redragon Orpheus GS550 (vira 2 caixinhas)'),
      e('mousepad', 'Mousepad Havit HV-MP830 (900 × 300)', { preset: 'Havit HV-MP830 (900 × 300 mm)' }),
      e('keyboard', 'Teclado Redragon Kumara K552 RGB (ABNT2)', { preset: 'Redragon Kumara K552 (TKL, 353 × 123 mm)' }),
      e('mouse', 'Mouse Logitech G703', { preset: 'Logitech G703 (124 × 68 × 43 mm)' }),
      e('headset', 'Headset Corsair HS80 RGB (com suporte)', { preset: 'Corsair HS80 RGB no suporte' }),
      e('peripheral', 'Soundbar de TV', { w: 0.86, d: 0.1, h: 0.065, color: '#26272b', color2: '#3a3c40', elevation: 0.5, options: { kind: 'soundbar' } }),
      e('monitorArm', 'Braço articulado (garra)'),
      e('monitorArm', 'Braço articulado (furo na mesa)', { options: { mount: 'furo' } }),
      e('monitorArm', 'Braço articulado duplo', { w: 0.73, options: { count: 2 } }),
      e('monitorArm', 'Braço articulado duplo (furo)', { w: 0.73, options: { count: 2, mount: 'furo' } }),
      e('peripheral', 'Microfone', { w: 0.15, d: 0.15, h: 0.3, color2: '#9aa0a6', options: { kind: 'microfone' } }),
      e('bookshelf', 'Estante', { preset: 'Padrão 80×180' }),
      e('bookshelf', 'Estante baixa', { preset: 'Baixa 80×90' }),
      e('wallShelf', 'Prateleira de parede'),
    ],
  },
  {
    category: 'Cortinas e persianas',
    entries: [
      e('curtain', 'Cortina', { options: { openness: 0.7 } }),
      e('curtain', 'Cortina dupla (voil + blackout)', { color: '#4a5566', color2: '#f7f5f0', options: { layers: 'dupla', openness: 0.85, sheerOpenness: 0 } }),
      e('curtain', 'Cortina com trilho', { color: '#d8c8ab', options: { rod: 'trilho', rodColor: '#f2f2f0', openness: 0.6 } }),
      e('curtain', 'Persiana rolô', { d: 0.08, color: '#e3ddd2', options: { style: 'rolo', openness: 0.35 } }),
      e('curtain', 'Persiana horizontal', { d: 0.06, color: '#f1f1ef', options: { style: 'horizontal', openness: 0, tilt: 0.7 } }),
    ],
  },
  {
    category: 'Cozinha',
    entries: [
      e('kitchenCabinet', 'Gabinete de pia', { preset: 'Gabinete de pia 1,20 m', options: { sink: true } }),
      e('kitchenCabinet', 'Balcão de cozinha', { preset: 'Balcão 0,80 m' }),
      e('wallCabinet', 'Armário aéreo de cozinha (2 portas)', { w: 0.8, d: 0.35, h: 0.7, elevation: 1.5, options: { front: 'portas' } }),
      e('wallCabinet', 'Armário aéreo 1 porta', { w: 0.45, d: 0.35, h: 0.7, elevation: 1.5, options: { front: 'porta' } }),
      e('wallCabinet', 'Armário aéreo basculante (porta elevadiça)', { w: 0.8, d: 0.35, h: 0.4, elevation: 1.8, options: { front: 'basculante' } }),
      e('niche', 'Nicho para micro-ondas', { w: 0.8, d: 0.475, h: 0.44, elevation: 1.4, color: '#f4f4f2', options: { layout: 'coluna', sideWidth: 0.17, sideCells: 2, shelfOut: 0.065 } }),
      e('fridge', 'Geladeira duplex', { preset: 'Duplex 400 L' }),
      e('fridge', 'Geladeira Electrolux Inverter duplex inox', { w: 0.632, d: 0.712, h: 1.884, color: '#d6d8d8', options: { model: 'electrolux', finish: 'inox-look' } }),
      e('fridge', 'Geladeira side by side', { preset: 'Side by side', options: { layout: 'side' } }),
      e('stove', 'Fogão 4 bocas', { preset: '4 bocas' }),
      e('stove', 'Fogão 5 bocas', { preset: '5 bocas' }),
      e('stove', 'Fogão de indução com forno', { preset: '4 bocas', options: { top: 'inducao' } }),
      e('cooktop', 'Cooktop de indução 4 bocas', { preset: '4 zonas 60 cm' }),
      e('cooktop', 'Cooktop de indução Dako Supreme (4 zonas)', { preset: '4 zonas 60 cm', w: 0.59, d: 0.52, options: { model: 'dako-supreme' } }),
      e('cooktop', 'Cooktop de indução 2 bocas', { preset: '2 zonas dominó 30 cm' }),
      e('cooktop', 'Fogão de indução portátil', { preset: 'Portátil 1 zona', options: { portable: true } }),
      e('microwave', 'Micro-ondas', { preset: '30 L' }),
      e('microwave', 'Micro-ondas Midea espelhado', { w: 0.52, d: 0.42, h: 0.31, color: '#3d3f42', options: { model: 'midea-espelhado' } }),
      e('microwave', 'Micro-ondas de embutir', { preset: 'Embutir 60 cm', elevation: 1.3, options: { mount: 'embutir' } }),
      e('airfryer', 'Airfryer', { preset: '5 L' }),
      e('airfryer', 'Airfryer forno 12 L', { preset: '12 L (forno)', options: { style: 'forno' } }),
      e('airfryer', 'Air fryer Kitchen Art KAF16A Redstone 16 L', { preset: 'Kitchen Art KAF16A 16 L (360 × 345 × 375 mm)', color: '#c4c7ca', options: { style: 'kaf16a' } }),
      e('oven', 'Forno de embutir', { preset: 'Embutir 60 cm' }),
      e('oven', 'Forno elétrico de bancada', { preset: 'Bancada 45 L', elevation: 0.9, color: '#2b2b2b', options: { style: 'bancada' } }),
      e('kitchenCabinet', 'Balcão com vão para forno', { preset: 'Gabinete de pia 1,20 m', options: { bay: 'forno', bayPos: 'direita' } }),
      e('kitchenCabinet', 'Balcão aberto embaixo', { preset: 'Gabinete de pia 1,20 m', options: { bay: 'aberto', bayPos: 'centro' } }),
      e('kitchenCabinet', 'Módulo 1 porta', { w: 0.45, d: 0.59, h: 0.884, options: { front: 'porta', handle: 'direita' } }),
      e('kitchenCabinet', 'Módulo 2 portas', { w: 0.8, d: 0.59, h: 0.884, options: { front: 'portas' } }),
      e('kitchenCabinet', 'Gaveteiro 3 gavetas', { w: 0.45, d: 0.59, h: 0.884, options: { front: 'gavetas' } }),
      e('kitchenCabinet', 'Gabinete de pia 2 portas + 3 gavetas', { w: 1.8, d: 0.59, h: 0.884, options: { front: 'portas-gavetas', sink: true, drawerWidth: 0.6 } }),
      e('kitchenCabinet', 'Porta-pano deslizante (20 cm)', { w: 0.2, d: 0.59, h: 0.884, options: { front: 'porta-pano' } }),
      e('kitchenCabinet', 'Módulo para forno de embutir (vão aberto)', { w: 0.8, d: 0.59, h: 0.884, options: { front: 'nicho', nicheW: 0.59, nicheH: 0.6 } }),
      e('niche', 'Nicho de cozinha'),
      e('dishTowelRack', 'Porta pano de prato articulado'),
      e('dishTowelRack', 'Porta pano de prato de barra', { w: 0.45, d: 0.07, h: 0.32, options: { style: 'barra' } }),
      e('washer', 'Máquina de lavar'),
    ],
  },
  {
    category: 'Banheiro',
    entries: [
      e('toilet', 'Vaso sanitário'),
      e('bathVanity', 'Gabinete com cuba', { preset: '80 cm' }),
      e('bathVanity', 'Gabinete suspenso', { preset: '60 cm', elevation: 0.45, h: 0.4 }),
      e('bathSink', 'Pia de coluna'),
      e('bathSink', 'Lavatório suspenso', { w: 0.46, d: 0.38, h: 0.23, elevation: 0.62, options: { style: 'suspensa' } }),
      e('bathSink', 'Bancada suspensa com cuba', { w: 0.9, d: 0.45, h: 0.2, elevation: 0.7, options: { style: 'bancada' } }),
      e('bathSink', 'Bancada esculpida de quartzo bege (cuba com rampa)', { w: 0.79, d: 0.46, h: 0.278, elevation: 0.69, color2: '#d8c6a6', options: { style: 'esculpida', sideSplash: 'direita' } }),
      e('shower', 'Box de vidro de canto', { preset: '90 × 90' }),
      e('shower', 'Box de vidro frontal de correr', { preset: '1,20 × 0,90', options: { layout: 'frontal' } }),
      e('shower', 'Box de vidro de abrir', { preset: '90 × 90', options: { layout: 'frontal', door: 'abrir' } }),
      e('shower', 'Box walk-in (vidro fixo)', { preset: '1,20 × 0,90', options: { layout: 'walkin' } }),
      e('shower', 'Box de vidro com perfil preto', { preset: '90 × 90', color2: '#2b2b2b' }),
      e('shower', 'Box com ducha Zagonel Quadratta', { preset: '90 × 90', options: { showerHead: 'quadratta' } }),
      e('bathAccessory', 'Toalheiro de barra'),
      e('bathAccessory', 'Porta-toalha de argola', { w: 0.2, d: 0.08, h: 0.3, elevation: 1.1, options: { kind: 'argola' } }),
      e('bathAccessory', 'Ganchos / cabide', { w: 0.3, d: 0.06, h: 0.08, elevation: 1.6, options: { kind: 'ganchos' } }),
      e('bathAccessory', 'Porta papel higiênico', { w: 0.16, d: 0.12, h: 0.13, elevation: 0.6, options: { kind: 'papel' } }),
      e('bathAccessory', 'Porta-shampoo', { w: 0.3, d: 0.12, h: 0.22, elevation: 1.2, options: { kind: 'porta-shampoo' } }),
      e('niche', 'Nicho de banheiro', { w: 0.4, d: 0.12, h: 0.6, elevation: 1.1, color: '#f4f4f2', color2: '#d9d4ca', options: { shelves: 1 } }),
      e('mirror', 'Espelho', { w: 0.6, d: 0.03, h: 0.8, elevation: 1.1, preset: 'espelho-banheiro' }),
    ],
  },
  {
    category: 'Elétrica',
    entries: [
      e('wallSwitch', 'Interruptor simples', { options: { type: 'simples' } }),
      e('wallSwitch', 'Interruptor duplo', { options: { type: 'duplo' } }),
      e('wallSwitch', 'Interruptor triplo', { options: { type: 'triplo' } }),
      e('wallSwitch', 'Interruptor 4×4 (4 teclas)', { preset: 'Placa 4×4', options: { type: 'quadruplo' } }),
      e('wallSwitch', 'Interruptor paralelo', { options: { type: 'paralelo' } }),
      e('wallSwitch', 'Dimmer', { options: { type: 'dimmer' } }),
      e('wallSwitch', 'Campainha (pulsador)', { options: { type: 'campainha' } }),
      e('wallSwitch', 'Interruptor + tomada', { options: { type: 'combo' } }),
      e('wallSwitch', 'Interruptor de sobrepor', { preset: 'Sobrepor 4×2', options: { type: 'simples', mount: 'sobrepor' } }),
      e('outlet', 'Tomada simples', { options: { count: 1 } }),
      e('outlet', 'Tomada dupla', { options: { count: 2 } }),
      e('outlet', 'Tomada tripla', { options: { count: 3 } }),
      e('outlet', 'Tomada 4×4 (4)', { preset: 'Placa 4×4', options: { count: 4 } }),
      e('outlet', 'Tomada 4×4 (6)', { preset: 'Placa 4×4', options: { count: 6 } }),
      e('outlet', 'Tomada 20 A', { options: { count: 1, type: '20A' } }),
      e('outlet', 'Tomada com USB', { options: { count: 2, type: 'usb' } }),
      e('outlet', 'Tomada média (bancada 1,10 m)', { elevation: 1.04, options: { count: 2 } }),
      e('outlet', 'Tomada alta (ar-cond. 2,20 m)', { elevation: 2.14, options: { count: 1, type: '20A' } }),
      e('outlet', 'Tomada de sobrepor', { preset: 'Sobrepor (condulete)', color: '#b8bcc0', options: { count: 2, mount: 'sobrepor' } }),
      e('outlet', 'Tomada externa com tampa', { preset: 'Sobrepor (condulete)', options: { count: 1, type: 'externa' } }),
      e('outlet', 'Tomada de piso', { preset: 'De piso', elevation: 0, options: { type: 'piso' } }),
    ],
  },
  {
    category: 'Decoração e outros',
    entries: [
      e('rug', 'Tapete', { preset: '150×200' }),
      e('rug', 'Tapete redondo', { preset: 'Redondo Ø150', options: { shape: 'round' } }),
      e('floorLamp', 'Luminária de piso'),
      e('plant', 'Planta'),
      e('airConditioner', 'Ar-condicionado split', { preset: '12.000 BTUs' }),
      e('box', 'Objeto genérico (caixa)'),
    ],
  },
]

export const ALL_ENTRIES = CATALOG.flatMap((c) => c.entries)
export const findEntry = (key: string) => ALL_ENTRIES.find((x) => x.key === key)

export function defaultOptions(type: string): Record<string, OptionValue> {
  const def = TYPES[type]
  const o: Record<string, OptionValue> = {}
  for (const opt of def?.options ?? []) o[opt.key] = opt.default
  return o
}

/** Campos do móvel a partir de uma entrada do catálogo (sem posição). */
export function entryToItem(entry: CatalogEntry): Omit<FurnitureItem, 'id' | 'x' | 'z' | 'rotation'> {
  const def = TYPES[entry.type]
  const p = def.presets?.find((x) => x.label === entry.preset)
  return {
    entry: entry.key,
    type: entry.type,
    name: entry.label,
    elevation: entry.elevation ?? def.elevation ?? 0,
    width: entry.w ?? p?.w ?? def.w,
    depth: entry.d ?? p?.d ?? def.d,
    height: entry.h ?? p?.h ?? def.h,
    color: entry.color ?? def.color,
    color2: entry.color2 ?? def.color2,
    options: { ...defaultOptions(entry.type), ...entry.options },
  }
}

/** Acima disto o móvel é considerado suspenso (sem pés/rodapé). */
export const FLOATING_MIN = 0.02

export function buildItemGroup(it: Pick<FurnitureItem, 'type' | 'width' | 'height' | 'depth' | 'color' | 'color2' | 'options' | 'elevation'>) {
  const def = TYPES[it.type] ?? TYPES.box
  return def.build({
    w: it.width,
    h: it.height,
    d: it.depth,
    color: it.color,
    color2: it.color2,
    options: it.options,
    floating: it.elevation > FLOATING_MIN,
  })
}

export const PALETTE: { name: string; hex: string }[] = [
  { name: 'Branco', hex: '#f4f4f2' },
  { name: 'Off-white', hex: '#ece6da' },
  { name: 'Areia', hex: '#d8c8ab' },
  { name: 'Cinza claro', hex: '#c9cccf' },
  { name: 'Cinza', hex: '#8c8f93' },
  { name: 'Grafite', hex: '#4a4f55' },
  { name: 'Preto', hex: '#2b2b2b' },
  { name: 'Pinus', hex: '#dcbc8a' },
  { name: 'Carvalho', hex: '#c49a6c' },
  { name: 'Freijó', hex: '#a87a4f' },
  { name: 'Nogueira', hex: '#6e4b33' },
  { name: 'Azul', hex: '#4a6fa5' },
  { name: 'Azul-marinho', hex: '#2f3e5c' },
  { name: 'Verde', hex: '#6f8f6a' },
  { name: 'Terracota', hex: '#c06c4c' },
  { name: 'Mostarda', hex: '#d1a33c' },
  { name: 'Rosa', hex: '#d8a7a7' },
  { name: 'Dourado', hex: '#c8a24a' },
  { name: 'Inox', hex: '#b8bcc0' },
]
