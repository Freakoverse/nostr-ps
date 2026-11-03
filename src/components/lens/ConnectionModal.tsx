import { useEffect, useState } from 'react'
import { Loader2, Waypoints, UserCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AuthorLine } from '@/components/social/AuthorLine'
import { useAuthStore } from '@/stores/authStore'
import { useFollowsStore } from '@/stores/followsStore'
import { useLensStore, requestScores } from '@/stores/lensStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { fetchConnectors } from '@/lib/nostr/connectors'
import { ordinal } from '@/lib/utils'

/**
 * How the viewer connects to `target`: the verifiable first hop. It reads the
 * viewer's contact list and finds which of those follows also follow the target
 * ("people you follow who also follow them"), straight from signed kind-3
 * events. The lens's degree (hops) is shown for context, but the chain itself is
 * not reconstructed past one hop — that needs a graph node (see CLIENT-LENS).
 */
export function ConnectionModal({ open, onOpenChange, target }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  target: string
}) {
  const me = useAuthStore((s) => s.pubkey)
  const hops = useLensStore((s) => s.scores[target]?.hops ?? null)
  const [loading, setLoading] = useState(false)
  const [direct, setDirect] = useState(false)
  const [connectors, setConnectors] = useState<string[]>([])

  useEffect(() => {
    if (!open || !me) return
    let cancelled = false
    setLoading(true)
    setConnectors([])
    setDirect(false)
    ;(async () => {
      await useFollowsStore.getState().loadContacts()
      if (cancelled) return
      const follows = (useFollowsStore.getState().contactEvent?.tags ?? [])
        .filter((t) => t[0] === 'p' && t[1])
        .map((t) => t[1])
      setDirect(follows.includes(target))
      const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
      const cs = await fetchConnectors(relays, follows, target).catch(() => [] as string[])
      if (cancelled) return
      setConnectors(cs)
      if (cs.length) void requestScores(cs)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, me, target])

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
            Below is the one hop this client verifies itself — people you follow who also follow them, read from signed contact lists. A longer chain is not reconstructed here.
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

            {loading ? (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Reading contact lists…</p>
            ) : connectors.length ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  {connectors.length === 1 ? '1 person you follow' : `${connectors.length} people you follow`} also follow{connectors.length === 1 ? 's' : ''} them
                </p>
                <div className="space-y-2">
                  {connectors.map((pk) => (
                    <div key={pk} className="rounded-lg border border-edge bg-panel p-2.5">
                      <AuthorLine pubkey={pk} size="xs" />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-600">
                  These are your connection to them. If the target is unwanted, the weak link is here — open a connector's profile to unfollow, mute, or report.
                </p>
              </>
            ) : (
              <p className="rounded-lg border border-dashed border-edge px-3 py-8 text-center text-sm text-neutral-500">
                {direct
                  ? 'No one else you follow follows them.'
                  : `None of the people you follow follow them directly${hops != null && hops > 0 ? `, so the connection runs deeper than one hop (your lens puts them at ${ordinal(hops)} degree)` : ''}. The full chain is not reconstructed here.`}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
