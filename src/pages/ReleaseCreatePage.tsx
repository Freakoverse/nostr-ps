import { useEffect, useMemo, useState } from 'react'
import { BackButton } from '@/components/shared/BackButton'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { Loader2, Rocket, Lock, Check, Copy, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { KINDS } from '@/lib/constants'
import { signAndPublish, type PublishStatus } from '@/lib/nostr/publish'
import {
  fetchDraft, fetchRelease, fetchReleasesForDraft, buildReleaseEvent, releaseNevent, draftNaddr, specId,
  isValidVersion, nextMajor, nextMinor, type Draft, type Release,
} from '@/lib/nostr/nipps'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownEditor } from '@/components/ps/MarkdownEditor'
import { LIMITS } from '@/lib/limits'
import { CharCounter } from '@/components/shared/CharCounter'
import { VersionList } from '@/components/ps/VersionDiff'
import { cn, shortNpub } from '@/lib/utils'
import { Tip } from '@/components/shared/Tip'

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
  const [parent, setParent] = useState<Release | null>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState('1')
  const [bump, setBump] = useState<'minor' | 'major' | 'custom'>('custom')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
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
        const rs = await fetchReleasesForDraft(relays, d).catch(() => [])
        if (cancelled) return
        setReleases(rs)
        // Resolve the fork parent so the release can carry the optional `p` tag and show its title.
        const fid = d.event.tags.find((t) => t[0] === 'fork')?.[1]?.trim().toLowerCase()
        if (fid && /^[0-9a-f]{64}$/.test(fid)) fetchRelease(relays, fid).then((p) => { if (!cancelled) setParent(p) }).catch(() => {})
        setVersion(rs.length ? nextMinor(rs[0].version) : '1')
        setBump(rs.length ? 'minor' : 'custom')
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
  // Fork parent, from the draft's advisory tag (§4.1). Only the first release carries the marker.
  const forkTagRaw = draft.event.tags.find((t) => t[0] === 'fork')
  const forkTag = forkTagRaw?.[1]?.trim().toLowerCase()
  const forkOf = forkTag && /^[0-9a-f]{64}$/.test(forkTag) ? forkTag : undefined
  const taken = releases.some((r) => r.version === version)
  const versionOk = isValidVersion(version) && !taken
  const busy = status !== null && status !== 'done' && status !== 'error'

  const publish = async () => {
    if (!versionOk) { toast.error(taken ? `v${version} already exists` : 'Version must be dotted integers, e.g. 1, 1.1, 2'); return }
    if (!title.trim() || !content.trim()) { toast.error('Title and body are required'); return }
    if (content.length > LIMITS.body) { toast.error(`The body is too long (max ${LIMITS.body.toLocaleString()} characters)`); return }
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
      forkOf: !prev && forkOf ? { id: forkOf, relay: forkTagRaw?.[2] || undefined, author: parent?.pubkey } : undefined,
    })
    setStatus('mining')
    const res = await signAndPublish(event, setStatus)
    if (!res.success || !res.event) { toast.error(res.error || 'Failed to publish release'); setStatus('error'); return }
    toast.success(`Released v${version}`)


    navigate(`/release/${releaseNevent(res.event.id, res.event.pubkey)}`)
  }

  return (
    <div className="space-y-6 py-6">
      <BackButton fallback="/drafts" />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{prev ? 'Release a new version' : 'Publish the first release'}</h1>
        <p className="text-sm text-neutral-400">
          A release is immutable. Implementers will point at its event id. Any change afterwards, even a typo, is a new version.
        </p>
      </div>

      {releases.length > 0 && (
        <div className="rounded-lg border border-edge bg-panel p-2">
          <p className="px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wider text-neutral-500">Existing versions</p>
          <VersionList versions={releases} />
        </div>
      )}

      {prev ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-200">What kind of change is this?</label>
          <div className="grid gap-2 sm:grid-cols-3">
            <BumpOption
              active={bump === 'minor'}
              onClick={() => { setBump('minor'); setVersion(nextMinor(prev.version)) }}
              title="Minor"
              version={nextMinor(prev.version)}
              blurb="Clarifications, typo fixes, wording. Nothing implementers must change."
            />
            <BumpOption
              active={bump === 'major'}
              onClick={() => { setBump('major'); setVersion(nextMajor(prev.version)) }}
              title="Major"
              version={nextMajor(prev.version)}
              blurb="Normative change. Implementations of the previous version may no longer comply."
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => setBump('custom')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setBump('custom') }}
              className={cn('flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition-colors', bump === 'custom' ? 'border-purple-500/60 bg-purple-500/10' : 'border-edge bg-panel hover:border-neutral-600')}
            >
              <span className="text-sm font-medium text-neutral-200">Custom</span>
              {bump === 'custom' ? (
                <Input
                  autoFocus
                  value={version}
                  onChange={(e) => setVersion(e.target.value.trim())}
                  className={cn('h-8 border-edge bg-panel font-mono text-sm', !versionOk && 'border-red-500/60')}
                />
              ) : (
                <span className="text-xs text-neutral-500">Type a version yourself.</span>
              )}
            </div>
          </div>
          <p className="text-[11px] text-neutral-600">
            {taken ? `v${version} already exists.` : !versionOk ? 'Dotted integers only, e.g. 1, 1.1, 2.' : `Previous: v${prev.version}. This release will be v${version}.`}
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-neutral-400">
          First release. It will be <span className="font-mono text-neutral-200">v1</span>. Later releases choose minor or major from here.
        </p>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-200">Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-edge bg-panel" maxLength={LIMITS.title} />
        <CharCounter value={title} max={LIMITS.title} />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-200">Summary <span className="text-neutral-500">(optional)</span></label>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className="border-edge bg-panel" maxLength={LIMITS.summary} />
        <CharCounter value={summary} max={LIMITS.summary} />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-200">Spec text <span className="text-neutral-500">(frozen on publish)</span></label>
        <MarkdownEditor value={content} onChange={setContent} maxLength={LIMITS.body} />
      </div>

      <div className="space-y-2 rounded-lg border border-edge bg-panel p-3 text-sm">
        <div className="flex items-center justify-between">
          <p className="font-medium text-neutral-200">Reference <span className="font-normal text-neutral-500">(set automatically)</span></p>
          <Lock className="h-3.5 w-3.5 text-neutral-500" />
        </div>
        <RefRow label="Spec id" hint="v tag" value={specId(draft.uuid, versionOk ? version : '?')} />
        <RefRow label="Lineage" hint="o tag" value={prev ? 'updated' : 'original'} note={prev ? 'A later version of an existing proposal.' : 'The first release of this proposal. Listings query this.'} />
        <RefRow label="Draft" hint="a tag" value={draft.coord} href={`/draft/${draftNaddr(draft.pubkey, draft.uuid)}`} />
        {!prev && forkOf && <RefRow label="Forked from" hint="e tag, fork" value={forkOf} href={`/release/${nip19.neventEncode({ id: forkOf, author: parent?.pubkey })}`} note={parent ? `${parent.title} v${parent.version}` : undefined} />}
        {!prev && forkOf && parent && <RefRow label="Parent author" hint="p tag" value={parent.pubkey} note={shortNpub(nip19.npubEncode(parent.pubkey))} />}
        {prev && <RefRow label="Previous version" hint="e tag, prev" value={prev.id} href={`/release/${releaseNevent(prev.id, prev.pubkey)}`} />}
        <p className="text-[11px] text-neutral-600">The spec id is what implementers point at. Kinds and topics are copied from the draft as well.</p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-purple-500/30 bg-purple-500/5 px-4 py-3">
        <p className="flex items-center gap-2 text-xs text-neutral-400"><Lock className="h-3.5 w-3.5 text-purple-400" /> The release itself cannot be edited. The draft stays editable, and a future release from it becomes the next version.</p>
        <div className="flex items-center gap-3">
          {status && status !== 'done' && status !== 'error' && <span className="text-xs text-neutral-500">{status === 'mining' ? 'Proof of work…' : status === 'signing' ? 'Signing…' : 'Publishing…'}</span>}
          <Button onClick={publish} disabled={busy || !versionOk} className="gap-2 bg-purple-600 text-white hover:bg-purple-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Publish release v{version}
          </Button>
        </div>
      </div>
    </div>
  )
}

