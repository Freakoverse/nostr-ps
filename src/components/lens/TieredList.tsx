import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Filter, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useLensFilter, SCORE_FILTERS, type ScoreFilter } from './useLensFilter'

/** The "Scored only / Unscored only / Show all" menu. */
export function ScoreFilterMenu({ value, onChange, unscored }: { value: ScoreFilter; onChange: (f: ScoreFilter) => void; unscored: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      {unscored > 0 && value === 'scored' && <span>{unscored} unscored hidden</span>}
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
        <DropdownMenuContent align="end" className="w-56 border-edge bg-panel">
          {SCORE_FILTERS.map((f) => (
            <DropdownMenuItem key={f.id} onClick={() => onChange(f.id)} className="flex items-start gap-2 py-2">
              <Check className={cn('mt-0.5 h-4 w-4', value === f.id ? 'text-purple-400' : 'invisible')} />
              <span className="min-w-0">
                <span className="block text-sm text-neutral-100">{f.label}</span>
                <span className="block text-[11px] text-neutral-500">{f.hint}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Collapsed fold for below-threshold items. Folded, never hidden. */
export function BelowFold<T>({ items, render, keyOf, label = 'low-trust' }: { items: T[]; render: (item: T) => ReactNode; keyOf: (item: T) => string; label?: string }) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  return (
    <div className="rounded-lg border border-dashed border-edge">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-400 hover:text-neutral-200"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-medium">{items.length} {label} {items.length === 1 ? 'item' : 'items'}</span>
        <span className="hidden text-neutral-600 sm:inline">· Authors scoring below your threshold. Folded, not hidden.</span>
      </button>
      {open && <div className="space-y-3 border-t border-edge p-3">{items.map((it) => <div key={keyOf(it)}>{render(it)}</div>)}</div>}
    </div>
  )
}

export function EmptyFiltered({ filter }: { filter: ScoreFilter }) {
  return (
    <p className="py-6 text-center text-xs text-neutral-500">
      {filter === 'scored' ? 'Nothing scored above your threshold.' : filter === 'unscored' ? 'Nothing unscored.' : 'Nothing above your threshold.'}
    </p>
  )
}

/**
 * Unpaginated list with the lens applied: filter menu, main list, below fold.
 * Pages that paginate use `useLensFilter` directly so the filter runs before
 * the page slice.
 */
export function TieredList<T extends { pubkey: string }>({
  items, render, keyOf, empty, belowLabel = 'low-trust', toolbar,
}: {
  items: T[]
  render: (item: T) => ReactNode
  keyOf: (item: T) => string
  empty?: ReactNode
  belowLabel?: string
  toolbar?: ReactNode
}) {
  const { main, below, lensActive, unscored, filter, setFilter } = useLensFilter(items)

  if (items.length === 0) return <>{empty ?? null}</>

  return (
    <div className="space-y-3">
      {(lensActive || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">{toolbar}</div>
          {lensActive && <ScoreFilterMenu value={filter} onChange={setFilter} unscored={unscored} />}
        </div>
      )}
      {main.length === 0 ? <EmptyFiltered filter={filter} /> : main.map((it) => <div key={keyOf(it)}>{render(it)}</div>)}
      <BelowFold items={below} render={render} keyOf={keyOf} label={belowLabel} />
    </div>
  )
}
