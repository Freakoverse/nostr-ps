import { useMemo } from 'react'
import { ShieldCheck, ShieldX } from 'lucide-react'
import type { Claim, Review } from '@/lib/nostr/nipps'
import { useLensStore } from '@/stores/lensStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ClaimCard, ReviewCard } from './Cards'

/**
 * The whole adoption claim plus every verdict on it (legit / fake), opened
 * from the verdict pills on a claim card. Verdicts are listed newest first;
 * each author line carries its trust badge, so the lens is visible per voice.
 */
export function ClaimDetailDialog({ open, onOpenChange, claim, reviews, mine, onReview }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  claim: Claim
  reviews: Review[]
  /** True when the viewer already left a verdict on this claim. */
  mine?: boolean
  onReview?: () => void
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <ClaimCard claim={claim} legit={trusted.legit} fake={trusted.fake} />

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-neutral-200">Verdicts</h3>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span className="flex items-center gap-1 text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /> {legit.length} legit</span>
                <span className="flex items-center gap-1 text-red-400"><ShieldX className="h-3.5 w-3.5" /> {fake.length} fake</span>
                {enabled && (legit.length + fake.length > trusted.legit + trusted.fake) && (
                  <span>· {trusted.legit + trusted.fake} above your threshold</span>
                )}
              </div>
            </div>
            {sorted.length === 0 ? (
              <p className="rounded-lg border border-dashed border-edge py-6 text-center text-sm text-neutral-500">No verdicts yet.</p>
            ) : (
              <div className="space-y-2">
                {sorted.map((r) => (
                  <ReviewCard key={r.event.id} review={r} />
                ))}
              </div>
            )}
          </section>
        </div>

        {onReview && (
          <div className="flex justify-end border-t border-edge pt-3">
            <Button size="sm" variant="outline" onClick={onReview} className="border-edge">
              {mine ? 'Edit your verdict' : 'Is this implementation real?'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
