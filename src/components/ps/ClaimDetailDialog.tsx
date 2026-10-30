import { useMemo, type ReactNode } from 'react'
import { ShieldCheck, ShieldX } from 'lucide-react'
import type { Claim, Review } from '@/lib/nostr/nipps'
import { useLensStore } from '@/stores/lensStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AuthorLine } from '@/components/social/AuthorLine'
import { Markdown } from '@/components/shared/Markdown'
import { ClaimCard } from './Cards'
import { cn } from '@/lib/utils'
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

  const sorted = useMemo(() => [...reviews].sort((a, b) => b.createdAt - a.createdAt), [reviews])
  const legit = sorted.filter((r) => r.verdict === 'legit')
  const fake = sorted.filter((r) => r.verdict === 'fake')
  // Above-threshold counts, same rule as the release page's pills.
  const trusted = useMemo(() => {
    void scores; void threshold
    const count = (rs: Review[]) => rs.filter((r) => !enabled || bucketOf(r.pubkey) === 'above' || bucketOf(r.pubkey) === 'off').length
    return { legit: count(legit), fake: count(fake) }
  }, [legit, fake, enabled, bucketOf, scores, threshold])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 border-edge bg-dialog sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Adoption claim</DialogTitle>
          <DialogDescription className="text-neutral-400">
            A claim is a statement by its author. The verdicts below are other people saying whether the implementation is real.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <ClaimCard claim={claim} legit={trusted.legit} fake={trusted.fake} menu={claimMenu} className="bg-well" />

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">Verdicts</h3>
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                <span className="flex items-center gap-1 text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /> {legit.length} legit</span>
                <span className="flex items-center gap-1 text-red-400"><ShieldX className="h-3.5 w-3.5" /> {fake.length} fake</span>
                {enabled && (legit.length + fake.length > trusted.legit + trusted.fake) && (
                  <span>· {trusted.legit + trusted.fake} above your threshold</span>
                )}
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
