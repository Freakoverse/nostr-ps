import { shortNpub } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { Loader2 } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { rawPowFloor } from '@/lib/nostr/rawPow'
import {
  fetchDrafts, fetchReleases, fetchClaimsBy, fetchReviewsBy, fetchLatestUpdates, fetchClaimsForMany, summarizeProposals, releaseNevent, shortId, PS_ORIGIN_TAG,
  getCachedDrafts, getCachedReleases, getCachedClaimsBy, getCachedClaimsByUuid, getCachedReviewsBy, whenEventCacheReady,
  type Draft, type Release, type Claim, type Review, type ProposalSummary,
} from '@/lib/nostr/nipps'
import { KINDS } from '@/lib/constants'
import { DraftCard, ProposalCard, ClaimCard, ReviewCard } from './Cards'
import { VerdictRow } from './ClaimDetailDialog'

function Loading() {
  return <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
}
function Empty({ text }: { text: string }) {
  return <p className="py-12 text-center text-sm text-neutral-500">{text}</p>
}
function Refreshing() {
  return <p className="flex items-center justify-end gap-1 text-[11px] text-neutral-500 animate-pulse"><Loader2 className="h-3 w-3 animate-spin" /> refreshing</p>
}

/**
 * Cache first, then relays: `seed` is a synchronous read of the event cache
 * that paints immediately; `load` replaces it when the relays answer.
 * `loading` is true only on a cold cache; `refreshing` while the relay
 * fetch runs behind seeded data.
 */
function useLoad<T>(seed: () => T | null, load: (relays: string[]) => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; refreshing: boolean } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setRefreshing(false); setData(null)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    ;(async () => {
      await whenEventCacheReady
      if (cancelled) return
      const s = seed()
      if (s !== null) { setData(s); setLoading(false); setRefreshing(true) }
      try {
        const d = await load(relays)
        if (!cancelled) setData(d)
      } catch {
        if (!cancelled && s === null) setData(null)
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false) }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, loading, refreshing }
}

const nonEmpty = <T,>(xs: T[]): T[] | null => (xs.length ? xs : null)

export function DraftsTab({ pubkey }: { pubkey: string }) {
  // Drafts plus the author's original releases, so the "released" chip is the
  // result of a query, never a label on the draft (spec §6.1).
  type Data = { drafts: Draft[]; releasedUuids: Set<string> }
  const { data, loading, refreshing } = useLoad<Data>(
    () => {
      const drafts = getCachedDrafts().filter((d) => d.pubkey === pubkey)
      if (!drafts.length) return null
      return { drafts, releasedUuids: new Set(getCachedReleases().filter((r) => r.pubkey === pubkey).map((r) => r.uuid)) }
    },
    async (relays) => {
      const [drafts, releases] = await Promise.all([
        fetchDrafts(relays, { authors: [pubkey], limit: 200 }),
        fetchReleases(relays, { authors: [pubkey], [`#${PS_ORIGIN_TAG}`]: ['original'], limit: 500 }).catch(() => [] as Release[]),
      ])
      return { drafts, releasedUuids: new Set(releases.map((r) => r.uuid)) }
    },
    [pubkey],
  )
  if (loading) return <Loading />
  if (!data?.drafts.length) return <Empty text="No drafts." />
  return (
    <div className="space-y-3">
      {refreshing && <Refreshing />}
      {data.drafts.map((d) => <DraftCard key={d.coord} draft={d} released={data.releasedUuids.has(d.uuid)} />)}
    </div>
  )
}

/**
 * The author's proposals as cards, the same rollup the proposals list uses:
 * one `#o original` query (bounded, one event per proposal), the latest
 * update per proposal, claims per uuid, summarised. Shows summary, version,
 * implementer count and version count, not the version list.
 */
