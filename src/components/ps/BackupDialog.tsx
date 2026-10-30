import { useState } from 'react'
import { Archive, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { signAndPublish } from '@/lib/nostr/publish'
import { buildBackupEvent, type Release } from '@/lib/nostr/nipps'
import { useSettingsStore } from '@/stores/settingsStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * Explains what a backup (kind 8202, spec §4.3) does before publishing one:
 * a copy of the signed release wrapped in an event of your own, so the text
 * survives relay loss and the author's own deletion requests.
 */
export function BackupDialog({ open, onOpenChange, release, onPublished }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  release: Release
  onPublished?: () => void
}) {
  const [busy, setBusy] = useState(false)

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
