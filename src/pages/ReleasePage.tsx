import { useCallback, useEffect, useMemo, useState } from 'react'
import { BackButton } from '@/components/shared/BackButton'
import { Link, useParams } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import {
  Loader2, GitFork, Archive, Users, MessageSquareText, ShieldCheck, FileText, Rocket, RotateCcw,
} from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModalStore } from '@/stores/loginModalStore'
import { useLensStore, requestScores, DEFAULT_CONFIRM_THRESHOLD } from '@/stores/lensStore'
import { Slider } from '@/components/ui/slider'
import { KINDS } from '@/lib/constants'
import {
  fetchRelease, fetchReleasesOf, fetchClaimsFor, fetchReleaseReviews, fetchClaimReviews, fetchBackups, fetchForksOf,
  getCachedRelease, getCachedVersions, getCachedClaimsFor, getCachedReleaseReviews, whenEventCacheReady, shortId,
  draftNaddr, releaseNevent, releaseLabel,
  type Release, type Claim, type Review, type Backup, type Fork,
} from '@/lib/nostr/nipps'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/shared/Markdown'
import { PostMenu } from '@/components/ps/PostMenu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { CommentSection } from '@/components/social/CommentSection'
import { LensBar } from '@/components/lens/LensBar'
import { TieredList, ChoiceMenu } from '@/components/lens/TieredList'
import { Chip, ClaimTile, ReviewCard, VerdictChip } from '@/components/ps/Cards'
import { ClaimDialog } from '@/components/ps/ClaimDialog'
import { ReviewDialog } from '@/components/ps/ReviewDialog'
import { VersionList } from '@/components/ps/VersionDiff'
import { ClaimDetailDialog } from '@/components/ps/ClaimDetailDialog'
import { ItemMenu } from '@/components/ps/ItemMenu'
import { assessClaim, tallyRelease, divergenceFlag } from '@/lib/nostr/trust'
import { passesRawPow } from '@/lib/nostr/rawPow'
import { ensureEventPresent } from '@/lib/nostr/eventRedundancy'
import { AuthorCard, MetaCard, ReferenceCard } from '@/components/ps/SideCards'
import { PowBadge } from '@/components/shared/PowBadge'
import { Tip } from '@/components/shared/Tip'
import { formatRelativeTime, formatTimestamp } from '@/lib/utils'
import { BackupDialog } from '@/components/ps/BackupDialog'
import { ForkDialog } from '@/components/ps/ForkDialog'
import { ForkListDialog } from '@/components/ps/ForkListDialog'
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
  const [forks, setForks] = useState<Fork[]>([])
  const [forksCapped, setForksCapped] = useState(false)
  const [forksChecked, setForksChecked] = useState(false)
  const [forkListOpen, setForkListOpen] = useState(false)
  /** What the §6.5 floor excluded on the last fetch, so the switch visibly does something. */
  const [belowFloor, setBelowFloor] = useState({ claims: 0, reviews: 0 })
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
  const confirmThreshold = useLensStore((s) => s.confirmThreshold)
  const setConfirmThreshold = useLensStore((s) => s.setConfirmThreshold)
  const bucketOf = useLensStore((s) => s.bucketOf)
  const scoreOf = useLensStore((s) => s.scoreOf)
  const rawFloorOn = useSettingsStore((s) => s.rawPowFloor)
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
    setForks([])
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
      // Cooperative replication: every reader checks the release is on enough relays and rebroadcasts if not.
      ensureEventPresent(r.event)
      // Instant paint of what the cache already knows around this release.
      {
        const cvs = getCachedVersions(r.pubkey, r.uuid)
        const lineage = new Set((cvs.length ? cvs : [r]).map((v) => v.id))
        setVersions(cvs.length ? cvs : [r])
        setClaims(getCachedClaimsFor(r.uuid).filter((c) => c.releaseAuthor === r.pubkey && lineage.has(c.releaseId) && passesRawPow(c.event)))
        setReviews(getCachedReleaseReviews(r.id).filter((x) => passesRawPow(x.event)))
      }
      const [vs, cs, rv, bk] = await Promise.all([
        fetchReleasesOf(relays, r.pubkey, r.uuid).catch(() => [r]),
        fetchClaimsFor(relays, r.uuid).catch(() => []),
        fetchReleaseReviews(relays, r.id).catch(() => []),
        fetchBackups(relays, r.id).catch(() => []),
      ])
      if (cancelled) return
      const lineageIds = new Set(vs.map((v) => v.id))
      const inLineage = cs.filter((c) => c.releaseAuthor === r.pubkey && lineageIds.has(c.releaseId))
      const mine = inLineage.filter((c) => passesRawPow(c.event))
      const rvKept = rv.filter((x) => passesRawPow(x.event))
      setBelowFloor({ claims: inLineage.length - mine.length, reviews: rv.length - rvKept.length })
      setVersions(vs.length ? vs : [r])
      setClaims(mine)
      setReviews(rvKept)
      setBackups(bk)
      setChecked(true)
      // Forks point at a parent version by id, so they can only be asked for once the versions are known.
      setForksChecked(false)
      fetchForksOf(relays, (vs.length ? vs : [r]).map((v) => v.id))
        .catch(() => ({ forks: [] as Fork[], capped: false }))
        .then((fk) => { if (!cancelled) { setForks(fk.forks); setForksCapped(fk.capped); setForksChecked(true) } })
      const cr = await fetchClaimReviews(relays, mine.map((c) => c.coord)).catch(() => new Map<string, Review[]>())
      if (!cancelled) setClaimReviews(cr)
    })()
    return () => { cancelled = true }
  }, [id, tick, rawFloorOn, enabled]) // the raw-view floor changes what counts, so refetch when it or the lens flips

  useEffect(() => {
    if (!enabled) return
    const pks = [...new Set([...claims.map((c) => c.pubkey), ...reviews.map((r) => r.pubkey)])]
    if (pks.length) void requestScores(pks)
  }, [claims, reviews, enabled, sources])

  useSeoMeta(release ? { title: `${release.title} v${release.version}`, description: release.summary ?? release.content.slice(0, 160), type: 'article' } : null)

  // Reviewer weight under the lens (§6.3): rank/100 above threshold, 0 below
  // or unknown, 1 for everyone when the lens is off (raw view).
  const weightOf = useCallback((pk: string): number => {
    if (!enabled) return 1
    const b = bucketOf(pk)
    if (b === 'off') return 1
    if (b !== 'above') return 0
    return (scoreOf(pk)?.combined ?? 0) / 100
  }, [enabled, bucketOf, scoreOf, scores, threshold]) // eslint-disable-line react-hooks/exhaustive-deps

  // Claim confirmation per §6.3: weighted "accurate" sum reaches the confirmation threshold and no counted "inaccurate".
  const claimStats = useMemo(() => {
    const out = new Map<string, ReturnType<typeof assessClaim>>()
    for (const c of claims) out.set(c.coord, assessClaim(claimReviews.get(c.coord) ?? [], weightOf, confirmThreshold))
    return out
  }, [claims, claimReviews, weightOf, confirmThreshold])

  const liveClaims = useMemo(() => claims.filter((c) => !c.withdrawn), [claims])
  const thisVersionClaims = useMemo(() => liveClaims.filter((c) => c.releaseId === release?.id), [liveClaims, release])
  const rawImplementers = useMemo(() => new Set(liveClaims.map((c) => c.pubkey)).size, [liveClaims])
  const confirmedImplementers = useMemo(() => {
    const set = new Set<string>()
    for (const c of liveClaims) if (claimStats.get(c.coord)?.confirmed) set.add(c.pubkey)
    return set.size
  }, [liveClaims, claimStats])
  // §6.8: raw next to confirmed, flagged when the gap is large.
  const diverging = enabled && divergenceFlag(rawImplementers, confirmedImplementers)

  // §6.3 item 4: distinct counted reviewers per verdict, rank-weighted.
  const reviewTally = useMemo(() => tallyRelease(reviews, weightOf), [reviews, weightOf])

  // §6.6 tiers. `all` keeps relay order for the raw view; `rest` is sorted by the
  // claimant's rank (usage would come first per spec, once observed), withdrawn last.
  const [tier, setTier] = useState<'confirmed' | 'contested' | 'unconfirmed' | 'all'>('confirmed')
  const claimTiers = useMemo(() => {
    void scores; void threshold
    const confirmed: Claim[] = []
    const rest: Claim[] = []
    for (const c of claims) {
      const st = claimStats.get(c.coord)
      if (!c.withdrawn && st?.confirmed) confirmed.push(c)
      else rest.push(c)
    }
    const rank = (pk: string) => scoreOf(pk)?.combined ?? -1
    rest.sort((a, b) => Number(a.withdrawn) - Number(b.withdrawn) || rank(b.pubkey) - rank(a.pubkey) || b.createdAt - a.createdAt)
    const contested = rest.filter((c) => !c.withdrawn && claimStats.get(c.coord)?.contested)
    const unconfirmed = rest.filter((c) => !contested.includes(c))
    return { all: claims, confirmed, rest, contested, unconfirmed }
  }, [claims, claimStats, scoreOf, scores, threshold])

  const renderClaimTile = (c: Claim) => {
    const st = claimStats.get(c.coord)
    return (
      <ClaimTile
        claim={c}
        accurate={st?.accurate}
        inaccurate={st?.inaccurate}
        confirmed={st?.confirmed}
        contested={st?.contested}
        mine={!!myPubkey && (claimReviews.get(c.coord) ?? []).some((r) => r.pubkey === myPubkey)}
        onReview={() => (myPubkey ? setClaimReviewTarget(c) : useLoginModalStore.getState().open())}
        onOpen={() => setClaimDetail(c)}
        menu={<ItemMenu event={c.event} mine={c.pubkey === myPubkey} onEdit={() => setClaimOpen(true)} noun="claim" title={`your claim for ${c.name}`} onDeleted={reload} />}
      />
    )
  }

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
          <PowBadge id={release.id} />
          <Tip label={formatTimestamp(release.createdAt)}><Chip className="text-neutral-400">published {formatRelativeTime(release.createdAt)}</Chip></Tip>
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
        {release.summary && <Markdown content={release.summary} className="rounded-lg border border-edge bg-well px-4 py-3 text-[15px] text-neutral-300" />}
      </div>

      <LensBar />

      {/* Stats + actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          icon={Users}
          label="Implementers"
          value={rawImplementers}
          sub={enabled
            ? <span className={diverging ? 'text-amber-400' : undefined}>{confirmedImplementers} confirmed{diverging ? ' · large gap, treat with suspicion' : ''}</span>
            : `${thisVersionClaims.length} on this version`}
        />
        <Stat
          icon={MessageSquareText}
          label="Reviews"
          value={reviews.length}
          sub={`${reviewTally.recommend} recommend · ${reviewTally['not-recommend']} against · ${reviewTally.unsure} unsure${enabled ? ` · weighted ${reviewTally.weight.recommend.toFixed(1)} / ${reviewTally.weight['not-recommend'].toFixed(1)} / ${reviewTally.weight.unsure.toFixed(1)}${reviewTally.uncounted ? ` · ${reviewTally.uncounted} below threshold` : ''}` : ''}`}
        />
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
          {/* Forks: a count that opens the list. Other proposals derived from this one, any version. */}
          <div className={cn('rounded-lg border bg-panel p-3 text-xs transition-colors', forksChecked ? 'border-edge' : 'animate-pulse border-purple-500/30')}>
            <p className="flex items-center justify-between font-medium uppercase tracking-wider text-neutral-500">
              Forks
              {!forksChecked && <span className="flex items-center gap-1 normal-case tracking-normal"><Loader2 className="h-3 w-3 animate-spin" /> checking</span>}
            </p>
            {forks.length > 0 ? (
              <button
                type="button"
                onClick={() => setForkListOpen(true)}
                className="mt-2 flex w-full items-center justify-between rounded-md border border-edge bg-panel-2 px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:border-purple-500/40 hover:text-purple-300"
              >
                <span className="flex items-center gap-2"><GitFork className="h-3.5 w-3.5 text-purple-400" /> {forks.length === 1 ? "1 fork" : `${forks.length}${forksCapped ? "+" : ""} forks`}</span>
                <span className="text-[11px] text-neutral-500">view</span>
              </button>
            ) : (
              <p className="mt-2 text-neutral-600">{forksChecked ? 'none' : '…'}</p>
            )}
          </div>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold">Adoption claims</h2>
            <span className="text-xs text-neutral-500">
              {liveClaims.length} live · {claims.length - liveClaims.length} withdrawn
              {rawFloorOn && <span className={belowFloor.claims ? 'text-amber-400' : ''}> · PoW floor: {belowFloor.claims ? `${belowFloor.claims} excluded` : 'nothing excluded'}</span>}
            </span>
          </div>
          {/* §6.6 tiers as the same menu the lists use for scores: confirmed by default, the rest one click away.
              Beside it, the §6.3 confirmation threshold the tiers are computed from. */}
          {enabled && claims.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs">
                <Tip label={`A claim is confirmed once the "accurate" verdicts from reviewers above your rank threshold, each weighing rank/100, add up to ${confirmThreshold.toFixed(1)}. One reviewer ranked ${Math.round(confirmThreshold * 100)} is enough; any trusted "inaccurate" blocks it.`}>
                  <span className="text-neutral-500">Confirm at</span>
                </Tip>
                <Slider min={0.1} max={3} step={0.1} value={[confirmThreshold]} onValueChange={([v]) => setConfirmThreshold(v)} className="w-24" aria-label="Confirmation threshold" />
                <span className="w-6 text-right tabular-nums text-neutral-200">{confirmThreshold.toFixed(1)}</span>
                {confirmThreshold !== DEFAULT_CONFIRM_THRESHOLD && (
                  <Tip label={`Reset to ${DEFAULT_CONFIRM_THRESHOLD.toFixed(1)}`}>
                    <button type="button" onClick={() => setConfirmThreshold(DEFAULT_CONFIRM_THRESHOLD)} className="text-neutral-500 hover:text-neutral-200" aria-label={`Reset confirmation threshold to ${DEFAULT_CONFIRM_THRESHOLD}`}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </Tip>
                )}
              </div>
              <ChoiceMenu
              value={tier}
              onChange={setTier}
              ariaLabel="Filter claims by confirmation"
              options={[
                { id: 'confirmed', label: 'Confirmed only', hint: 'Enough trusted reviewers found it accurate', count: claimTiers.confirmed.length },
                { id: 'contested', label: 'Contested only', hint: 'A trusted reviewer found it inaccurate', count: claimTiers.contested.length },
                { id: 'unconfirmed', label: 'Unconfirmed only', hint: 'No trusted decision yet', count: claimTiers.unconfirmed.length },
                { id: 'all', label: 'Show all', hint: 'Everything, in one list', count: claims.length },
              ]}
              hiddenNote={tier === 'all' ? undefined : [
                tier !== 'confirmed' && claimTiers.confirmed.length ? `${claimTiers.confirmed.length} confirmed` : '',
                tier !== 'contested' && claimTiers.contested.length ? `${claimTiers.contested.length} contested` : '',
                tier !== 'unconfirmed' && claimTiers.unconfirmed.length ? `${claimTiers.unconfirmed.length} unconfirmed` : '',
              ].filter(Boolean).join(' · ') || undefined}
              />
            </div>
          )}
        </div>
        {claims.length === 0 ? (
          <p className="rounded-lg border border-dashed border-edge py-10 text-center text-sm text-neutral-500">No one has claimed adoption yet. Implemented it? Say so.</p>
        ) : (() => {
          // Raw view (lens off): every non-withdrawn claim counts (§6.5), one grid.
          const shown = !enabled ? claimTiers.all
            : tier === 'confirmed' ? claimTiers.confirmed
            : tier === 'contested' ? claimTiers.contested
            : tier === 'unconfirmed' ? claimTiers.unconfirmed
            : [...claimTiers.confirmed, ...claimTiers.unconfirmed, ...claimTiers.contested]
          return shown.length === 0 ? (
            <p className="rounded-lg border border-dashed border-edge py-6 text-center text-xs text-neutral-500">
              {tier === 'confirmed' ? 'No claim is confirmed under your lens yet.' : tier === 'contested' ? 'Nothing contested.' : 'Nothing unconfirmed.'}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((c) => <div key={c.coord} className="min-w-0">{renderClaimTile(c)}</div>)}
            </div>
          )
        })()}
      </TabsContent>

      {/* Reviews */}
      <TabsContent value="reviews" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Reviews
            {rawFloorOn && <span className={cn('ml-2 text-xs font-normal', belowFloor.reviews ? 'text-amber-400' : 'text-neutral-500')}>PoW floor: {belowFloor.reviews ? `${belowFloor.reviews} excluded` : 'nothing excluded'}</span>}
          </h2>
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
      <ForkListDialog open={forkListOpen} onOpenChange={setForkListOpen} release={release} versions={versions} forks={forks} capped={forksCapped} />
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

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: number; sub?: React.ReactNode }) {
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
