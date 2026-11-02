/**
 * Every way to point at a draft or a release: the native NIP-19 address and
 * its page, and the NIP-SHORT address and its page when the event carries a
 * verified code. The short forms are what the address bar shows and what the
 * share buttons use; the native forms always exist.
 */
import type { Event as NostrEvent } from 'nostr-tools'
import { draftNaddr, releaseNevent, type Draft, type Release } from './nipps'
import { shareableShortAddress, verifiedShortAddress } from './nipShort'

export interface PostLinks {
  event: NostrEvent
  /** `naddr1…` for a draft, `nevent1…` for a release. */
  nativeAddress: string
  /** Site path for the native address, e.g. `/release/nevent1…`. */
  nativePath: string
  nativeUrl: string
  /** `s…` when the event carries a verified short code, else null. */
  shortAddress: string | null
  shortPath: string | null
  shortUrl: string | null
  /** The short URL when there is one, else the native one. */
  bestUrl: string
}

/** The site's base path without a trailing slash: '' on the custom domain, '/<repo>' on a project page. */
export function siteBase(): string {
  return (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
}

function build(event: NostrEvent, nativeAddress: string, nativePath: string, shortAddress: string | null): PostLinks {
  const origin = window.location.origin + siteBase()
  const shortPath = shortAddress ? `/${shortAddress}` : null
  const nativeUrl = origin + nativePath
  const shortUrl = shortPath ? origin + shortPath : null
  return { event, nativeAddress, nativePath, nativeUrl, shortAddress, shortPath, shortUrl, bestUrl: shortUrl ?? nativeUrl }
}

export function draftLinks(draft: Draft): PostLinks {
  const naddr = draftNaddr(draft.pubkey, draft.uuid)
  return build(draft.event, naddr, `/draft/${naddr}`, verifiedShortAddress(draft.event))
}

export function releaseLinks(release: Release): PostLinks {
  const nevent = releaseNevent(release.id, release.pubkey)
  return build(release.event, nevent, `/release/${nevent}`, verifiedShortAddress(release.event))
}

/**
 * The same links with a collision selector on the short address if the author
 * has another event on the same code. One bounded relay query; falls back to
 * the base address when relays do not answer.
 */
export async function withSelector(links: PostLinks, relays: string[]): Promise<PostLinks> {
  if (!links.shortAddress) return links
  const exact = await shareableShortAddress(relays, links.event)
  if (!exact || exact === links.shortAddress) return links
  return build(links.event, links.nativeAddress, links.nativePath, exact)
}
