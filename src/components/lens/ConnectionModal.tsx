import { useEffect, useMemo, useState } from 'react'
import { Loader2, Waypoints, UserCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AuthorLine } from '@/components/social/AuthorLine'
import { useAuthStore } from '@/stores/authStore'
import { useFollowsStore } from '@/stores/followsStore'
import { useLensStore, requestScores } from '@/stores/lensStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { fetchConnectors, fetchSecondHop } from '@/lib/nostr/connectors'
import { ordinal } from '@/lib/utils'

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
      <DialogContent className="border-edge bg-dialog sm:max-w-lg">
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
          <div className="space-y-3">
            {direct && (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300">
                <UserCheck className="h-4 w-4 shrink-0" /> You follow them directly — 1st degree.
              </p>
            )}

            {loading && !connectors.length && !deepening ? (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Reading contact lists…</p>
            ) : connectors.length ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  {connectors.length === 1 ? '1 person you follow' : `${connectors.length} people you follow`} also follow{connectors.length === 1 ? 's' : ''} them
                </p>
                <div className="space-y-2">
                  {connectors.slice(0, 8).map((pk) => (
                    <div key={pk} className="rounded-lg border border-edge bg-panel p-2.5">
                      <AuthorLine pubkey={pk} size="xs" showDegree={false} />
                    </div>
                  ))}
                  {connectors.length > 8 && (
                    <p className="text-[11px] text-neutral-600">+{connectors.length - 8} more</p>
                  )}
                </div>
                <p className="text-[11px] text-neutral-600">
                  These are your connection to them. If the target is unwanted, the weak link is here — open a connector's profile to unfollow, mute, or report.
                </p>
              </>
            ) : deepening ? (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Looking one hop deeper…</p>
            ) : bridges.length ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  {connectorCount === 1 ? '1 person you follow connects' : `${connectorCount} people you follow connect`} through {bridges.length === 1 ? '1 account' : `${bridges.length} accounts`} who follow them
                </p>
                <div className="space-y-2">
                  {bridges.slice(0, 6).map(({ middle, count }) => (
                    <div key={middle} className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-panel p-2.5">
                      <div className="min-w-0 flex-1"><AuthorLine pubkey={middle} size="xs" showDegree={false} /></div>
                      <span className="shrink-0 text-[11px] text-neutral-500">{count} of your follows</span>
                    </div>
                  ))}
                  {bridges.length > 6 && (
                    <p className="text-[11px] text-neutral-600">+{bridges.length - 6} more bridges</p>
                  )}
                </div>
                <p className="text-[11px] text-neutral-600">
                  These accounts bridge your follows to them (you → a follow → a bridge → them).{' '}
                  {connectorCount > 8
                    ? 'They are broadly connected to your network — there is no single weak link to cut.'
                    : 'To cut the connection, unfollow the bridging follows or mute a bridge.'}
                </p>
              </>
            ) : (
              <p className="rounded-lg border border-dashed border-edge px-3 py-8 text-center text-sm text-neutral-500">
                {direct
                  ? 'No one else you follow follows them.'
                  : `No verifiable path within two hops${hops != null && hops > 0 ? ` (your lens puts them at ${ordinal(hops)} degree)` : ''}. The connection runs deeper, or the relays queried don't index it. The full chain is left to a graph node.`}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
