import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useLensStore, requestScores } from '@/stores/lensStore'
import { fetchReleases, fetchClaimsForMany, summarizeProposals, type ProposalSummary } from '@/lib/nostr/nipps'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LensBar } from '@/components/lens/LensBar'
import { ProposalCard } from '@/components/ps/Cards'
import { cn } from '@/lib/utils'

type Sort = 'adoption' | 'newest'

/**
 * Released specs, one row per proposal (author + uuid), ranked by adoption.
 * Adoption = distinct implementers with a live claim against any version;
 * "verified" = those whose author clears the lens threshold.
 */
export function ProposalsPage() {
  useSeoMeta({ title: 'Proposals', description: 'Released specs ranked by who implements them.' })
  const [items, setItems] = useState<ProposalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('adoption')
  const [tick, setTick] = useState(0)

  const enabled = useLensStore((s) => s.enabled)
  const threshold = useLensStore((s) => s.threshold)
  const scores = useLensStore((s) => s.scores)
  const bucketOf = useLensStore((s) => s.bucketOf)
  const sources = useLensStore((s) => s.sources)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    ;(async () => {
      try {
        const releases = await fetchReleases(relays, { limit: 300 })
        const uuids = [...new Set(releases.map((r) => r.uuid))]
        const claims = await fetchClaimsForMany(relays, uuids)
        if (!cancelled) setItems(summarizeProposals(releases, claims))
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [tick])

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
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, topic, or kind…" className="border-[#262626] bg-[#1c1c1c] pl-9" />
        </div>
        <div className="flex rounded-lg border border-[#262626] bg-[#1c1c1c] p-0.5 text-xs">
          {(['adoption', 'newest'] as Sort[]).map((s) => (
            <button key={s} type="button" onClick={() => setSort(s)} className={cn('rounded-md px-2.5 py-1.5 capitalize transition-colors', sort === s ? 'bg-[#2a2a2a] text-purple-300' : 'text-neutral-400 hover:text-neutral-200')}>{s}</button>
          ))}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setTick((t) => t + 1)} disabled={loading} aria-label="Refresh" className="text-neutral-400">
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading releases and claims…</div>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500">{q ? 'No proposals match.' : 'No releases on your relays yet. Drafts become proposals once their author publishes a release.'}</p>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => <ProposalCard key={p.key} p={p} verified={enabled ? verifiedCount.get(p.key) : undefined} />)}
        </div>
      )}
    </div>
  )
}
