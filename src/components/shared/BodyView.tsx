import { useState } from 'react'
import { Eye, Code } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Markdown } from './Markdown'
import { CollapsibleBody } from './CollapsibleBody'

type Mode = 'rendered' | 'source'

/**
 * A proposal/release body with a toggle above it to switch between the rendered
 * markdown ("Rendered") and the raw markdown source ("Markdown"). Both modes
 * share one CollapsibleBody, so the long-body clip and the expanded state carry
 * across a toggle.
 */
export function BodyView({ content }: { content: string }) {
  const [mode, setMode] = useState<Mode>('rendered')

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <div className="inline-flex gap-0.5 rounded-lg border border-edge bg-panel-2 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('rendered')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors',
              mode === 'rendered' ? 'bg-panel-3 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300',
            )}
          >
            <Eye className="h-3.5 w-3.5" /> Rendered
          </button>
          <button
            type="button"
            onClick={() => setMode('source')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors',
              mode === 'source' ? 'bg-panel-3 text-neutral-100' : 'text-neutral-500 hover:text-neutral-300',
            )}
          >
            <Code className="h-3.5 w-3.5" /> Markdown
          </button>
        </div>
      </div>

      <CollapsibleBody>
        {mode === 'rendered' ? (
          <Markdown content={content} className="text-[15px]" />
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-sunken p-4 font-mono text-[13px] leading-relaxed text-neutral-300">
            {content}
          </pre>
        )}
      </CollapsibleBody>
    </div>
  )
}
