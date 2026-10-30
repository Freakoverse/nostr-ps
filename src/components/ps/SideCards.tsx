import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { ProfileCard } from '@/components/social/ProfileCard'
import { TrustBadge } from '@/components/lens/TrustBadge'
import { Tip } from '@/components/shared/Tip'
import { PowBadge } from '@/components/shared/PowBadge'
import { formatRelativeTime, formatTimestamp } from '@/lib/utils'
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
 * identity, bio, follow, menu), plus one row of facts about this post:
 * proof of work, the author's trust score under your lens, and when it was
 * published.
 */
export function AuthorCard({ pubkey, at, eventId }: { pubkey: string; at?: number; eventId?: string; title?: string }) {
  return (
    <ProfileCard
      pubkey={pubkey}
      compact
      extra={
        <>
          {eventId && <PowBadge id={eventId} />}
          <TrustBadge pubkey={pubkey} />
          {at !== undefined && (
            <Tip label={formatTimestamp(at)}>
              <span className="text-xs text-neutral-500">published {formatRelativeTime(at)}</span>
            </Tip>
          )}
        </>
      }
    />
  )
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
