import { useMemo, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import type { Release } from '@/lib/nostr/nipps'
import { diffLines, diffStats, toChunks, type DiffLine } from '@/lib/diff'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ReleaseRow } from './Cards'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/shared/Tip'

/**
 * A version list with a diff control between each adjacent pair: "+a −r"
 * (lines added / removed going from the older to the newer version), which
 * opens a wide modal with the change itself. Versions are newest first.
 */
export function VersionList({ versions, currentId }: { versions: Release[]; currentId?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {versions.map((v, i) => (
        <div key={v.id} className="flex flex-col gap-1">
          <ReleaseRow r={v} current={v.id === currentId} />
          {i < versions.length - 1 && <DiffBetween older={versions[i + 1]} newer={v} />}
        </div>
      ))}
    </div>
  )
}

function DiffBetween({ older, newer }: { older: Release; newer: Release }) {
  const [open, setOpen] = useState(false)
  const lines = useMemo(() => diffLines(older.content, newer.content), [older.content, newer.content])
  const stats = useMemo(() => diffStats(lines), [lines])
  const metaChanged = older.title !== newer.title || (older.summary ?? '') !== (newer.summary ?? '')
  const nothing = stats.added === 0 && stats.removed === 0 && !metaChanged

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-0.5">
        <span className="h-3 w-px bg-edge" />
        <Tip label={nothing ? 'No text changes between these versions' : `Changes from v${older.version} to v${newer.version}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={nothing}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-[11px] transition-colors',
            nothing ? 'cursor-default border-edge text-neutral-600' : 'border-edge text-neutral-400 hover:border-purple-500/40 hover:text-neutral-200',
          )}
        >
          <ChevronsUpDown className="h-3 w-3" />
          {nothing ? 'no change' : (
            <>
              <span className="text-emerald-400">+{stats.added}</span>
              <span className="text-red-400">−{stats.removed}</span>
              {metaChanged && <span className="text-neutral-500">· meta</span>}
            </>
          )}
        </button>
        </Tip>
      </div>
      {open && <DiffDialog open={open} onOpenChange={setOpen} older={older} newer={newer} lines={lines} />}
    </>
  )
}

function DiffDialog({ open, onOpenChange, older, newer, lines }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  older: Release
  newer: Release
  lines: DiffLine[]
}) {
  const [full, setFull] = useState(false)
  const chunks = useMemo(() => (full ? [{ kind: 'lines' as const, lines }] : toChunks(lines)), [lines, full])
  const stats = diffStats(lines)
  const titleChanged = older.title !== newer.title
  const summaryChanged = (older.summary ?? '') !== (newer.summary ?? '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 border-edge bg-dialog sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-foreground">
            <span className="font-mono text-neutral-400">v{older.version}</span>
            <span className="text-neutral-600">→</span>
            <span className="font-mono">v{newer.version}</span>
            <span className="ml-2 font-mono text-sm"><span className="text-emerald-400">+{stats.added}</span> <span className="text-red-400">−{stats.removed}</span></span>
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            Line changes in the spec text. {newer.title}
          </DialogDescription>
        </DialogHeader>

        {(titleChanged || summaryChanged) && (
          <div className="space-y-1 rounded-md border border-edge bg-panel p-3 text-xs">
            {titleChanged && (
              <p><span className="text-neutral-500">Title: </span><span className="text-red-400 line-through">{older.title}</span> <span className="text-emerald-400">{newer.title}</span></p>
            )}
            {summaryChanged && (
              <div className="space-y-0.5">
                <p className="text-neutral-500">Summary:</p>
                {older.summary && <p className="text-red-400 line-through">{older.summary}</p>}
                {newer.summary && <p className="text-emerald-400">{newer.summary}</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>{lines.length.toLocaleString()} lines compared</span>
          <button type="button" onClick={() => setFull((v) => !v)} className="rounded px-2 py-0.5 hover:bg-panel-2 hover:text-neutral-200">
            {full ? 'Collapse unchanged' : 'Show whole text'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-edge bg-sunken font-mono text-xs leading-5">
          {chunks.map((c, i) => c.kind === 'gap' ? (
            <div key={i} className="border-y border-edge/60 bg-panel px-3 py-1 text-[11px] text-neutral-500">… {c.count} unchanged {c.count === 1 ? 'line' : 'lines'}</div>
          ) : (
            c.lines.map((l, k) => <Line key={`${i}:${k}`} line={l} />)
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Line({ line }: { line: DiffLine }) {
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
