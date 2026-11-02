import { useMemo, useState } from 'react'
import { Archive, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react'
import { compareVersions, type Backup, type Release } from '@/lib/nostr/nipps'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AuthorLine } from '@/components/social/AuthorLine'
import { Tip } from '@/components/shared/Tip'

const ALL = 'all'

/**
 * An informative list of every backup of this proposal, grouped by version.
 * A backup is a signed copy of a release that anyone can publish, so the
 * release survives relay loss or a deletion request. A version column on the
 * left selects one version (or all); the right lists who backed it up and
 * whether their copy verifies. Purely read-only: nothing here acts.
 */
export function BackupListDialog({ open, onOpenChange, release, versions, backups, checked, cap = 5 }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** The release the page is showing; names the proposal in the header. */
  release: Release
  /** Every version of the proposal, so the column can be ordered and labelled. */
  versions: Release[]
  /** Every backup across all versions, each tagging the version it copies. */
  backups: Backup[]
  /** Whether the across-versions fetch has answered, so "none" is not asserted early. */
  checked?: boolean
  /** How many backups are fetched per version; a version at this count may have more. */
  cap?: number
}) {
  const [selected, setSelected] = useState<string>(ALL)

  const countOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of backups) m.set(b.releaseId, (m.get(b.releaseId) ?? 0) + 1)
    return m
  }, [backups])

  // Every version, newest first, with its backup count (zero included: a
  // version with no backup is the point worth seeing here).
  const column = useMemo(
    () => [...versions].sort((a, b) => compareVersions(b.version, a.version)).map((v) => ({ id: v.id, version: v.version, count: countOf.get(v.id) ?? 0 })),
    [versions, countOf],
  )

  const shown = useMemo(() => selected === ALL ? backups : backups.filter((b) => b.releaseId === selected), [backups, selected])
  const versionOf = (id: string) => versions.find((v) => v.id === id)?.version ?? '?'
  // A version at the fetch cap may have more backups than are shown.
  const atCap = useMemo(() => [...countOf.values()].some((c) => c >= cap), [countOf, cap])

  const tab = (id: string, label: string, count: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setSelected(id)}
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
        selected === id ? 'bg-panel-3 text-purple-300' : 'text-neutral-400 hover:bg-panel-2 hover:text-neutral-200',
      )}
    >
      <span className={id === ALL ? '' : 'font-mono'}>{label}</span>
      <span className={cn('tabular-nums text-xs', count === 0 ? 'text-neutral-600' : 'text-neutral-500')}>{count}</span>
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-edge bg-dialog sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground"><Archive className="h-5 w-5 text-purple-400" /> Backups</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Signed copies of <span className="text-neutral-200">{release.title || 'this release'}</span> that anyone has published, so a version survives relay loss or a deletion request. A verified copy can be rendered from its own version's page if the live event goes missing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
          {/* Version column; a chip row on phones. */}
          <div className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
            {tab(ALL, 'All versions', backups.length)}
            {column.map((v) => tab(v.id, `v${v.version}`, v.count))}
          </div>

          <div className="min-w-0 space-y-2">
            {shown.length === 0 ? (
              checked ? (
                <p className="rounded-lg border border-dashed border-edge px-3 py-10 text-center text-sm text-neutral-500">
                  {selected === ALL
                    ? 'No one has backed up any version yet. A deleted version with no backup cannot be recovered.'
                    : `No backup of v${versionOf(selected)}. If its event is deleted, its body cannot be recovered.`}
                </p>
              ) : (
                <p className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-edge px-3 py-10 text-center text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking relays for backups…
                </p>
              )
            ) : (
              shown.map((b) => (
                <div key={b.event.id} className="rounded-lg border border-edge bg-panel p-3">
                  <div className="flex items-start justify-between gap-3">
                    <AuthorLine pubkey={b.pubkey} at={b.event.created_at} size="xs" linked={false} />
                    <div className="flex shrink-0 items-center gap-2">
                      {selected === ALL && <span className="font-mono text-[11px] text-neutral-500">v{versionOf(b.releaseId)}</span>}
                      {b.release ? (
                        <Tip label="The embedded copy's id and signature check out, so this backup can be rendered.">
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 px-1.5 py-0.5 text-[11px] text-emerald-400"><ShieldCheck className="h-3 w-3" /> verified</span>
                        </Tip>
                      ) : (
                        <Tip label="This backup's embedded copy is missing or does not verify, so it cannot be rendered.">
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 px-1.5 py-0.5 text-[11px] text-amber-400"><ShieldAlert className="h-3 w-3" /> unverified</span>
                        </Tip>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            {checked && atCap && (
              <p className="pt-1 text-center text-[11px] text-neutral-600">Up to {cap} shown per version; a version at that count may have more.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
