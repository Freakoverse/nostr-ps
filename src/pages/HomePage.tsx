import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, FileText, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { useDraftFeed } from '@/hooks/useDraftFeed'
import { useProposalFeed } from '@/hooks/useProposalFeed'
import { useLensStore, requestScores } from '@/stores/lensStore'
import { useLensFilter } from '@/components/lens/useLensFilter'
import { LensBar } from '@/components/lens/LensBar'
import { ScoreFilterMenu, EmptyFiltered } from '@/components/lens/TieredList'
import { DraftCard, ProposalCard } from '@/components/ps/Cards'

/** How many of each to show on the landing page before "View all". */
const PREVIEW = 8

/**
 * Landing page: proposals and drafts together, each the first page of its
 * feed with the lens applied. The full pages keep pagination and search.
 */
export function HomePage() {
  useSeoMeta({ description: 'Permissionless standards for Nostr: anyone can propose, adoption is the signal, trust is a lens you choose.' })
  const [tick] = useState(0)

  const proposals = useProposalFeed(tick, 60)
  const drafts = useDraftFeed(tick, 40)

  const enabled = useLensStore((s) => s.enabled)
  const threshold = useLensStore((s) => s.threshold)
  const scores = useLensStore((s) => s.scores)
  const bucketOf = useLensStore((s) => s.bucketOf)
  const sources = useLensStore((s) => s.sources)

  // Rank proposals by verified implementers, as the full page does.
  useEffect(() => {
    if (!enabled) return
    const pks = [...new Set(proposals.items.flatMap((p) => p.claims.map((c) => c.pubkey)))]
    if (pks.length) void requestScores(pks)
  }, [proposals.items, enabled, sources])

  const verifiedCount = useMemo(() => {
    void scores; void threshold
    const out = new Map<string, number>()
    for (const p of proposals.items) {
      const set = new Set<string>()
      for (const c of p.claims) if (bucketOf(c.pubkey) === 'above' || bucketOf(c.pubkey) === 'off') set.add(c.pubkey)
      out.set(p.key, set.size)
    }
    return out
  }, [proposals.items, scores, threshold, bucketOf])

  const rankedProposals = useMemo(() => {
    const withAuthor = proposals.items.map((p) => ({ ...p, pubkey: p.latest.pubkey }))
    return withAuthor.sort((a, b) => {
      const va = verifiedCount.get(a.key) ?? 0
      const vb = verifiedCount.get(b.key) ?? 0
      if (vb !== va) return vb - va
      if (b.implementers !== a.implementers) return b.implementers - a.implementers
      return b.latest.createdAt - a.latest.createdAt
    })
  }, [proposals.items, verifiedCount])

  const pf = useLensFilter(rankedProposals)
  const df = useLensFilter(drafts.drafts)

  return (
    <div className="space-y-8 py-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">Permissionless Standards</h1>
        <p className="max-w-3xl text-neutral-400 leading-relaxed">
          Anyone may propose a standard. Nothing is official and there are no gatekeepers,
          neither a single maintainer nor a roundtable. What matters is adoption: who
          implements it, read through the trust graph of whoever is looking.{' '}
          <Link to="/about" className="text-purple-400 hover:underline">How this works</Link>
        </p>
      </div>

      <LensBar />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Proposals */}
        <section className="min-w-0 space-y-3">
          <SectionHeader
            icon={BookOpen}
            title="Proposals"
            blurb="Released specs, ranked by who implements them."
            count={pf.main.length}
            more={!proposals.reachedEnd}
            viewAll="/proposals"
            right={pf.lensActive ? <ScoreFilterMenu value={pf.filter} onChange={pf.setFilter} counts={pf.counts} /> : null}
          />
          {proposals.loading ? (
            <Loading text="Loading releases and claims…" />
          ) : proposals.items.length === 0 ? (
            <Empty text="No releases on your relays yet. Drafts become proposals once their author publishes a release." />
          ) : pf.main.length === 0 ? (
            <EmptyFiltered filter={pf.filter} />
          ) : (
            <div className="space-y-3">
              {pf.main.slice(0, PREVIEW).map((p) => <ProposalCard key={p.key} p={p} verified={enabled ? verifiedCount.get(p.key) : undefined} />)}
              {pf.main.length > PREVIEW && <ViewAll to="/proposals" label={`View all ${pf.main.length}${proposals.reachedEnd ? '' : '+'} proposals`} />}
            </div>
          )}
        </section>

        {/* Drafts */}
        <section className="min-w-0 space-y-3">
          <SectionHeader
            icon={FileText}
            title="Drafts"
            blurb="Work in progress, open for discussion."
            count={df.main.length}
            more={!drafts.reachedEnd}
            viewAll="/drafts"
            right={
              <div className="flex items-center gap-2">
                {df.lensActive && <ScoreFilterMenu value={df.filter} onChange={df.setFilter} counts={df.counts} />}
                <Button asChild size="sm" className="gap-1 bg-purple-600 text-white hover:bg-purple-700">
                  <Link to="/submit-draft"><Plus className="h-3.5 w-3.5" /> New</Link>
                </Button>
              </div>
            }
          />
          {drafts.loading ? (
            <Loading text="Loading drafts…" />
          ) : drafts.drafts.length === 0 ? (
            <Empty text="No drafts on your relays yet. Start one." />
          ) : df.main.length === 0 ? (
            <EmptyFiltered filter={df.filter} />
          ) : (
            <div className="space-y-3">
              {df.main.slice(0, PREVIEW).map((d) => <DraftCard key={d.coord} draft={d} released={drafts.released.has(d.coord) || !!d.releaseId} />)}
              {df.main.length > PREVIEW && <ViewAll to="/drafts" label={`View all ${df.main.length}${drafts.reachedEnd ? '' : '+'} drafts`} />}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, blurb, count, more, viewAll, right }: {
  icon: typeof BookOpen
  title: string
  blurb: string
  count: number
  more: boolean
  viewAll: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <Link to={viewAll} className="flex items-center gap-2 text-lg font-semibold text-neutral-100 hover:text-purple-300">
          <Icon className="h-4 w-4 text-purple-400" /> {title}
          <span className="text-sm font-normal tabular-nums text-neutral-500">{count}{more ? '+' : ''}</span>
        </Link>
        <p className="text-xs text-neutral-500">{blurb}</p>
      </div>
      {right}
    </div>
  )
}

function ViewAll({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-edge py-2.5 text-sm text-neutral-400 transition-colors hover:border-purple-500/40 hover:text-purple-300">
      {label} <ArrowRight className="h-4 w-4" />
    </Link>
  )
}

function Loading({ text }: { text: string }) {
  return <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /> {text}</div>
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-edge py-12 text-center text-sm text-neutral-500">{text}</p>
}
