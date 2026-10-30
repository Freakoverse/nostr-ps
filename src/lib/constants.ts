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
  BUNKER_KEY: 'nip-ps:bunker-key',
  BUNKER_STRING: 'nip-ps:bunker-string',
  PC55_CLIENT_KEY: 'nip-ps:pc55-client-key',
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
// The pubkey that publishes site-level config (announcement banner) and whose
// graph is the anonymous default viewpoint (docs/CLIENT-LENS.md). Replace with
// the deploying operator's key.

export const ADMIN_NPUB = 'npub17jl3ldd6305rnacvwvchx03snauqsg4nz8mruq0emj9thdpglr2sst825x'
export const ADMIN_PUBKEY = 'f4bf1fb5ba8be839f70c7331733e309f780822b311f63e01f9dc8abbb428f8d5'

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
