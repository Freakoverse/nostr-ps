import { useState } from 'react'
import { Archive, Loader2, ShieldCheck, ShieldX } from 'lucide-react'
import { toast } from 'sonner'
import { signAndPublish } from '@/lib/nostr/publish'
import { buildBackupEvent, type Release, type Backup } from '@/lib/nostr/nipps'
import { formatRelativeTime } from '@/lib/utils'
import { ItemMenu } from './ItemMenu'
import { useSettingsStore } from '@/stores/settingsStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * Explains what a backup (kind 8202, spec §4.3) does before publishing one:
 * a copy of the signed release wrapped in an event of your own, so the text
 * survives relay loss and the author's own deletion requests.
 */
export function BackupDialog({ open, onOpenChange, release, existing, onPublished, onDeleted }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  release: Release
  /** The viewer's own backup of this release, when one exists: the dialog then shows it instead of offering to publish. */
  existing?: Backup | null
  onPublished?: () => void
  onDeleted?: () => void
}) {
  const [busy, setBusy] = useState(false)

  if (existing) {
    const backupSize = new Blob([JSON.stringify(existing.event)]).size
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="border-edge bg-dialog sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground"><Archive className="h-5 w-5 text-purple-400" /> Your backup</DialogTitle>
            <DialogDescription className="text-neutral-400">
              A copy of <span className="text-neutral-200">{release.title} v{release.version}</span>, signed by you.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-edge bg-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1 text-sm">
                <p className="flex items-center gap-2 text-neutral-200">
                  {existing.release
                    ? <><ShieldCheck className="h-4 w-4 text-emerald-400" /> Verified copy</>
                    : <><ShieldX className="h-4 w-4 text-red-400" /> Copy does not verify</>}
                </p>
                <p className="text-xs text-neutral-500">
                  {existing.release
                    ? 'The embedded release matches the original id and signature byte for byte.'
                    : 'The embedded event does not match the release it claims to back up.'}
                </p>
              </div>
              <ItemMenu event={existing.event} mine noun="backup" title={`your backup of ${release.title} v${release.version}`} onDeleted={() => { onOpenChange(false); onDeleted?.() }} />
            </div>
            <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-neutral-500">Backup event</dt>
              <dd className="truncate font-mono text-neutral-300">{existing.event.id}</dd>
              <dt className="text-neutral-500">Backs up</dt>
              <dd className="truncate font-mono text-neutral-300">{existing.releaseId}</dd>
              <dt className="text-neutral-500">Published</dt>
              <dd className="text-neutral-300">{formatRelativeTime(existing.event.created_at)}</dd>
              <dt className="text-neutral-500">Size</dt>
              <dd className="text-neutral-300">{(backupSize / 1024).toFixed(1)} KB</dd>
            </dl>
          </div>
          <p className="text-xs text-neutral-500">The menu has the raw event. Deleting sends a NIP-09 request only; a backup is a regular event, so there is nothing to tombstone.</p>
        </DialogContent>
      </Dialog>
    )
  }

  const publish = async () => {
    setBusy(true)
    const relay = useSettingsStore.getState().getAllEnabledRelayUrls('write')[0]
    const res = await signAndPublish(buildBackupEvent(release.event, relay))
    setBusy(false)
    if (!res.success) { toast.error(res.error || 'Backup failed'); return }
    toast.success('Backup published')
    onOpenChange(false)
    onPublished?.()
  }

  const size = new Blob([JSON.stringify(release.event)]).size

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v) }}>
      <DialogContent className="border-edge bg-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground"><Archive className="h-5 w-5 text-purple-400" /> Back up this release</DialogTitle>
          <DialogDescription className="text-neutral-400">
            <span className="text-neutral-200">{release.title} v{release.version}</span>, {(size / 1024).toFixed(1)} KB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-neutral-300">
          <p>
            A backup is a copy of this release, signature included, wrapped inside a new event
            signed by you. Anyone can publish one; it does not need the author.
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-neutral-400">
            <li>The copy keeps the author&apos;s original signature, so any client can verify it is the exact release, byte for byte.</li>
            <li>It has its own event id under your key. If the author later asks relays to delete the release, your copy is unaffected, and this page falls back to it.</li>
            <li>It is public and attributed to you. It says nothing about whether you endorse the spec; use a review for that.</li>
            <li>One backup per person per release is enough. Backups from more people, on more relays, is what makes a release hard to lose.</li>
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="border-edge">Cancel</Button>
          <Button onClick={publish} disabled={busy} className="gap-2 bg-purple-600 text-white hover:bg-purple-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            Publish backup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
