import { GitFork } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Release } from '@/lib/nostr/nipps'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ForkPrefill } from '@/pages/DraftEditPage'

/**
 * Explains what a fork is (spec §5) before starting one: a new proposal
 * under your key with its own identity, seeded with this release's text.
 */
export function ForkDialog({ open, onOpenChange, release }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  release: Release
}) {
  const navigate = useNavigate()

  const start = () => {
    const prefill: ForkPrefill = {
      title: `${release.title} (fork)`,
      summary: release.summary,
      content: release.content,
      kinds: release.kinds,
      topics: release.topics,
      forkOfId: release.id,
    }
    onOpenChange(false)
    navigate('/submit-draft', { state: { fork: prefill } })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-edge bg-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground"><GitFork className="h-5 w-5 text-purple-400" /> Fork this release</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Start a new proposal from <span className="text-neutral-200">{release.title} v{release.version}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-neutral-300">
          <p>
            A fork is a new proposal under your key, with its own identity. It starts as a draft
            prefilled with this release&apos;s title, summary, text, kinds, and topics, and you can
            change all of it before publishing anything.
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-neutral-400">
            <li>Nothing happens to the original. Its author is not asked, and its adoption and reviews stay where they are.</li>
            <li>Your draft is editable and open for discussion like any other. Nothing is published until you save it.</li>
            <li>When you release the fork, its first release records which release it came from, so readers can follow the lineage.</li>
            <li>Adoption does not carry over. Implementers who want to back your variant claim it separately, and the two can compete side by side.</li>
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-edge">Cancel</Button>
          <Button onClick={start} className="gap-2 bg-purple-600 text-white hover:bg-purple-700">
            <GitFork className="h-4 w-4" /> Fork into a new draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
