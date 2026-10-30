import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Plus, RefreshCw, Search } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { fetchDrafts, type Draft } from '@/lib/nostr/nipps'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { usePaged } from '@/hooks/usePaged'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LensBar } from '@/components/lens/LensBar'
import { ScoreFilterMenu, EmptyFiltered } from '@/components/lens/TieredList'
import { useLensFilter } from '@/components/lens/useLensFilter'
import { Pagination } from '@/components/shared/Pagination'
import { DraftCard } from '@/components/ps/Cards'

const PER_PAGE = 10
const BATCH = 60

/** Progressive draft feed: newest first, older batches via an `until` cursor. */
function useDraftFeed(tick: number) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const byCoord = useRef(new Map<string, Draft>())
  const oldest = useRef<number | undefined>(undefined)
  const inFlight = useRef(false)

  const ingest = useCallback((batch: Draft[]): number => {
    let fresh = 0
    for (const d of batch) {
      const cur = byCoord.current.get(d.coord)
      if (!cur) fresh++
      if (!cur || d.createdAt > cur.createdAt) byCoord.current.set(d.coord, d)
      if (oldest.current === undefined || d.createdAt < oldest.current) oldest.current = d.createdAt
    }
    setDrafts([...byCoord.current.values()].sort((a, b) => b.createdAt - a.createdAt))
    return fresh
  }, [])

  useEffect(() => {
    let cancelled = false
    byCoord.current = new Map(); oldest.current = undefined; inFlight.current = false
    setDrafts([]); setReachedEnd(false); setLoading(true)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    fetchDrafts(relays, { limit: BATCH })
      .then((d) => { if (!cancelled) { const n = ingest(d); if (n === 0) setReachedEnd(true) } })
      .catch(() => { if (!cancelled) setReachedEnd(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tick, ingest])

  const loadMore = useCallback(async () => {
    if (inFlight.current || reachedEnd || oldest.current === undefined) return
    inFlight.current = true
    setLoadingMore(true)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    try {
      const d = await fetchDrafts(relays, { until: oldest.current - 1, limit: BATCH })
      if (ingest(d) === 0) setReachedEnd(true)
    } catch {
      setReachedEnd(true)
    } finally {
      inFlight.current = false
      setLoadingMore(false)
    }
  }, [reachedEnd, ingest])

  return { drafts, loading, loadingMore, reachedEnd, loadMore }
}

export function DraftsPage() {
  useSeoMeta({ title: 'Drafts', description: 'Proposals in progress: read, discuss, implement experimentally.' })
  const [q, setQ] = useState('')
  const [tick, setTick] = useState(0)
  const { drafts, loading, loadingMore, reachedEnd, loadMore } = useDraftFeed(tick)

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return drafts
    return drafts.filter((d) =>
      d.title.toLowerCase().includes(s) ||
      (d.summary ?? '').toLowerCase().includes(s) ||
      d.topics.some((t) => t.includes(s)) ||
      d.kinds.some((k) => String(k.kind) === s || (k.name ?? '').toLowerCase().includes(s)),
    )
  }, [drafts, q])

  const { main, counts, lensActive, filter, setFilter } = useLensFilter(visible)
  const { page, setPage, totalPages, paged } = usePaged(main, PER_PAGE, { loadMore, reachedEnd, loading: loading || loadingMore, resetKey: `${q}|${filter}` })

  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Drafts</h1>
          <p className="text-sm text-neutral-400">Editable proposals, open for discussion. Nothing here is frozen yet.</p>
        </div>
        <Button asChild className="gap-1.5 bg-purple-600 text-white hover:bg-purple-700">
          <Link to="/submit-draft"><Plus className="h-4 w-4" /> New draft</Link>
        </Button>
      </div>

      <LensBar />

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drafts by title, topic, or kind…" className="border-edge bg-panel pl-9" />
        </div>
        <Button variant="ghost" size="icon" onClick={() => setTick((t) => t + 1)} disabled={loading} aria-label="Refresh" className="text-neutral-400">
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading drafts…</div>
      ) : (
        <>
          {visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-neutral-500">{q ? 'No drafts match.' : 'No drafts on your relays yet. Start one.'}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-neutral-500">{main.length}{reachedEnd ? '' : '+'} drafts · page {page} of {totalPages}{reachedEnd ? '' : '+'}</span>
                {lensActive && <ScoreFilterMenu value={filter} onChange={setFilter} counts={counts} />}
              </div>
              {paged.length === 0 ? <EmptyFiltered filter={filter} /> : paged.map((d) => <DraftCard key={d.coord} draft={d} />)}
              <Pagination page={page} totalPages={totalPages} onPage={setPage} reachedEnd={reachedEnd} loadingMore={loadingMore} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
