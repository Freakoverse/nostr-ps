import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2, Waypoints, User, ArrowDown } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AuthorLine } from '@/components/social/AuthorLine'
import { useAuthStore } from '@/stores/authStore'
import { useFollowsStore } from '@/stores/followsStore'
import { useLensStore, requestScores } from '@/stores/lensStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { fetchConnectors, fetchSecondHop } from '@/lib/nostr/connectors'
import { cn, ordinal } from '@/lib/utils'

/** A labelled downward edge between two nodes of the path — "↓ follow …". */
function Edge({ children, dashed = false }: { children: ReactNode; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1 pl-3 text-[11px] leading-tight text-neutral-500">
      <ArrowDown className={cn('h-3.5 w-3.5 shrink-0', dashed ? 'text-neutral-600' : 'text-purple-400/70')} />
      <span className="inline-flex items-center gap-1.5">{children}</span>
    </div>
  )
}

/**
 * How the viewer connects to `target`, reconstructed from signed kind-3 contact
 * lists only — no graph node. First the one verifiable hop (people you follow
 * who also follow them); if there is none, the two-hop path (someone you follow
 * who follows someone who follows them), which is the common case for a
 * 3rd-degree account. The lens's degree (hops) frames it; chains longer than two
 * hops fan out combinatorially and are left to a node (see CLIENT-LENS).
 */
export function ConnectionModal({ open, onOpenChange, target }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  target: string
}) {
  const me = useAuthStore((s) => s.pubkey)
  const hops = useLensStore((s) => s.scores[target]?.hops ?? null)
  const [loading, setLoading] = useState(false)
  const [deepening, setDeepening] = useState(false)
  const [direct, setDirect] = useState(false)
  const [connectors, setConnectors] = useState<string[]>([])
  const [second, setSecond] = useState<{ connector: string; middle: string }[]>([])

  useEffect(() => {
    if (!open || !me) return
    let cancelled = false
    setLoading(true)
    setDeepening(false)
    setConnectors([])
    setSecond([])
    setDirect(false)
    ;(async () => {
      await useFollowsStore.getState().loadContacts()
      if (cancelled) return
      const follows = (useFollowsStore.getState().contactEvent?.tags ?? [])
        .filter((t) => t[0] === 'p' && t[1])
        .map((t) => t[1])
      const isDirect = follows.includes(target)
      setDirect(isDirect)
      const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')

      const cs = await fetchConnectors(relays, follows, target).catch(() => [] as string[])
      if (cancelled) return
      setConnectors(cs)
      if (cs.length) void requestScores(cs)

      // No verifiable first hop and not a direct follow: try the second hop.
      if (!cs.length && !isDirect) {
        setDeepening(true)
        const paths = await fetchSecondHop(relays, follows, target).catch(() => [] as { connector: string; middle: string }[])
        if (cancelled) return
        setSecond(paths)
        const pks = [...new Set(paths.flatMap((p) => [p.connector, p.middle]))]
        if (pks.length) void requestScores(pks)
        setDeepening(false)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, me, target])

  // Two-hop paths summarised by bridge (the middle B): how many of the people
  // you follow reach the target through each one. These shared accounts are the
  // chokepoints — the weak links — so they lead, not a per-person wall.
  const bridges = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const { connector, middle } of second) {
      const s = m.get(middle) ?? new Set<string>()
      s.add(connector)
      m.set(middle, s)
    }
    return [...m.entries()]
      .map(([middle, set]) => ({ middle, count: set.size }))
      .sort((a, b) => b.count - a.count)
  }, [second])
  const connectorCount = useMemo(() => new Set(second.map((p) => p.connector)).size, [second])

  const degreeLine = hops != null && hops > 0
    ? `Your lens puts them at ${ordinal(hops)} degree.`
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-edge bg-dialog sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground"><Waypoints className="h-5 w-5 text-purple-400" /> How you connect</DialogTitle>
          <DialogDescription className="text-neutral-400">
            {degreeLine && <span className="text-neutral-300">{degreeLine} </span>}
            Reconstructed from signed contact lists — people you follow who follow them, or who connect to them one step further. Longer chains are left to a graph node.
          </DialogDescription>
        </DialogHeader>

        {!me ? (
          <p className="rounded-lg border border-dashed border-edge px-3 py-8 text-center text-sm text-neutral-500">Log in to see who connects you to this person.</p>
        ) : (
          <div className="space-y-1.5">
            {/* You — the start of every path. */}
            <div className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-2.5 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-purple-300"><User className="h-3.5 w-3.5" /></span>
              <span className="text-sm font-medium text-neutral-200">You</span>
            </div>

            {loading && !direct && !connectors.length && !bridges.length && !deepening ? (
              <Edge><Loader2 className="h-3 w-3 animate-spin" /> reading contact lists…</Edge>
            ) : direct ? (
              <Edge>follow them directly — 1st degree</Edge>
            ) : connectors.length ? (
              <>
                <Edge>follow {connectors.length === 1 ? 'this person' : `these ${connectors.length}`}, who follow them</Edge>
                {connectors.slice(0, 8).map((pk) => (
                  <div key={pk} className="rounded-lg border border-edge bg-panel p-2.5">
                    <AuthorLine pubkey={pk} size="xs" showDegree={false} />
                  </div>
                ))}
                {connectors.length > 8 && <p className="pl-1 text-[11px] text-neutral-600">+{connectors.length - 8} more</p>}
                <Edge>who follow</Edge>
              </>
            ) : deepening ? (
              <Edge><Loader2 className="h-3 w-3 animate-spin" /> looking one hop deeper…</Edge>
            ) : bridges.length ? (
              <>
                <Edge>follow {connectorCount === 1 ? '1 person' : `${connectorCount} people`} who follow {bridges.length === 1 ? 'this account' : `these ${bridges.length} accounts`}</Edge>
                {bridges.slice(0, 6).map(({ middle, count }) => (
                  <div key={middle} className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-panel p-2.5">
                    <div className="min-w-0 flex-1"><AuthorLine pubkey={middle} size="xs" showDegree={false} /></div>
                    <span className="shrink-0 text-[11px] text-neutral-500">via {count} of your follows</span>
                  </div>
                ))}
                {bridges.length > 6 && <p className="pl-1 text-[11px] text-neutral-600">+{bridges.length - 6} more bridges</p>}
                <Edge>who follow</Edge>
              </>
            ) : (
              <Edge dashed>
                no verifiable path within two hops{hops != null && hops > 0 ? ` (lens says ${ordinal(hops)} degree)` : ''} — runs deeper, or the relays queried don't index it
              </Edge>
            )}

            {/* Them — the person in question, the end of every path. */}
            <div className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/5 px-2.5 py-2">
              <div className="min-w-0 flex-1"><AuthorLine pubkey={target} size="sm" showDegree={false} /></div>
            </div>

            {(connectors.length > 0 || bridges.length > 0) && (
              <p className="pt-1 text-[11px] text-neutral-600">
                {connectors.length > 0
                  ? 'The accounts in the middle are your connection to them — if this person is unwanted, open a profile to unfollow, mute, or report.'
                  : connectorCount > 8
                    ? 'They are broadly connected to your network — there is no single weak link to cut.'
                    : 'The bridges are where the connection concentrates — unfollow a bridging follow, or mute a bridge, to cut it.'}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
