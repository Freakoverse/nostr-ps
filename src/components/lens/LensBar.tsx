import { Link } from 'react-router-dom'
import { Eye, EyeOff, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLensStore } from '@/stores/lensStore'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'

/**
 * The always-visible viewpoint indicator (spec §6.2: the active viewpoint
 * MUST be displayed and MUST be changeable). Shows which sources are on, the
 * threshold, and a master switch. Full editing lives in Settings → Lens.
 */
export function LensBar({ className }: { className?: string }) {
  const enabled = useLensStore((s) => s.enabled)
  const setEnabled = useLensStore((s) => s.setEnabled)
  const threshold = useLensStore((s) => s.threshold)
  const setThreshold = useLensStore((s) => s.setThreshold)
  const sources = useLensStore((s) => s.sources)
  const active = sources.filter((s) => s.enabled)

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[#262626] bg-[#1c1c1c] px-3 py-2 text-xs', className)}>
      <div className="flex items-center gap-2">
        {enabled ? <Eye className="h-3.5 w-3.5 text-purple-400" /> : <EyeOff className="h-3.5 w-3.5 text-neutral-500" />}
        <span className="font-medium text-neutral-200">Lens</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Toggle lens" />
      </div>

      <div className="min-w-0 flex-1 truncate text-neutral-400">
        {enabled
          ? active.length === 0
            ? 'No sources enabled: raw view.'
            : <>Viewing as {active.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ', '}
                  <span className="text-neutral-200">{s.label}</span>
                </span>
              ))}</>
          : 'Off: raw view. Every claim counts, nothing is weighted.'}
      </div>

      {enabled && active.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-neutral-500">Threshold</span>
          <Slider min={0} max={100} step={5} value={[threshold]} onValueChange={([v]) => setThreshold(v)} className="w-24" />
          <span className="w-6 text-right tabular-nums text-neutral-200">{threshold}</span>
        </div>
      )}

      <Link to="/settings?tab=lens" className="inline-flex items-center gap-1 text-neutral-400 hover:text-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" /> Edit
      </Link>
    </div>
  )
}
