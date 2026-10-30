import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import {
  fetchReleases, fetchLatestUpdates, fetchClaimsForMany, summarizeProposals,
  getCachedReleases, getCachedClaimsByUuid, whenEventCacheReady, PS_ORIGIN_TAG,
  type ProposalSummary, type Release, type Claim,
} from '@/lib/nostr/nipps'

const BATCH = 100

/**
 * Transitional: releases published before the `o` tag existed are invisible to
 * the `#o original` listing. While true, the first page also runs one unfiltered
 * query and keeps whatever lacks the tag. Flip off once nothing old matters.
 */
const INCLUDE_UNTAGGED_LEGACY = true

/**
 * Progressive proposal feed (spec §6.1): paints from the event cache at once,
 * then originals newest first via an `until` cursor, one event per proposal
 * regardless of version count; the latest update per proposal on the page
 * (limit 1 each), claims for every new uuid, rolled up per proposal (§5).
 */
export function useProposalFeed(tick = 0, batch = BATCH) {
  const [items, setItems] = useState<ProposalSummary[]>([])
  /** True only while nothing is on screen yet (cold cache). */
  const [loading, setLoading] = useState(true)
  /** True while the first relay fetch runs behind a cache-seeded list. */
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const releases = useRef(new Map<string, Release>())
  const claims = useRef(new Map<string, Claim[]>())
  /** Release ids seeded from cache and not yet confirmed by a relay. */
  const seeded = useRef(new Set<string>())
  const oldest = useRef<number | undefined>(undefined)
  const inFlight = useRef(false)

  /** Ingest originals, resolve their latest versions, fetch claims for new uuids. Returns fresh proposal count. */
  const ingest = useCallback(async (relays: string[], originals: Release[]): Promise<number> => {
    let fresh = 0
    const newUuids = new Set<string>()
    const newOriginals: Release[] = []
    for (const r of originals) {
      // A cache-seeded release counts as fresh the first time a relay returns
      // it, otherwise a fully cached first page would look like the end.
      const unseen = !releases.current.has(r.id) || seeded.current.delete(r.id)
      if (unseen) {
        fresh++
        newOriginals.push(r)
        newUuids.add(r.uuid)
      }
      releases.current.set(r.id, r)
      if (r.origin === 'original' && (oldest.current === undefined || r.createdAt < oldest.current)) oldest.current = r.createdAt
    }
    const [updates, got] = await Promise.all([
      newOriginals.length ? fetchLatestUpdates(relays, newOriginals).catch(() => [] as Release[]) : Promise.resolve([] as Release[]),
      newUuids.size ? fetchClaimsForMany(relays, [...newUuids]).catch(() => new Map<string, Claim[]>()) : Promise.resolve(new Map<string, Claim[]>()),
    ])
    for (const r of updates) releases.current.set(r.id, r)
    for (const u of newUuids) claims.current.set(u, got.get(u) ?? [])
    setItems(summarizeProposals([...releases.current.values()], claims.current))
    return fresh
  }, [])

  useEffect(() => {
    let cancelled = false
    releases.current = new Map(); claims.current = new Map(); seeded.current = new Set(); oldest.current = undefined; inFlight.current = false
    setItems([]); setReachedEnd(false); setLoading(true); setRefreshing(false)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    ;(async () => {
      await whenEventCacheReady
      if (cancelled) return
      // Seed from cache: every cached release and claim, rolled up. No cursor;
      // the relay batch sets it.
      const cachedReleases = getCachedReleases()
      if (cachedReleases.length) {
        for (const r of cachedReleases) { releases.current.set(r.id, r); seeded.current.add(r.id) }
        for (const [u, cs] of getCachedClaimsByUuid()) claims.current.set(u, cs)
        setItems(summarizeProposals(cachedReleases, claims.current))
        setLoading(false)
        setRefreshing(true)
      }
      try {
        const [originals, legacy] = await Promise.all([
          fetchReleases(relays, { [`#${PS_ORIGIN_TAG}`]: ['original'], limit: batch }),
          INCLUDE_UNTAGGED_LEGACY ? fetchReleases(relays, { limit: batch }).catch(() => [] as Release[]) : Promise.resolve([] as Release[]),
        ])
        if (cancelled) return
        // Untagged releases: every version arrives, so the rollup sees them all.
        const untagged = legacy.filter((r) => !r.origin)
        const n = await ingest(relays, [...originals, ...untagged])
        // Paging walks originals only; none means there is nothing further back.
        if (!cancelled && (n === 0 || originals.length === 0)) setReachedEnd(true)
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
      const rs = await fetchReleases(relays, { [`#${PS_ORIGIN_TAG}`]: ['original'], until: oldest.current - 1, limit: batch })
      if ((await ingest(relays, rs)) === 0) setReachedEnd(true)
    } catch {
      setReachedEnd(true)
    } finally {
      inFlight.current = false
      setLoadingMore(false)
    }
  }, [reachedEnd, batch, ingest])

  return { items, loading, refreshing, loadingMore, reachedEnd, loadMore }
}
