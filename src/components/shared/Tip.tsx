import type { ReactNode } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

/**
 * Hover/focus tooltip in place of a native `title` attribute. Wraps one
 * element (`asChild`, so the child keeps its own tag and classes). An empty
 * label renders the child alone.
 */
export function Tip({ label, side = 'top', className, children }: {
  label?: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  children: ReactNode
}) {
  if (!label) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className={className}>{label}</TooltipContent>
    </Tooltip>
  )
}
