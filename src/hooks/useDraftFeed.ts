import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { fetchDrafts, fetchReleases, type Draft } from '@/lib/nostr/nipps'

const BATCH = 60

/**
 * Progressive draft feed: newest first, older batches via an `until` cursor.
 * Also detects which listed drafts have a release (spec §6.1) so the chip
 * does not depend on the author stamping the draft.
 */
export function useDraftFeed(tick = 0, batch = BATCH) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const [released, setReleased] = useState<Set<string>>(new Set())
  const byCoord = useRef(new Map<string, Draft>())
  const oldest = useRef<number | undefined>(undefined)
  const inFlight = useRef(false)

  const ingest = useCallback((incoming: Draft[]): number => {
    let fresh = 0
    for (const d of incoming) {
      const cur = byCoord.current.get(d.coord)
      if (!cur) fresh++
      if (!cur || d.createdAt > cur.createdAt) byCoord.current.set(d.coord, d)
      if (oldest.current === undefined || d.createdAt < oldest.current) oldest.current = d.createdAt
    }
    setDrafts([...byCoord.current.values()].sort((a, b) => b.createdAt - a.createdAt))
    const coords = incoming.map((d) => d.coord)
    if (coords.length) {
      const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
      fetchReleases(relays, { '#a': coords, limit: 500 })
        .then((rs) => {
          if (rs.length === 0) return
          setReleased((prev) => {
            const next = new Set(prev)
            for (const r of rs) if (r.draftCoord) next.add(r.draftCoord)
            return next
          })
        })
        .catch(() => { /* chip falls back to the advisory tag */ })
    }
    return fresh
  }, [])

  useEffect(() => {
    let cancelled = false
    byCoord.current = new Map(); oldest.current = undefined; inFlight.current = false
    setDrafts([]); setReleased(new Set()); setReachedEnd(false); setLoading(true)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    fetchDrafts(relays, { limit: batch })
      .then((d) => { if (!cancelled) { const n = ingest(d); if (n === 0) setReachedEnd(true) } })
      .catch(() => { if (!cancelled) setReachedEnd(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tick, batch, ingest])

  const loadMore = useCallback(async () => {
    if (inFlight.current || reachedEnd || oldest.current === undefined) return
    inFlight.current = true
    setLoadingMore(true)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    try {
      const d = await fetchDrafts(relays, { until: oldest.current - 1, limit: batch })
      if (ingest(d) === 0) setReachedEnd(true)
    } catch {
      setReachedEnd(true)
    } finally {
      inFlight.current = false
      setLoadingMore(false)
    }
  }, [reachedEnd, batch, ingest])

  return { drafts, released, loading, loadingMore, reachedEnd, loadMore }
}
