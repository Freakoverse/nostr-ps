import { useMemo, useRef, useState } from 'react'
import { Eye, Pencil, ImagePlus, GitCompare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IMAGE_UPLOAD_ACCEPT } from '@/lib/constants'
import { diffLines, diffStats, toChunks, type DiffLine } from '@/lib/diff'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/shared/Markdown'
import { MarkdownToolbar } from '@/components/shared/MarkdownToolbar'
import { CharCounter } from '@/components/shared/CharCounter'
import { BlossomUploadField } from '@/components/upload/BlossomUploadField'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

type Mode = 'edit' | 'preview' | 'compare'

/** Markdown textarea with toolbar, preview toggle and Blossom image insert. */
export function MarkdownEditor({
  value, onChange, placeholder, minRows = 16, className, maxLength, compareWith,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minRows?: number
  className?: string
  /** Hard cap on the body; a counter appears as the text approaches it. */
  maxLength?: number
  /**
   * When set, a "Compare" mode diffs the current text against this baseline —
   * e.g. the already-published release being revised, so the author sees exactly
   * what this new version changes. Omit it and the button does not appear.
   */
  compareWith?: { content: string; label?: string }
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [mode, setMode] = useState<Mode>('edit')
  const [imageOpen, setImageOpen] = useState(false)

  const insertAtCursor = (text: string) => {
    const ta = ref.current
    if (!ta) { onChange(value + text); return }
    const start = ta.selectionStart ?? value.length
    const end = ta.selectionEnd ?? value.length
    const next = value.slice(0, start) + text + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = start + text.length
    })
  }

  const leftLabel = mode === 'preview' ? 'Preview' : mode === 'compare' ? 'Compare' : null

  return (
    <div className={cn('rounded-lg border border-edge bg-panel', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-2 py-1.5">
        {mode === 'edit'
          ? <MarkdownToolbar textareaRef={ref} value={value} onChange={onChange} />
          : <span className="px-1 text-xs text-neutral-500">{leftLabel}</span>}
        <div className="flex items-center gap-1">
          {mode === 'edit' && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setImageOpen(true)} className="h-7 gap-1 px-2 text-xs text-neutral-400">
              <ImagePlus className="h-3.5 w-3.5" /> Image
            </Button>
          )}
          {compareWith && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode((m) => (m === 'compare' ? 'edit' : 'compare'))}
              className={cn('h-7 gap-1 px-2 text-xs', mode === 'compare' ? 'text-purple-300' : 'text-neutral-400')}
            >
              {mode === 'compare' ? <><Pencil className="h-3.5 w-3.5" /> Edit</> : <><GitCompare className="h-3.5 w-3.5" /> Compare</>}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMode((m) => (m === 'preview' ? 'edit' : 'preview'))}
            className={cn('h-7 gap-1 px-2 text-xs', mode === 'preview' ? 'text-purple-300' : 'text-neutral-400')}
          >
            {mode === 'preview' ? <><Pencil className="h-3.5 w-3.5" /> Edit</> : <><Eye className="h-3.5 w-3.5" /> Preview</>}
          </Button>
        </div>
      </div>

      {mode === 'preview' ? (
        <div className="min-h-[200px] p-4">
          {value.trim() ? <Markdown content={value} /> : <p className="text-sm text-neutral-600">Nothing to preview.</p>}
        </div>
      ) : mode === 'compare' && compareWith ? (
        <CompareView baseContent={compareWith.content} baseLabel={compareWith.label} value={value} />
      ) : (
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={minRows}
          maxLength={maxLength}
          className="min-h-[300px] resize-y rounded-t-none border-0 bg-transparent font-mono text-[13px] leading-relaxed text-neutral-200"
        />
      )}
      {maxLength && mode === 'edit' && <div className="px-3 pb-2"><CharCounter value={value} max={maxLength} /></div>}

      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="border-edge bg-dialog sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Insert image</DialogTitle>
            <DialogDescription className="text-neutral-400">Uploads to your Blossom servers and inserts a markdown image at the cursor.</DialogDescription>
          </DialogHeader>
          <BlossomUploadField
            accept={IMAGE_UPLOAD_ACCEPT}
            label="Drop an image or click to browse"
            resetAfter
            onUploaded={(r) => {
              insertAtCursor(`\n![${r.filename ?? 'image'}](${r.url})\n`)
              setImageOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * The current spec text diffed against the published release it revises. The
 * baseline is the "old" side (what is already published) and the editor text is
 * the "new" side, so green is what this version adds and red what it drops.
 */
function CompareView({ baseContent, baseLabel, value }: { baseContent: string; baseLabel?: string; value: string }) {
  const [full, setFull] = useState(false)
  const lines = useMemo(() => diffLines(baseContent, value), [baseContent, value])
  const stats = useMemo(() => diffStats(lines), [lines])
  const chunks = useMemo(() => (full ? [{ kind: 'lines' as const, lines }] : toChunks(lines)), [lines, full])
  const unchanged = stats.added === 0 && stats.removed === 0
  const against = baseLabel ? `the published ${baseLabel}` : 'the published release'

  return (
    <div className="p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
        <span>
          Changes against <span className="text-neutral-300">{against}</span>
          {!unchanged && (
            <span className="ml-2 font-mono"><span className="text-emerald-400">+{stats.added}</span> <span className="text-red-400">−{stats.removed}</span></span>
          )}
        </span>
        {!unchanged && (
          <button type="button" onClick={() => setFull((v) => !v)} className="rounded px-2 py-0.5 hover:bg-panel-2 hover:text-neutral-200">
            {full ? 'Collapse unchanged' : 'Show whole text'}
          </button>
        )}
      </div>

      {unchanged ? (
        <p className="py-8 text-center text-sm text-neutral-600">
          Identical to {against} — no changes yet.
        </p>
      ) : (
        <div className="max-h-[480px] overflow-auto rounded-md border border-edge bg-sunken font-mono text-xs leading-5">
          {chunks.map((c, i) => c.kind === 'gap' ? (
            <div key={i} className="border-y border-edge/60 bg-panel px-3 py-1 text-[11px] text-neutral-500">… {c.count} unchanged {c.count === 1 ? 'line' : 'lines'}</div>
          ) : (
            c.lines.map((l, k) => <DiffRow key={`${i}:${k}`} line={l} />)
          ))}
        </div>
      )}
    </div>
  )
}

function DiffRow({ line }: { line: DiffLine }) {
  const cls = line.op === 'add'
    ? 'bg-emerald-500/10 text-emerald-200'
    : line.op === 'del'
      ? 'bg-red-500/10 text-red-200'
      : 'text-neutral-400'
  const mark = line.op === 'add' ? '+' : line.op === 'del' ? '−' : ' '
  return (
    <div className={cn('grid grid-cols-[3rem_3rem_1rem_1fr] gap-0 px-2', cls)}>
      <span className="select-none text-right pr-2 text-neutral-600">{line.a ?? ''}</span>
      <span className="select-none text-right pr-2 text-neutral-600">{line.b ?? ''}</span>
      <span className="select-none">{mark}</span>
      <span className="whitespace-pre-wrap break-words">{line.text || ' '}</span>
    </div>
  )
}