export function ReleasesTab({ pubkey }: { pubkey: string }) {
  const { data, loading, refreshing } = useLoad<ProposalSummary[]>(
    () => {
      const mine = getCachedReleases().filter((r) => r.pubkey === pubkey)
      if (!mine.length) return null
      return summarizeProposals(mine, getCachedClaimsByUuid(), rawPowFloor()).sort((a, b) => b.latest.createdAt - a.latest.createdAt)
    },
    async (relays) => {
      const originals = await fetchReleases(relays, { authors: [pubkey], [`#${PS_ORIGIN_TAG}`]: ['original'], limit: 500 })
      const [updates, claims] = await Promise.all([
        fetchLatestUpdates(relays, originals).catch(() => [] as Release[]),
        fetchClaimsForMany(relays, [...new Map(originals.map((r) => [r.uuid, { pubkey, uuid: r.uuid }])).values()]).catch(() => new Map<string, Claim[]>()),
      ])
      return summarizeProposals([...originals, ...updates], claims, rawPowFloor()).sort((a, b) => b.latest.createdAt - a.latest.createdAt)
    },
    [pubkey],
  )
  if (loading) return <Loading />
  if (!data?.length) return <Empty text="No releases." />
  return (
    <div className="space-y-3">
      {refreshing && <Refreshing />}
      {data.map((p) => <ProposalCard key={p.key} p={p} />)}
    </div>
  )
}

export function AdoptedTab({ pubkey }: { pubkey: string }) {
  const { data, loading, refreshing } = useLoad<Claim[]>(
    () => nonEmpty(getCachedClaimsBy(pubkey)),
    (relays) => fetchClaimsBy(relays, pubkey),
    [pubkey],
  )
  if (loading) return <Loading />
  if (!data?.length) return <Empty text="No adoption claims." />
  return (
    <div className="space-y-3">
      {refreshing && <Refreshing />}
      {data.map((c) => (
        <div key={c.coord} className="space-y-1">
          <Link to={`/release/${releaseNevent(c.releaseId, c.releaseAuthor)}`} className="px-1 text-xs text-neutral-500 hover:text-purple-300">
            → release {shortId(c.releaseId)} · v{c.version}
          </Link>
          <ClaimCard claim={c} />
        </div>
      ))}
    </div>
  )
}

/** Reviews of releases only (recommend / not recommend / unsure). Verdicts on claims have their own tab. */
export function ReviewsTab({ pubkey }: { pubkey: string }) {
  const { data, loading, refreshing } = useLoad<Review[]>(
    () => nonEmpty(getCachedReviewsBy(pubkey).filter((r) => r.target === 'release')),
    async (relays) => (await fetchReviewsBy(relays, pubkey)).filter((r) => r.target === 'release'),
    [pubkey],
  )
  if (loading) return <Loading />
  if (!data?.length) return <Empty text="No release reviews." />
  return (
    <div className="space-y-3">
      {refreshing && <Refreshing />}
      {data.map((r) => r.target === 'release' && (
        <ReviewCard
          key={r.event.id}
          review={r}
          targetLabel={<Link to={`/release/${nip19.neventEncode({ id: r.releaseId, kind: KINDS.PS_RELEASE })}`} className="text-xs text-neutral-500 hover:text-purple-300">release {shortId(r.releaseId)}</Link>}
        />
      ))}
    </div>
  )
}

/** Verdicts on adoption claims only (accurate / inaccurate), in the flat row style of the claim dialog. */
export function VerdictsTab({ pubkey }: { pubkey: string }) {
  const { data, loading, refreshing } = useLoad<Review[]>(
    () => nonEmpty(getCachedReviewsBy(pubkey).filter((r) => r.target === 'claim')),
    async (relays) => (await fetchReviewsBy(relays, pubkey)).filter((r) => r.target === 'claim'),
    [pubkey],
  )
  if (loading) return <Loading />
  if (!data?.length) return <Empty text="No verdicts on adoption claims." />
  return (
    <div className="space-y-2">
      {refreshing && <Refreshing />}
      {data.map((r) => r.target === 'claim' && (
        <VerdictRow
          key={r.event.id}
          review={r}
          label={<Link to={`/profile/${claimAuthorNpub(r.claimCoord)}`} className="text-xs text-neutral-500 hover:text-purple-300">claim by {claimAuthorOf(r.claimCoord)}</Link>}
        />
      ))}
    </div>
  )
}

function claimAuthorNpub(coord: string): string {
  const pk = coord.split(':')[1] ?? ''
  try { return nip19.npubEncode(pk) } catch { return pk }
}

function claimAuthorOf(coord: string): string {
  const pk = coord.split(':')[1]
  try { return shortNpub(nip19.npubEncode(pk)) } catch { return pk?.slice(0, 8) ?? '?' }
}
