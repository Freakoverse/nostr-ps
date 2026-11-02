import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { ProfileCard } from '@/components/social/ProfileCard'
import { Tip } from '@/components/shared/Tip'
import { KindChips, TopicChips } from './Cards'
import type { KindRef } from '@/lib/nostr/nipps'

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-edge bg-panel p-3">
      <p className="flex items-center justify-between pb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
        {title}
        {right}
      </p>
      {children}
    </div>
  )
}

/**
 * Who published it: the same card as the profile page (banner, avatar,
 * identity, bio, follow, menu), plus the author's trust score under your
 * lens. Facts about the post itself live in PostFacts under the title.
 */
export function AuthorCard({ pubkey }: { pubkey: string }) {
  return <ProfileCard pubkey={pubkey} compact />
}

/** Kinds and topics, each saying "none" rather than disappearing. */
export function MetaCard({ kinds, topics }: { kinds: KindRef[]; topics: string[] }) {
  return (
    <div className="space-y-3">
      <Card title="Kinds">
        {kinds.length ? <KindChips kinds={kinds} max={20} expandable /> : <p className="text-xs text-neutral-600">none</p>}
      </Card>
      <Card title="Topics">
        {topics.length ? <TopicChips topics={topics} max={20} expandable /> : <p className="text-xs text-neutral-600">none</p>}
      </Card>
    </div>
  )
}

/** The human rendering of a release (spec §3), ready to paste into a README or claim. */
export function ReferenceCard({ label }: { label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(label)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Card
      title="Reference"
      right={
        <Tip label={copied ? 'Copied' : 'Copy'}>
          <button type="button" onClick={copy} aria-label="Copy reference" className="rounded p-1 normal-case text-neutral-500 hover:text-neutral-200">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </Tip>
      }
    >
      <button type="button" onClick={copy} className="w-full rounded-md border border-edge bg-sunken px-2.5 py-2 text-left font-mono text-[11px] leading-relaxed text-neutral-300 break-all transition-colors hover:border-purple-500/40">
        {label}
      </button>
      <p className="pt-2 text-[11px] text-neutral-600">How to say you implement this, in a README or changelog. Click to copy.</p>
    </Card>
  )
}

// ─── Share ──────────────────────────────────────────────────────────

const SHARE_TARGETS: { id: string; label: string; href: (url: string, text: string) => string }[] = [
  { id: 'x', label: 'X/Twitter', href: (url, text) => `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
  { id: 'facebook', label: 'Facebook', href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  { id: 'reddit', label: 'Reddit', href: (url, text) => `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}` },
]

/**
 * Share buttons for a post, all built on its short link when it has one (the
 * NIP-19 link otherwise). The link itself is shown underneath with a copy
 * button, so the reader sees exactly what the buttons will send.
 */
export function ShareCard({ url, text, isShort }: { url: string; text: string; isShort: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Card
      title="Share"
      right={
        <Tip label={copied ? 'Copied' : 'Copy link'}>
          <button type="button" onClick={copy} aria-label="Copy link" className="rounded p-1 normal-case text-neutral-500 hover:text-neutral-200">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </Tip>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {SHARE_TARGETS.map((t) => (
          <a
            key={t.id}
            href={t.href(url, text)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-edge bg-panel-2 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-purple-500/40 hover:text-purple-300"
          >
            {t.label}
          </a>
        ))}
      </div>
      <p className="mt-2 break-all font-mono text-[11px] text-neutral-500">{url}</p>
      <p className="mt-1 text-[11px] text-neutral-600">{isShort ? 'The short link, a NIP-SHORT address on this site.' : 'The NIP-19 link; this post has no short address.'}</p>
    </Card>
  )
}
