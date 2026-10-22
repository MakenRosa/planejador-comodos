import { useMemo } from 'react'
import { analyze, type Analysis } from './lib/analysis'
import type { FurnitureItem, Room } from './lib/types'
import { useStore } from './store'

let memo: { room: Room | null; items: FurnitureItem[]; res: Analysis } | null = null

export function getAnalysis(room: Room | null, items: FurnitureItem[]) {
  if (memo && memo.room === room && memo.items === items) return memo.res
  const res = analyze(room, items)
  memo = { room, items, res }
  return res
}

export function useAnalysis() {
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  return useMemo(() => getAnalysis(room, items), [room, items])
}
