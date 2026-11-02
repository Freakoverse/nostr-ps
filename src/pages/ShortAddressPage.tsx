import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, Loader2, Circle, SearchX, GitFork } from 'lucide-react'
import type { Event as NostrEvent } from 'nostr-tools'
import { KINDS } from '@/lib/constants'
import { useSettingsStore } from '@/stores/settingsStore'
import { parseShortAddress, resolveShortAddress, selectorFor, formatShortAddress, shortCodeOf, type ShortStep } from '@/lib/nostr/nipShort'
import { parseDraft, parseRelease } from '@/lib/nostr/nipps'
import { DraftPage } from './DraftPage'
import { ReleasePage } from './ReleasePage'
import { NotFoundPage } from './NotFoundPage'
import { cn } from '@/lib/utils'

const STEPS: { id: ShortStep; label: string; detail: string }[] = [
  { id: 'parsing', label: 'Parsing address', detail: 'marker, author key, code, selector' },
  { id: 'querying', label: 'Querying relays', detail: 'by author and code' },
  { id: 'verifying', label: 'Verifying', detail: 'recomputing the code, checking the signature' },
  { id: 'rendering', label: 'Rendering', detail: 'showing the event' },
]

type State =
  | { status: 'working'; step: ShortStep; startedAt: Record<string, number> }
  | { status: 'resolved'; event: NostrEvent }
  | { status: 'ambiguous'; candidates: NostrEvent[] }
  | { status: 'not-found' }
  | { status: 'bad-address' }

/**
 * `/s<key36><code>`: resolve a NIP-SHORT address and render the draft or
 * release it names, keeping the short URL in the bar. The steps are shown
 * with elapsed times while relays answer, as the NIP recommends, so a direct
 * visit never looks stuck.
 */
export function ShortAddressPage() {
  const { short = '' } = useParams<{ short: string }>()
  const [state, setState] = useState<State>({ status: 'working', step: 'parsing', startedAt: { parsing: Date.now() } })
  const [now, setNow] = useState(Date.now())
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!parseShortAddress(short)) { setState({ status: 'bad-address' }); return }
    let cancelled = false
    const startedAt: Record<string, number> = { parsing: Date.now() }
    setState({ status: 'working', step: 'parsing', startedAt })
    timer.current = window.setInterval(() => setNow(Date.now()), 250)
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    void resolveShortAddress(relays, short, (step) => {
      if (cancelled) return
      startedAt[step] ??= Date.now()
      setState({ status: 'working', step, startedAt: { ...startedAt } })
    }).then((res) => {
      if (cancelled) return
      if (res.status === 'resolved') {
        startedAt.rendering ??= Date.now()
        setState({ status: 'resolved', event: res.event })
      } else setState(res.status === 'ambiguous' ? { status: 'ambiguous', candidates: res.candidates } : { status: res.status })
    })
    return () => { cancelled = true; if (timer.current) window.clearInterval(timer.current) }
  }, [short])

  useEffect(() => {
    if (state.status !== 'working' && timer.current) { window.clearInterval(timer.current); timer.current = null }
  }, [state.status])

  if (state.status === 'bad-address') return <NotFoundPage />

  if (state.status === 'resolved') {
    const ev = state.event
    if (ev.kind === KINDS.PS_DRAFT) return <DraftPage resolved={ev} />
    if (ev.kind === KINDS.PS_RELEASE) return <ReleasePage resolved={ev} />
    return (
      <Shell title="Not a draft or release">
        <p className="text-sm text-neutral-400">The address resolves to a kind {ev.kind} event, which this site does not display.</p>
      </Shell>
    )
  }

  if (state.status === 'not-found') {
    return (
      <Shell title="Nothing found for this address" icon={<SearchX className="h-5 w-5 text-neutral-500" />}>
        <p className="text-sm text-neutral-400">
          No relay you read from has an event by this author with this code. The author may publish to relays you do not read, the event may have been deleted, or the address may have a typo: a mistyped key decodes to a different author rather than failing.
        </p>
        <p className="break-all font-mono text-xs text-neutral-500">{short}</p>
      </Shell>
    )
  }

  if (state.status === 'ambiguous') {
    const parsed = parseShortAddress(short)!
    return (
      <Shell title="Two events share this address" icon={<GitFork className="h-5 w-5 text-amber-400" />}>
        <p className="text-sm text-neutral-400">The author has more than one event on this code and the address does not say which. Pick one; its link below carries the selector that makes it exact.</p>
        <div className="space-y-2">
          {state.candidates.map((c) => {
            const exact = formatShortAddress(parsed.pubkey, shortCodeOf(c) ?? parsed.code, selectorFor(c, state.candidates))
            const d = c.kind === KINDS.PS_DRAFT ? parseDraft(c) : null
            const r = c.kind === KINDS.PS_RELEASE ? parseRelease(c) : null
            const label = d ? `Draft: ${d.title}` : r ? `Release: ${r.title} v${r.version}` : `Kind ${c.kind} event`
            return (
              <Link key={c.id} to={`/${exact}`} className="block rounded-lg border border-edge bg-panel p-3 transition-colors hover:border-purple-500/40">
                <p className="text-sm font-medium text-neutral-100">{label}</p>
                <p className="mt-1 break-all font-mono text-[11px] text-neutral-500">{exact}</p>
              </Link>
            )
          })}
        </div>
      </Shell>
    )
  }

  // Working: the step list with elapsed times.
  const order = STEPS.findIndex((s) => s.id === state.step)
  return (
    <Shell title="Resolving short address" icon={<Loader2 className="h-5 w-5 animate-spin text-purple-400" />}>
      <ol className="space-y-2">
        {STEPS.map((s, i) => {
          const done = i < order
          const active = i === order
          const started = state.startedAt[s.id]
          const ended = done ? (state.startedAt[STEPS[i + 1]?.id] ?? now) : now
          const secs = started ? ((ended - started) / 1000).toFixed(1) : null
          return (
            <li key={s.id} className={cn('flex items-center gap-3 rounded-md border px-3 py-2', active ? 'border-purple-500/40 bg-panel' : done ? 'border-edge bg-panel' : 'border-edge/60 bg-panel/50 opacity-60')}>
              {done ? <Check className="h-4 w-4 text-emerald-400" /> : active ? <Loader2 className="h-4 w-4 animate-spin text-purple-400" /> : <Circle className="h-4 w-4 text-neutral-600" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-neutral-200">{s.label}</span>
                <span className="block text-[11px] text-neutral-500">{s.detail}</span>
              </span>
              {secs !== null && <span className="tabular-nums text-xs text-neutral-500">{secs}s</span>}
            </li>
          )
        })}
      </ol>
      <p className="break-all font-mono text-xs text-neutral-600">{short}</p>
    </Shell>
  )
}

function Shell({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-16">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-neutral-100">{icon}{title}</h1>
      {children}
    </div>
  )
}
