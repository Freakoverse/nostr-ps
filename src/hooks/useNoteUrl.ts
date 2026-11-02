import { useEffect } from 'react'
import { nip19, type Event as NostrEvent } from 'nostr-tools'
import { useSettingsStore } from '@/stores/settingsStore'
import { shareableShortAddress, shortCodeOf, verifiedShortAddress } from '@/lib/nostr/nipShort'

/**
 * The best address for a note: its NIP-SHORT one if it carries a verified
 * code, with a collision selector if the author needs one, else an nevent.
 */
export async function noteAddress(event: NostrEvent): Promise<string> {
  const nevent = nip19.neventEncode({ id: event.id, author: event.pubkey })
  if (!shortCodeOf(event)) return nevent
  try {
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    return (await shareableShortAddress(relays, event)) || nevent
  } catch {
    return nevent
  }
}

/**
 * Give an open note its own URL, and take it back when the note closes.
 *
 * A note lives in a modal rather than a page, so without this the address bar
 * still says where the modal was opened from and there is nothing to copy or
 * reload. Restores whatever the URL was on close.
 */
export function useNoteUrl(open: boolean, event: NostrEvent | null | undefined) {
  useEffect(() => {
    if (!open || !event) return
    const previous = window.location.pathname + window.location.search
    let cancelled = false

    const nevent = nip19.neventEncode({ id: event.id, author: event.pubkey })
    const set = (address: string) => {
      const next = `/feed/note/${address}`
      if (window.location.pathname !== next) window.history.replaceState(null, '', next)
    }

    // The short address straight away, since verifying the code is local; the
    // relay check for a collision follows and appends a selector if needed.
    const optimistic = verifiedShortAddress(event)
    set(optimistic ?? nevent)
    noteAddress(event).then((address) => {
      if (!cancelled && address !== (optimistic ?? nevent)) set(address)
    })

    return () => {
      cancelled = true
      if (window.location.pathname.startsWith('/feed/note/')) {
        window.history.replaceState(null, '', previous)
      }
    }
  }, [open, event])
}
