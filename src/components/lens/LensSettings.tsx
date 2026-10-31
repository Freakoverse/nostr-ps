import { useState } from 'react'
import { nip19 } from 'nostr-tools'
import { Eye, Plus, Trash2, RefreshCw, Network, Radar, RotateCcw, UserCheck, Loader2, ExternalLink, HelpCircle, Pencil, Send } from 'lucide-react'
import type { Event as NostrEvent } from 'nostr-tools'
import { signAndPublish, type PublishStatus } from '@/lib/nostr/publish'
import { buildTrustProviderListEvent } from '@/lib/nostr/events'
import { PublishPhase } from '@/components/shared/PublishPhase'
import { toast } from 'sonner'
import { cn, shortNpub } from '@/lib/utils'
import { useLensStore, DEFAULT_THRESHOLD, type ProviderEntry } from '@/stores/lensStore'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useLoginModalStore } from '@/stores/loginModalStore'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

function decodePubkey(input: string): string | null {
  const s = input.trim()
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase()
  try {
    const d = nip19.decode(s)
    if (d.type === 'npub') return d.data
    if (d.type === 'nprofile') return d.data.pubkey
  } catch { /* fallthrough */ }
  return null
}

/** Settings → Lens: your own provider, the threshold, and the provider list. */
export function LensSettings() {
  const enabled = useLensStore((s) => s.enabled)
  const setEnabled = useLensStore((s) => s.setEnabled)
  const powFilterDifficulty = useSettingsStore((s) => s.powFilterDifficulty)
  const rawPowFloor = useSettingsStore((s) => s.rawPowFloor)
  const setRawPowFloor = useSettingsStore((s) => s.setRawPowFloor)
  const threshold = useLensStore((s) => s.threshold)
  const setThreshold = useLensStore((s) => s.setThreshold)
  const sources = useLensStore((s) => s.sources)
  const addSource = useLensStore((s) => s.addSource)
  const removeSource = useLensStore((s) => s.removeSource)
  const toggleSource = useLensStore((s) => s.toggleSource)
  const invalidate = useLensStore((s) => s.invalidate)
  const busy = useLensStore((s) => s.busy > 0)

  const [npub, setNpub] = useState('')
  const [label, setLabel] = useState('')
  const [relay, setRelay] = useState('')

  const add = () => {
    const pk = decodePubkey(npub)
    if (!pk) { toast.error('Enter the provider key as npub, nprofile, or hex'); return }
    const r = relay.trim()
    if (r && !/^wss?:\/\/\S+$/.test(r)) { toast.error('Relay must be a wss:// URL'); return }
    addSource({ pubkey: pk, label: label.trim(), relays: r ? [r] : undefined })
    setNpub(''); setLabel(''); setRelay('')
    toast.success('Provider added')
  }

  return (
    <div className="space-y-6">
      <OwnProviderCard />

      <Card icon={Eye} title="Lens" description="Every ranking is a viewpoint. Providers score the authors of claims and reviews; nothing is hidden, only folded. Turn it off to see the raw market.">
        <Row label="Enable lens" description="Off means every claim counts equally and nothing is weighted.">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </Row>
        <Row label="Proof-of-work floor in the raw view" description={`With the lens off, ignore claims and reviews with less than ${powFilterDifficulty} bits of proof of work (the content-filter difficulty in Preferences). Raises the cost of volume spam; it is a floor, not a defense. Off by default.`}>
          <Switch checked={rawPowFloor} onCheckedChange={setRawPowFloor} />
        </Row>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Threshold</label>
            <div className="flex items-center gap-2">
              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-sm text-muted-foreground">{threshold}</span>
              <button
                type="button"
                onClick={() => setThreshold(DEFAULT_THRESHOLD)}
                disabled={threshold === DEFAULT_THRESHOLD}
                className="flex shrink-0 items-center gap-1 text-xs text-neutral-500 transition-colors hover:text-neutral-300 disabled:cursor-default disabled:opacity-40"
              >
                <RotateCcw size={11} /> Reset
              </button>
            </div>
          </div>
          <Slider min={0} max={100} step={1} value={[threshold]} onValueChange={([v]) => setThreshold(v)} />
          <p className="mt-1.5 text-xs text-muted-foreground">Ranks run 0 to 100, normalised by each provider. Keys the provider&apos;s graph never reached carry no rank at all and show as unscored; muted or reported keys sit at 0. The default of {DEFAULT_THRESHOLD} therefore means &quot;vouched for at all&quot;, the anti-spam floor. Raise it to demand more than a toehold. The score filter on each list lets you view scored, low-scored, or unscored authors.</p>
        </div>
      </Card>

      <Card icon={Network} title="Providers" description="Each is a key that publishes NIP-85 trusted assertions (kind 30382) computed from one observer's vantage point. Scored in parallel and combined by maximum, so one provider vouching is enough to surface something.">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-edge bg-panel-2 px-3 py-2">
          <p className="text-xs text-neutral-400">Scores are cached for ten minutes, including "unscored" answers. Refresh after a provider has finished computing, or when its relay was slow and left authors unscored.</p>
          <Button variant="outline" size="sm" onClick={() => { invalidate(); toast.success('Scores cleared; they refetch as pages load.') }} disabled={busy} className="shrink-0 gap-1.5 border-edge">
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} /> Refresh scores now
          </Button>
        </div>
        <div className="divide-y divide-edge">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <Switch checked={s.enabled} onCheckedChange={(v) => toggleSource(s.id, v)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-200">{s.label}{s.own && <span className="ml-1.5 text-[11px] text-purple-300">from your kind 10040</span>}</p>
                <p className="truncate font-mono text-[11px] text-neutral-500">{nip19.npubEncode(s.pubkey)}{s.relays?.length ? ` · ${s.relays.join(', ')}` : ''}</p>
              </div>
              {!s.builtin ? (
                <button type="button" onClick={() => removeSource(s.id)} className="text-neutral-500 hover:text-red-400" aria-label="Remove provider"><Trash2 className="h-4 w-4" /></button>
              ) : <span className="w-4" />}
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-lg border border-edge bg-panel-2 p-3">
          <p className="text-xs font-medium text-neutral-300">Add a provider</p>
          <Input value={npub} onChange={(e) => setNpub(e.target.value)} placeholder="npub1… of the provider key (the key that signs the kind 30382 assertions)" className="border-edge bg-panel font-mono text-xs" />
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className="border-edge bg-panel" onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
            <Input value={relay} onChange={(e) => setRelay(e.target.value)} placeholder="Relay it publishes to, e.g. wss://nip85.brainstorm.world" className="border-edge bg-panel font-mono text-xs" onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
            <Button type="button" variant="outline" onClick={add} className="gap-1.5 border-edge"><Plus className="h-4 w-4" /> Add</Button>
          </div>
          <p className="text-[11px] text-neutral-500">
            A person&apos;s own npub is not a provider: nobody publishes assertions under their personal key. Use the assistant or service key an instance such as Brainstorm created for them.
          </p>
        </div>
      </Card>

      <Card icon={Radar} title="How the default was chosen" description="Anonymous visitors look through the built-in providers, currently one Brainstorm instance. That is a default authority in structure; what keeps it a setting is that it is shown on every list and can be swapped or switched off here, without logging in. Trust is computed on the provider's side, never by walking follow lists in your browser.">
        <></>
      </Card>
    </div>
  )
}

