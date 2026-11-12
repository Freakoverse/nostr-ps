/**
 * NIP-PS client: constants and configuration
 */

import relaysData from './relays.json'

// ─── Upload limits & accepted formats ───────────────────────────────

/** Accepted image upload formats. SVG is excluded — it can carry scripts (XSS). */
export const IMAGE_UPLOAD_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.avif'
/**
 * Accepted media attachments: images plus short video/audio.
 * Same SVG exclusion as above — it can carry scripts.
 */
export const SOCIAL_UPLOAD_ACCEPT = `${IMAGE_UPLOAD_ACCEPT},.mp4,.webm,.mov,.m4v,.mp3,.ogg,.wav`

export const StorageKey = {
  CURRENT_ACCOUNT: 'nip-ps:current-account',
  AUTH_METHOD: 'nip-ps:auth-method',
  // Legacy single NIP-46 client key (one slot, wiped on logout). Read only for a
  // one-time migration into the per-signer keys below; no longer written.
  BUNKER_KEY: 'nip-ps:bunker-key',
  // The active bunker session pointer: the bunker:// string of the current signer.
  BUNKER_STRING: 'nip-ps:bunker-string',
  // NIP-46 client key per signer, suffixed with the signer pubkey the bunker URL
  // addresses. One key per signer (survives logout) so re-login resumes the same
  // connection and policy instead of prompting again and piling up duplicates.
  BUNKER_CLIENT_KEY_PREFIX: 'nip-ps:bunker-client-key:',
  // NIP-LRS: the active local-signer session pointer {transportPubkey, accountPubkey, lastPort}.
  LRS_SIGNER: 'nip-ps:lrs-signer',
  // NIP-LRS: per-signer client key, suffixed with the signer's transport pubkey.
  // One key per signer (survives logout) so re-login is silent and never duplicates.
  LRS_CLIENT_KEY_PREFIX: 'nip-ps:lrs-client-key:',
  CLIENT_RELAYS: 'nip-ps:client-relays',
  CLIENT_BLOSSOMS: 'nip-ps:client-blossoms',
  USER_RELAYS: 'nip-ps:user-relays',
  USER_BLOSSOMS: 'nip-ps:user-blossoms',
  CUSTOM_RELAYS: 'nip-ps:custom-relays',
  CUSTOM_BLOSSOMS: 'nip-ps:custom-blossoms',
  DNN_NODES: 'nip-ps:dnn-nodes',
  USER_DNN_NODES: 'nip-ps:user-dnn-nodes',
  POW_DIFFICULTY: 'nip-ps:pow-difficulty',
  POW_FILTER_DIFFICULTY: 'nip-ps:pow-filter',
  RAW_POW_FLOOR: 'nip-ps:raw-pow-floor',
  HASH_RATE: 'nip-ps:hash-rate',
  BLOSSOM_UPLOAD_LIMIT_MB: 'nip-ps:blossom-upload-limit-mb',
  MEDIA_DOWNLOAD_LIMIT_MB: 'nip-ps:media-download-limit-mb',
  POSTING_BEHAVIOUR: 'nip-ps:posting-behaviour',
} as const

// ─── Encrypted (IndexedDB) store keys ───────────────────────────────

export const SECURE_KEYS = {
  UPV2_SESSION: 'upv2-session',
} as const

// ─── Operator ───────────────────────────────────────────────────────
//
// Optional operator key: signs the announcement banner (NIP-78). The lens does
// not use it; trust comes from NIP-85 providers (docs/CLIENT-LENS.md). Leave
// both empty to ship without a banner.

export const ADMIN_NPUB = ''
export const ADMIN_PUBKEY = ''
/** True when a deploying operator set a key above. */
export const HAS_OPERATOR = /^[0-9a-f]{64}$/.test(ADMIN_PUBKEY)

// ─── Client (NIP-89) ────────────────────────────────────────────────

/** This client's name, stamped on published events via a `client` tag. */
export const CLIENT_NAME = 'NIP-PS'

// ─── Nostr Event Kinds ──────────────────────────────────────────────

export const KINDS = {
  METADATA: 0,
  SHORT_NOTE: 1,
  CONTACTS: 3,
  DELETE: 5,
  COMMENT: 1111, // NIP-22
  REPORT: 1984, // NIP-56 reporting
  MUTE_LIST: 10000, // NIP-51 mute list (blocked users)
  RELAY_LIST: 10002,
  BLOSSOM_LIST: 10063,
  APP_DATA: 30078, // NIP-78 application-specific data (site config)
  TRUSTED_ASSERTION: 30382, // NIP-85, read-only here (lens)
  TRUSTED_PROVIDERS: 10040, // NIP-85 provider list

  // ── NIP-PS (docs/NIP-PS.md §4). Numbers marked provisional there. ──
  PS_DRAFT: 30817, // addressable, d = uuid
  PS_RELEASE: 8201, // regular, immutable, carries the spec id in `v`
  PS_BACKUP: 8202, // regular, wraps a signed release
  PS_CLAIM: 30851, // addressable, d = uuid, one per implementer per proposal
  PS_REVIEW: 30852, // addressable, d = target identifier
} as const

/** Single-letter tag carrying the NIP-PS spec id (`<uuid>:<version>`). */
export const PS_SPEC_ID_TAG = 'v'

// ─── Types ──────────────────────────────────────────────────────────

export interface RelayConfig {
  url: string
  read: boolean
  write: boolean
  enabled: boolean
  /** Pre-marked as NIP-50 search capable (defaults only; user relays use the probe). */
  search?: boolean
}

export interface BlossomConfig {
  url: string
  enabled: boolean
  /** Always included in uploads/failover, exempt from the per-list random cap. */
  pinned?: boolean
}

export interface DnnNodeConfig {
  url: string
  enabled: boolean
  healthy?: boolean
  lastChecked?: number
}

// ─── Defaults ───────────────────────────────────────────────────────

export const DEFAULT_RELAYS = relaysData as RelayConfig[]

export const DEFAULT_BLOSSOMS: BlossomConfig[] = [
  { url: 'https://blossom.primal.net', enabled: true },
  { url: 'https://blossom.data.haus', enabled: true },
  { url: 'https://nostr.download', enabled: true },
  { url: 'https://blossom.jumble.social', enabled: true },
  { url: 'https://blossom-01.uid.ovh', enabled: true },
  { url: 'https://blossom-02.uid.ovh', enabled: true },
  { url: 'https://blossom.ditto.pub', enabled: true },
]

export const DEFAULT_DNN_NODES: DnnNodeConfig[] = [
  { url: 'https://node.icannot.xyz', enabled: true },
]
