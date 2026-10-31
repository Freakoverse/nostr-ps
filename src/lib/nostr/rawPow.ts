/**
 * Spec §6.5: an optional proof-of-work floor for the raw view. When the lens
 * is off and the user switched the floor on, claims and reviews below the
 * content-filter difficulty are ignored. With a lens active the floor is 0,
 * since the providers do the work there. Off by default.
 */
import type { Event as NostrEvent } from 'nostr-tools'
import { countLeadingZeroBits } from '@/lib/pow/pow'
import { useSettingsStore } from '@/stores/settingsStore'
import { useLensStore } from '@/stores/lensStore'

/** Current floor in bits: 0 unless the raw-view floor is on and the lens is off. */
export function rawPowFloor(): number {
  const s = useSettingsStore.getState()
  if (!s.rawPowFloor) return 0
  if (useLensStore.getState().enabled) return 0
  return s.powFilterDifficulty
}

export function passesRawPow(ev: NostrEvent, floor = rawPowFloor()): boolean {
  return floor <= 0 || countLeadingZeroBits(ev.id) >= floor
}
