import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Filter, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLensStore, bucketize, requestScores } from '@/stores/lensStore'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

export type ScoreFilter = 'all' | 'scored' | 'unscored'

const FILTERS: { id: ScoreFilter; label: string; hint: string }[] = [
  { id: 'scored', label: 'Scored only', hint: 'Authors above your threshold' },
  { id: 'unscored', label: 'Unscored only', hint: 'Authors no source has an opinion on' },
  { id: 'all', label: 'Show all', hint: 'Scored and unscored together' },
]

/**
 * Renders items with their author's lens bucket applied (CLIENT-LENS.md,
 * "Threshold filter"): scored-and-above and unscored items share one list in
 * their original order; below-threshold items are collapsed under a fold.
 * A dropdown narrows the main list to scored or unscored only. Nothing is
 * ever removed from reach. With the lens off everything renders as one list.
 */
export function TieredList<T extends { pubkey: string }>({
  items,
  render,
  keyOf,
  empty,
  belowLabel = 'low-trust',
  toolbar,
}: {
  items: T[]
  render: (item: T) => ReactNode
  keyOf: (item: T) => string
  empty?: ReactNode
  belowLabel?: string
  /** Rendered left of the score filter, e.g. pagination or a count. */
  toolbar?: ReactNode
}) {
  const enabled = useLensStore((s) => s.enabled)
  const threshold = useLensStore((s) => s.threshold)
  const scores = useLensStore((s) => s.scores)
  const sources = useLensStore((s) => s.sources)
  const bucketOf = useLensStore((s) => s.bucketOf)
  const [showBelow, setShowBelow] = useState(false)
  const [filter, setFilter] = useState<ScoreFilter>('scored')

  useEffect(() => {
    if (enabled && items.length) void requestScores(items.map((i) => i.pubkey))
  }, [items, enabled, sources])

  // scores/threshold are read so the bucketing recomputes when they change.
  void scores; void threshold
  const { below, off } = bucketize(items, bucketOf)
  const lensActive = enabled && !off

  if (items.length === 0) return <>{empty ?? null}</>

  // Main list keeps the original order; the filter decides which buckets stay.
  const main = items.filter((it) => {
    const b = bucketOf(it.pubkey)
    if (b === 'below') return false
    if (!lensActive || filter === 'all') return true
    if (filter === 'scored') return b === 'above'
    return b === 'unknown'
  })
  const unscoredCount = lensActive ? items.filter((it) => bucketOf(it.pubkey) === 'unknown').length : 0

  return (
    <div className="space-y-3">
      {(lensActive || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">{toolbar}</div>
          {lensActive && (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              {unscoredCount > 0 && filter === 'scored' && <span>{unscoredCount} unscored hidden</span>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-panel px-2.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-edge-2 hover:bg-panel-2"
                    aria-label="Filter by score"
                  >
                    <Filter className="h-3.5 w-3.5 text-purple-400" />
                    {FILTERS.find((f) => f.id === filter)?.label}
                    <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 border-edge bg-panel">
                  {FILTERS.map((f) => (
                    <DropdownMenuItem key={f.id} onClick={() => setFilter(f.id)} className="flex items-start gap-2 py-2">
                      <Check className={cn('mt-0.5 h-4 w-4', filter === f.id ? 'text-purple-400' : 'invisible')} />
                      <span className="min-w-0">
                        <span className="block text-sm text-neutral-100">{f.label}</span>
                        <span className="block text-[11px] text-neutral-500">{f.hint}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      )}

      {main.length === 0 ? (
        <p className="py-6 text-center text-xs text-neutral-500">
          {filter === 'scored' ? 'Nothing scored above your threshold on this page.' : filter === 'unscored' ? 'Nothing unscored on this page.' : 'Nothing above your threshold on this page.'}
        </p>
      ) : (
        main.map((it) => <div key={keyOf(it)}>{render(it)}</div>)
      )}

      {below.length > 0 && (
        <Fold open={showBelow} onToggle={() => setShowBelow((v) => !v)} label={`${below.length} ${belowLabel} ${below.length === 1 ? 'item' : 'items'}`} hint="Authors scoring below your threshold. Folded, not hidden.">
          {below.map((it) => <div key={keyOf(it)}>{render(it)}</div>)}
        </Fold>
      )}
    </div>
  )
}

function Fold({ open, onToggle, label, hint, children }: { open: boolean; onToggle: () => void; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-edge">
      <button
        type="button"
        onClick={onToggle}
        className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-400 hover:text-neutral-200')}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-medium">{label}</span>
        {hint && <span className="hidden text-neutral-600 sm:inline">· {hint}</span>}
      </button>
      {open && <div className="space-y-3 border-t border-edge p-3">{children}</div>}
    </div>
  )
}
