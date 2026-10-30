/**
 * Generic event builders (profile, lists, comments, deletion, reports, site
 * config). NIP-PS kinds live in ./nipps.ts.
 *
 * All builders return UnsignedEvent objects ready to be signed.
 * pubkey is set to '': the signer fills it in.
 */

import type { Event as NostrEvent, UnsignedEvent } from 'nostr-tools'
import { KINDS, CLIENT_NAME } from '@/lib/constants'

const now = () => Math.floor(Date.now() / 1000)

// ─── Comment Events (kind 1111, NIP-22) ──────────────────────────────

export interface CommentEventParams {
  content: string
  rootEvent: { id: string; pubkey: string; kind: number; aTag?: string }
  replyTo?: { id: string; pubkey: string; kind: number; aTag?: string }
  /** Extra tags appended verbatim. */
  extraTags?: string[][]
}

export function buildCommentEvent(params: CommentEventParams): UnsignedEvent {
  const tags: string[][] = []

  // Root scope (uppercase tags). Addressable roots use `A`; everything else
  // uses `E` so the whole thread shares one root scope.
  if (params.rootEvent.aTag) {
    tags.push(['A', params.rootEvent.aTag])
  } else {
    tags.push(['E', params.rootEvent.id])
  }
  tags.push(['K', params.rootEvent.kind.toString()])
  tags.push(['P', params.rootEvent.pubkey])

  // Direct parent (lowercase tags)
  const parent = params.replyTo ?? params.rootEvent
  if (parent.aTag) {
    tags.push(['a', parent.aTag])
  } else {
    tags.push(['e', parent.id])
  }
  tags.push(['k', parent.kind.toString()])
  tags.push(['p', parent.pubkey])

  if (params.extraTags?.length) tags.push(...params.extraTags)

  return { kind: KINDS.COMMENT, content: params.content, tags, created_at: now(), pubkey: '' }
}

// ─── Metadata Event (kind 0) ────────────────────────────────────────

export interface ProfileMetadata {
  name?: string
  display_name?: string
  about?: string
  picture?: string
  banner?: string
  nip05?: string
  lud16?: string
  website?: string
  [key: string]: unknown
}

export function buildMetadataEvent(metadata: ProfileMetadata): UnsignedEvent {
  return { kind: KINDS.METADATA, content: JSON.stringify(metadata), tags: [], created_at: now(), pubkey: '' }
}

// ─── Relay List Event (kind 10002, NIP-65) ──────────────────────────

export interface RelayListEntry {
  url: string
  read: boolean
  write: boolean
}

export function buildRelayListEvent(relays: RelayListEntry[]): UnsignedEvent {
  const tags = relays.map(r => {
    if (r.read && r.write) return ['r', r.url]
    if (r.read) return ['r', r.url, 'read']
    return ['r', r.url, 'write']
  })
  return { kind: KINDS.RELAY_LIST, content: '', tags, created_at: now(), pubkey: '' }
}

// ─── Blossom Server List Event (kind 10063) ─────────────────────────

export function buildBlossomListEvent(serverUrls: string[]): UnsignedEvent {
  const tags = serverUrls.map(url => ['server', url])
  return { kind: KINDS.BLOSSOM_LIST, content: '', tags, created_at: now(), pubkey: '' }
}

// ─── Mute List Event (kind 10000, NIP-51) ───────────────────────────

/** Public mute list of blocked user pubkeys. */
export function buildMuteListEvent(pubkeys: string[]): UnsignedEvent {
  const tags = pubkeys.map(pk => ['p', pk])
  return { kind: KINDS.MUTE_LIST, content: '', tags, created_at: now(), pubkey: '' }
}

// ─── Deletion: Dual Mechanism ───────────────────────────────────────

/**
 * Step 1 (addressable events only): re-publish with same d-tag, created_at+1,
 * content cleared, only essential tags kept, ["deleted", "true"] appended.
 */
export function buildDeletedEvent(
  originalEvent: NostrEvent,
  essentialTagNames: string[] = ['d', 'published_at'],
): UnsignedEvent {
  const essentialTags = originalEvent.tags.filter(t => essentialTagNames.includes(t[0]))
  essentialTags.push(['deleted', 'true'])
  return {
    kind: originalEvent.kind,
    content: '',
    tags: essentialTags,
    created_at: originalEvent.created_at + 1,
    pubkey: '',
  }
}

