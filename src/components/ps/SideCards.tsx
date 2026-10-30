import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { AuthorLine } from '@/components/social/AuthorLine'
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

/** Who published it, and when. */
export function AuthorCard({ pubkey, at, title = 'Author' }: { pubkey: string; at?: number; title?: string }) {
  return (
    <Card title={title}>
      <AuthorLine pubkey={pubkey} at={at} size="md" />
    </Card>
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
