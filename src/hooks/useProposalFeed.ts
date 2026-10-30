import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { fetchReleases, fetchClaimsForMany, summarizeProposals, type ProposalSummary, type Release, type Claim } from '@/lib/nostr/nipps'

const BATCH = 100

/**
 * Progressive proposal feed: releases newest first via an `until` cursor,
 * claims fetched for every new uuid, rolled up per proposal (spec §5).
 */
export function useProposalFeed(tick = 0, batch = BATCH) {
  const [items, setItems] = useState<ProposalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const releases = useRef(new Map<string, Release>())
  const claims = useRef(new Map<string, Claim[]>())
  const oldest = useRef<number | undefined>(undefined)
  const inFlight = useRef(false)

  const ingest = useCallback(async (relays: string[], incoming: Release[]): Promise<number> => {
    let fresh = 0
    const newUuids = new Set<string>()
    for (const r of incoming) {
      if (!releases.current.has(r.id)) { fresh++; if (!claims.current.has(r.uuid)) newUuids.add(r.uuid) }
      releases.current.set(r.id, r)
      if (oldest.current === undefined || r.createdAt < oldest.current) oldest.current = r.createdAt
    }
    if (newUuids.size) {
      const got = await fetchClaimsForMany(relays, [...newUuids]).catch(() => new Map<string, Claim[]>())
      for (const u of newUuids) claims.current.set(u, got.get(u) ?? [])
    }
    setItems(summarizeProposals([...releases.current.values()], claims.current))
    return fresh
  }, [])

  useEffect(() => {
    let cancelled = false
    releases.current = new Map(); claims.current = new Map(); oldest.current = undefined; inFlight.current = false
    setItems([]); setReachedEnd(false); setLoading(true)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    ;(async () => {
      try {
        const rs = await fetchReleases(relays, { limit: batch })
        if (cancelled) return
        const n = await ingest(relays, rs)
        if (!cancelled && n === 0) setReachedEnd(true)
      } catch {
        if (!cancelled) setReachedEnd(true)
      } finally {
        if (!cancelled) setLoading(false)
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
      const rs = await fetchReleases(relays, { until: oldest.current - 1, limit: batch })
      if ((await ingest(relays, rs)) === 0) setReachedEnd(true)
    } catch {
      setReachedEnd(true)
    } finally {
      inFlight.current = false
      setLoadingMore(false)
    }
  }, [reachedEnd, batch, ingest])

  return { items, loading, loadingMore, reachedEnd, loadMore }
}