/**
 * Step 2: kind 5 deletion request. Addressable events are referenced by
 * coordinate (`a`), regular events by id (`e`).
 */
export function buildDeletionRequest(originalEvent: NostrEvent, reason?: string): UnsignedEvent {
  const isAddressable = originalEvent.kind >= 30000 && originalEvent.kind < 40000
  const tags: string[][] = []
  if (isAddressable) {
    const dTag = originalEvent.tags.find(t => t[0] === 'd')?.[1] ?? ''
    tags.push(['a', `${originalEvent.kind}:${originalEvent.pubkey}:${dTag}`])
  }
  tags.push(['e', originalEvent.id])
  tags.push(['k', String(originalEvent.kind)])
  return { kind: KINDS.DELETE, content: reason ?? '', tags, created_at: now(), pubkey: '' }
}

/** Check if an addressable event has been soft-deleted (tombstoned). */
export function isDeleted(event: NostrEvent): boolean {
  return event.tags.some(t => t[0] === 'deleted' && t[1] === 'true')
}

// ─── Generic NIP-78 list event (kind 30078) ─────────────────────────

export function buildNip78ListEvent(dTag: string, tags: string[][]): UnsignedEvent {
  return { kind: KINDS.APP_DATA, content: '', tags: [['d', dTag], ...tags], created_at: now(), pubkey: '' }
}

// ─── Site Announcement (kind 30078, d: site-announcement) ───────────

export const ANNOUNCEMENT_DTAG = 'site-announcement'

export interface AnnouncementData {
  id: string
  content: string
  link?: string
  linkLabel?: string
  severity: 'info' | 'warning'
  /** True when there's nothing meaningful to show (cleared announcement). */
  isEmpty: boolean
}

export function buildAnnouncementEvent(
  content: string,
  opts: { link?: string; linkLabel?: string; severity?: 'info' | 'warning' } = {},
): UnsignedEvent {
  const tags: string[][] = [['d', ANNOUNCEMENT_DTAG]]
  if (opts.link?.trim()) tags.push(['link', opts.link.trim()])
  if (opts.linkLabel?.trim()) tags.push(['link-label', opts.linkLabel.trim()])
  tags.push(['severity', opts.severity === 'warning' ? 'warning' : 'info'])
  return { kind: KINDS.APP_DATA, content: content.trim(), tags, created_at: now(), pubkey: '' }
}

export function extractAnnouncement(event: NostrEvent): AnnouncementData {
  const get = (name: string) => event.tags.find(t => t[0] === name)?.[1]?.trim() || undefined
  const content = event.content.trim()
  const link = get('link')
  return {
    id: event.id,
    content,
    link,
    linkLabel: get('link-label'),
    severity: get('severity') === 'warning' ? 'warning' : 'info',
    isEmpty: !content && !link,
  }
}

// ─── Reports (kind 1984, NIP-56) ────────────────────────────────────

export type ReportType = 'spam' | 'impersonation' | 'malware' | 'illegal' | 'nsfw' | 'other'

export interface ReportParams {
  type: ReportType
  comment?: string
  /** The author/person involved (always set). */
  pubkey: string
  /** Reported event id (for content reports). */
  eventId?: string
  /** Addressable coordinate "kind:pubkey:dTag". */
  coord?: string
  /** Kind of the reported post (for relay-level filtering). */
  kind?: number
  /** Blossom blob hashes (malware reports) → x tags. */
  malwareHashes?: string[]
}

export function buildReportEvent(p: ReportParams): UnsignedEvent {
  const tags: string[][] = []
  // NIP-56: report type goes on the primary tag (e for content, p for a person).
  if (p.eventId) {
    tags.push(['e', p.eventId, p.type])
    if (p.coord) tags.push(['a', p.coord])
    tags.push(['p', p.pubkey])
  } else {
    tags.push(['p', p.pubkey, p.type])
  }
  if (p.kind != null) tags.push(['k', String(p.kind)])
  for (const h of p.malwareHashes ?? []) if (h.trim()) tags.push(['x', h.trim()])
  tags.push(['client', CLIENT_NAME])
  return { kind: KINDS.REPORT, content: p.comment?.trim() ?? '', tags, created_at: now(), pubkey: '' }
}
