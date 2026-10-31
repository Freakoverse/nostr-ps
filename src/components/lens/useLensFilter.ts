import { useEffect, useMemo, useState } from 'react'
import { useLensStore, requestScores, type Bucket } from '@/stores/lensStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { countLeadingZeroBits } from '@/lib/pow/pow'

export type ScoreFilter = 'all' | 'scored' | 'low' | 'unscored'

export const SCORE_FILTERS: { id: ScoreFilter; label: string; hint: string }[] = [
  { id: 'scored', label: 'Scored only', hint: 'At or above your threshold' },
  { id: 'low', label: 'Low scored only', hint: 'Scored, but below your threshold' },
  { id: 'unscored', label: 'Unscored only', hint: 'No source has an opinion on them' },
  { id: 'all', label: 'Show all', hint: 'Everything, including anything under the proof-of-work floor' },
]

export interface LensCounts {
  above: number
  below: number
  unknown: number
  /** Items under the §6.5 proof-of-work floor; folded unless the filter is "all". */
  belowPow: number
}

/** The event id a list item is judged by: its own event, or a proposal's latest release. */
function eventIdOf(it: unknown): string | null {
  const o = it as { event?: { id?: string }; latest?: { id?: string }; id?: string }
  return o.event?.id ?? o.latest?.id ?? (typeof o.id === 'string' && o.id.length === 64 ? o.id : null)
}

/**
 * Apply the lens to a list by author (CLIENT-LENS.md, "Threshold filter"),
 * and the proof-of-work floor (spec §6.5) by event. Returns `main` (what the
 * current filter keeps, in original order) plus the per-bucket counts. Run
 * this BEFORE pagination so page slices never come up empty; it requests
 * scores for every item it sees.
 */
export function useLensFilter<T extends { pubkey: string }>(items: T[], initial: ScoreFilter = 'scored') {
  const enabled = useLensStore((s) => s.enabled)
  const threshold = useLensStore((s) => s.threshold)
  const scores = useLensStore((s) => s.scores)
  const sources = useLensStore((s) => s.sources)
  const bucketOf = useLensStore((s) => s.bucketOf)
  const floorOn = useSettingsStore((s) => s.rawPowFloor)
  const floorBits = useSettingsStore((s) => s.powFilterDifficulty)
  const floor = floorOn ? floorBits : 0
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
    const counts: LensCounts = { above: 0, below: 0, unknown: 0, belowPow: 0 }
    for (const it of items) {
      // Proof-of-work floor first: an event under it is folded whatever its author's rank.
      if (floor > 0) {
        const id = eventIdOf(it)
        if (id && countLeadingZeroBits(id) < floor) {
          counts.belowPow++
          if (filter === 'all') main.push(it)
          continue
        }
      }
      const b = buckets.get(it)!
      if (b === 'above' || b === 'below' || b === 'unknown') counts[b]++
      if (!lensActive || filter === 'all') { main.push(it); continue }
      if (filter === 'scored' ? b === 'above' : filter === 'low' ? b === 'below' : b === 'unknown') main.push(it)
    }
    // The menu is worth showing when either the lens or the floor can fold something.
    const filterActive = lensActive || floor > 0
    return { main, counts, lensActive, filterActive, floor, filter, setFilter }
  }, [items, enabled, filter, bucketOf, scores, threshold, floor])
}
