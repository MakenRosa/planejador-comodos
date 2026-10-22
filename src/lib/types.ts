/** Coordenadas do cômodo em metros. Vec2 = [x, z] no plano do piso. */
export type Vec2 = [number, number]
export type Vec3 = [number, number, number]

export interface Wall {
  id: string
  a: Vec2
  b: Vec2
  height: number
  /** Normal unitária apontando para dentro do cômodo. */
  normal: Vec2
  /** Cor da tinta da parede (face interna). */
  paint?: string
  /** Papéis de parede / faixas de tinta sobre a face interna. */
  panels?: WallPanel[]
  /** Espessura desenhada (para fora do cômodo). Padrão: room.wallThickness. */
  thickness?: number
  /** Trechos com espessura própria [início, fim, espessura] (ex.: metade da parede compartilhada com o vizinho). */
  thicknessSpans?: [number, number, number][]
  /** Cômodo (Space) ao qual a face interna pertence. */
  spaceId?: string
  /** Rodapé na face interna (para nas portas e passagens). */
  baseboard?: Baseboard
}

export type BaseboardTop = 'reto' | 'chanfrado' | 'boleado'

/** Rodapé de poliestireno (frisado ou liso), medidas em metros. */
export interface Baseboard {
  height: number
  thickness: number
  color: string
  /** Quantidade de frisos (sulcos horizontais) na frente: 0 = liso. */
  grooves: number
  /** Frisos juntos perto do topo ou distribuídos pela altura. */
  groovePos: 'topo' | 'distribuidos'
  /** Acabamento da quina de cima. */
  top: BaseboardTop
}

/** Papel de parede, faixa de tinta ou azulejo (o padrão vem de lib/patterns.ts / lib/tiles.ts). */
export type WallPanelKind = 'wallpaper' | 'paint' | 'tile'

/** Revestimento aplicado numa região retangular da face interna da parede. */
export interface WallPanel {
  id: string
  kind: WallPanelKind
  /** Padrão do papel de parede (ver lib/patterns.ts). */
  pattern: string
  /** Cor de fundo (ou da tinta, para faixas). */
  color: string
  /** Cor do desenho. */
  color2: string
  /** Tamanho de repetição do desenho, em metros. */
  scale: number
  /** Distância a partir da ponta ESQUERDA da parede, vista de dentro do cômodo. */
  left: number
  width: number
  /** Altura da base acima do piso. */
  bottom: number
  height: number
}

export type OpeningKind = 'door' | 'window' | 'opening'
export type WindowType = 'sliding' | 'casement' | 'awning' | 'fixed'
/** Porta de abrir (dobradiças) ou de correr aparente (folha sobre a parede, pendurada num trilho). */
export type DoorType = 'swing' | 'sliding'

export interface Opening {
  id: string
  wallId: string
  kind: OpeningKind
  /** Distância de wall.a até o centro da abertura, ao longo da parede. */
  offset: number
  width: number
  height: number
  /** Altura da base acima do piso (peitoril, para janelas). */
  bottom: number
  isOpen: boolean
  /** false: dobradiça no lado mais próximo de wall.a. */
  hingeAtEnd: boolean
  swingOut: boolean
  /** Só para janelas: de correr (padrão), de abrir, basculante ou fixa. */
  windowType?: WindowType
  /**
   * Só para portas: de abrir (padrão) ou de correr. Na de correr, `hingeAtEnd` diz para que lado a folha
   * corre ao abrir (true = para o lado de wall.b) e `swingOut` em que face fica o trilho.
   */
  doorType?: DoorType
  /** Só para portas: folha de vidro temperado (senão, madeira). */
  glass?: boolean
  /** Porta de correr: quanto o conjunto trilho + folha sai da parede (até a face de fora da folha). */
  railDepth?: number
  /** Só para portas: acabamento da folha (id de lib/doors ou '#rrggbb'). */
  leafFinish?: string
  /** Só para portas: acabamento do batente e do alisar (moldura). */
  frameFinish?: string
  /** Só para portas: largura do alisar (moldura na face da parede, por fora do vão), em metros. Padrão 7 cm. */
  casing?: number
  /** Só para portas de vidro: cor do vidro. */
  glassTint?: string
  /** Só para portas: modelo e acabamento da maçaneta/puxador. */
  handle?: string
  handleFinish?: string
  /** Só o recorte (o outro lado de uma porta entre cômodos): sem folha, rótulo ou arco. */
  ghost?: boolean
  /** Abertura correspondente do outro lado da parede. */
  pairId?: string
}

