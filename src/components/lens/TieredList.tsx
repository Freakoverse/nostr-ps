import type { ReactNode } from 'react'
import { ChevronDown, Filter, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useLensFilter, SCORE_FILTERS, type ScoreFilter } from './useLensFilter'

export interface BucketCounts { above: number; below: number; unknown: number }

/** The "Scored / Low scored / Unscored / All" menu, with what each choice would show. */
export function ScoreFilterMenu({ value, onChange, counts }: { value: ScoreFilter; onChange: (f: ScoreFilter) => void; counts: BucketCounts }) {
  const total = counts.above + counts.below + counts.unknown
  const countFor = (id: ScoreFilter) => id === 'scored' ? counts.above : id === 'low' ? counts.below : id === 'unscored' ? counts.unknown : total
  const hiddenNote = value === 'scored'
    ? [counts.below && `${counts.below} low`, counts.unknown && `${counts.unknown} unscored`].filter(Boolean).join(' · ')
    : ''
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      {hiddenNote && <span>{hiddenNote} not shown</span>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-panel px-2.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-edge-2 hover:bg-panel-2"
            aria-label="Filter by score"
          >
            <Filter className="h-3.5 w-3.5 text-purple-400" />
            {SCORE_FILTERS.find((f) => f.id === value)?.label}
            <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 border-edge bg-panel">
          {SCORE_FILTERS.map((f) => (
            <DropdownMenuItem key={f.id} onClick={() => onChange(f.id)} className="flex items-start gap-2 py-2">
              <Check className={cn('mt-0.5 h-4 w-4', value === f.id ? 'text-purple-400' : 'invisible')} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-neutral-100">{f.label}</span>
                <span className="block text-[11px] text-neutral-500">{f.hint}</span>
              </span>
              <span className="mt-0.5 shrink-0 tabular-nums text-[11px] text-neutral-500">{countFor(f.id)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function EmptyFiltered({ filter }: { filter: ScoreFilter }) {
  const text = filter === 'scored' ? 'Nothing scored at or above your threshold.'
    : filter === 'low' ? 'Nothing scored below your threshold.'
    : filter === 'unscored' ? 'Nothing unscored.'
    : 'Nothing here.'
  return <p className="py-6 text-center text-xs text-neutral-500">{text}</p>
}

/**
 * Unpaginated list with the lens applied: filter menu plus the items the
 * filter keeps. Pages that paginate use `useLensFilter` directly so the
 * filter runs before the page slice.
 */
export function TieredList<T extends { pubkey: string }>({
  items, render, keyOf, empty, toolbar, layout = 'list',
}: {
  items: T[]
  render: (item: T) => ReactNode
  keyOf: (item: T) => string
  empty?: ReactNode
  toolbar?: ReactNode
  /** "grid" lays items out in up to four columns of equal-height cards. */
  layout?: 'list' | 'grid'
}) {
  const { main, counts, lensActive, filter, setFilter } = useLensFilter(items)

  if (items.length === 0) return <>{empty ?? null}</>

  return (
    <div className="space-y-3">
      {(lensActive || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">{toolbar}</div>
          {lensActive && <ScoreFilterMenu value={filter} onChange={setFilter} counts={counts} />}
        </div>
      )}
      {main.length === 0 ? (
        <EmptyFiltered filter={filter} />
      ) : (
        <div className={layout === 'grid' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'space-y-3'}>
          {main.map((it) => <div key={keyOf(it)} className={layout === 'grid' ? 'min-w-0' : undefined}>{render(it)}</div>)}
        </div>
      )}
    </div>
  )
}
