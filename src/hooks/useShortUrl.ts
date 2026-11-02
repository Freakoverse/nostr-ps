import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { parseShortAddress } from '@/lib/nostr/nipShort'
import { siteBase, withSelector, type PostLinks } from '@/lib/nostr/postLinks'

/**
 * Put the post's short address in the address bar.
 *
 * The page is routed by its native address, but the short one is what a reader
 * should see and copy, so once the event is in hand the bar is rewritten in
 * place with `replaceState`. The router listens to `popstate` only, so nothing
 * remounts; a reload lands on the short route, which resolves the address.
 *
 * The short form is shown at once, since verifying the code is local; the
 * relay check for a collision runs afterwards and appends a selector in the
 * rare case one is needed. The bar is only touched while it still shows this
 * post, so a navigation that happens mid-check wins.
 */
export function useShortUrl(links: PostLinks | null) {
  useEffect(() => {
    if (!links?.shortPath) return
    const base = siteBase()
    const onThisPost = () => {
      const path = window.location.pathname
      if (path === base + links.nativePath) return true
      const short = path.startsWith(base + '/s') ? parseShortAddress(path.slice(base.length + 1)) : null
      return !!short && short.pubkey === links.event.pubkey && links.shortAddress!.startsWith('s' + short.key36 + short.code)
    }
    const set = (path: string) => {
      const next = base + path + window.location.search + window.location.hash
      if (window.location.pathname !== base + path) window.history.replaceState(window.history.state, '', next)
    }
    if (!onThisPost()) return
    set(links.shortPath)

    let cancelled = false
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    void withSelector(links, relays).then((exact) => {
      if (!cancelled && exact.shortPath && exact.shortPath !== links.shortPath && onThisPost()) set(exact.shortPath)
    })
    return () => { cancelled = true }
  }, [links])
}
