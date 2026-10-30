import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, GitFork, Users, ShieldCheck, ShieldX, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { draftNaddr, releaseNevent, type Draft, type Release, type ProposalSummary, type Claim, type Review } from '@/lib/nostr/nipps'
import { AuthorLine } from '@/components/social/AuthorLine'
import { Markdown } from '@/components/shared/Markdown'

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-md border border-edge bg-panel-2 px-1.5 py-0.5 text-[11px] text-neutral-400', className)}>{children}</span>
}

/** Chip label text cap; the full value goes in a title tooltip. */
const CHIP_TEXT_MAX = 20

function clip(s: string): string {
  return s.length > CHIP_TEXT_MAX ? s.slice(0, CHIP_TEXT_MAX - 1).trimEnd() + '…' : s
}

/**
 * Capped chip row. `max` chips are shown; the rest collapse into a "+N" chip
 * (static on cards) or a "+N more" button that expands when `expandable`.
 */
function ChipRow<T>({ items, max, expandable, keyOf, render }: {
  items: T[]
  max: number
  expandable?: boolean
  keyOf: (item: T) => string
  render: (item: T) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  const shown = open ? items : items.slice(0, max)
  const rest = items.length - shown.length
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((it) => <Chip key={keyOf(it)}>{render(it)}</Chip>)}
      {rest > 0 && (expandable
        ? <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-dashed border-edge-2 px-1.5 py-0.5 text-[11px] text-neutral-400 hover:border-purple-500/40 hover:text-purple-300">+{rest} more</button>
        : <Chip className="border-dashed text-neutral-500">+{rest}</Chip>)}
      {open && expandable && items.length > max && (
        <button type="button" onClick={() => setOpen(false)} className="px-1 text-[11px] text-neutral-500 hover:text-neutral-300">show less</button>
      )}
    </div>
  )
}

export function KindChips({ kinds, max = 10, expandable = false }: { kinds: { kind: number; name?: string }[]; max?: number; expandable?: boolean }) {
  return (
    <ChipRow
      items={kinds}
      max={max}
      expandable={expandable}
      keyOf={(k) => String(k.kind)}
      render={(k) => <span title={k.name ? ` ` : String(k.kind)} className="inline-flex items-center gap-1"><span className="font-mono text-purple-300">{k.kind}</span>{k.name && <span>{clip(k.name)}</span>}</span>}
    />
  )
}

