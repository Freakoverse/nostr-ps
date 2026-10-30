import { useEffect, useMemo, useState } from 'react'
import { useLensStore, requestScores, type Bucket } from '@/stores/lensStore'

export type ScoreFilter = 'all' | 'scored' | 'low' | 'unscored'

export const SCORE_FILTERS: { id: ScoreFilter; label: string; hint: string }[] = [
  { id: 'scored', label: 'Scored only', hint: 'At or above your threshold' },
  { id: 'low', label: 'Low scored only', hint: 'Scored, but below your threshold' },
  { id: 'unscored', label: 'Unscored only', hint: 'No source has an opinion on them' },
  { id: 'all', label: 'Show all', hint: 'Everything, in one list' },
]

/**
 * Apply the lens to a list by author (CLIENT-LENS.md, "Threshold filter").
 * Returns `main` (what the current filter keeps, in original order) plus the
 * per-bucket counts. Run this BEFORE pagination so page slices never come up
 * empty; it requests scores for every item it sees.
 */
export function useLensFilter<T extends { pubkey: string }>(items: T[], initial: ScoreFilter = 'scored') {
  const enabled = useLensStore((s) => s.enabled)
  const threshold = useLensStore((s) => s.threshold)
  const scores = useLensStore((s) => s.scores)
  const sources = useLensStore((s) => s.sources)
  const bucketOf = useLensStore((s) => s.bucketOf)
  const [filter, setFilter] = useState<ScoreFilter>(initial)

  useEffect(() => {
    if (enabled && items.length) void requestScores(items.map((i) => i.pubkey))
  }, [items, enabled, sources])

  return useMemo(() => {
    void scores; void threshold
    const buckets = new Map<T, Bucket>()
    for (const it of items) buckets.set(it, bucketOf(it.pubkey))
    const lensActive = enabled && ![...buckets.values()].some((b) => b === 'off')
    const main: T[] = []
    const counts = { above: 0, below: 0, unknown: 0 }
    for (const it of items) {
      const b = buckets.get(it)!
      if (b === 'above' || b === 'below' || b === 'unknown') counts[b]++
      if (!lensActive || filter === 'all') { main.push(it); continue }
      if (filter === 'scored' ? b === 'above' : filter === 'low' ? b === 'below' : b === 'unknown') main.push(it)
    }
    return { main, counts, lensActive, filter, setFilter }
  }, [items, enabled, filter, bucketOf, scores, threshold])
}