function BumpOption({ active, onClick, title, version, blurb }: { active: boolean; onClick: () => void; title: string; version: string; blurb: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors', active ? 'border-purple-500/60 bg-purple-500/10' : 'border-edge bg-panel hover:border-neutral-600')}
    >
      <span className="flex items-center justify-between text-sm font-medium text-neutral-200">
        {title}
        <span className="font-mono text-xs text-purple-300">v{version}</span>
      </span>
      <span className="text-xs text-neutral-500">{blurb}</span>
    </button>
  )
}

function RefRow({ label, hint, value, href, note }: { label: string; hint: string; value: string; href?: string; note?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="grid items-center gap-x-3 gap-y-0.5 sm:grid-cols-[9rem_1fr_auto]">
      <span className="text-xs text-neutral-400">{label} <span className="text-neutral-600">({hint})</span>{note && <Tip label={note}><span className="block truncate text-[11px] text-neutral-500">{note}</span></Tip>}</span>
      <Tip label={value} className="max-w-[90vw] break-all font-mono"><code className="min-w-0 truncate rounded bg-sunken px-2 py-1 font-mono text-xs text-neutral-300">{value}</code></Tip>
      <span className="flex items-center gap-1">
        <Tip label={copied ? 'Copied' : 'Copy'}>
          <button type="button" onClick={copy} className="rounded p-1 text-neutral-500 hover:text-neutral-200" aria-label="Copy">
            {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </Tip>
        {href && <Tip label="Open"><Link to={href} className="rounded p-1 text-neutral-500 hover:text-neutral-200" aria-label="Open"><Link2 className="h-3.5 w-3.5" /></Link></Tip>}
      </span>
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
