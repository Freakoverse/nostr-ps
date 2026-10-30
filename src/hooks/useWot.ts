import { useMemo } from 'react'
import { useWotStore, type WotContext } from '@/stores/wotStore'

/**
 * Local web-of-trust filter (follows + public mutes). Kept from the original
 * client but not wired into NIP-PS surfaces: the lens (docs/CLIENT-LENS.md)
 * uses NIP-85 trusted-assertion providers instead. Retained so it can be
 * offered as a graph-viewpoint source later.
 */
function useWotFilterFor(context: WotContext, applied: boolean) {
  const threshold = useWotStore((s) => s.settings.scoreThreshold)
  const depth = useWotStore((s) => s.settings.followDepth)
  const dnnBonus = useWotStore((s) => s.settings.dnnBonus)
  const lastUpdated = useWotStore((s) => s.lastUpdated)

  return useMemo(() => {
    if (!applied) return <T extends { pubkey: string }>(items: T[]) => items
    const shouldHide = useWotStore.getState().shouldHide
    return <T extends { pubkey: string }>(items: T[]) => items.filter((m) => !shouldHide(m.pubkey, context))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, applied, threshold, depth, dnnBonus, lastUpdated])
}

/** WoT filter for comments. */
export function useWotCommentFilter(): <T extends { pubkey: string }>(items: T[]) => T[] {
  return useWotFilterFor('comments', useWotStore((s) => s.settings.applyComments))
}

/** How many of these items are low-trust (would be hidden by WoT). */
export function useWotHiddenCount(items: { pubkey: string }[]): number {
  const threshold = useWotStore((s) => s.settings.scoreThreshold)
  const depth = useWotStore((s) => s.settings.followDepth)
  const dnnBonus = useWotStore((s) => s.settings.dnnBonus)
  const lastUpdated = useWotStore((s) => s.lastUpdated)

  return useMemo(() => {
    const isLowTrust = useWotStore.getState().isLowTrust
    let n = 0
    for (const m of items) if (isLowTrust(m.pubkey)) n++
    return n
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, threshold, depth, dnnBonus, lastUpdated])
}
