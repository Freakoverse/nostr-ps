import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { Loader2, Rocket, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { KINDS } from '@/lib/constants'
import { signAndPublish, type PublishStatus } from '@/lib/nostr/publish'
import {
  fetchDraft, fetchReleasesForDraft, buildReleaseEvent, buildDraftEvent, releaseNevent,
  isValidVersion, nextMajor, nextMinor, type Draft, type Release,
} from '@/lib/nostr/nipps'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownEditor } from '@/components/ps/MarkdownEditor'
import { ReleaseRow } from '@/components/ps/Cards'
import { cn } from '@/lib/utils'

/**
 * Freeze a draft into a release (kind 8201). The body is prefilled from the
 * draft and still editable here, because this is the last chance: once
 * published, any change is a new version.
 */
export function ReleaseCreatePage() {
  const { naddr } = useParams<{ naddr: string }>()
  const navigate = useNavigate()
  const pubkey = useAuthStore((s) => s.pubkey)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState('1')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [forkOfId, setForkOfId] = useState('')
  const [status, setStatus] = useState<PublishStatus | null>(null)
  useSeoMeta({ title: 'Publish release' })

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
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    ;(async () => {
      const d = await fetchDraft(relays, addr.pubkey, addr.identifier)
      if (cancelled) return
      setDraft(d)
      if (d) {
        setTitle(d.title); setSummary(d.summary ?? ''); setContent(d.content)
        setForkOfId(d.event.tags.find((t) => t[0] === 'fork')?.[1] ?? '')
        const rs = await fetchReleasesForDraft(relays, d).catch(() => [])
        if (cancelled) return
        setReleases(rs)
        setVersion(nextMajor(rs[0]?.version ?? null))
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [addr])

  if (!addr) return <Missing text="That is not a draft address." />
  if (loading) return <div className="flex items-center justify-center gap-2 py-24 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading draft…</div>
  if (!draft) return <Missing text="Draft not found on your relays." />
  if (draft.pubkey !== pubkey) return <Missing text="Only the author can release this draft." />

  const prev = releases[0] ?? null
  const taken = releases.some((r) => r.version === version)
  const versionOk = isValidVersion(version) && !taken
  const busy = status !== null && status !== 'done' && status !== 'error'

  const publish = async () => {
    if (!versionOk) { toast.error(taken ? `v${version} already exists` : 'Version must be dotted integers, e.g. 1, 1.1, 2'); return }
    if (!title.trim() || !content.trim()) { toast.error('Title and body are required'); return }
    const writeRelay = useSettingsStore.getState().getAllEnabledRelayUrls('write')[0]
    const event = buildReleaseEvent({
      uuid: draft.uuid,
      version,
      title,
      summary: summary.trim() || undefined,
      content,
      kinds: draft.kinds,
      topics: draft.topics,
      draftCoord: draft.coord,
      draftRelay: writeRelay,
      prevId: prev?.id,
      prevRelay: prev ? writeRelay : undefined,
      forkOf: forkOfId.trim() && /^[0-9a-f]{64}$/i.test(forkOfId.trim()) ? { id: forkOfId.trim().toLowerCase() } : undefined,
    })
    setStatus('mining')
    const res = await signAndPublish(event, setStatus)
    if (!res.success || !res.event) { toast.error(res.error || 'Failed to publish release'); setStatus('error'); return }
    toast.success(`Released v${version}`)

    // Advisory: stamp the draft with the release pointer (§4.1). Best effort;
    // clients detect releases without it.
    try {
      const stamp = buildDraftEvent({
        uuid: draft.uuid,
        title: draft.title,
        summary: draft.summary,
        content: draft.content,
        kinds: draft.kinds,
        topics: draft.topics,
        status: 'released',
        releaseId: res.event.id,
        releaseRelay: writeRelay,
      })
      const f = draft.event.tags.find((t) => t[0] === 'fork')
      if (f) stamp.tags.push(f)
      await signAndPublish(stamp)
    } catch { /* non-fatal */ }

    navigate(`/release/${releaseNevent(res.event.id, res.event.pubkey)}`)
  }

  return (
    <div className="space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{prev ? 'Release a new version' : 'Publish the first release'}</h1>
        <p className="text-sm text-neutral-400">
          A release is immutable. Implementers will point at its event id. Any change afterwards, even a typo, is a new version.
        </p>
      </div>

      {releases.length > 0 && (
        <div className="rounded-lg border border-edge bg-panel p-2">
          <p className="px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wider text-neutral-500">Existing versions</p>
          {releases.map((r) => <ReleaseRow key={r.id} r={r} />)}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-200">Version</label>
          <div className="flex items-center gap-2">
            <Input value={version} onChange={(e) => setVersion(e.target.value.trim())} className={cn('w-28 border-edge bg-panel font-mono', !versionOk && 'border-red-500/60')} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setVersion(nextMajor(prev?.version ?? null))} className="text-xs text-neutral-400">major</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setVersion(nextMinor(prev?.version ?? null))} className="text-xs text-neutral-400">minor</Button>
          </div>
          <p className="text-[11px] text-neutral-600">{taken ? 'Already released.' : 'Dotted integers. Minor for clarifications, major for normative changes.'}</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-200">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-edge bg-panel" maxLength={120} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-200">Summary <span className="text-neutral-500">(optional)</span></label>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className="border-edge bg-panel" maxLength={500} />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-200">Spec text <span className="text-neutral-500">(frozen on publish)</span></label>
        <MarkdownEditor value={content} onChange={setContent} />
      </div>

      <details className="rounded-lg border border-edge bg-panel p-3 text-sm">
        <summary className="cursor-pointer text-neutral-300">Fork ancestry</summary>
        <div className="mt-3 space-y-1.5">
          <label className="text-xs font-medium text-neutral-300">Parent release event id <span className="text-neutral-600">(hex, optional)</span></label>
          <Input value={forkOfId} onChange={(e) => setForkOfId(e.target.value)} placeholder="64 hex characters" className="border-edge bg-panel font-mono text-xs" />
          <p className="text-[11px] text-neutral-600">Only for the first release of a fork. Later versions chain to the previous one automatically.</p>
        </div>
      </details>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-purple-500/30 bg-purple-500/5 px-4 py-3">
        <p className="flex items-center gap-2 text-xs text-neutral-400"><Lock className="h-3.5 w-3.5 text-purple-400" /> Kinds and topics are copied from the draft. The draft stays editable for the next version.</p>
        <div className="flex items-center gap-3">
          {status && status !== 'done' && status !== 'error' && <span className="text-xs text-neutral-500">{status === 'mining' ? 'Proof of work…' : status === 'signing' ? 'Signing…' : 'Publishing…'}</span>}
          <Button onClick={publish} disabled={busy || !versionOk} className="gap-2 bg-purple-600 text-white hover:bg-purple-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Release v{version}
          </Button>
        </div>
      </div>
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
