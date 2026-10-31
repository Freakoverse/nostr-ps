import { Link } from 'react-router-dom'
import { Eye, EyeOff, SlidersHorizontal, RotateCcw, ChevronDown, Pickaxe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/shared/Tip'
import { useLensStore, DEFAULT_THRESHOLD } from '@/stores/lensStore'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu'

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
  const toggleSource = useLensStore((s) => s.toggleSource)
  const own = useLensStore((s) => s.ownProvider)
  const myPubkey = useAuthStore((s) => s.pubkey)
  const rawFloorOn = useSettingsStore((s) => s.rawPowFloor)
  const rawFloorBits = useSettingsStore((s) => s.powFilterDifficulty)
  const setRawFloor = useSettingsStore((s) => s.setRawPowFloor)
  const active = sources.filter((s) => s.enabled)

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-edge bg-panel px-3 py-2 text-xs', className)}>
      {/* Lens menu: one switch for the whole lens, one per source, and a way to the full settings. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-panel-2" aria-label="Lens options">
            {enabled ? <Eye className="h-3.5 w-3.5 text-purple-400" /> : <EyeOff className="h-3.5 w-3.5 text-neutral-500" />}
            <span className="font-medium text-neutral-200">Lens</span>
            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', enabled ? 'bg-purple-500/15 text-purple-300' : 'bg-panel-2 text-neutral-500')}>
              {enabled ? `${active.length} on` : 'off'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 border-edge bg-panel">
          <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => setEnabled(!enabled)} className="cursor-pointer justify-between">
            <span className="flex items-center gap-2">
              {enabled ? <Eye className="h-4 w-4 text-purple-400" /> : <EyeOff className="h-4 w-4 text-neutral-500" />}
              <span className="font-medium">Lens</span>
              <span className="text-xs text-neutral-500">{enabled ? 'on' : 'off, raw view'}</span>
            </span>
            <Switch checked={enabled} onCheckedChange={setEnabled} onClick={(e) => e.stopPropagation()} aria-label="Toggle the whole lens" />
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-edge" />
          <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Sources</DropdownMenuLabel>
          {sources.length === 0 && <p className="px-2 py-1.5 text-xs text-neutral-500">No sources yet.</p>}
          {/* Logged in without a kind 10040: show the row they would have, disabled, pointing at Manage. */}
          {myPubkey && own.state === 'missing' && (
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="justify-between gap-3 opacity-70" disabled>
              <span className="min-w-0">
                <span className="block truncate text-sm">Your provider</span>
                <span className="block text-[11px] text-neutral-500">none yet, set one up under Manage</span>
              </span>
              <Switch checked={false} disabled aria-label="Your provider (none)" />
            </DropdownMenuItem>
          )}
          {myPubkey && own.state === 'checking' && (
            <p className="px-2 py-1.5 text-[11px] text-neutral-500">Checking your kind 10040…</p>
          )}
          {sources.map((s) => (
            <DropdownMenuItem
              key={s.id}
              onSelect={(e) => e.preventDefault()}
              onClick={() => toggleSource(s.id)}
              className={cn('cursor-pointer justify-between gap-3', !enabled && 'opacity-60')}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm">{s.label}</span>
                <span className="block text-[11px] text-neutral-500">{s.own ? 'your provider, from your kind 10040' : 'NIP-85 provider'}</span>
              </span>
              <Switch checked={s.enabled} onCheckedChange={(v) => toggleSource(s.id, v)} onClick={(e) => e.stopPropagation()} aria-label={`Toggle ${s.label}`} />
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-edge" />
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to="/settings?tab=lens"><SlidersHorizontal className="mr-2 h-4 w-4" /> Manage sources and threshold</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
          : `Off: raw view. Every claim counts, nothing is weighted.`}
      </div>

      {/* §6.5 floor: visible here so the raw view is one click from having a cost. */}
      <Tip label={rawFloorOn ? `Claims and reviews under ${rawFloorBits} bits of proof of work are ignored. Change the bits in Settings › Preferences.` : `Off: every claim and review counts regardless of proof of work. On: ignore anything under ${rawFloorBits} bits.`}>
        <label className="flex cursor-pointer items-center gap-2 text-neutral-500">
          <Pickaxe className={cn('h-3.5 w-3.5', rawFloorOn ? 'text-purple-400' : 'text-neutral-600')} />
          <span>PoW floor{rawFloorOn ? ` ${rawFloorBits}` : ''}</span>
          <Switch checked={rawFloorOn} onCheckedChange={setRawFloor} aria-label="Proof-of-work floor" className="scale-90" />
        </label>
      </Tip>

      {enabled && active.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-neutral-500">Threshold</span>
          <Slider min={0} max={100} step={5} value={[threshold]} onValueChange={([v]) => setThreshold(v)} className="w-24" />
          <span className="w-6 text-right tabular-nums text-neutral-200">{threshold}</span>
          {threshold !== DEFAULT_THRESHOLD && (
            <Tip label={`Reset to ${DEFAULT_THRESHOLD}`}>
              <button type="button" onClick={() => setThreshold(DEFAULT_THRESHOLD)} className="text-neutral-500 hover:text-neutral-200" aria-label={`Reset threshold to ${DEFAULT_THRESHOLD}`}>
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </Tip>
          )}
        </div>
      )}

      <Link to="/settings?tab=lens" className="inline-flex items-center gap-1 text-neutral-400 hover:text-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" /> Edit
      </Link>
    </div>
  )
}
