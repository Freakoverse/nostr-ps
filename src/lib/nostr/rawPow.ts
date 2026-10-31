/**
 * Spec §6.5: an optional proof-of-work floor. When the user switches it on,
 * claims and reviews below the content-filter difficulty are ignored, in the
 * raw view and, if they keep it on, under a lens too. Off by default.
 */
import type { Event as NostrEvent } from 'nostr-tools'
import { countLeadingZeroBits } from '@/lib/pow/pow'
import { useSettingsStore } from '@/stores/settingsStore'

/** Current floor in bits: 0 unless the floor switch is on. */
export function rawPowFloor(): number {
  const s = useSettingsStore.getState()
  return s.rawPowFloor ? s.powFilterDifficulty : 0
}

export function passesRawPow(ev: NostrEvent, floor = rawPowFloor()): boolean {
  return floor <= 0 || countLeadingZeroBits(ev.id) >= floor
}
