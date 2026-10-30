import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw, Search } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useLensStore, requestScores } from '@/stores/lensStore'
import { fetchReleases, fetchClaimsForMany, summarizeProposals, type ProposalSummary, type Release, type Claim } from '@/lib/nostr/nipps'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { usePaged } from '@/hooks/usePaged'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LensBar } from '@/components/lens/LensBar'
import { ScoreFilterMenu, EmptyFiltered } from '@/components/lens/TieredList'
import { useLensFilter } from '@/components/lens/useLensFilter'
import { Pagination } from '@/components/shared/Pagination'
import { ProposalCard } from '@/components/ps/Cards'
import { cn } from '@/lib/utils'

type Sort = 'adoption' | 'newest'
const PER_PAGE = 10
const BATCH = 100

/**
 * Progressive proposal feed: releases newest first via an `until` cursor,
 * claims fetched for every new uuid, rolled up per proposal (§5).
 */
function useProposalFeed(tick: number) {
  const [items, setItems] = useState<ProposalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const releases = useRef(new Map<string, Release>())
  const claims = useRef(new Map<string, Claim[]>())
  const oldest = useRef<number | undefined>(undefined)
  const inFlight = useRef(false)

  const ingest = useCallback(async (relays: string[], batch: Release[]): Promise<number> => {
    let fresh = 0
    const newUuids = new Set<string>()
    for (const r of batch) {
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
        const rs = await fetchReleases(relays, { limit: BATCH })
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
  }, [tick, ingest])

  const loadMore = useCallback(async () => {
    if (inFlight.current || reachedEnd || oldest.current === undefined) return
    inFlight.current = true
    setLoadingMore(true)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    try {
      const rs = await fetchReleases(relays, { until: oldest.current - 1, limit: BATCH })
      if ((await ingest(relays, rs)) === 0) setReachedEnd(true)
    } catch {
      setReachedEnd(true)
    } finally {
      inFlight.current = false
      setLoadingMore(false)
    }
  }, [reachedEnd, ingest])

  return { items, loading, loadingMore, reachedEnd, loadMore }
}

/**
 * Released specs, one row per proposal (author + uuid), ranked by adoption.
 * Adoption = distinct implementers with a live claim against any version;
 * "verified" = those whose author clears the lens threshold.
 */
export function ProposalsPage() {
  useSeoMeta({ title: 'Proposals', description: 'Released specs ranked by who implements them.' })
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('adoption')
  const [tick, setTick] = useState(0)
  const { items, loading, loadingMore, reachedEnd, loadMore } = useProposalFeed(tick)

  const enabled = useLensStore((s) => s.enabled)
  const threshold = useLensStore((s) => s.threshold)
  const scores = useLensStore((s) => s.scores)
  const bucketOf = useLensStore((s) => s.bucketOf)
  const sources = useLensStore((s) => s.sources)

  // Score every claim author so the "above threshold" count is real.
  useEffect(() => {
    if (!enabled) return
    const pks = [...new Set(items.flatMap((p) => p.claims.map((c) => c.pubkey)))]
    if (pks.length) void requestScores(pks)
  }, [items, enabled, sources])

  const verifiedCount = useMemo(() => {
    void scores; void threshold
    const out = new Map<string, number>()
    for (const p of items) {
      const set = new Set<string>()
      for (const c of p.claims) if (bucketOf(c.pubkey) === 'above' || bucketOf(c.pubkey) === 'off') set.add(c.pubkey)
      out.set(p.key, set.size)
    }
    return out
  }, [items, scores, threshold, bucketOf])

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase()
    const filtered = !s ? items : items.filter((p) => {
      const r = p.latest
      return r.title.toLowerCase().includes(s) || (r.summary ?? '').toLowerCase().includes(s) ||
        r.topics.some((t) => t.includes(s)) || r.kinds.some((k) => String(k.kind) === s || (k.name ?? '').toLowerCase().includes(s))
    })
    return [...filtered].sort((a, b) => {
      if (sort === 'newest') return b.latest.createdAt - a.latest.createdAt
      const va = verifiedCount.get(a.key) ?? 0
      const vb = verifiedCount.get(b.key) ?? 0
      if (vb !== va) return vb - va
      if (b.implementers !== a.implementers) return b.implementers - a.implementers
      return b.latest.createdAt - a.latest.createdAt
    })
  }, [items, q, sort, verifiedCount])

  const withAuthor = useMemo(() => visible.map((p) => ({ ...p, pubkey: p.latest.pubkey })), [visible])
  const { main, counts, lensActive, filter, setFilter } = useLensFilter(withAuthor)
  const { page, setPage, totalPages, paged } = usePaged(main, PER_PAGE, { loadMore, reachedEnd, loading: loading || loadingMore, resetKey: `${q}|${sort}|${filter}` })

  return (
    <div className="space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Proposals</h1>
        <p className="text-sm text-neutral-400">Released specs, ranked by who implements them. Nothing here is official; the counts are the evidence.</p>
      </div>

      <LensBar />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, topic, or kind…" className="border-edge bg-panel pl-9" />
        </div>
        <div className="flex rounded-lg border border-edge bg-panel p-0.5 text-xs">
          {(['adoption', 'newest'] as Sort[]).map((s) => (
            <button key={s} type="button" onClick={() => setSort(s)} className={cn('rounded-md px-2.5 py-1.5 capitalize transition-colors', sort === s ? 'bg-panel-3 text-purple-300' : 'text-neutral-400 hover:text-neutral-200')}>{s}</button>
          ))}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setTick((t) => t + 1)} disabled={loading} aria-label="Refresh" className="text-neutral-400">
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading releases and claims…</div>
      ) : (
        <>
          {visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-neutral-500">{q ? 'No proposals match.' : 'No releases on your relays yet. Drafts become proposals once their author publishes a release.'}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-neutral-500">{main.length}{reachedEnd ? '' : '+'} proposals · page {page} of {totalPages}{reachedEnd ? '' : '+'}</span>
                {lensActive && <ScoreFilterMenu value={filter} onChange={setFilter} counts={counts} />}
              </div>
              {paged.length === 0 ? <EmptyFiltered filter={filter} /> : paged.map((p) => <ProposalCard key={p.key} p={p} verified={enabled ? verifiedCount.get(p.key) : undefined} />)}
              <Pagination page={page} totalPages={totalPages} onPage={setPage} reachedEnd={reachedEnd} loadingMore={loadingMore} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
