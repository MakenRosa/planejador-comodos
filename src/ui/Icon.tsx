const P: Record<string, string> = {
  select: 'M5 3l6.5 17 2.4-7.1L21 10.5z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  ruler: 'M3.5 16.5L16.5 3.5l4 4-13 13z M7.5 12.5l2 2 M10.5 9.5l2 2 M13.5 6.5l2 2',
  cube: 'M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z M12 21.5V12 M20.5 7.25L12 12 3.5 7.25',
  plan: 'M3.5 3.5h17v17h-17z M3.5 12.5h7v8 M10.5 3.5v4.5',
  undo: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  open: 'M3 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1.5 M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5h13.2L21 12H6.2L3 19',
  save: 'M5 3.5h11l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z M7.5 3.5V8h8 M7 20.5v-6.5h10v6.5',
  image: 'M3.5 5h17v14h-17z M3.5 16l5-5 4 4 3-3 5 5 M15.5 9.2a1.2 1.2 0 1 0 0.01 0',
  file: 'M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z M14 3v5h5 M8.5 13h7 M8.5 16.5h4.5',
  magnet: 'M6 3.5v7.5a6 6 0 0 0 12 0V3.5 M6 7.5h3.5 M14.5 7.5H18 M9.5 3.5v7.5a2.5 2.5 0 0 0 5 0V3.5',
  grid: 'M3.5 3.5h17v17h-17z M3.5 9.2h17 M3.5 14.8h17 M9.2 3.5v17 M14.8 3.5v17',
  trash: 'M4 7h16 M9.5 7V4.5h5V7 M6 7l1 13h10l1-13 M10 11v5.5 M14 11v5.5',
  copy: 'M8.5 8.5h11v11h-11z M5 15.5H4.5V4.5h11V5',
  lock: 'M6 11h12v9.5H6z M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  unlock: 'M6 11h12v9.5H6z M8.5 11V7.5a3.5 3.5 0 0 1 6.8-1.2',
  rotL: 'M4 12a8 8 0 1 0 2.6-5.9 M4 3.5V8h4.5',
  rotR: 'M20 12a8 8 0 1 1-2.6-5.9 M20 3.5V8h-4.5',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 9.2a2.8 2.8 0 1 0 0.01 0',
  person: 'M12 3.5a2 2 0 1 0 0.01 0 M12 8v7 M9 21l3-6 3 6 M7.5 11h9',
  fit: 'M3.5 8.5v-5h5 M20.5 8.5v-5h-5 M3.5 15.5v5h5 M20.5 15.5v5h-5',
  iso: 'M12 3l8 4.5-8 4.5-8-4.5z M4 12l8 4.5 8-4.5 M4 16.5L12 21l8-4.5',
  plus: 'M12 5v14 M5 12h14',
  upload: 'M12 15.5V4 M7 8.5L12 4l5 4.5 M4 20h16',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  x: 'M6 6l12 12 M18 6L6 18',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1',
  alert: 'M12 3.5l9.5 16.5h-19z M12 10v4.5 M12 17.2v.3',
  home: 'M3.5 11L12 3.5l8.5 7.5 M5.5 9.5v10h13v-10',
  left: 'M19 12H5 M11 6l-6 6 6 6',
  right: 'M5 12h14 M13 6l6 6-6 6',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  center: 'M12 3v18 M3 12h18 M12 8.5a3.5 3.5 0 1 0 0.01 0',
  keyboard: 'M3 6.5h18v11H3z M7 10.5h.01 M11 10.5h.01 M15 10.5h.01 M7.5 14h9',
  chevron: 'M7 10l5 5 5-5',
  search: 'M10.5 4.5a6 6 0 1 0 0.01 0 M15 15l5 5',
  door: 'M5 20.5h14 M7 20.5V4h10v16.5 M14 12.5h.01',
  window: 'M4 4h16v16H4z M12 4v16 M4 12h16',
  wall: 'M3.5 6h17v12h-17z M3.5 12h17 M9 6v6 M15 12v6',
  flag: 'M5.5 21V3.5 M5.5 4h11.5l-2.4 4.25L17 12.5H5.5',
  sun: 'M12 8a4 4 0 1 0 0.01 0 M12 2.5v2 M12 19.5v2 M4.6 4.6l1.4 1.4 M18 18l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.6 19.4L6 18 M18 6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
}

export function Icon({ name, size = 18 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name] ?? ''} />
    </svg>
  )
}
