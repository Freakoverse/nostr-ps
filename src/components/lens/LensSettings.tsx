import { useState } from 'react'
import { nip19 } from 'nostr-tools'
import { Eye, Plus, Trash2, RefreshCw, Network, Radar, RotateCcw, UserCheck, Loader2, ExternalLink, HelpCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cn, shortNpub } from '@/lib/utils'
import { useLensStore, DEFAULT_THRESHOLD } from '@/stores/lensStore'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModalStore } from '@/stores/loginModalStore'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

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

        <Button variant="outline" size="sm" onClick={() => { invalidate(); toast.success('Scores cleared; they refetch on the next page.') }} disabled={busy} className="gap-1.5 border-edge">
          <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} /> Clear cached scores
        </Button>
      </Card>

      <Card icon={Radar} title="How the default was chosen" description="Anonymous visitors look through the built-in providers, currently one Brainstorm instance. That is a default authority in structure; what keeps it a setting is that it is shown on every list and can be swapped or switched off here, without logging in. Trust is computed on the provider's side, never by walking follow lists in your browser.">
        <></>
      </Card>
    </div>
  )
}

/** The logged-in user's own provider, read from their kind 10040. */
function OwnProviderCard() {
  const myPubkey = useAuthStore((s) => s.pubkey)
  const own = useLensStore((s) => s.ownProvider)
  const sync = useLensStore((s) => s.syncOwnProvider)
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <Card icon={UserCheck} title="Your provider" description="Your own vantage point: the provider named in your kind 10040 event, which says “my ranks come from this key, at this relay”. This client reads that event; it never publishes one for you.">
      {!myPubkey ? (
        <Row label="Not logged in" description="Log in to use your own provider alongside the defaults.">
          <Button size="sm" variant="outline" onClick={() => useLoginModalStore.getState().open()} className="border-edge">Log in</Button>
        </Row>
      ) : own.state === 'checking' ? (
        <p className="flex items-center gap-2 text-sm text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" /> Checking your relays for a kind 10040…</p>
      ) : own.state === 'found' ? (
        <Row label="Your graph, scored by your provider" description={`${shortNpub(nip19.npubEncode(own.provider))}${own.relay ? ` · ${own.relay}` : ''}`}>
          <Button size="sm" variant="ghost" onClick={() => void sync(null).then(() => sync(myPubkey))} className="gap-1.5 text-neutral-400"><RefreshCw className="h-3.5 w-3.5" /> Re-check</Button>
        </Row>
      ) : (
        <Row label="Trust graph and provider not found" description="No kind 10040 on your relays. Until you have one, the lens uses the built-in providers only.">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => void sync(null).then(() => sync(myPubkey))} className="gap-1.5 text-neutral-400"><RefreshCw className="h-3.5 w-3.5" /> Re-check</Button>
            <Button size="sm" variant="outline" onClick={() => setHelpOpen(true)} className="gap-1.5 border-edge"><HelpCircle className="h-3.5 w-3.5" /> How to get one</Button>
          </div>
        </Row>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="border-edge bg-dialog sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Getting your own provider</DialogTitle>
            <DialogDescription className="text-neutral-400">A provider computes trust from your vantage point and publishes it, so this client only has to read the result.</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-300">
            <li>Sign up with a provider that runs the computation for you. Brainstorm is one: it creates a “Brainstorm Assistant” key for your account that publishes kind 30382 assertions computed from your follows and mutes.</li>
            <li>Publish a kind 10040 event from your own key naming that assistant key and the relay it publishes to. The provider&apos;s site does this for you with your signer; it is one tag, <span className="font-mono text-xs">[&quot;30382:rank&quot;, &quot;&lt;assistant pubkey&gt;&quot;, &quot;&lt;relay&gt;&quot;]</span>.</li>
            <li>Come back and press Re-check. The row “Your provider” appears at the top of the list and is preferred when it has an opinion.</li>
          </ol>
          <p className="text-xs text-neutral-500">Your private key is never shared: it signs only the pointer. The assistant key is the provider&apos;s own and signs only scores.</p>
          <a href="https://brainstorm.world" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:underline">
            <ExternalLink className="h-4 w-4" /> brainstorm.world
          </a>
        </DialogContent>
      </Dialog>
    </Card>
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

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
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
