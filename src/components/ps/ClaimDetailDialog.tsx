import { useMemo, type ReactNode } from 'react'
import { ShieldCheck, ShieldX, ExternalLink } from 'lucide-react'
import { addressToNaddr, type Claim, type Review } from '@/lib/nostr/nipps'
import { useLensStore } from '@/stores/lensStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AuthorLine } from '@/components/social/AuthorLine'
import { Markdown } from '@/components/shared/Markdown'
import { Tip } from '@/components/shared/Tip'
import { formatRelativeTime, formatTimestamp } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { verifyClaim, VERIFY_SUM_THRESHOLD } from '@/lib/nostr/trust'
import { PowBadge } from '@/components/shared/PowBadge'

/**
 * The whole adoption claim plus every verdict on it (legit / fake), opened
 * from the verdict pills on a claim card. Verdicts are flat rows with a
 * coloured edge, deliberately unlike the claim card above them, newest first.
 */
export function ClaimDetailDialog({ open, onOpenChange, claim, reviews, mine, onReview, claimMenu, menuFor }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  claim: Claim
  reviews: Review[]
  /** True when the viewer already left a verdict on this claim. */
  mine?: boolean
  /** Opens the verdict form (only offered while the viewer has none). */
  onReview?: () => void
  /** Three-dot menu for the claim itself. */
  claimMenu?: ReactNode
  /** Three-dot menu for one verdict (raw event; edit and delete for its author). */
  menuFor?: (r: Review) => ReactNode
}) {
  const enabled = useLensStore((s) => s.enabled)
  const bucketOf = useLensStore((s) => s.bucketOf)
  const scores = useLensStore((s) => s.scores)
  const threshold = useLensStore((s) => s.threshold)

  const scoreOf = useLensStore((s) => s.scoreOf)

  const sorted = useMemo(() => [...reviews].sort((a, b) => b.createdAt - a.createdAt), [reviews])
  const legit = sorted.filter((r) => r.verdict === 'legit')
  const fake = sorted.filter((r) => r.verdict === 'fake')
  // Same §6.3 rule as the release page: rank/100 above threshold, else 0; 1 with the lens off.
  const stats = useMemo(() => {
    void scores; void threshold
    const weightOf = (pk: string) => {
      if (!enabled) return 1
      const b = bucketOf(pk)
      if (b === 'off') return 1
      if (b !== 'above') return 0
      return (scoreOf(pk)?.combined ?? 0) / 100
    }
    return verifyClaim(reviews, weightOf)
  }, [reviews, enabled, bucketOf, scoreOf, scores, threshold])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 border-edge bg-dialog sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Adoption claim</DialogTitle>
          <DialogDescription className="text-neutral-400">
            A claim is a statement by its author. The verdicts below are other people saying whether the implementation is real.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <ClaimFullView claim={claim} menu={claimMenu} />

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">Verdicts</h3>
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                <span className="flex items-center gap-1 text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /> {legit.length} legit</span>
                <span className="flex items-center gap-1 text-red-400"><ShieldX className="h-3.5 w-3.5" /> {fake.length} fake</span>
                {enabled && (
                  <span>· weighted legit {stats.legitWeight.toFixed(2)} / {VERIFY_SUM_THRESHOLD.toFixed(1)}{stats.uncounted ? ` ·  below threshold` : ''}</span>
                )}
                <span className={stats.disputed ? 'text-red-300' : stats.verified ? 'text-emerald-300' : 'text-neutral-400'}>· {stats.disputed ? 'disputed' : stats.verified ? 'verified' : 'unverified'}</span>
              </div>
            </div>
            {sorted.length === 0 ? (
              <p className="px-1 py-4 text-sm text-neutral-500">No verdicts yet.</p>
            ) : (
              <div className="space-y-1.5">
                {sorted.map((r) => <VerdictRow key={r.event.id} review={r} menu={menuFor?.(r)} />)}
              </div>
            )}
          </section>
        </div>

        {onReview && !mine && (
          <div className="flex justify-end border-t border-edge pt-3">
            <Button size="sm" variant="outline" onClick={onReview} className="border-edge">
              Is this implementation real?
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A verdict: flat row, coloured left edge, author and verdict on one line, reasoning under it. */
/**
 * A verdict, styled the way a reply sits under a comment in a thread: the
 * same card shape as the claim above it, but on the plain panel surface with
 * tighter padding, while the claim itself sits on the raised "well" surface.
 */
export function VerdictRow({ review, menu, label }: { review: Review; menu?: ReactNode; label?: ReactNode }) {
  const legit = review.verdict === 'legit'
  return (
    <div className="rounded-lg border border-edge bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AuthorLine pubkey={review.pubkey} at={review.createdAt} size="xs" suffix={<PowBadge id={review.event.id} />} />
        <div className="flex items-center gap-1.5">
          {label}
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', legit ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400')}>
            {legit ? <ShieldCheck className="h-3 w-3" /> : <ShieldX className="h-3 w-3" />}
            {legit ? 'legit' : 'fake'}
          </span>
          {menu}
        </div>
      </div>
      {review.content && <div className="mt-2 text-sm text-neutral-300"><Markdown content={review.content} /></div>}
    </div>
  )
}

/**
 * The claim in full, for the dialog: everything the event carries, laid out
 * as facts rather than a card, since here there is room for all of it.
 */
function ClaimFullView({ claim, menu }: { claim: Claim; menu?: ReactNode }) {

  const fact = (label: string, value: ReactNode) => (
    <div className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-0.5 py-1.5 text-sm">
      <dt className="text-xs uppercase tracking-wider text-neutral-500 pt-0.5">{label}</dt>
      <dd className="min-w-0 text-neutral-200">{value}</dd>
    </div>
  )

  return (
    <div className={cn('rounded-lg border border-edge bg-well', claim.withdrawn && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-edge p-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-neutral-100">
            {claim.name}
            {claim.implVersion && <span className="ml-2 font-mono text-sm font-normal text-neutral-400">{claim.implVersion}</span>}
          </h3>
          <p className="text-xs text-neutral-500">
            <span className="capitalize text-neutral-300">{claim.role}</span> · implements <span className="font-mono text-neutral-300">v{claim.version}</span>
            {claim.scope === 'partial' && <span className="text-yellow-500"> · partial implementation</span>}
            {claim.withdrawn && <span className="text-red-400"> · withdrawn</span>}
          </p>
        </div>
        {menu}
      </div>

      <dl className="divide-y divide-edge px-4">
        {fact('Claimed by', <AuthorLine pubkey={claim.pubkey} size="xs" suffix={<PowBadge id={claim.event.id} />} />)}
        {fact('Published', <Tip label={formatTimestamp(claim.createdAt)}><span>{formatRelativeTime(claim.createdAt)}</span></Tip>)}
        {claim.urls.length > 0 && fact('Links', (
          <div className="flex flex-col gap-1">
            {claim.urls.map((u) => (
              <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-purple-400 hover:underline">
                <ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{u}</span>
              </a>
            ))}
          </div>
        ))}
        {claim.relay && fact('Relay', <span className="font-mono text-xs break-all">{claim.relay}</span>)}
        {claim.handler && fact('NIP-89 handler', <Tip label={claim.handler}><span className="font-mono text-xs break-all">{addressToNaddr(claim.handler)}</span></Tip>)}
        {claim.repo && fact('NIP-34 repo', <Tip label={claim.repo}><span className="font-mono text-xs break-all">{addressToNaddr(claim.repo)}</span></Tip>)}
        {fact('Release', <span className="font-mono text-xs break-all">{claim.releaseId}</span>)}
        {claim.content && fact('Notes', <div className="whitespace-pre-wrap text-neutral-300">{claim.content}</div>)}
      </dl>
    </div>
  )
}
