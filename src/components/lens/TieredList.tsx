import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useLensStore, bucketize, requestScores } from '@/stores/lensStore'

/**
 * Renders items split by their author's lens bucket (CLIENT-LENS.md,
 * "Threshold filter"): above-threshold shown normally, below and unknown
 * collapsed under their own folds. Nothing is removed; the folds are always
 * reachable. With the lens off everything renders in one list.
 */
export function TieredList<T extends { pubkey: string }>({
  items,
  render,
  keyOf,
  empty,
  belowLabel = 'low-trust',
  unknownLabel = 'unscored',
}: {
  items: T[]
  render: (item: T) => ReactNode
  keyOf: (item: T) => string
  empty?: ReactNode
  belowLabel?: string
  unknownLabel?: string
}) {
  const enabled = useLensStore((s) => s.enabled)
  const threshold = useLensStore((s) => s.threshold)
  const scores = useLensStore((s) => s.scores)
  const sources = useLensStore((s) => s.sources)
  const bucketOf = useLensStore((s) => s.bucketOf)
  const [showBelow, setShowBelow] = useState(false)
  const [showUnknown, setShowUnknown] = useState<boolean | null>(null) // null = not chosen yet

  useEffect(() => {
    if (enabled && items.length) void requestScores(items.map((i) => i.pubkey))
  }, [items, enabled, sources])

  // scores/threshold are read so the memo recomputes when they change.
  void scores; void threshold
  const { above, below, unknown } = bucketize(items, bucketOf)

  if (items.length === 0) return <>{empty ?? null}</>

  // Unknown is not zero: when nothing clears the threshold, the unscored fold
  // starts open so a sparse lens doesn't read as an empty list. Still labelled
  // and still collapsible; the user's own choice wins once they touch it.
  const unknownOpen = showUnknown ?? (above.length === 0 && unknown.length > 0)

  return (
    <div className="space-y-3">
      {above.map((it) => <div key={keyOf(it)}>{render(it)}</div>)}
      {above.length === 0 && (below.length > 0 || unknown.length > 0) && (
        <p className="py-2 text-center text-xs text-neutral-500">Nothing above your threshold. The folds below hold the rest.</p>
      )}

      {below.length > 0 && (
        <Fold open={showBelow} onToggle={() => setShowBelow((v) => !v)} label={`${below.length} ${belowLabel} ${below.length === 1 ? 'item' : 'items'}`}>
          {below.map((it) => <div key={keyOf(it)}>{render(it)}</div>)}
        </Fold>
      )}
      {unknown.length > 0 && (
        <Fold open={unknownOpen} onToggle={() => setShowUnknown(!unknownOpen)} label={`${unknown.length} ${unknownLabel} ${unknown.length === 1 ? 'item' : 'items'}`} hint="No enabled source has an opinion on these authors. Unknown is not zero.">
          {unknown.map((it) => <div key={keyOf(it)}>{render(it)}</div>)}
        </Fold>
      )}
    </div>
  )
}

function Fold({ open, onToggle, label, hint, children }: { open: boolean; onToggle: () => void; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[#2e2e2e]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-400 hover:text-neutral-200"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-medium">{label}</span>
        {hint && <span className="hidden text-neutral-600 sm:inline">· {hint}</span>}
      </button>
      {open && <div className="space-y-3 border-t border-[#262626] p-3">{children}</div>}
    </div>
  )
}
