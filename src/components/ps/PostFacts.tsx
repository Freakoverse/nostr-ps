import { Markdown } from '@/components/shared/Markdown'
import { PowBadge } from '@/components/shared/PowBadge'
import { Tip } from '@/components/shared/Tip'
import { formatRelativeTime, formatTimestamp } from '@/lib/utils'

/**
 * The box under a post's title: facts about the event (proof of work, when
 * it was published), then a divider, then the summary when there is one.
 */
export function PostFacts({ eventId, at, summary }: { eventId: string; at: number; summary?: string }) {
  return (
    <div className="rounded-lg border border-edge bg-well px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PowBadge id={eventId} />
        <Tip label={formatTimestamp(at)}>
          <span className="text-xs text-neutral-500">published {formatRelativeTime(at)}</span>
        </Tip>
      </div>
      {summary && (
        <>
          <div className="my-3 border-t border-edge-2" />
          <Markdown content={summary} className="text-[15px] text-neutral-300" />
        </>
      )}
    </div>
  )
}
