import { useCallback, useEffect, useMemo, useState } from 'react'
import { BackButton } from '@/components/shared/BackButton'
import { Link, useParams } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import {
  Loader2, GitFork, Archive, Users, MessageSquareText, ShieldCheck, FileText, Rocket,
} from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModalStore } from '@/stores/loginModalStore'
import { useLensStore, requestScores } from '@/stores/lensStore'
import { KINDS } from '@/lib/constants'
import {
  fetchRelease, fetchReleasesOf, fetchClaimsFor, fetchReleaseReviews, fetchClaimReviews, fetchBackups,
  getCachedRelease, getCachedVersions, getCachedClaimsFor, getCachedReleaseReviews, whenEventCacheReady, shortId,
  draftNaddr, releaseNevent, releaseLabel,
  type Release, type Claim, type Review, type Backup,
} from '@/lib/nostr/nipps'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/shared/Markdown'
import { PostMenu } from '@/components/ps/PostMenu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { CommentSection } from '@/components/social/CommentSection'
import { LensBar } from '@/components/lens/LensBar'
import { TieredList } from '@/components/lens/TieredList'
import { Chip, ClaimCard, ReviewCard, VerdictChip } from '@/components/ps/Cards'
import { ClaimDialog } from '@/components/ps/ClaimDialog'
import { ReviewDialog } from '@/components/ps/ReviewDialog'
import { VersionList } from '@/components/ps/VersionDiff'
import { ClaimDetailDialog } from '@/components/ps/ClaimDetailDialog'
import { ItemMenu } from '@/components/ps/ItemMenu'
import { AuthorCard, MetaCard, ReferenceCard } from '@/components/ps/SideCards'
import { PostFacts } from '@/components/ps/PostFacts'
import { BackupDialog } from '@/components/ps/BackupDialog'
import { ForkDialog } from '@/components/ps/ForkDialog'
import { CollapsibleBody } from '@/components/shared/CollapsibleBody'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

const tabTrigger = 'py-1.5 data-[state=active]:bg-edge data-[state=active]:text-purple-400'

