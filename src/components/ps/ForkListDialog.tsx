import { useMemo, useState } from 'react'
import { GitFork } from 'lucide-react'
import { Link } from 'react-router-dom'
import { releaseNevent, compareVersions, type Fork, type Release } from '@/lib/nostr/nipps'
import { markdownToText, cn } from '@/lib/utils'
import { usePaged } from '@/hooks/usePaged'
import { Pagination } from '@/components/shared/Pagination'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AuthorLine } from '@/components/social/AuthorLine'
import { PowBadge } from '@/components/shared/PowBadge'

const PER_PAGE = 10
const ALL = 'all'

/**
 * Every proposal forked from this one (spec §5). A version column on the
 * left narrows the list to forks of one version; the list on the right pages
 * at ten. Each row is a fork's first release, the one that carries the fork
 * marker; its own page shows whatever versions it has grown since.
 */
export function ForkListDialog({ open, onOpenChange, release, versions, forks, capped }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** The release the page is showing; names the proposal in the header. */
  release: Release
  /** Every version of the proposal, so the column can be ordered and labelled. */
  versions: Release[]
  forks: Fork[]
  /** A relay returned the query limit, so there may be forks beyond these. */
  capped?: boolean
}) {
  const [selected, setSelected] = useState<string>(ALL)

  // Versions that have at least one fork, newest version first, with their counts.
  const column = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of forks) counts.set(f.parentId, (counts.get(f.parentId) ?? 0) + 1)
    return versions
      .filter((v) => counts.has(v.id))
      .sort((a, b) => compareVersions(b.version, a.version))
      .map((v) => ({ id: v.id, version: v.version, count: counts.get(v.id)! }))
  }, [forks, versions])

  const shown = useMemo(() => selected === ALL ? forks : forks.filter((f) => f.parentId === selected), [forks, selected])
  const { page, setPage, totalPages, paged } = usePaged(shown, PER_PAGE, { loadMore: () => {}, reachedEnd: true, loading: false, resetKey: selected })
  const plus = capped ? '+' : ''
  const versionOf = (id: string) => versions.find((v) => v.id === id)?.version ?? '?'

  const tab = (id: string, label: string, count: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setSelected(id)}
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
        selected === id ? 'bg-panel-3 text-purple-300' : 'text-neutral-400 hover:bg-panel-2 hover:text-neutral-200',
      )}
    >
      <span className={id === ALL ? '' : 'font-mono'}>{label}</span>
      <span className="tabular-nums text-xs text-neutral-500">{count}{id === ALL ? plus : ''}</span>
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-edge bg-dialog sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground"><GitFork className="h-5 w-5 text-purple-400" /> Forks</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Proposals derived from <span className="text-neutral-200">{release.title}</span>. Each is its own proposal with its own identity, versions, and adoption.
            {capped && <span className="mt-1 block text-xs text-amber-400/90">A relay returned its limit, so there may be forks beyond these.</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
          {/* Version column; a chip row on phones. */}
          <div className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
            {tab(ALL, 'All versions', forks.length)}
            {column.map((v) => tab(v.id, `v${v.version}`, v.count))}
          </div>

          <div className="min-w-0 space-y-3">
            <div className="space-y-2">
              {paged.map((f) => {
                const r = f.release
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
                      {selected === ALL && <span className="shrink-0 font-mono text-[11px] text-neutral-500">from v{versionOf(f.parentId)}</span>}
                    </div>
                    {r.summary && <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{markdownToText(r.summary)}</p>}
                    <div className="mt-2">
                      <AuthorLine pubkey={r.pubkey} at={r.createdAt} size="xs" linked={false} suffix={<PowBadge id={r.id} />} />
                    </div>
                  </Link>
                )
              })}
            </div>
            {shown.length > PER_PAGE && (
              <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
                <span>{shown.length}{selected === ALL ? plus : ''} forks · page {page} of {totalPages}</span>
                <Pagination page={page} totalPages={totalPages} onPage={setPage} />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
