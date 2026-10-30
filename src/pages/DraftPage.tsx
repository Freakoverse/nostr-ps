import { useEffect, useMemo, useState } from 'react'
import { BackButton } from '@/components/shared/BackButton'
import { AuthorCard, MetaCard } from '@/components/ps/SideCards'
import { PostFacts } from '@/components/ps/PostFacts'
import { CollapsibleBody } from '@/components/shared/CollapsibleBody'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { Loader2, Pencil, Rocket, AlertCircle, ArrowRight, Trash2, FileText } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { KINDS } from '@/lib/constants'
import { fetchDraft, fetchReleasesForDraft, getCachedDraft, getCachedVersions, whenEventCacheReady, releaseNevent, type Draft, type Release } from '@/lib/nostr/nipps'
import { ensureEventPresent } from '@/lib/nostr/eventRedundancy'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/shared/Markdown'
import { RequestDeleteDialog } from '@/components/shared/RequestDeleteDialog'
import { CommentSection } from '@/components/social/CommentSection'
import { Chip } from '@/components/ps/Cards'
import { PostMenu } from '@/components/ps/PostMenu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

export function DraftPage() {
  const { naddr } = useParams<{ naddr: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const myPubkey = useAuthStore((s) => s.pubkey)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [releases, setReleases] = useState<Release[]>([])
  // Whether a release exists is learned only by querying (§6.1); until the
  // query answers, the page says so rather than guessing either way.
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const addr = useMemo(() => {
    try {
      const d = nip19.decode(naddr ?? '')
      if (d.type === 'naddr' && d.data.kind === KINDS.PS_DRAFT) return d.data
    } catch { /* fallthrough */ }
    return null
  }, [naddr])

  useEffect(() => {
    if (!addr) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setChecking(true)
    setReleases([])
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    ;(async () => {
      // Paint from cache at once if a list (or a previous visit) already had
      // this draft, then re-fetch: a newer revision replaces it, a tombstone
      // turns the page into "not found".
      await whenEventCacheReady
      if (cancelled) return
      const cached = getCachedDraft(addr.pubkey, addr.identifier)
      if (cached) { setDraft(cached); setLoading(false) }
      const fetched = await fetchDraft(relays, addr.pubkey, addr.identifier)
      if (cancelled) return
      // No relay answer keeps the cached copy; a tombstone (fetchDraft → null
      // while the cache now holds the deleted revision) clears it.
      const d = fetched ?? (getCachedDraft(addr.pubkey, addr.identifier) ? cached : null)
      setDraft(d)
      setLoading(false)
      if (!d) { setChecking(false); return }
      ensureEventPresent(d.event)
      // Cached releases of this draft show the banner at once; the query
      // below still decides, and `checking` stays on until it answers.
      const cvs = getCachedVersions(d.pubkey, d.uuid)
      if (cvs.length) setReleases(cvs)
      const rs = await fetchReleasesForDraft(relays, d).catch(() => [])
      if (cancelled) return
      setReleases(rs)
      setChecking(false)
    })()
    return () => { cancelled = true }
  }, [addr])

  useSeoMeta(draft ? { title: draft.title, description: draft.summary ?? draft.content.slice(0, 160), type: 'article' } : null)

  if (!addr) return <Missing text="That is not a draft address." />
  if (loading) return <div className="flex items-center justify-center gap-2 py-24 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading draft…</div>
  if (!draft) return <Missing text="Draft not found on your relays." />

  const isAuthor = myPubkey === draft.pubkey
  const latest = releases[0]

  return (
    <div className="space-y-6 py-6">
      <BackButton fallback="/drafts" />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Chip>draft</Chip>
          </div>
          <PostMenu event={draft.event}>
            {isAuthor && (
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to={`/draft/${naddr}/edit`}><Pencil className="h-4 w-4 mr-2" /> Edit</Link>
              </DropdownMenuItem>
            )}
            {isAuthor && (
              <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="cursor-pointer text-red-400 focus:text-red-300">
                <Trash2 className="h-4 w-4 mr-2" /> Request deletion
              </DropdownMenuItem>
            )}
          </PostMenu>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{draft.title}</h1>
        <PostFacts eventId={draft.event.id} at={draft.createdAt} summary={draft.summary} />
      </div>

      {checking && !latest ? (
        <div className="flex items-center gap-3 rounded-lg border border-edge bg-panel px-4 py-3 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          Checking for a release post…
        </div>
      ) : latest ? (
        <Link to={`/release/${releaseNevent(latest.id, latest.pubkey)}`} className={cn('flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm transition-colors hover:border-emerald-500/60', checking && 'animate-pulse')}>
          <Rocket className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="min-w-0 flex-1 text-neutral-200">
            This draft has been released. Latest: <span className="font-mono">v{latest.version}</span>
            {releases.length > 1 && <span className="text-neutral-500"> · {releases.length} versions</span>}
            {checking && <span className="text-neutral-500"> · checking for newer…</span>}
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-neutral-500" />
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-edge bg-panel px-4 py-3 text-sm text-neutral-500">
          <FileText className="h-4 w-4 shrink-0" />
          No release post yet. This is a draft, open for discussion and edits.
        </div>
      )}

      {isAuthor && (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5 border-edge">
            <Link to={`/draft/${naddr}/edit`}><Pencil className="h-3.5 w-3.5" /> Edit</Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5 bg-purple-600 text-white hover:bg-purple-700">
            <Link to={`/draft/${naddr}/release`}><Rocket className="h-3.5 w-3.5" /> {latest ? 'Release new version' : 'Publish release'}</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <article className="min-w-0 self-start rounded-lg border border-edge bg-panel p-6">
          <CollapsibleBody>
            <Markdown content={draft.content} className="text-[15px]" />
          </CollapsibleBody>
        </article>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <AuthorCard pubkey={draft.pubkey} />
          <MetaCard kinds={draft.kinds} topics={draft.topics} />
        </aside>
      </div>

      {!latest && (
        <div className="flex items-start gap-2 rounded-lg border border-edge bg-well px-4 py-3 text-xs text-neutral-500">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Drafts are editable, so nothing can claim adoption of one. Implement it experimentally, say so in the discussion, and the author releases a frozen version once the text has stopped changing.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Discussion</h2>
        <CommentSection
          root={{ id: draft.event.id, pubkey: draft.pubkey, kind: KINDS.PS_DRAFT, aTag: draft.coord }}
          focusCommentId={searchParams.get('c')}
        />
      </section>

      <RequestDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        event={draft.event}
        title={draft.title}
        noun="draft"
        onDeleted={() => navigate('/drafts')}
      />
    </div>
  )
}

function Missing({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-neutral-300">{text}</p>
      <Button asChild variant="outline" className="border-edge"><Link to="/drafts">Back to drafts</Link></Button>
    </div>
  )
}
