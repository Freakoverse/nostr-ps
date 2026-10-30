import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { toast } from 'sonner'
import {
  Loader2, GitFork, Archive, Users, MessageSquareText, ShieldCheck, FileText,
} from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModalStore } from '@/stores/loginModalStore'
import { useLensStore, requestScores } from '@/stores/lensStore'
import { KINDS } from '@/lib/constants'
import { signAndPublish } from '@/lib/nostr/publish'
import {
  fetchRelease, fetchReleasesOf, fetchClaimsFor, fetchReleaseReviews, fetchClaimReviews, fetchBackups,
  buildBackupEvent, draftNaddr, releaseNevent, releaseLabel,
  type Release, type Claim, type Review, type Backup,
} from '@/lib/nostr/nipps'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/shared/Markdown'
import { PostMenu } from '@/components/ps/PostMenu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { CommentSection } from '@/components/social/CommentSection'
import { AuthorLine } from '@/components/social/AuthorLine'
import { LensBar } from '@/components/lens/LensBar'
import { TieredList } from '@/components/lens/TieredList'
import { Chip, KindChips, TopicChips, ReleaseRow, ClaimCard, ReviewCard, VerdictChip } from '@/components/ps/Cards'
import { ClaimDialog } from '@/components/ps/ClaimDialog'
import { ReviewDialog } from '@/components/ps/ReviewDialog'
import type { ForkPrefill } from './DraftEditPage'

