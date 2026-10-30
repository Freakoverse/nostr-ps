import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Long body text, cut at `maxHeight` with a divider and a "View full" button.
 * Expanded, a sticky "View less" bar rides the bottom of the viewport so it
 * is reachable from anywhere in the text. Short content gets no control.
 */
export function CollapsibleBody({ children, maxHeight = 560, className }: { children: ReactNode; maxHeight?: number; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)

  // Measure the content, and keep measuring: markdown images and embeds load late.
  useEffect(() => {
    const el = inner.current
    if (!el) return
    const check = () => setOverflows(el.scrollHeight > maxHeight + 40)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [maxHeight])

  const collapse = () => {
    setExpanded(false)
    // Bring the top of the body back on screen if the reader is deep inside it.
    const top = wrap.current?.getBoundingClientRect().top ?? 0
    if (top < 0) wrap.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const clipped = overflows && !expanded

  return (
    <div ref={wrap} className={cn('relative', className)}>
      <div
        className={cn('relative', clipped && 'overflow-hidden')}
        style={clipped ? { maxHeight } : undefined}
      >
        <div ref={inner}>{children}</div>
      </div>

      {clipped && (
        <div className="mt-5 flex justify-center border-t border-edge-2 pt-5">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full max-w-md rounded-md border border-edge bg-panel-2 px-6 py-2.5 text-center text-sm font-medium text-neutral-100 transition-colors hover:border-purple-500/40 hover:bg-panel-3 hover:text-purple-300"
          >
            View full
          </button>
        </div>
      )}

      {overflows && expanded && (
        <>
        {/* The divider stays put under the text; only the button is sticky. */}
        <div className="mt-5 border-t border-edge-2" />
        <div className="sticky bottom-4 z-10 mt-5 flex justify-center">
          <button
            type="button"
            onClick={collapse}
            className="w-full max-w-md rounded-md border border-edge bg-panel-2/95 px-6 py-2.5 text-center text-sm font-medium text-neutral-100 shadow-lg backdrop-blur-sm transition-colors hover:border-purple-500/40 hover:bg-panel-3 hover:text-purple-300"
          >
            View less
          </button>
        </div>
        </>
      )}
    </div>
  )
}
