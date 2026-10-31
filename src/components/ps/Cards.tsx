import { useState, forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { FileText, GitFork, Users, ShieldCheck, ShieldX, ShieldQuestion, ExternalLink } from 'lucide-react'
import { cn, markdownToText } from '@/lib/utils'
import { Tip } from '@/components/shared/Tip'
import { PowBadge } from '@/components/shared/PowBadge'
import { draftNaddr, releaseNevent, shortId, type Draft, type Release, type ProposalSummary, type Claim, type Review } from '@/lib/nostr/nipps'
import { AuthorLine } from '@/components/social/AuthorLine'
import { Markdown } from '@/components/shared/Markdown'

/** Forwards its ref and spreads extra props so it can be a Radix tooltip trigger (`Tip` uses `asChild`). */
export const Chip = forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(function Chip({ children, className, ...rest }, ref) {
  return <span ref={ref} className={cn('inline-flex items-center gap-1 rounded-md border border-edge bg-panel-2 px-1.5 py-0.5 text-[11px] text-neutral-400', className)} {...rest}>{children}</span>
})

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
      render={(k) => (
        <Tip label={k.name ? `kind ${k.kind}: ${k.name}` : `kind ${k.kind}`}>
          <span className="inline-flex items-center gap-1"><span className="font-mono text-purple-300">{k.kind}</span>{k.name && <span>{clip(k.name)}</span>}</span>
        </Tip>
      )}
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
      render={(t) => <Tip label={t.length > 20 ? `#${t}` : undefined}><span>#{clip(t)}</span></Tip>}
    />
  )
}

// ─── Draft ──────────────────────────────────────────────────────────