export interface ScannedObject {
  id: string
  category: string
  attributes: Record<string, string>
  /** Centro da base. */
  position: Vec3
  /** [largura (x local), altura, profundidade (z local)] */
  size: Vec3
  rotation: number
  confidence: string
  /** Rótulo do cômodo (RoomPlan section) onde o objeto está: kitchen, bathroom, bedroom... */
  spaceKind?: string
}

/** Um cômodo dentro da planta (casa com vários cômodos). */
export interface Space {
  id: string
  name: string
  /** Rótulo do RoomPlan: bedroom, kitchen, bathroom, livingRoom, unidentified... */
  kind: string
  floor: Vec2[]
  ceilingHeight: number
  /** Revestimento do piso: wood | porcelain | ceramic | cement. */
  floorType?: string
}

export interface Room {
  name: string
  walls: Wall[]
  openings: Opening[]
  floor: Vec2[]
  ceilingHeight: number
  wallThickness: number
  scanned: ScannedObject[]
  /** Cômodos (quando a planta é uma casa montada a partir de vários scans). */
  spaces?: Space[]
  /** Seções do RoomPlan (rótulo + centro), usadas para nomear cômodos. */
  sections?: { label: string; center: Vec2 }[]
  /** Versão da lógica de montagem da casa que gerou estas paredes (para atualizar projetos salvos). */
  houseVersion?: number
  /**
   * Correções de paredes conferidas com trena (lib/wallEdit.ts), na ordem — reaplicadas quando a casa é
   * refeita a partir dos scans, que não são alterados.
   */
  wallEdits?: WallEdit[]
  /**
   * Medidas conferidas com trena (lib/checks.ts), por chave: `wall:<id>`, `opening:<id>` (a principal de
   * um par) e `height:<id do cômodo>` (pé-direito). Sem registro, a medida é a do scan.
   */
  checks?: Record<string, MeasureCheck>
  /** Margem de erro do scan para avisar de encaixes justos (metros). Padrão: 2 cm. */
  checkTolerance?: number
}

/** Conferência de uma medida: marcada para conferir ou já conferida com trena. */
export interface MeasureCheck {
  state: 'conferida' | 'a-conferir'
  /** Quando foi marcada (ISO). */
  at: string
  /** Anotação curta: "trena 116 cm", "medir sem o rodapé"… */
  note?: string
}

/** Correção de parede: a parede anda `delta` metros ao longo da normal dela (+ = para dentro do cômodo). */
export interface WallEdit {
  wallId: string
  delta: number
}

export type OptionValue = number | string | boolean

export interface FurnitureItem {
  /** Item do catálogo de onde veio (ex.: "outlet:Tomada simples") — para seguir o padrão do último. */
  entry?: string
  id: string
  type: string
  name: string
  /** Centro da base no piso. */
  x: number
  z: number
  elevation: number
  /** Rotação em radianos no eixo Y. Frente do móvel = +Z local. */
  rotation: number
  width: number
  depth: number
  height: number
  color: string
  color2: string
  options: Record<string, OptionValue>
  locked?: boolean
  assetId?: string
  fromScan?: boolean
  /** Monitor preso a um braço articulado (id do braço) e em qual placa VESA (0 = esquerda). */
  attachedTo?: string
  attachSlot?: number
}

export interface Measurement {
  id: string
  a: Vec3
  b: Vec3
}

export type Selection = { kind: 'item' | 'measure' | 'opening' | 'wall' | 'space' | 'group'; id: string } | null

/**
 * Grupo de móveis com nome (um nível só): mover, girar ou duplicar o grupo leva todos os membros,
 * mantendo as distâncias. Não é o mesmo que "apoiado em" (monitor na mesa), que continua valendo.
 */
export interface FurnitureGroup {
  id: string
  name: string
  members: string[]
  /** Ponto em volta do qual o grupo gira (e que os campos de posição mostram). */
  pivot: Vec2
  /** Giro acumulado do grupo, só para mostrar no painel. */
  rotation: number
}
