import { useEffect } from 'react'
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLensStore, requestScores } from '@/stores/lensStore'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

/**
 * Small trust pill for a pubkey: the combined lens score, coloured against the
 * threshold. Hover lists every source and what it said, so a score is never
 * an authority without a visible origin (CLIENT-LENS.md, "Badge and provenance").
 */
export function TrustBadge({ pubkey, className, compact = false }: { pubkey: string; className?: string; compact?: boolean }) {
  const enabled = useLensStore((s) => s.enabled)
  const threshold = useLensStore((s) => s.threshold)
  const sources = useLensStore((s) => s.sources)
  const score = useLensStore((s) => s.scores[pubkey])
  const anyEnabled = sources.some((s) => s.enabled)

  useEffect(() => {
    if (enabled && anyEnabled) void requestScores([pubkey])
  }, [pubkey, enabled, anyEnabled, sources])

  if (!enabled || !anyEnabled) return null

  const combined = score?.combined ?? null
  const state = combined === null ? 'unknown' : combined >= threshold ? 'above' : 'below'
  const Icon = state === 'above' ? ShieldCheck : state === 'below' ? ShieldAlert : ShieldQuestion

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
            state === 'above' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
            state === 'below' && 'border-red-500/40 bg-red-500/10 text-red-400',
            state === 'unknown' && 'border-[#333] bg-[#1f1f1f] text-neutral-500',
            className,
          )}
          aria-label={`Trust ${combined === null ? 'unknown' : combined}`}
        >
          <Icon className="h-3 w-3" />
          {!compact && (combined === null ? '?' : combined)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1 text-xs">
          <p className="font-medium text-neutral-200">
            {combined === null ? 'No score from any source' : `Trust ${combined} (threshold ${threshold})`}
          </p>
          {sources.filter((s) => s.enabled).map((s) => {
            const v = score?.per[s.id]
            return (
              <p key={s.id} className="flex items-center justify-between gap-4 text-neutral-400">
                <span className="truncate">{s.label} <span className="text-neutral-600">({s.type === 'nip85' ? 'provider' : 'graph'})</span></span>
                <span className="tabular-nums text-neutral-300">{v === null || v === undefined ? '—' : v}</span>
              </p>
            )
          })}
          {score && <p className="text-[10px] text-neutral-600">Fetched {Math.round((Date.now() - score.fetchedAt) / 60000)} min ago</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
