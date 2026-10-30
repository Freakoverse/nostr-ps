import { Pickaxe } from 'lucide-react'
import { countLeadingZeroBits } from '@/lib/pow/pow'
import { Tip } from './Tip'
import { cn } from '@/lib/utils'

/**
 * Proof-of-work bits of an event (leading zero bits of its id, NIP-13).
 * Renders nothing for zero, since most events carry none.
 */
export function PowBadge({ id, className }: { id: string; className?: string }) {
  const bits = countLeadingZeroBits(id)
  if (bits <= 0) return null
  return (
    <Tip label={`Proof of work: ${bits} bits`}>
      <span className={cn('inline-flex items-center gap-1 rounded-full border border-edge px-1.5 py-0.5 font-mono text-[10px] text-neutral-400', className)}>
        <Pickaxe className="h-3 w-3" />{bits}
      </span>
    </Tip>
  )
}
