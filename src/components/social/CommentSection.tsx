import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MessagesSquare, Loader2, RefreshCw, Settings, ListFilter, Pickaxe, RotateCcw } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useBlockStore } from '@/stores/blockStore'
import { useFollowedSet } from '@/hooks/useFollowedSet'
import type { Event as NostrEvent } from 'nostr-tools'
import {
  fetchComments,
  buildCommentTree,
  countComments,
  findCommentPath,
  type CommentNode,
  type NostrTarget,
} from '@/lib/nostr/social'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tip } from '@/components/shared/Tip'
import { useLensStore } from '@/stores/lensStore'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { CommentForm } from './CommentForm'
import { Comment } from './Comment'
import { CommentThreadModal } from './CommentThreadModal'
import { CommentFilters, DEFAULT_COMMENT_FILTERS, type CommentFilterState } from './CommentFilters'
import { useLensFilter } from '@/components/lens/useLensFilter'
import { ScoreFilterMenu, EmptyFiltered } from '@/components/lens/TieredList'

interface CommentSectionProps {
  root: NostrTarget
  /** When set (e.g. arriving from a notification), scroll here and open the
   *  thread modal focused on this comment id. */
  focusCommentId?: string | null
}

export function CommentSection({ root, focusCommentId }: CommentSectionProps) {
  const defaultPow = useSettingsStore(s => s.powFilterDifficulty)
  const [events, setEvents] = useState<NostrEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // Settings value unless the thread's filter dialog set a temporary one.
  const [threadFocusId, setThreadFocusId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<CommentFilterState>(DEFAULT_COMMENT_FILTERS)
  const minPow = filters.minPow ?? defaultPow
  const activeFilterCount = filters.authorOnly ? 1 : 0
  const sectionRef = useRef<HTMLElement>(null)
  const handledFocusRef = useRef<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const closeThread = useCallback(() => {
    setThreadFocusId(null)
    // Drop the deep-link param so a refresh / share doesn't reopen the modal.
    if (searchParams.has('c')) {
      const next = new URLSearchParams(searchParams)
      next.delete('c')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const load = useCallback(async (isRefresh = false) => {
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const fetched = await fetchComments(relays, root)
      setEvents(fetched)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root.id])

  useEffect(() => { load() }, [load])

  // Refetch shortly after publishing so the new event has propagated.
  const handlePublished = useCallback(() => {
    setTimeout(() => load(true), 1200)
  }, [load])

  const followed = useFollowedSet()
  // Filtering demotes, never hides (spec §6): comments under the proof-of-work
  // floor are folded behind a count, and the slider in the toolbar lowers the
  // floor for this thread to bring them back.
  const unfilteredTree = useMemo(() => buildCommentTree(events, 0, followed, root.id), [events, followed, root.id])
  const filteredTree = useMemo(() => buildCommentTree(events, minPow, followed, root.id), [events, minPow, followed, root.id])
  const powTree = filteredTree
  const lensEnabled = useLensStore((s) => s.enabled)
  const powOverridden = filters.minPow !== null
  const belowPow = useMemo(() => countComments(unfilteredTree) - countComments(filteredTree), [unfilteredTree, filteredTree])

  // Drop comments/replies from blocked users. Trust is the lens's job and the
  // lens folds rather than hides, so nothing else is pruned here.
  const blocked = useBlockStore((s) => s.blockedPubkeys)
  const tree = useMemo(() => {
    const prune = (nodes: CommentNode[]): CommentNode[] =>
      nodes
        .filter((n) => !blocked.has(n.event.pubkey))
        .map((n) => ({ ...n, replies: prune(n.replies) }))
    return prune(powTree)
  }, [powTree, blocked])

  // Apply view filters. "Author only" shows just the post author's top-level
  // comments, without their reply threads.
  const displayTree = useMemo(() => {
    if (!filters.authorOnly) return tree
    return tree
      .filter((n) => n.event.pubkey === root.pubkey)
      .map((n) => ({ ...n, replies: [] as CommentNode[] }))
  }, [tree, filters.authorOnly, root.pubkey])

  const total = useMemo(() => countComments(displayTree), [displayTree])

  // The lens, as on every list: top-level comments by their author's rank,
  // scored first, the rest one menu click away. Replies stay with their
  // parent inside the thread modal, each carrying its author's trust badge.
  const topLevel = useMemo(() => displayTree.map((n) => ({ ...n, pubkey: n.event.pubkey })), [displayTree])
  const lens = useLensFilter(topLevel)

  // Arriving from a notification: once the target comment is in the tree, scroll
  // here and open the thread modal focused on it (seeded with its ancestry).
  useEffect(() => {
    if (!focusCommentId || loading) return
    if (handledFocusRef.current === focusCommentId) return
    if (!findCommentPath(tree, focusCommentId)) return
    handledFocusRef.current = focusCommentId
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setThreadFocusId(focusCommentId)
  }, [focusCommentId, loading, tree])

  return (
    <section ref={sectionRef} className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-200">
          <MessagesSquare className="h-5 w-5 text-purple-400" />
          Comments
          {!loading && <span className="text-sm font-normal text-neutral-500">({total})</span>}
        </h2>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setFiltersOpen(true)}
                className="relative text-neutral-400 hover:text-neutral-200"
                aria-label="Comment filters"
              >
                <ListFilter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-600 px-1 text-[10px] font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filter comments</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="text-neutral-400 hover:text-neutral-200">
                <Link to="/settings?tab=preferences" aria-label="Filter settings">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Adjust content filters in Settings</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => load(true)}
            disabled={refreshing}
            className="text-neutral-400 hover:text-neutral-200"
            aria-label="Refresh comments"
          >
            <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </div>
      </div>

      {/* Toolbar: the proof-of-work floor for this thread, live, and the lens menu. Always there, so the controls never move. */}
      {!loading && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Tip label={`Comments with less than ${minPow} bits of proof of work are folded. Your Settings value is ${defaultPow} bits; moving this applies to this thread only. People you follow are never folded.`}>
              <span className="flex items-center gap-1.5 text-neutral-500"><Pickaxe className="h-3.5 w-3.5 text-purple-400" /> PoW floor</span>
            </Tip>
            <Slider min={0} max={32} step={1} value={[minPow]} onValueChange={([v]) => setFilters({ ...filters, minPow: v === defaultPow ? null : v })} className="w-24" aria-label="Proof-of-work floor for this thread" />
            <span className="w-6 text-right tabular-nums text-neutral-200">{minPow}</span>
            {powOverridden && (
              <Tip label={`Reset to ${defaultPow}`}>
                <button type="button" onClick={() => setFilters({ ...filters, minPow: null })} className="text-neutral-500 hover:text-neutral-200" aria-label={`Reset proof-of-work floor to ${defaultPow}`}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </Tip>
            )}
            {belowPow > 0 && <span className="text-neutral-500">{belowPow} folded</span>}
          </div>
          {lensEnabled && <ScoreFilterMenu value={lens.filter} onChange={lens.setFilter} counts={lens.counts} />}
        </div>
      )}

      {/* New top-level comment */}
      <div className="rounded-lg bg-panel p-4 shadow-md shadow-black/20">
        <CommentForm root={root} onPublished={handlePublished} />
      </div>

      {/* Thread */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
        </div>
      ) : displayTree.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">
          {filters.authorOnly
            ? 'No comments from the author yet.'
            : belowPow > 0
              ? `${belowPow} ${belowPow === 1 ? 'comment is' : 'comments are'} under the proof-of-work floor. Lower the slider to see ${belowPow === 1 ? 'it' : 'them'}.`
              : 'No comments yet. Be the first to comment.'}
        </p>
      ) : lens.main.length === 0 ? (
        <EmptyFiltered filter={lens.filter} />
      ) : (
        <div className="space-y-6">
          {lens.main.map(node => (
            <Comment
              key={node.event.id}
              node={node}
              root={root}
              onReplyPublished={handlePublished}
              onOpenThread={setThreadFocusId}
            />
          ))}
        </div>
      )}

      <CommentThreadModal
        open={threadFocusId !== null}
        onOpenChange={(o) => { if (!o) closeThread() }}
        tree={tree}
        focusId={threadFocusId}
        root={root}
        onReplyPublished={handlePublished}
      />

      <CommentFilters
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onChange={setFilters}
      />
    </section>
  )
}