/** Services known to run the computation and publish kind 30382 for an account. Grows as instances appear. */
const PROVIDER_SERVICES: { name: string; url: string; note: string }[] = [
  { name: 'Brainstorm', url: 'https://brainstorm.world', note: 'Creates a "Brainstorm Assistant" key for your account and publishes your pointer (it calls it your Treasure Map).' },
]

/** The logged-in user's own providers, read from their kind 10040, with an editor that merges rather than overwrites. */
function OwnProviderCard() {
  const myPubkey = useAuthStore((s) => s.pubkey)
  const own = useLensStore((s) => s.ownProvider)
  const sources = useLensStore((s) => s.sources)
  const toggleSource = useLensStore((s) => s.toggleSource)
  const sync = useLensStore((s) => s.syncOwnProvider)
  const [helpOpen, setHelpOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const recheck = () => { if (myPubkey) void sync(null).then(() => sync(myPubkey)) }
  const ownRows = sources.filter((s) => s.own)

  return (
    <Card icon={UserCheck} title="Your providers" description="Your own vantage point: the providers named in your kind 10040 event, which says “my ranks come from these keys, at these relays”. NIP-85 allows several. This client reads that event, and only rewrites it when you press Publish in the editor below.">
      {!myPubkey ? (
        <Row label="Not logged in" description="Log in to use your own providers alongside the defaults.">
          <Button size="sm" variant="outline" onClick={() => useLoginModalStore.getState().open()} className="border-edge">Log in</Button>
        </Row>
      ) : own.state === 'checking' ? (
        <p className="flex items-center gap-2 text-sm text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" /> Checking your relays for a kind 10040…</p>
      ) : own.state === 'found' ? (
        <div className="divide-y divide-edge">
          {ownRows.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2">
              <Switch checked={s.enabled} onCheckedChange={(v) => toggleSource(s.id, v)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-200">{s.label}</p>
                <p className="truncate font-mono text-[11px] text-neutral-500">{shortNpub(nip19.npubEncode(s.pubkey))}{s.relays?.length ? ` · ${s.relays[0]}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Row label="Trust graph and provider not found" description="No kind 10040 on your relays. Until you have one, the lens uses the built-in providers only." />
      )}

      {myPubkey && own.state !== 'checking' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setManageOpen(true)} className="gap-1.5 border-edge"><Pencil className="h-3.5 w-3.5" /> Manage list</Button>
          <Button size="sm" variant="outline" onClick={() => setHelpOpen(true)} className="gap-1.5 border-edge"><HelpCircle className="h-3.5 w-3.5" /> {own.state === 'found' ? 'Get another provider' : 'How to get one'}</Button>
          <Button size="sm" variant="ghost" onClick={recheck} className="gap-1.5 text-neutral-400"><RefreshCw className="h-3.5 w-3.5" /> Re-check</Button>
        </div>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="border-edge bg-dialog sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Getting a provider</DialogTitle>
            <DialogDescription className="text-neutral-400">A provider computes trust from your vantage point and publishes it, so this client only has to read the result.</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-300">
            <li>Sign up with a service that runs the computation for you. It creates a key of its own for your account, which will sign your kind 30382 assertions.</li>
            <li>Publish your kind 10040 pointer naming that key and the relay it publishes to, one tag per provider: <span className="font-mono text-xs">[&quot;30382:rank&quot;, &quot;&lt;provider pubkey&gt;&quot;, &quot;&lt;relay&gt;&quot;]</span>. The service does this with your signer. If you already have a pointer from another service, use Manage list here instead, so the new entry is added to it rather than replacing it.</li>
            <li>Come back and press Re-check.</li>
          </ol>
          <div className="space-y-2">
            {PROVIDER_SERVICES.map((p) => (
              <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 rounded-md border border-edge bg-panel px-3 py-2 text-sm hover:border-purple-500/40">
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                <span><span className="text-neutral-200">{p.name}</span> <span className="text-neutral-500">· {p.note}</span></span>
              </a>
            ))}
          </div>
          <p className="text-xs text-neutral-500">Your private key is never shared: it signs only the pointer. The provider&apos;s key signs only scores.</p>
        </DialogContent>
      </Dialog>

      {manageOpen && myPubkey && (
        <ProviderListEditor
          open={manageOpen}
          onOpenChange={setManageOpen}
          existing={own.state === 'found' || own.state === 'missing' ? own.event : null}
          initial={own.state === 'found' ? own.providers : []}
          onPublished={recheck}
        />
      )}
    </Card>
  )
}

/**
 * Edit the kind 10040 provider list: add or remove `30382:rank` entries and
 * republish, merging into the existing event so entries other services wrote
 * (other result types, a private encrypted list) survive.
 */
function ProviderListEditor({ open, onOpenChange, existing, initial, onPublished }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  existing: NostrEvent | null
  initial: ProviderEntry[]
  onPublished: () => void
}) {
  const [entries, setEntries] = useState<ProviderEntry[]>(initial)
  const [npub, setNpub] = useState('')
  const [relay, setRelay] = useState('')
  const [phase, setPhase] = useState<PublishStatus | null>(null)
  const busy = phase !== null && phase !== 'done' && phase !== 'error'
  const changed = JSON.stringify(entries) !== JSON.stringify(initial)

  const add = () => {
    const pk = decodePubkey(npub)
    if (!pk) { toast.error('Enter the provider key as npub, nprofile, or hex'); return }
    const r = relay.trim()
    if (r && !/^wss?:\/\/\S+$/.test(r)) { toast.error('Relay must be a wss:// URL'); return }
    if (entries.some((e) => e.provider === pk)) { toast.error('Already in the list'); return }
    setEntries([...entries, { provider: pk, relay: r || undefined }])
    setNpub(''); setRelay('')
  }

  const publish = async () => {
    if (entries.length === 0 && !existing) { toast.error('Add at least one provider'); return }
    const event = buildTrustProviderListEvent(existing, entries)
    const res = await signAndPublish(event, setPhase)
    setPhase(null)
    if (!res.success) { toast.error(res.error || 'Failed to publish'); return }
    toast.success('Provider list published')
    onOpenChange(false)
    onPublished()
  }

  const preview = buildTrustProviderListEvent(existing, entries)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v) }}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 border-edge bg-dialog sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Your provider list (kind 10040)</DialogTitle>
          <DialogDescription className="text-neutral-400">
            The event your key signs to name who computes your trust. Publishing replaces your current one, but this editor merges: entries for other result types and any private list are carried over unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Rank providers</p>
            {entries.length === 0 ? (
              <p className="rounded-md border border-dashed border-edge px-3 py-4 text-center text-sm text-neutral-500">None yet.</p>
            ) : entries.map((e) => (
              <div key={e.provider} className="flex items-center gap-3 rounded-md border border-edge bg-panel px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-neutral-200">{nip19.npubEncode(e.provider)}</p>
                  <p className="truncate font-mono text-[11px] text-neutral-500">{e.relay ?? 'no relay given'}</p>
                </div>
                <button type="button" onClick={() => setEntries(entries.filter((x) => x.provider !== e.provider))} className="text-neutral-500 hover:text-red-400" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-lg border border-edge bg-panel-2 p-3">
            <p className="text-xs font-medium text-neutral-300">Add a provider</p>
            <Input value={npub} onChange={(e) => setNpub(e.target.value)} placeholder="npub1… of the provider key that signs your kind 30382" className="border-edge bg-panel font-mono text-xs" />
            <div className="flex gap-2">
              <Input value={relay} onChange={(e) => setRelay(e.target.value)} placeholder="wss://… relay it publishes to" className="border-edge bg-panel font-mono text-xs" onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
              <Button type="button" variant="outline" onClick={add} className="gap-1.5 border-edge"><Plus className="h-4 w-4" /> Add</Button>
            </div>
          </div>

          <details className="rounded-lg border border-edge bg-panel p-3 text-xs">
            <summary className="cursor-pointer text-neutral-300">Exactly what will be signed ({preview.tags.length} tags{existing?.content ? ', private list kept' : ''})</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-sunken p-2 font-mono text-[11px] text-neutral-300">{JSON.stringify(preview.tags, null, 1)}</pre>
          </details>
        </div>

        <DialogFooter className="items-center gap-2">
          <PublishPhase status={phase} className="mr-auto" />
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="border-edge">Cancel</Button>
          <Button onClick={publish} disabled={busy || !changed} className="gap-2 bg-purple-600 text-white hover:bg-purple-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Card({ icon: Icon, title, description, children }: { icon: typeof Eye; title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-edge bg-panel p-4">
      <div className="flex items-center gap-2">
        <Icon size={15} className="shrink-0 text-purple-400" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {description && <p className="text-xs leading-relaxed text-neutral-500">{description}</p>}
      <div className="space-y-4 pt-0.5">{children}</div>
    </div>
  )
}

function Row({ label, description, children }: { label: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-200">{label}</p>
        {description && <p className="text-xs text-neutral-500">{description}</p>}
      </div>
      {children}
    </div>
  )
}
