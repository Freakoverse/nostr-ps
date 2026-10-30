import { useState } from 'react'
import { nip19 } from 'nostr-tools'
import { Eye, Plus, Trash2, RefreshCw, Network, Radar } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useLensStore, type LensSourceType } from '@/stores/lensStore'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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

/** Settings → Lens: edit the trust sources, threshold and depth. */
export function LensSettings() {
  const enabled = useLensStore((s) => s.enabled)
  const setEnabled = useLensStore((s) => s.setEnabled)
  const threshold = useLensStore((s) => s.threshold)
  const setThreshold = useLensStore((s) => s.setThreshold)
  const graphDepth = useLensStore((s) => s.graphDepth)
  const setGraphDepth = useLensStore((s) => s.setGraphDepth)
  const sources = useLensStore((s) => s.sources)
  const addSource = useLensStore((s) => s.addSource)
  const removeSource = useLensStore((s) => s.removeSource)
  const toggleSource = useLensStore((s) => s.toggleSource)
  const setSourceType = useLensStore((s) => s.setSourceType)
  const invalidate = useLensStore((s) => s.invalidate)
  const busy = useLensStore((s) => s.busy > 0)

  const [npub, setNpub] = useState('')
  const [label, setLabel] = useState('')
  const [type, setType] = useState<LensSourceType>('nip85')

  const add = () => {
    const pk = decodePubkey(npub)
    if (!pk) { toast.error('Enter an npub, nprofile, or hex pubkey'); return }
    addSource({ type, pubkey: pk, label: label.trim() })
    setNpub(''); setLabel('')
    toast.success('Source added')
  }

  return (
    <div className="space-y-6">
      <Card icon={Eye} title="Lens" description="Every ranking is a viewpoint. These sources score the authors of claims and reviews; nothing is hidden, only folded. Turn it off to see the raw market.">
        <Row label="Enable lens" description="Off means every claim counts equally and nothing is weighted.">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </Row>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Threshold</label>
            <span className="rounded bg-secondary px-2 py-0.5 font-mono text-sm text-muted-foreground">{threshold}</span>
          </div>
          <Slider min={0} max={100} step={5} value={[threshold]} onValueChange={([v]) => setThreshold(v)} />
          <p className="mt-1.5 text-xs text-muted-foreground">Authors scoring below this are collapsed into a fold. Authors with no score are collapsed separately: unknown is not zero.</p>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Graph depth</label>
            <div className="flex rounded-lg border border-[#262626] bg-[#1c1c1c] p-0.5 text-xs">
              {([1, 2] as const).map((d) => (
                <button key={d} type="button" onClick={() => setGraphDepth(d)} className={cn('rounded-md px-2.5 py-1 transition-colors', graphDepth === d ? 'bg-[#2a2a2a] text-purple-300' : 'text-neutral-400 hover:text-neutral-200')}>{d === 1 ? 'Follows' : 'Follows of follows'}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">For graph sources: direct follows score 100, follows of follows 50, muted 0.</p>
        </div>
      </Card>

      <Card icon={Network} title="Sources" description="Scored in parallel and combined by maximum, so one source vouching is enough to surface something.">
        <div className="divide-y divide-[#262626]">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <Switch checked={s.enabled} onCheckedChange={(v) => toggleSource(s.id, v)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-200">{s.label}</p>
                <p className="truncate font-mono text-[11px] text-neutral-500">{nip19.npubEncode(s.pubkey)}</p>
              </div>
              <div className="flex rounded-md border border-[#262626] bg-[#1c1c1c] p-0.5 text-[11px]">
                {(['nip85', 'graph'] as LensSourceType[]).map((t) => (
                  <button key={t} type="button" onClick={() => setSourceType(s.id, t)} disabled={s.builtin} className={cn('rounded px-2 py-0.5 transition-colors disabled:opacity-50', s.type === t ? 'bg-[#2a2a2a] text-purple-300' : 'text-neutral-400 hover:text-neutral-200')}>
                    {t === 'nip85' ? 'provider' : 'graph'}
                  </button>
                ))}
              </div>
              {!s.builtin ? (
                <button type="button" onClick={() => removeSource(s.id)} className="text-neutral-500 hover:text-red-400" aria-label="Remove source"><Trash2 className="h-4 w-4" /></button>
              ) : <span className="w-4" />}
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-lg border border-[#262626] bg-[#212121] p-3">
          <p className="text-xs font-medium text-neutral-300">Add a source</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input value={npub} onChange={(e) => setNpub(e.target.value)} placeholder="npub1… of a NIP-85 provider key, or any person's npub" className="border-[#262626] bg-[#1c1c1c] font-mono text-xs" />
            <div className="flex rounded-lg border border-[#262626] bg-[#1c1c1c] p-0.5 text-xs">
              {(['nip85', 'graph'] as LensSourceType[]).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)} className={cn('rounded-md px-2.5 py-1 transition-colors', type === t ? 'bg-[#2a2a2a] text-purple-300' : 'text-neutral-400 hover:text-neutral-200')}>{t === 'nip85' ? 'Provider' : 'Graph'}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className="border-[#262626] bg-[#1c1c1c]" onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
            <Button type="button" variant="outline" onClick={add} className="gap-1.5 border-[#262626]"><Plus className="h-4 w-4" /> Add</Button>
          </div>
          <p className="text-[11px] text-neutral-500">
            <span className="text-neutral-300">Provider:</span> a service key publishing NIP-85 assertions (kind 30382), e.g. a Brainstorm instance. The key is one observer&apos;s perspective; adding it adopts that view.{' '}
            <span className="text-neutral-300">Graph:</span> any npub whose follows and mutes become the trusted set.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => { invalidate(); toast.success('Scores cleared; they refetch on the next page.') }} disabled={busy} className="gap-1.5 border-[#262626]">
          <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} /> Clear cached scores
        </Button>
      </Card>

      <Card icon={Radar} title="How the default was chosen" description="Anonymous visitors look through the operator's graph. That is a default authority in structure; what keeps it a setting is that it is shown on every list and can be swapped or switched off here, without logging in.">
        <></>
      </Card>
    </div>
  )
}

function Card({ icon: Icon, title, description, children }: { icon: typeof Eye; title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-[#262626] bg-[#1c1c1c] p-4">
      <div className="flex items-center gap-2">
        <Icon size={15} className="shrink-0 text-purple-400" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
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
