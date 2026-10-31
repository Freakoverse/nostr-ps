import { GitFork } from 'lucide-react'
import { Link } from 'react-router-dom'
import { releaseNevent, type Fork, type Release } from '@/lib/nostr/nipps'
import { markdownToText } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AuthorLine } from '@/components/social/AuthorLine'
import { PowBadge } from '@/components/shared/PowBadge'
import { Chip } from './Cards'

/**
 * Every proposal forked from this one (spec §5): each row is the fork's
 * current version, who published it, and which parent version it branched
 * from. A fork is a separate proposal, so the row opens its own page.
 */
export function ForkListDialog({ open, onOpenChange, release, versions, forks }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** The release the page is showing; names the proposal in the header. */
  release: Release
  /** Every version of the proposal, so a fork can say "from v1.2". */
  versions: Release[]
  forks: Fork[]
}) {
  const versionOf = (id: string) => versions.find((v) => v.id === id)?.version
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-edge bg-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground"><GitFork className="h-5 w-5 text-purple-400" /> Forks</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Proposals derived from <span className="text-neutral-200">{release.title}</span>. Each is its own proposal with its own identity, versions, and adoption.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {forks.map((f) => {
            const r = f.latest
            const from = versionOf(f.parentId)
            return (
              <Link
                key={r.id}
                to={`/release/${releaseNevent(r.id, r.pubkey)}`}
                onClick={() => onOpenChange(false)}
                className="block rounded-lg border border-edge bg-panel p-3 transition-colors hover:border-purple-500/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 truncate text-sm font-semibold text-neutral-100">
                    {r.title} <span className="font-normal text-neutral-500">v{r.version}</span>
                  </h3>
                  <Chip className="shrink-0">from v{from ?? '?'}</Chip>
                </div>
                {r.summary && <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{markdownToText(r.summary)}</p>}
                <div className="mt-2">
                  <AuthorLine pubkey={r.pubkey} at={r.createdAt} size="xs" linked={false} suffix={<PowBadge id={r.id} />} />
                </div>
              </Link>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
