import { Loader2, Pickaxe } from 'lucide-react'
import type { PublishStatus } from '@/lib/nostr/publish'
import { useSettingsStore } from '@/stores/settingsStore'
import { cn } from '@/lib/utils'

/**
 * What a publish is doing right now. Proof of work is named explicitly, with
 * the configured difficulty, since it is the slow part and otherwise looks
 * like a hang.
 */
export function PublishPhase({ status, className }: { status: PublishStatus | null; className?: string }) {
  const difficulty = useSettingsStore((s) => s.powDifficulty)
  if (!status || status === 'done' || status === 'error') return null
  const text = status === 'mining'
    ? `Proof of work, ${difficulty} bits…`
    : status === 'signing' ? 'Signing…' : 'Publishing to relays…'
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-neutral-400', className)}>
      {status === 'mining' ? <Pickaxe className="h-3.5 w-3.5 animate-pulse text-purple-400" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {text}
    </span>
  )
}
