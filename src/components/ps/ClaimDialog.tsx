import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { signAndPublish } from '@/lib/nostr/publish'
import { buildClaimEvent, CLAIM_ROLES, type Claim, type ClaimRole, type Release } from '@/lib/nostr/nipps'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModalStore } from '@/stores/loginModalStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { LIMITS } from '@/lib/limits'
import { CharCounter, LimitCounter } from '@/components/shared/CharCounter'

/**
 * Publish or update an adoption claim (kind 30851). One live claim per
 * implementer per proposal: saving replaces whatever this pubkey said before,
 * and "Withdraw" republishes it with a `withdrawn` tag rather than deleting.
 */
export function ClaimDialog({
  open, onOpenChange, release, versions, existing, onPublished,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** The release the dialog was opened from; the default target. */
  release: Release
  /** Every version of the proposal, newest first; lets the claim point at any of them. */
  versions?: Release[]
  existing?: Claim | null
  onPublished?: () => void
}) {
  const pubkey = useAuthStore((s) => s.pubkey)
  const [role, setRole] = useState<ClaimRole>('client')
  const [name, setName] = useState('')
  const [implVersion, setImplVersion] = useState('')
  const [urls, setUrls] = useState('')
  const [handler, setHandler] = useState('')
  const [relay, setRelay] = useState('')
  const [repo, setRepo] = useState('')
  const [partial, setPartial] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState<'save' | 'withdraw' | null>(null)
  // Which version the claim will point at. Defaults to the page's release;
  // any version of the proposal can be chosen, since the claim is one per
  // proposal and moving it is a republish (spec §4.4).
  const [targetId, setTargetId] = useState(release.id)
  const choices = versions && versions.length ? versions : [release]
  const target = choices.find((v) => v.id === targetId) ?? release

  useEffect(() => {
    if (!open) return
    setTargetId(release.id)
    setRole(existing?.role ?? 'client')
    setName(existing?.name ?? '')
    setImplVersion(existing?.implVersion ?? '')
    setUrls((existing?.urls ?? []).join('\n'))
    setHandler(existing?.handler ?? '')
    setRelay(existing?.relay ?? '')
    setRepo(existing?.repo ?? '')
    setPartial(existing?.scope === 'partial')
    setNotes(existing?.content ?? '')
  }, [open, existing, release.id])

  if (open && !pubkey) {
    onOpenChange(false)
    useLoginModalStore.getState().open()
    return null
  }

  const publish = async (withdrawn: boolean) => {
    if (!name.trim()) { toast.error('Name the software'); return }
    setBusy(withdrawn ? 'withdraw' : 'save')
    const event = buildClaimEvent({
      release: target,
      role,
      name,
      implVersion: implVersion || undefined,
      urls: urls.split('\n').map((u) => u.trim()).filter(Boolean),
      handler: role === 'client' ? handler || undefined : undefined,
      relay: role === 'relay' ? relay || undefined : undefined,
      repo: role === 'library' ? repo || undefined : undefined,
      scope: partial ? 'partial' : 'full',
      content: notes,
      withdrawn,
    })
    const res = await signAndPublish(event)
    setBusy(null)
    if (!res.success) { toast.error(res.error || 'Failed to publish claim'); return }
    toast.success(withdrawn ? 'Claim withdrawn' : existing ? 'Claim updated' : 'Adoption claimed')
    onOpenChange(false)
    onPublished?.()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v) }}>
      <DialogContent className="border-edge bg-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">{existing ? 'Update adoption claim' : 'Claim adoption'}</DialogTitle>
          <DialogDescription className="text-neutral-400">
            &quot;We implement <span className="text-neutral-200">{target.title} v{target.version}</span>.&quot; A claim is a statement by you. Publishing one does not make it true; others can review it.
            {existing && existing.version !== target.version && (
              <span className="mt-2 block rounded-md border border-purple-500/30 bg-purple-500/5 px-3 py-2 text-xs text-neutral-300">
                Your current claim points at <span className="font-mono">v{existing.version}</span>. Saving moves it to <span className="font-mono">v{target.version}</span>: one claim per proposal, so the old one is replaced, not kept.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {choices.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300">Version you implement</label>
              <div className="flex flex-wrap gap-1 rounded-lg border border-edge bg-panel p-1">
                {choices.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setTargetId(v.id)}
                    className={cn('rounded-md px-2.5 py-1.5 font-mono text-xs transition-colors', target.id === v.id ? 'bg-panel-3 text-purple-300' : 'text-neutral-400 hover:text-neutral-200')}
                  >
                    v{v.version}
                    {existing?.releaseId === v.id && <span className="ml-1 font-sans text-[10px] text-neutral-500">current</span>}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-neutral-600">One claim per proposal. Picking another version moves the claim; it does not add a second one.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300">Role</label>
            <div className="grid grid-cols-4 gap-1 rounded-lg border border-edge bg-panel p-1">
              {CLAIM_ROLES.map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)} className={cn('rounded-md px-2 py-1.5 text-xs capitalize transition-colors', role === r ? 'bg-panel-3 text-purple-300' : 'text-neutral-400 hover:text-neutral-200')}>{r}</button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300">Software name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amethyst" className="border-edge bg-panel" maxLength={LIMITS.claimName} />
              <CharCounter value={name} max={LIMITS.claimName} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300">Software version <span className="text-neutral-600">(optional)</span></label>
              <Input value={implVersion} onChange={(e) => setImplVersion(e.target.value)} placeholder="1.4.0 or a commit" className="border-edge bg-panel" maxLength={LIMITS.claimVersion} />
              <CharCounter value={implVersion} max={LIMITS.claimVersion} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300">Links to source, commit, or release <span className="text-neutral-600">(one per line)</span></label>
            <Textarea value={urls} onChange={(e) => setUrls(e.target.value)} rows={2} placeholder="https://…" className="border-edge bg-panel" maxLength={LIMITS.claimUrls * (LIMITS.claimUrlLength + 1)} />
            <LimitCounter current={urls.split('\n').filter((u) => u.trim()).length} max={LIMITS.claimUrls} />
          </div>

          {role === 'client' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300">NIP-89 handler address <span className="text-neutral-600">(optional, 31990:pubkey:d)</span></label>
              <Input value={handler} onChange={(e) => setHandler(e.target.value)} placeholder="31990:…:…" className="border-edge bg-panel font-mono text-xs" />
              <p className="text-[11px] text-neutral-600">Lets observed traffic be attributed to this client.</p>
            </div>
          )}
          {role === 'relay' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300">Relay URL</label>
              <Input value={relay} onChange={(e) => setRelay(e.target.value)} placeholder="wss://…" className="border-edge bg-panel font-mono text-xs" />
              <p className="text-[11px] text-neutral-600">Sign this claim with the key the relay publishes in its NIP-11 document.</p>
            </div>
          )}
          {role === 'library' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300">NIP-34 repository address <span className="text-neutral-600">(optional, 30617:pubkey:d)</span></label>
              <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="30617:…:…" className="border-edge bg-panel font-mono text-xs" />
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-panel px-3 py-2">
            <div>
              <p className="text-sm text-neutral-200">Partial implementation</p>
              <p className="text-[11px] text-neutral-500">Say so if parts of the spec are missing. Explain in the notes.</p>
            </div>
            <Switch checked={partial} onCheckedChange={setPartial} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300">Notes <span className="text-neutral-600">(optional)</span></label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Scope, caveats, what is not supported yet." className="border-edge bg-panel" maxLength={LIMITS.claimNotes} />
            <CharCounter value={notes} max={LIMITS.claimNotes} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {existing && !existing.withdrawn ? (
            <Button variant="ghost" onClick={() => publish(true)} disabled={!!busy} className="text-red-400 hover:text-red-300">
              {busy === 'withdraw' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Withdraw claim
            </Button>
          ) : <span />}
          <Button onClick={() => publish(false)} disabled={!!busy} className="bg-purple-600 text-white hover:bg-purple-700">
            {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {existing ? 'Save' : 'Publish claim'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
