import { useEffect, useState } from 'react'
import { Loader2, ChevronLeft, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { signAndPublish, type PublishStatus } from '@/lib/nostr/publish'
import { PublishPhase } from '@/components/shared/PublishPhase'
import { buildClaimEvent, parseAddress, CLAIM_ROLES, HANDLER_KIND, REPO_KIND, type Claim, type ClaimRole, type Release } from '@/lib/nostr/nipps'
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

/** What each role means, shown under the picker so the choice is not a guess. */
const ROLE_HINT: Record<ClaimRole, string> = {
  client: 'An app people use directly: web, desktop, or mobile.',
  relay: 'A relay that accepts, stores, or serves the events the spec defines.',
  library: 'An SDK or package other software builds on.',
  service: 'Anything else that runs on behalf of users: an indexer, bot, bridge, signer, media server, DVM, trust provider, or hosted API.',
}

/**
 * Publish or update an adoption claim (kind 30851). An implementer may hold
 * several on one proposal, one per piece of software, each addressable on
 * its own: with existing claims the dialog opens on a picker (update one, or
 * add another), and the form keeps a back button to it. "Withdraw"
 * republishes a claim with a `withdrawn` tag rather than deleting it.
 */
export function ClaimDialog({
  open, onOpenChange, release, versions, mine = [], initial = null, onPublished,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** The release the dialog was opened from; the default target. */
  release: Release
  /** Every version of the proposal, newest first; lets the claim point at any of them. */
  versions?: Release[]
  /** The viewer's own claims on this proposal. */
  mine?: Claim[]
  /** A claim to open straight on, skipping the picker (a tile's Edit). */
  initial?: Claim | null
  onPublished?: () => void
}) {
  const pubkey = useAuthStore((s) => s.pubkey)
  // Which claim the form edits (null: a new one), and whether the picker is showing.
  const [existing, setExisting] = useState<Claim | null>(null)
  const [stage, setStage] = useState<'pick' | 'form'>('form')
  const canGoBack = mine.length > 0 && !initial
  useEffect(() => {
    if (!open) return
    if (initial) { setExisting(initial); setStage('form') }
    else if (mine.length > 0) { setExisting(null); setStage('pick') }
    else { setExisting(null); setStage('form') }
    // Decided once per opening; `mine` refreshing underneath must not bounce the user back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])
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
  const [phase, setPhase] = useState<PublishStatus | null>(null)
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

  // The tag carries `kind:pubkey:d`; the field takes an naddr, which is what developers have on hand.
  const handlerCoord = role === 'client' && handler.trim() ? parseAddress(handler, HANDLER_KIND) : null
  const repoCoord = role === 'library' && repo.trim() ? parseAddress(repo, REPO_KIND) : null
  const handlerBad = role === 'client' && !!handler.trim() && !handlerCoord
  const repoBad = role === 'library' && !!repo.trim() && !repoCoord

  const publish = async (withdrawn: boolean) => {
    if (!name.trim()) { toast.error('Name the software'); return }
    if (handlerBad) { toast.error(`The handler must be an naddr of a kind ${HANDLER_KIND} event`); return }
    if (repoBad) { toast.error(`The repository must be an naddr of a kind ${REPO_KIND} event`); return }
    setBusy(withdrawn ? 'withdraw' : 'save')
    const event = buildClaimEvent({
      release: target,
      role,
      name,
      implVersion: implVersion || undefined,
      urls: urls.split('\n').map((u) => u.trim()).filter(Boolean),
      claimId: existing?.claimId,
      handler: handlerCoord ?? undefined,
      relay: role === 'relay' ? relay || undefined : undefined,
      repo: repoCoord ?? undefined,
      scope: partial ? 'partial' : 'full',
      content: notes,
      withdrawn,
    })
    const res = await signAndPublish(event, setPhase)
    setBusy(null); setPhase(null)
    if (!res.success) { toast.error(res.error || 'Failed to publish claim'); return }
    toast.success(withdrawn ? 'Claim withdrawn' : existing ? 'Claim updated' : 'Adoption claimed')
    onOpenChange(false)
    onPublished?.()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v) }}>
      <DialogContent className="border-edge bg-dialog sm:max-w-lg">
        {stage === 'pick' ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-foreground">Your adoption claims</DialogTitle>
              <DialogDescription className="text-neutral-400">
                On <span className="text-neutral-200">{release.title}</span>. One claim per piece of software: pick one to update or withdraw, or add another.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {mine.map((c) => (
                <button
                  key={c.coord}
                  type="button"
                  onClick={() => { setExisting(c); setStage('form') }}
                  className={cn('flex w-full items-center justify-between gap-3 rounded-lg border border-edge bg-panel px-3 py-2.5 text-left transition-colors hover:border-purple-500/40', c.withdrawn && 'opacity-60')}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-100">{c.name}{c.implVersion && <span className="ml-1 font-mono text-xs font-normal text-neutral-500">{c.implVersion}</span>}</span>
                    <span className="block text-[11px] text-neutral-500">
                      <span className="capitalize">{c.role}</span> · implements <span className="font-mono">v{c.version}</span>{c.scope === 'partial' && ' · partial'}{c.withdrawn && <span className="text-red-400"> · withdrawn</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">Edit</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setExisting(null); setStage('form') }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-edge px-3 py-2.5 text-sm text-neutral-300 transition-colors hover:border-purple-500/40 hover:text-purple-300"
              >
                <Plus className="h-4 w-4" /> New claim for other software
              </button>
            </div>
          </>
        ) : (
        <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            {canGoBack && (
              <button type="button" onClick={() => setStage('pick')} className="rounded-md p-1 text-neutral-400 hover:bg-edge hover:text-foreground" aria-label="Back to your claims">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {existing ? 'Update adoption claim' : 'Claim adoption'}
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            &quot;We implement <span className="text-neutral-200">{target.title} v{target.version}</span>.&quot; A claim is a statement by you. Publishing one does not make it true; others can review it.
            {existing && existing.version !== target.version && (
              <span className="mt-2 block rounded-md border border-purple-500/30 bg-purple-500/5 px-3 py-2 text-xs text-neutral-300">
                This claim points at <span className="font-mono">v{existing.version}</span>. Saving moves it to <span className="font-mono">v{target.version}</span>: the claim is replaced in place, not duplicated.
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
              <p className="text-[11px] text-neutral-600">Picking another version moves this claim; it does not add a second one.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300">Role</label>
            <div className="grid grid-cols-4 gap-1 rounded-lg border border-edge bg-panel p-1">
              {CLAIM_ROLES.map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)} className={cn('rounded-md px-2 py-1.5 text-xs capitalize transition-colors', role === r ? 'bg-panel-3 text-purple-300' : 'text-neutral-400 hover:text-neutral-200')}>{r}</button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-600">{ROLE_HINT[role]}</p>
            <p className="text-[11px] text-neutral-600">Best published by the software&apos;s maintainer. You may claim software you don&apos;t maintain, but say how you checked in the notes; a claim whose handler, repo, or relay your own key signs carries more weight.</p>
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
              <label className="text-xs font-medium text-neutral-300">NIP-89 handler naddr <span className="text-neutral-600">(optional)</span></label>
              <Input value={handler} onChange={(e) => setHandler(e.target.value)} placeholder="naddr1…" className={cn('border-edge bg-panel font-mono text-xs', handlerBad && 'border-red-500/60')} />
              <p className={cn('text-[11px]', handlerBad ? 'text-red-400' : 'text-neutral-600')}>
                {handlerBad
                  ? `Not an naddr of a kind ${HANDLER_KIND} event.`
                  : `The naddr of your app's kind ${HANDLER_KIND} handler event, the one NIP-89 clients show "open in" links for. Lets observed traffic be attributed to this client.`}
              </p>
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
              <label className="text-xs font-medium text-neutral-300">NIP-34 repository naddr <span className="text-neutral-600">(optional)</span></label>
              <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="naddr1…" className={cn('border-edge bg-panel font-mono text-xs', repoBad && 'border-red-500/60')} />
              <p className={cn('text-[11px]', repoBad ? 'text-red-400' : 'text-neutral-600')}>
                {repoBad
                  ? `Not an naddr of a kind ${REPO_KIND} event.`
                  : `The naddr of the repository's kind ${REPO_KIND} announcement, as published by ngit or gitworkshop.dev. Names the exact codebase, not just a project name.`}
              </p>
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
          <PublishPhase status={phase} />
          <Button onClick={() => publish(false)} disabled={!!busy} className="bg-purple-600 text-white hover:bg-purple-700">
            {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {existing ? 'Save' : 'Publish claim'}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  )
}
