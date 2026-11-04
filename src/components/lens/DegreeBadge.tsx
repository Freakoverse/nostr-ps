import { useState } from 'react'
import { Waypoints } from 'lucide-react'
import { cn, ordinal } from '@/lib/utils'
import { useLensStore } from '@/stores/lensStore'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ConnectionModal } from './ConnectionModal'

/**
 * Degrees-of-separation pill for a pubkey: the hop count the lens source
 * reported (NIP-85 `hops`), shown as "4th". Clicking opens the connection modal.
 * Hidden when the lens is off, no source is on, or no hop count is known (so an
 * unscored account shows nothing rather than a misleading "0"). The score fetch
 * is already triggered by the TrustBadge that sits beside it.
 */
export function DegreeBadge({ pubkey, className }: { pubkey: string; className?: string }) {
  const enabled = useLensStore((s) => s.enabled)
  const anyEnabled = useLensStore((s) => s.sources.some((x) => x.enabled))
  const hops = useLensStore((s) => s.scores[pubkey]?.hops ?? null)
  const [open, setOpen] = useState(false)

  if (!enabled || !anyEnabled || hops === null || hops <= 0) return null

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true) }}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border border-edge-2 bg-panel-2 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-neutral-400 transition-colors hover:border-purple-500/40 hover:text-purple-300',
              className,
            )}
            aria-label={`${ordinal(hops)} degree — see how you connect`}
          >
            <Waypoints className="h-3 w-3" /> {ordinal(hops)}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          {ordinal(hops)} degree in your lens ({hops} hop{hops === 1 ? '' : 's'} away). Click to see who connects you.
        </TooltipContent>
      </Tooltip>
      {open && (
        // The modal mounts inside a clickable card; even portaled, its events
        // bubble through the React tree. Stop them here so closing it (overlay,
        // X, or a click inside) never triggers the card's navigation.
        <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <ConnectionModal open={open} onOpenChange={setOpen} target={pubkey} />
        </span>
      )}
    </>
  )
}