export function TopicChips({ topics, max = 10, expandable = false }: { topics: string[]; max?: number; expandable?: boolean }) {
  return (
    <ChipRow
      items={topics}
      max={max}
      expandable={expandable}
      keyOf={(t) => t}
      render={(t) => <span title={`#`}>#{clip(t)}</span>}
    />
  )
}

// ─── Draft ──────────────────────────────────────────────────────────

export function DraftCard({ draft }: { draft: Draft }) {
  return (
    <Link to={`/draft/${draftNaddr(draft.pubkey, draft.uuid)}`} className="block rounded-lg border border-edge bg-panel p-4 transition-colors hover:border-purple-500/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-neutral-100">{draft.title}</h3>
          {draft.summary && <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{draft.summary}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {draft.releaseId && <Chip className="border-emerald-500/30 text-emerald-400">released</Chip>}
          {draft.status === 'review' && <Chip className="border-yellow-500/30 text-yellow-400">in review</Chip>}
          <FileText className="h-4 w-4 text-neutral-600" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <AuthorLine pubkey={draft.pubkey} at={draft.createdAt} size="xs" />
        <KindChips kinds={draft.kinds} />
        <TopicChips topics={draft.topics} />
      </div>
    </Link>
  )
}

// ─── Proposal (latest release + rollup) ─────────────────────────────

export function ProposalCard({ p, verified }: { p: ProposalSummary; verified?: number }) {
  const r = p.latest
  return (
    <Link to={`/release/${releaseNevent(r.id, r.pubkey)}`} className="block rounded-lg border border-edge bg-panel p-4 transition-colors hover:border-purple-500/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-neutral-100">
            {r.title} <span className="font-normal text-neutral-500">v{r.version}</span>
          </h3>
          {r.summary && <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{r.summary}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="inline-flex items-center gap-1.5 text-sm text-neutral-200">
            <Users className="h-4 w-4 text-purple-400" />
            <span className="tabular-nums font-semibold">{p.implementers}</span>
            <span className="text-xs text-neutral-500">{p.implementers === 1 ? 'implementer' : 'implementers'}</span>
          </span>
          {verified !== undefined && verified !== p.implementers && (
            <span className="text-[11px] text-neutral-500"><span className="tabular-nums text-emerald-400">{verified}</span> above threshold</span>
          )}
          {r.forkOf && <Chip><GitFork className="h-3 w-3" /> fork</Chip>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <AuthorLine pubkey={r.pubkey} at={r.createdAt} size="xs" />
        {p.releases.length > 1 && <Chip>{p.releases.length} versions</Chip>}
        <KindChips kinds={r.kinds} />
        <TopicChips topics={r.topics} />
      </div>
    </Link>
  )
}

export function ReleaseRow({ r, current }: { r: Release; current?: boolean }) {
  return (
    <Link
      to={`/release/${releaseNevent(r.id, r.pubkey)}`}
      className={cn('flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-panel-2', current && 'bg-panel-2')}
    >
      <span className="flex items-center gap-2">
        <span className={cn('font-mono', current ? 'text-purple-300' : 'text-neutral-300')}>v{r.version}</span>
        <span className="truncate text-neutral-400">{r.title}</span>
      </span>
      <span className="shrink-0 font-mono text-[11px] text-neutral-600">{r.id.slice(0, 8)}</span>
    </Link>
  )
}

// ─── Claim ──────────────────────────────────────────────────────────

export function ClaimCard({ claim, legit = 0, fake = 0, onReview, mine }: { claim: Claim; legit?: number; fake?: number; onReview?: () => void; mine?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-edge bg-panel p-4', claim.withdrawn && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-100">
            {claim.name}
            {claim.implVersion && <span className="ml-1.5 font-mono text-xs font-normal text-neutral-500">{claim.implVersion}</span>}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            <span className="capitalize text-neutral-300">{claim.role}</span>
            {' · '}implements v{claim.version}
            {claim.scope === 'partial' && <span className="text-yellow-500"> · partial</span>}
            {claim.withdrawn && <span className="text-red-400"> · withdrawn</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {legit > 0 && <Chip className="border-emerald-500/30 text-emerald-400"><ShieldCheck className="h-3 w-3" /> {legit} legit</Chip>}
          {fake > 0 && <Chip className="border-red-500/30 text-red-400"><ShieldX className="h-3 w-3" /> {fake} fake</Chip>}
          {claim.withdrawn && <Ban className="h-4 w-4 text-neutral-600" />}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <AuthorLine pubkey={claim.pubkey} at={claim.createdAt} size="xs" />
        {claim.urls.map((u) => (
          <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-purple-400 hover:underline">{u.replace(/^https?:\/\//, '')}</a>
        ))}
        {claim.relay && <Chip>{claim.relay}</Chip>}
      </div>
      {claim.content && <p className="mt-2 text-sm text-neutral-400">{claim.content}</p>}
      {onReview && (
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={onReview} className="text-xs text-neutral-400 hover:text-purple-400">
            {mine ? 'Edit your verdict' : 'Is this implementation real?'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Review ─────────────────────────────────────────────────────────

const VERDICT_STYLE: Record<string, string> = {
  'recommend': 'border-emerald-500/30 text-emerald-400',
  'not-recommend': 'border-red-500/30 text-red-400',
  'unsure': 'border-yellow-500/30 text-yellow-400',
  'legit': 'border-emerald-500/30 text-emerald-400',
  'fake': 'border-red-500/30 text-red-400',
}

export function VerdictChip({ verdict }: { verdict: string }) {
  return <Chip className={VERDICT_STYLE[verdict] ?? ''}>{verdict.replace('-', ' ')}</Chip>
}

export function ReviewCard({ review, targetLabel }: { review: Review; targetLabel?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AuthorLine pubkey={review.pubkey} at={review.createdAt} size="xs" />
        <div className="flex items-center gap-2">
          {targetLabel}
          <VerdictChip verdict={review.verdict} />
        </div>
      </div>
      {review.content && <div className="mt-2"><Markdown content={review.content} /></div>}
    </div>
  )
}