export function ReleasePage() {
  const { nevent } = useParams<{ nevent: string }>()
  const navigate = useNavigate()
  const myPubkey = useAuthStore((s) => s.pubkey)
  const [release, setRelease] = useState<Release | null>(null)
  const [versions, setVersions] = useState<Release[]>([])
  const [claims, setClaims] = useState<Claim[]>([])
  const [claimReviews, setClaimReviews] = useState<Map<string, Review[]>>(new Map())
  const [reviews, setReviews] = useState<Review[]>([])
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const [claimOpen, setClaimOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [claimReviewTarget, setClaimReviewTarget] = useState<Claim | null>(null)
  const [backingUp, setBackingUp] = useState(false)

  const enabled = useLensStore((s) => s.enabled)
  const scores = useLensStore((s) => s.scores)
  const threshold = useLensStore((s) => s.threshold)
  const bucketOf = useLensStore((s) => s.bucketOf)
  const sources = useLensStore((s) => s.sources)

  const id = useMemo(() => {
    try {
      const d = nip19.decode(nevent ?? '')
      if (d.type === 'nevent') return d.data.id
      if (d.type === 'note') return d.data
    } catch { /* fallthrough */ }
    return /^[0-9a-f]{64}$/i.test(nevent ?? '') ? nevent!.toLowerCase() : null
  }, [nevent])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!id) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    ;(async () => {
      const r = await fetchRelease(relays, id)
      if (cancelled) return
      setRelease(r)
      setLoading(false)
      if (!r) return
      const [vs, cs, rv, bk] = await Promise.all([
        fetchReleasesOf(relays, r.pubkey, r.uuid).catch(() => [r]),
        fetchClaimsFor(relays, r.uuid).catch(() => []),
        fetchReleaseReviews(relays, r.id).catch(() => []),
        fetchBackups(relays, r.id).catch(() => []),
      ])
      if (cancelled) return
      const lineageIds = new Set(vs.map((v) => v.id))
      const mine = cs.filter((c) => c.releaseAuthor === r.pubkey && lineageIds.has(c.releaseId))
      setVersions(vs.length ? vs : [r])
      setClaims(mine)
      setReviews(rv)
      setBackups(bk)
      const cr = await fetchClaimReviews(relays, mine.map((c) => c.coord)).catch(() => new Map<string, Review[]>())
      if (!cancelled) setClaimReviews(cr)
    })()
    return () => { cancelled = true }
  }, [id, tick])

  useEffect(() => {
    if (!enabled) return
    const pks = [...new Set([...claims.map((c) => c.pubkey), ...reviews.map((r) => r.pubkey)])]
    if (pks.length) void requestScores(pks)
  }, [claims, reviews, enabled, sources])

  useSeoMeta(release ? { title: `${release.title} v${release.version}`, description: release.summary ?? release.content.slice(0, 160), type: 'article' } : null)

  // Claim verification counts under the lens (§6.3, simplified: distinct
  // above-threshold reviewers; any above-threshold "fake" wins).
  const claimStats = useMemo(() => {
    void scores; void threshold
    const out = new Map<string, { legit: number; fake: number; anyFakeTrusted: boolean }>()
    for (const c of claims) {
      let legit = 0; let fake = 0; let anyFakeTrusted = false
      for (const r of claimReviews.get(c.coord) ?? []) {
        if (r.target !== 'claim') continue
        const trusted = !enabled || bucketOf(r.pubkey) === 'above' || bucketOf(r.pubkey) === 'off'
        if (r.verdict === 'legit') legit++
        else { fake++; if (trusted) anyFakeTrusted = true }
      }
      out.set(c.coord, { legit, fake, anyFakeTrusted })
    }
    return out
  }, [claims, claimReviews, enabled, bucketOf, scores, threshold])

  const liveClaims = useMemo(() => claims.filter((c) => !c.withdrawn), [claims])
  const thisVersionClaims = useMemo(() => liveClaims.filter((c) => c.releaseId === release?.id), [liveClaims, release])
  const verifiedImplementers = useMemo(() => {
    void scores; void threshold
    const set = new Set<string>()
    for (const c of liveClaims) {
      const st = claimStats.get(c.coord)
      if (st?.anyFakeTrusted) continue
      if (!enabled || bucketOf(c.pubkey) === 'above' || bucketOf(c.pubkey) === 'off') set.add(c.pubkey)
    }
    return set.size
  }, [liveClaims, claimStats, enabled, bucketOf, scores, threshold])

  const reviewTally = useMemo(() => {
    const t = { recommend: 0, unsure: 0, 'not-recommend': 0 }
    for (const r of reviews) if (r.target === 'release') t[r.verdict]++
    return t
  }, [reviews])

  const myClaim = useMemo(() => claims.find((c) => c.pubkey === myPubkey) ?? null, [claims, myPubkey])
  const myReview = useMemo(() => reviews.find((r) => r.pubkey === myPubkey) ?? null, [reviews, myPubkey])
  const myClaimReview = useMemo(() => {
    if (!claimReviewTarget || !myPubkey) return null
    return (claimReviews.get(claimReviewTarget.coord) ?? []).find((r) => r.pubkey === myPubkey) ?? null
  }, [claimReviewTarget, claimReviews, myPubkey])

  if (!id) return <Missing text="That is not a release address." />
  if (loading) return <div className="flex items-center justify-center gap-2 py-24 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading release…</div>
  if (!release) return <Missing text="Release not found on your relays, and no verified backup either." />

  const isLatest = versions[0]?.id === release.id
  const draftHref = release.draftCoord ? draftHrefOf(release.draftCoord) : null
  const myBackup = backups.some((b) => b.pubkey === myPubkey)

  const backup = async () => {
    if (!myPubkey) { useLoginModalStore.getState().open(); return }
    setBackingUp(true)
    const relay = useSettingsStore.getState().getAllEnabledRelayUrls('write')[0]
    const res = await signAndPublish(buildBackupEvent(release.event, relay))
    setBackingUp(false)
    if (!res.success) { toast.error(res.error || 'Backup failed'); return }
    toast.success('Backup published. This copy survives the author’s deletion requests.')
    reload()
  }

  const fork = () => {
    if (!myPubkey) { useLoginModalStore.getState().open(); return }
    const prefill: ForkPrefill = {
      title: `${release.title} (fork)`,
      summary: release.summary,
      content: release.content,
      kinds: release.kinds,
      topics: release.topics,
      forkOfId: release.id,
    }
    navigate('/submit-draft', { state: { fork: prefill } })
  }

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
          <Chip className="border-emerald-500/30 text-emerald-400">release</Chip>
          <Chip className="font-mono">v{release.version}</Chip>
          {!isLatest && <Chip className="border-yellow-500/30 text-yellow-400">not the latest version</Chip>}
          {release.forkOf && (
            <Link to={`/release/${nip19.neventEncode({ id: release.forkOf.id })}`} className="inline-flex">
              <Chip className="hover:border-purple-500/40"><GitFork className="h-3 w-3" /> forked from {release.forkOf.id.slice(0, 8)}</Chip>
            </Link>
          )}
          </div>
          <PostMenu event={release.event} link={`${window.location.origin}/release/${releaseNevent(release.id, release.pubkey)}`}>
            {draftHref && (
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to={draftHref}><FileText className="h-4 w-4 mr-2" /> Open draft</Link>
              </DropdownMenuItem>
            )}
          </PostMenu>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{release.title}</h1>
        {release.summary && <p className="text-neutral-400">{release.summary}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <AuthorLine pubkey={release.pubkey} at={release.createdAt} />
          <KindChips kinds={release.kinds} max={20} expandable />
          <TopicChips topics={release.topics} max={20} expandable />
        </div>
        <p className="font-mono text-[11px] text-neutral-600">{releaseLabel(release)}</p>
      </div>

      <LensBar />

      {/* Stats + actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Implementers" value={new Set(liveClaims.map((c) => c.pubkey)).size} sub={enabled ? `${verifiedImplementers} above threshold` : `${thisVersionClaims.length} on this version`} />
        <Stat icon={MessageSquareText} label="Reviews" value={reviews.length} sub={`${reviewTally.recommend} recommend · ${reviewTally['not-recommend']} against · ${reviewTally.unsure} unsure`} />
        <Stat icon={Archive} label="Backups" value={backups.length} sub={backups.filter((b) => b.release).length === backups.length ? 'all verified' : `${backups.filter((b) => b.release).length} verified`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => (myPubkey ? setClaimOpen(true) : useLoginModalStore.getState().open())} className="gap-1.5 bg-purple-600 text-white hover:bg-purple-700">
          <ShieldCheck className="h-3.5 w-3.5" /> {myClaim && !myClaim.withdrawn ? 'Update my claim' : 'Claim adoption'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => (myPubkey ? setReviewOpen(true) : useLoginModalStore.getState().open())} className="gap-1.5 border-edge">
          <MessageSquareText className="h-3.5 w-3.5" /> {myReview ? 'Edit my review' : 'Review'}
        </Button>
        <Button size="sm" variant="outline" onClick={backup} disabled={backingUp || myBackup} className="gap-1.5 border-edge">
          {backingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />} {myBackup ? 'Backed up' : 'Back up'}
        </Button>
        <Button size="sm" variant="outline" onClick={fork} className="gap-1.5 border-edge"><GitFork className="h-3.5 w-3.5" /> Fork</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Body */}
        <article className="min-w-0 rounded-lg border border-edge bg-panel p-6">
          <Markdown content={release.content} className="text-[15px]" />
        </article>

        {/* Versions */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-lg border border-edge bg-panel p-2">
            <p className="px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wider text-neutral-500">Versions</p>
            {versions.map((v) => <ReleaseRow key={v.id} r={v} current={v.id === release.id} />)}
          </div>
          {Object.keys(perVersion(liveClaims)).length > 0 && (
            <div className="rounded-lg border border-edge bg-panel p-3 text-xs">
              <p className="pb-2 font-medium uppercase tracking-wider text-neutral-500">Claims per version</p>
              {Object.entries(perVersion(liveClaims)).map(([v, n]) => (
                <p key={v} className="flex justify-between py-0.5 text-neutral-400"><span className="font-mono">v{v}</span><span className="tabular-nums text-neutral-200">{n}</span></p>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Claims */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Adoption claims</h2>
          <span className="text-xs text-neutral-500">{liveClaims.length} live · {claims.length - liveClaims.length} withdrawn</span>
        </div>
        <TieredList
          items={claims}
          keyOf={(c) => c.coord}
          render={(c) => {
            const st = claimStats.get(c.coord)
            return <ClaimCard claim={c} legit={st?.legit} fake={st?.fake} mine={!!myPubkey && (claimReviews.get(c.coord) ?? []).some((r) => r.pubkey === myPubkey)} onReview={() => (myPubkey ? setClaimReviewTarget(c) : useLoginModalStore.getState().open())} />
          }}
          empty={<p className="rounded-lg border border-dashed border-edge py-10 text-center text-sm text-neutral-500">No one has claimed adoption yet. Implemented it? Say so.</p>}
        />
      </section>

      {/* Reviews */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Reviews</h2>
          <div className="flex items-center gap-1.5">
            {reviewTally.recommend > 0 && <VerdictChip verdict="recommend" />}{reviewTally.recommend > 0 && <span className="text-xs tabular-nums text-neutral-400">{reviewTally.recommend}</span>}
            {reviewTally['not-recommend'] > 0 && <VerdictChip verdict="not-recommend" />}{reviewTally['not-recommend'] > 0 && <span className="text-xs tabular-nums text-neutral-400">{reviewTally['not-recommend']}</span>}
            {reviewTally.unsure > 0 && <VerdictChip verdict="unsure" />}{reviewTally.unsure > 0 && <span className="text-xs tabular-nums text-neutral-400">{reviewTally.unsure}</span>}
          </div>
        </div>
        <TieredList
          items={reviews}
          keyOf={(r) => r.event.id}
          render={(r) => <ReviewCard review={r} />}
          empty={<p className="rounded-lg border border-dashed border-edge py-10 text-center text-sm text-neutral-500">No reviews yet.</p>}
        />
      </section>

      {/* Discussion */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Discussion</h2>
        <p className="text-xs text-neutral-500">The release is frozen. Discussion that should change the text belongs on the draft, where the next version is written.</p>
        <CommentSection root={{ id: release.id, pubkey: release.pubkey, kind: KINDS.PS_RELEASE }} />
      </section>

      <ClaimDialog open={claimOpen} onOpenChange={setClaimOpen} release={release} existing={myClaim} onPublished={reload} />
      <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} target={{ kind: 'release', release }} existing={myReview} onPublished={reload} />
      {claimReviewTarget && (
        <ReviewDialog open onOpenChange={(v) => { if (!v) setClaimReviewTarget(null) }} target={{ kind: 'claim', claim: claimReviewTarget }} existing={myClaimReview} onPublished={reload} />
      )}
    </div>
  )
}

function perVersion(claims: Claim[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of claims) out[c.version] = (out[c.version] ?? 0) + 1
  return out
}

function draftHrefOf(coord: string): string | null {
  const [k, pk, ...rest] = coord.split(':')
  if (Number(k) !== KINDS.PS_DRAFT || !pk) return null
  try { return `/draft/${draftNaddr(pk, rest.join(':'))}` } catch { return null }
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border border-edge bg-panel px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-neutral-500"><Icon className="h-3.5 w-3.5 text-purple-400" /> {label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-100">{value}</p>
      {sub && <p className="text-[11px] text-neutral-500">{sub}</p>}
    </div>
  )
}

function Missing({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-neutral-300">{text}</p>
      <Button asChild variant="outline" className="border-edge"><Link to="/proposals">Back to proposals</Link></Button>
    </div>
  )
}