export function DraftCard({ draft, released }: { draft: Draft; released?: boolean }) {
  return (
    <Link to={`/draft/${draftNaddr(draft.pubkey, draft.uuid)}`} className="block rounded-lg border border-edge bg-panel p-4 transition-colors hover:border-purple-500/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-neutral-100">{draft.title}</h3>
          {draft.summary && <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{markdownToText(draft.summary)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {released && <Chip className="border-emerald-500/30 text-emerald-400">released</Chip>}
          <FileText className="h-4 w-4 text-neutral-600" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <AuthorLine pubkey={draft.pubkey} at={draft.publishedAt} size="xs" linked={false} suffix={draft.edited ? <span className="text-[11px] text-neutral-600">edited</span> : undefined} />
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
          {r.summary && <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{markdownToText(r.summary)}</p>}
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
        <AuthorLine pubkey={r.pubkey} at={r.createdAt} size="xs" linked={false} />
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
      <span className="shrink-0 font-mono text-[11px] text-neutral-600">{shortId(r.id)}</span>
    </Link>
  )
}

// ─── Claim ──────────────────────────────────────────────────────────


/**
 * An adoption claim, laid out as a directory entry about a piece of software
 * rather than a post: role icon tile, software name and version as the
 * headline, what it implements, links as buttons, a verification status block
 * on the right, and "claimed by" demoted to the footer.
 */
/**
 * A claim's links as buttons: at most `max` of them, each truncated to a fixed
 * width, then "+N" for the rest (URLs, relay, handler, repo), which opens the
 * dialog where the full list is shown.
 */
function ClaimLinks({ claim, onOpen, max = 2, className }: { claim: Claim; onOpen?: () => void; max?: number; className?: string }) {
  const shown = claim.urls.slice(0, max)
  const extra = (claim.urls.length - shown.length) + (claim.relay ? 1 : 0) + (claim.handler ? 1 : 0) + (claim.repo ? 1 : 0)
  if (shown.length === 0 && extra === 0) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {shown.map((u) => (
        <Tip key={u} label={u}>
          <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-[11rem] items-center gap-1 rounded-md border border-edge bg-panel-2 px-2 py-1 text-xs text-neutral-200 transition-colors hover:border-purple-500/40 hover:text-purple-300">
            <ExternalLink className="h-3 w-3 shrink-0 text-neutral-500" /><span className="truncate">{u.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
          </a>
        </Tip>
      ))}
      {extra > 0 && (
        onOpen ? (
          <button type="button" onClick={onOpen} className="rounded-md border border-dashed border-edge px-2 py-1 text-xs text-neutral-400 transition-colors hover:border-purple-500/40 hover:text-purple-300">+{extra}</button>
        ) : (
          <span className="rounded-md border border-dashed border-edge px-2 py-1 text-xs text-neutral-500">+{extra}</span>
        )
      )}
    </div>
  )
}

export function ClaimCard({ claim, legit = 0, fake = 0, onReview, onOpen, mine, menu, className }: {
  className?: string
  claim: Claim
  legit?: number
  fake?: number
  onReview?: () => void
  /** Opens the full claim with its verdicts; the status block becomes a button. */
  onOpen?: () => void
  /** Viewer already left a verdict on this claim. */
  mine?: boolean
  /** Three-dot menu slot (ItemMenu). */
  menu?: React.ReactNode
}) {
  const status = fake > 0 ? 'disputed' : legit > 0 ? 'verified' : 'unverified'
  const statusCls = status === 'verified'
    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
    : status === 'disputed'
      ? 'border-red-500/30 bg-red-500/5 text-red-300'
      : 'border-edge bg-panel-2 text-neutral-400'
  const StatusIcon = status === 'verified' ? ShieldCheck : status === 'disputed' ? ShieldX : ShieldQuestion
  const statusTitle = status === 'verified' ? 'Verified' : status === 'disputed' ? 'Disputed' : 'Unverified'
  const statusSub = status === 'verified'
    ? `${legit} legit${fake ? ` · ${fake} fake` : ''}`
    : status === 'disputed'
      ? `${fake} fake${legit ? ` · ${legit} legit` : ''}`
      : 'no verdicts yet'
  const StatusBlock = (
    <div className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left', statusCls, onOpen && 'cursor-pointer transition-colors hover:border-purple-500/40')}>
      <StatusIcon className="h-5 w-5 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight">{statusTitle}</span>
        <span className="block text-[11px] opacity-80">{statusSub}</span>
      </span>
    </div>
  )

  return (
    <div className={cn('rounded-lg border border-edge bg-panel', claim.withdrawn && 'opacity-60', className)}>
      <div className="flex gap-4 p-4">
        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="truncate text-base font-semibold text-neutral-100">{claim.name}</h3>
            {claim.implVersion && <span className="font-mono text-xs text-neutral-400">{claim.implVersion}</span>}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-500">
            <span className="capitalize text-neutral-300">{claim.role}</span>
            <span>·</span>
            <span>implements <span className="font-mono text-neutral-300">v{claim.version}</span></span>
            {claim.scope === 'partial' && <><span>·</span><span className="text-yellow-500">partial</span></>}
            {claim.withdrawn && <><span>·</span><span className="text-red-400">withdrawn</span></>}
          </p>
          <ClaimLinks claim={claim} onOpen={onOpen} className="mt-2.5" />
          {claim.content && (onOpen ? (
            <button type="button" onClick={onOpen} className="mt-2.5 block w-full border-l-2 border-edge-2 pl-3 text-left text-sm text-neutral-400 transition-colors hover:border-purple-500/60 hover:text-neutral-200">{claim.content}</button>
          ) : (
            <p className="mt-2.5 border-l-2 border-edge-2 pl-3 text-sm text-neutral-400">{claim.content}</p>
          ))}
        </div>

        {/* Verification + menu */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-start gap-1">
            {onOpen ? <button type="button" onClick={onOpen} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50">{StatusBlock}</button> : StatusBlock}
            {menu}
          </div>
        </div>
      </div>

      {/* Footer: who claims it, and the verdict action */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-edge px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-xs text-neutral-500">
          <span className="shrink-0">claimed by</span>
          <AuthorLine pubkey={claim.pubkey} at={claim.createdAt} size="xs" suffix={<PowBadge id={claim.event.id} />} />
        </div>
        {mine && onOpen ? (
          <button type="button" onClick={onOpen} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-purple-400">
            <ShieldCheck className="h-3 w-3" /> You&apos;ve given your verdict
          </button>
        ) : onReview ? (
          <button type="button" onClick={onReview} className="text-xs text-neutral-400 hover:text-purple-400">
            Is this implementation real?
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Compact claim for a grid: tile, name, what it implements, one link,
 * verification status, and "claimed by" in the footer. The wide ClaimCard
 * stays for the dialog and single-column places.
 */
export function ClaimTile({ claim, legit = 0, fake = 0, onReview, onOpen, mine, menu, className }: {
  className?: string
  claim: Claim
  legit?: number
  fake?: number
  onReview?: () => void
  onOpen?: () => void
  mine?: boolean
  menu?: React.ReactNode
}) {
  const status = fake > 0 ? 'disputed' : legit > 0 ? 'verified' : 'unverified'
  const statusCls = status === 'verified'
    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
    : status === 'disputed'
      ? 'border-red-500/30 bg-red-500/5 text-red-300'
      : 'border-edge bg-panel-2 text-neutral-400'
  const StatusIcon = status === 'verified' ? ShieldCheck : status === 'disputed' ? ShieldX : ShieldQuestion
  const statusText = status === 'verified'
    ? `Verified · ${legit} legit${fake ? `, ${fake} fake` : ''}`
    : status === 'disputed'
      ? `Disputed · ${fake} fake${legit ? `, ${legit} legit` : ''}`
      : 'Unverified · no verdicts'

  return (
    <div className={cn('flex h-full flex-col rounded-lg border border-edge bg-panel', claim.withdrawn && 'opacity-60', className)}>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-neutral-100">{claim.name}</h3>
            <p className="truncate text-[11px] text-neutral-500">
              <span className="capitalize text-neutral-300">{claim.role}</span>
              {claim.implVersion && <span className="font-mono"> {claim.implVersion}</span>}
              {' · '}implements <span className="font-mono text-neutral-300">v{claim.version}</span>
              {claim.scope === 'partial' && <span className="text-yellow-500"> · partial</span>}
              {claim.withdrawn && <span className="text-red-400"> · withdrawn</span>}
            </p>
          </div>
          {menu}
        </div>

        <ClaimLinks claim={claim} onOpen={onOpen} />

        {claim.content && (onOpen ? (
          <button type="button" onClick={onOpen} className="line-clamp-2 w-full border-l-2 border-edge-2 pl-2.5 text-left text-xs text-neutral-400 transition-colors hover:border-purple-500/60 hover:text-neutral-200">{claim.content}</button>
        ) : (
          <p className="line-clamp-2 border-l-2 border-edge-2 pl-2.5 text-xs text-neutral-400">{claim.content}</p>
        ))}

        <div className="mt-auto">
          {onOpen ? (
            <button type="button" onClick={onOpen} className={cn('flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors hover:border-purple-500/40', statusCls)}>
              <StatusIcon className="h-4 w-4 shrink-0" /><span className="truncate">{statusText}</span>
            </button>
          ) : (
            <div className={cn('flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs', statusCls)}>
              <StatusIcon className="h-4 w-4 shrink-0" /><span className="truncate">{statusText}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-edge px-4 py-2 text-[11px] text-neutral-500">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0">by</span>
          <AuthorLine pubkey={claim.pubkey} size="xs" suffix={<PowBadge id={claim.event.id} />} />
        </div>
        {mine && onOpen ? (
          <Tip label="You've given your verdict"><button type="button" onClick={onOpen} className="shrink-0 text-neutral-400 hover:text-purple-400" aria-label="Your verdict"><ShieldCheck className="h-3.5 w-3.5" /></button></Tip>
        ) : onReview ? (
          <button type="button" onClick={onReview} className="shrink-0 text-neutral-400 hover:text-purple-400">Real?</button>
        ) : null}
      </div>
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

export function ReviewCard({ review, targetLabel, menu }: { review: Review; targetLabel?: React.ReactNode; menu?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-edge bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AuthorLine pubkey={review.pubkey} at={review.createdAt} size="xs" suffix={<PowBadge id={review.event.id} />} />
        <div className="flex items-center gap-2">
          {targetLabel}
          <VerdictChip verdict={review.verdict} />
          {menu}
        </div>
      </div>
      {review.content && <div className="mt-2"><Markdown content={review.content} /></div>}
    </div>
  )
}
