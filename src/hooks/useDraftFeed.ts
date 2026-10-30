import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import {
  fetchDrafts, fetchReleases, getCachedDrafts, getCachedReleasedCoords, whenEventCacheReady, PS_ORIGIN_TAG,
  type Draft,
} from '@/lib/nostr/nipps'

const BATCH = 60

/**
 * Progressive draft feed: paints from the event cache at once, then newest
 * first from relays with older batches via an `until` cursor. Also detects
 * which listed drafts have a release (spec §6.1) by query; the chip never
 * reads a label on the draft, since drafts carry none.
 */
export function useDraftFeed(tick = 0, batch = BATCH) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  /** True only while nothing is on screen yet (cold cache). */
  const [loading, setLoading] = useState(true)
  /** True while the first relay fetch runs behind a cache-seeded list. */
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const [released, setReleased] = useState<Set<string>>(new Set())
  const byCoord = useRef(new Map<string, Draft>())
  /** Coordinates seeded from cache and not yet confirmed by a relay. */
  const seeded = useRef(new Set<string>())
  const oldest = useRef<number | undefined>(undefined)
  const inFlight = useRef(false)

  const ingest = useCallback((incoming: Draft[]): number => {
    let fresh = 0
    for (const d of incoming) {
      const cur = byCoord.current.get(d.coord)
      // A cache-seeded draft counts as fresh the first time a relay returns it,
      // otherwise a fully cached first page would look like the end of the feed.
      if (!cur || seeded.current.delete(d.coord)) fresh++
      if (!cur || d.createdAt > cur.createdAt) byCoord.current.set(d.coord, d)
      if (oldest.current === undefined || d.createdAt < oldest.current) oldest.current = d.createdAt
    }
    // Listing order is original publication time; created_at is a version counter (§4.1).
    setDrafts([...byCoord.current.values()].sort((a, b) => b.publishedAt - a.publishedAt))
    const coords = incoming.map((d) => d.coord)
    if (coords.length) {
      const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
      // `#o original` bounds this to one event per draft (§6.1), so a
      // version-heavy proposal cannot crowd out the others' chips.
      fetchReleases(relays, { '#a': coords, [`#${PS_ORIGIN_TAG}`]: ['original'], limit: coords.length })
        .then((rs) => {
          const found = new Set<string>()
          for (const r of rs) if (r.draftCoord) found.add(r.draftCoord)
          if (found.size === 0) return
          setReleased((prev) => new Set([...prev, ...found]))
        })
        .catch(() => { /* no chip without evidence */ })
    }
    return fresh
  }, [])

  useEffect(() => {
    let cancelled = false
    byCoord.current = new Map(); seeded.current = new Set(); oldest.current = undefined; inFlight.current = false
    setDrafts([]); setReleased(new Set()); setReachedEnd(false); setLoading(true); setRefreshing(false)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    ;(async () => {
      await whenEventCacheReady
      if (cancelled) return
      // Seed from cache: instant paint, no cursor (the relay batch sets it).
      const cached = getCachedDrafts().slice(0, batch)
      if (cached.length) {
        for (const d of cached) { byCoord.current.set(d.coord, d); seeded.current.add(d.coord) }
        setDrafts(cached)
        setReleased(getCachedReleasedCoords())
        setLoading(false)
        setRefreshing(true)
      }
      try {
        const d = await fetchDrafts(relays, { limit: batch })
        if (cancelled) return
        if (ingest(d) === 0) setReachedEnd(true)
      } catch {
        if (!cancelled) setReachedEnd(true)
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false) }
      }
    })()
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

  return { drafts, released, loading, refreshing, loadingMore, reachedEnd, loadMore }
}
