import { cn } from '@/lib/utils'

/** "current / max" in the corner; appears once `current` passes 80% of `max`, red at the cap. */
export function LimitCounter({ current, max, always = false, className }: { current: number; max: number; always?: boolean; className?: string }) {
  if (!always && current < max * 0.8) return null
  return (
    <p className={cn('text-right text-xs tabular-nums', current >= max ? 'text-red-400' : 'text-neutral-500', className)}>
      {current.toLocaleString()} / {max.toLocaleString()}
    </p>
  )
}

/** A character counter for a text field that only appears as the value approaches `max`. */
export function CharCounter({ value, max, always, className }: { value: string; max: number; always?: boolean; className?: string }) {
  return <LimitCounter current={value.length} max={max} always={always} className={className} />
}
