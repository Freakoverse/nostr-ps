import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { signAndPublish, type PublishStatus } from '@/lib/nostr/publish'
import { PublishPhase } from '@/components/shared/PublishPhase'
import {
  buildReleaseReviewEvent, buildClaimReviewEvent,
  type Claim, type Release, type Review, type ReleaseVerdict, type ClaimVerdict,
} from '@/lib/nostr/nipps'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModalStore } from '@/stores/loginModalStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LIMITS } from '@/lib/limits'
import { CharCounter } from '@/components/shared/CharCounter'

type Target = { kind: 'release'; release: Release } | { kind: 'claim'; claim: Claim }

const RELEASE_OPTS: { v: ReleaseVerdict; label: string; hint: string; cls: string }[] = [
  { v: 'recommend', label: 'Recommend', hint: 'This spec is good; adopt it.', cls: 'data-[on=true]:border-emerald-500/60 data-[on=true]:text-emerald-300' },
  { v: 'unsure', label: 'Unsure', hint: 'Reviewed, no verdict.', cls: 'data-[on=true]:border-yellow-500/60 data-[on=true]:text-yellow-300' },
  { v: 'not-recommend', label: "Don't recommend", hint: 'This spec has problems.', cls: 'data-[on=true]:border-red-500/60 data-[on=true]:text-red-300' },
]
const CLAIM_OPTS: { v: ClaimVerdict; label: string; hint: string; cls: string }[] = [
  { v: 'accurate', label: 'Accurate', hint: 'I checked: the software implements it as claimed.', cls: 'data-[on=true]:border-emerald-500/60 data-[on=true]:text-emerald-300' },
  { v: 'inaccurate', label: 'Inaccurate', hint: 'I checked: it does not, or not as claimed.', cls: 'data-[on=true]:border-red-500/60 data-[on=true]:text-red-300' },
]

/**
 * One opinion per reviewer per target (kind 30852). Two vocabularies that
 * never mix: a release gets recommend / unsure / not-recommend, a claim gets
 * accurate / inaccurate.
 */
export function ReviewDialog({
  open, onOpenChange, target, existing, onPublished,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  target: Target
  existing?: Review | null
  onPublished?: () => void
}) {
  const pubkey = useAuthStore((s) => s.pubkey)
  const [verdict, setVerdict] = useState<string>('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<PublishStatus | null>(null)

  useEffect(() => {
    if (!open) return
    setVerdict(existing?.verdict ?? '')
    setContent(existing?.content ?? '')
  }, [open, existing])

  if (open && !pubkey) {
    onOpenChange(false)
    useLoginModalStore.getState().open()
    return null
  }

  const opts = target.kind === 'release' ? RELEASE_OPTS : CLAIM_OPTS

  const publish = async () => {
    if (!verdict) { toast.error('Pick a verdict'); return }
    if (target.kind === 'claim' && verdict === 'inaccurate' && !content.trim()) { toast.error('Say what you checked. An inaccurate verdict needs evidence.'); return }
    setBusy(true)
    const event = target.kind === 'release'
      ? buildReleaseReviewEvent(target.release, verdict as ReleaseVerdict, content)
      : buildClaimReviewEvent(target.claim, verdict as ClaimVerdict, content)
    const res = await signAndPublish(event, setPhase)
    setBusy(false); setPhase(null)
    if (!res.success) { toast.error(res.error || 'Failed to publish review'); return }
    toast.success(existing ? 'Review updated' : 'Review published')
    onOpenChange(false)
    onPublished?.()
  }

  const title = target.kind === 'release'
    ? `${target.release.title} v${target.release.version}`
    : `${target.claim.name} (${target.claim.role})`

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v) }}>
      <DialogContent className="border-edge bg-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">{target.kind === 'release' ? 'Review this spec' : 'Is this implementation real?'}</DialogTitle>
          <DialogDescription className="text-neutral-400">
            <span className="text-neutral-200">{title}</span>. {target.kind === 'release'
              ? 'Your opinion of the spec itself. It says nothing about any implementer.'
              : 'Whether this claim is backed by real software. It says nothing about whether the spec is good.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className={cn('grid gap-2', opts.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
            {opts.map((o) => (
              <button
                key={o.v}
                type="button"
                data-on={verdict === o.v}
                onClick={() => setVerdict(o.v)}
                className={cn('rounded-lg border border-edge bg-panel px-3 py-2.5 text-left transition-colors hover:border-edge-2', o.cls)}
              >
                <p className="text-sm font-medium">{o.label}</p>
                <p className="mt-0.5 text-[11px] text-neutral-500">{o.hint}</p>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300">
              {target.kind === 'release' ? 'Reasoning' : 'What did you check?'} <span className="text-neutral-600">(markdown)</span>
            </label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder={target.kind === 'release' ? 'What works, what does not, what you would change.' : 'Installed it, confirmed it speaks the spec; or: no code, no users, nothing behind the npub.'} className="border-edge bg-panel" maxLength={LIMITS.review} />
            <CharCounter value={content} max={LIMITS.review} />
          </div>
        </div>

        <DialogFooter>
          <PublishPhase status={phase} className="mr-auto" />
          <Button onClick={publish} disabled={busy} className="bg-purple-600 text-white hover:bg-purple-700">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {existing ? 'Update review' : 'Publish review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