export function ReleasePage() {
  const { nevent } = useParams<{ nevent: string }>()
  const myPubkey = useAuthStore((s) => s.pubkey)
  const [release, setRelease] = useState<Release | null>(null)
  const [versions, setVersions] = useState<Release[]>([])
  const [claims, setClaims] = useState<Claim[]>([])
  const [claimReviews, setClaimReviews] = useState<Map<string, Review[]>>(new Map())
  const [reviews, setReviews] = useState<Review[]>([])
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  // Versions, claims and reviews paint from cache first; this flips once the
  // relays have answered, so "latest version" is only asserted on evidence.
  const [checked, setChecked] = useState(false)
  const [tick, setTick] = useState(0)

  const [claimOpen, setClaimOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [claimReviewTarget, setClaimReviewTarget] = useState<Claim | null>(null)
  const [claimDetail, setClaimDetail] = useState<Claim | null>(null)
  const [backupOpen, setBackupOpen] = useState(false)
  const [forkOpen, setForkOpen] = useState(false)

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
    setChecked(false)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    ;(async () => {
      // A release is immutable, so a cached copy is the release: paint it and
      // skip the fetch. Only the data around it (versions, claims, reviews,
      // backups) is loaded from relays.
      await whenEventCacheReady
      if (cancelled) return
      const r = getCachedRelease(id) ?? await fetchRelease(relays, id)
      if (cancelled) return
      setRelease(r)
      setLoading(false)
      if (!r) return
      // Instant paint of what the cache already knows around this release.
      {
        const cvs = getCachedVersions(r.pubkey, r.uuid)
        const lineage = new Set((cvs.length ? cvs : [r]).map((v) => v.id))
        setVersions(cvs.length ? cvs : [r])
        setClaims(getCachedClaimsFor(r.uuid).filter((c) => c.releaseAuthor === r.pubkey && lineage.has(c.releaseId)))
        setReviews(getCachedReleaseReviews(r.id))
      }
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
      setChecked(true)
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
  const myBackup = backups.find((b) => b.pubkey === myPubkey) ?? null

  // The backup itself is published from BackupDialog, after an explanation.
  const backup = () => {
    if (!myPubkey) { useLoginModalStore.getState().open(); return }
    setBackupOpen(true)
  }

  // The fork itself starts from ForkDialog, after an explanation.
  const fork = () => {
    if (!myPubkey) { useLoginModalStore.getState().open(); return }
    setForkOpen(true)
  }

  return (
    <div className="space-y-6 py-6">
      <BackButton fallback="/proposals" />
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
          <Chip className="border-emerald-500/30 text-emerald-400">release</Chip>
          <Chip className="font-mono">v{release.version}</Chip>
          {!checked ? (
            <Chip className="animate-pulse text-neutral-400"><Loader2 className="h-3 w-3 animate-spin" /> checking versions…</Chip>
          ) : !isLatest ? (
            <Chip className="border-yellow-500/30 text-yellow-400">not the latest version</Chip>
          ) : null}
          {release.forkOf && (
            <Link to={`/release/${nip19.neventEncode({ id: release.forkOf.id })}`} className="inline-flex">
              <Chip className="hover:border-purple-500/40"><GitFork className="h-3 w-3" /> forked from {shortId(release.forkOf.id)}</Chip>
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
        <PostFacts eventId={release.id} at={release.createdAt} summary={release.summary} />
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
        <Button size="sm" variant="outline" onClick={backup} className="gap-1.5 border-edge">
          <Archive className="h-3.5 w-3.5" /> {myBackup ? 'Backed up' : 'Back up'}
        </Button>
        {myPubkey === release.pubkey && draftHref && (
          <Button asChild size="sm" variant="outline" className="gap-1.5 border-purple-500/40 text-purple-300 hover:text-purple-200">
            <Link to={`${draftHref}/release`}><Rocket className="h-3.5 w-3.5" /> New version</Link>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={fork} className="gap-1.5 border-edge"><GitFork className="h-3.5 w-3.5" /> Fork</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Body */}
        <article className="min-w-0 self-start rounded-lg border border-edge bg-panel p-6">
          <CollapsibleBody>
            <Markdown content={release.content} className="text-[15px]" />
          </CollapsibleBody>
        </article>

        {/* Versions */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <AuthorCard pubkey={release.pubkey} />
          <div className={cn('rounded-lg border bg-panel p-2 transition-colors', checked ? 'border-edge' : 'animate-pulse border-purple-500/30')}>
            <p className="flex items-center justify-between px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
              Versions
              {!checked && <span className="flex items-center gap-1 normal-case tracking-normal text-neutral-500"><Loader2 className="h-3 w-3 animate-spin" /> checking</span>}
            </p>
            <VersionList versions={versions} currentId={release.id} />
            {!checked && versions.length <= 1 && (
              <div className="space-y-1 px-2 pb-1 pt-1">
                <div className="h-7 rounded-md bg-panel-2" />
                <div className="h-7 w-3/4 rounded-md bg-panel-2" />
              </div>
            )}
          </div>
          {Object.keys(perVersion(liveClaims)).length > 0 && (
            <div className="rounded-lg border border-edge bg-panel p-3 text-xs">
              <p className="pb-2 font-medium uppercase tracking-wider text-neutral-500">Claims per version</p>
              {Object.entries(perVersion(liveClaims)).map(([v, n]) => (
                <p key={v} className="flex justify-between py-0.5 text-neutral-400"><span className="font-mono">v{v}</span><span className="tabular-nums text-neutral-200">{n}</span></p>
              ))}
            </div>
          )}
          <ReferenceCard label={releaseLabel(release)} />
          <MetaCard kinds={release.kinds} topics={release.topics} />
        </aside>
      </div>

      {/* Adoption · Reviews · Discussion, as tabs: three lists in a row scroll badly. */}
      <Tabs defaultValue="adoption" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 items-stretch border border-edge bg-panel">
          <TabsTrigger value="adoption" className={tabTrigger}>Adoption <span className="ml-1.5 tabular-nums text-neutral-500">{liveClaims.length}</span></TabsTrigger>
          <TabsTrigger value="reviews" className={tabTrigger}>Reviews <span className="ml-1.5 tabular-nums text-neutral-500">{reviews.length}</span></TabsTrigger>
          <TabsTrigger value="discussion" className={tabTrigger}>Discussion</TabsTrigger>
        </TabsList>

      {/* Claims */}
      <TabsContent value="adoption" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Adoption claims</h2>
          <span className="text-xs text-neutral-500">{liveClaims.length} live · {claims.length - liveClaims.length} withdrawn</span>
        </div>
        <TieredList
          items={claims}
          keyOf={(c) => c.coord}
          render={(c) => {
            const st = claimStats.get(c.coord)
            return (
              <ClaimCard
                claim={c}
                legit={st?.legit}
                fake={st?.fake}
                mine={!!myPubkey && (claimReviews.get(c.coord) ?? []).some((r) => r.pubkey === myPubkey)}
                onReview={() => (myPubkey ? setClaimReviewTarget(c) : useLoginModalStore.getState().open())}
                onOpen={() => setClaimDetail(c)}
                menu={<ItemMenu event={c.event} mine={c.pubkey === myPubkey} onEdit={() => setClaimOpen(true)} noun="claim" title={`your claim for ${c.name}`} onDeleted={reload} />}
              />
            )
          }}
          empty={<p className="rounded-lg border border-dashed border-edge py-10 text-center text-sm text-neutral-500">No one has claimed adoption yet. Implemented it? Say so.</p>}
        />
      </TabsContent>

      {/* Reviews */}
      <TabsContent value="reviews" className="space-y-3">
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
          render={(r) => (
            <ReviewCard
              review={r}
              menu={<ItemMenu event={r.event} mine={r.pubkey === myPubkey} onEdit={() => setReviewOpen(true)} noun="review" title={`your review of ${release.title}`} onDeleted={reload} />}
            />
          )}
          empty={<p className="rounded-lg border border-dashed border-edge py-10 text-center text-sm text-neutral-500">No reviews yet.</p>}
        />
      </TabsContent>

      {/* Discussion */}
      <TabsContent value="discussion" className="space-y-3">
        <h2 className="text-lg font-semibold">Discussion</h2>
        <CommentSection root={{ id: release.id, pubkey: release.pubkey, kind: KINDS.PS_RELEASE }} />
      </TabsContent>
      </Tabs>

      <ClaimDialog open={claimOpen} onOpenChange={setClaimOpen} release={release} versions={versions} existing={myClaim} onPublished={reload} />
      <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} release={release} existing={myBackup} onPublished={reload} onDeleted={reload} />
      <ForkDialog open={forkOpen} onOpenChange={setForkOpen} release={release} />
      <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} target={{ kind: 'release', release }} existing={myReview} onPublished={reload} />
      {claimDetail && (
        <ClaimDetailDialog
          open
          onOpenChange={(v) => { if (!v) setClaimDetail(null) }}
          claim={claimDetail}
          reviews={claimReviews.get(claimDetail.coord) ?? []}
          mine={!!myPubkey && (claimReviews.get(claimDetail.coord) ?? []).some((r) => r.pubkey === myPubkey)}
          onReview={() => {
            if (!myPubkey) { useLoginModalStore.getState().open(); return }
            const c = claimDetail
            setClaimDetail(null)
            setClaimReviewTarget(c)
          }}
          claimMenu={<ItemMenu event={claimDetail.event} mine={claimDetail.pubkey === myPubkey} onEdit={() => { setClaimDetail(null); setClaimOpen(true) }} noun="claim" title={`your claim for ${claimDetail.name}`} onDeleted={() => { setClaimDetail(null); reload() }} />}
          menuFor={(r) => (
            <ItemMenu
              event={r.event}
              mine={r.pubkey === myPubkey}
              onEdit={() => { const c = claimDetail; setClaimDetail(null); setClaimReviewTarget(c) }}
              noun="verdict"
              title={`your verdict on ${claimDetail.name}`}
              onDeleted={reload}
            />
          )}
        />
      )}
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
