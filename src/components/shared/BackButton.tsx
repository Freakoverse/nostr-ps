import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "Back" for detail and form pages. Goes back in history when this tab has
 * somewhere to go back to, otherwise to `fallback` (a deep link or a fresh
 * tab has no history inside the app).
 */
export function BackButton({ fallback = '/', label = 'Back', className }: { fallback?: string; label?: string; className?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  // React Router stores the history index in state; 0 means this entry is the first in the tab.
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
  const canGoBack = idx > 0
  void location
  return (
    <button
      type="button"
      onClick={() => (canGoBack ? navigate(-1) : navigate(fallback))}
      className={cn('inline-flex items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-neutral-100', className)}
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  )
}
