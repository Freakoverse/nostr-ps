import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { signAndPublish, type PublishStatus } from '@/lib/nostr/publish'
import { buildDraftEvent, generateUuid, draftNaddr, type Draft, type KindRef } from '@/lib/nostr/nipps'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { LIMITS } from '@/lib/limits'
import { MarkdownEditor } from './MarkdownEditor'
import { KindsEditor } from './KindsEditor'
import { TopicsEditor } from './TopicsEditor'

const STATUS_TEXT: Record<PublishStatus, string> = {
  mining: 'Proof of work…', signing: 'Signing…', publishing: 'Publishing…', done: 'Done', error: 'Failed',
}

/**
 * Create or edit a draft (kind 30817). The uuid is minted once on first save
 * and never changes; every later save is a replacement of the same address.
 */
export function DraftEditor({ initial, prefill }: { initial?: Draft; prefill?: Partial<Pick<Draft, 'title' | 'summary' | 'content' | 'kinds' | 'topics'>> & { forkOfId?: string } }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState(initial?.title ?? prefill?.title ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? prefill?.summary ?? '')
  const [content, setContent] = useState(initial?.content ?? prefill?.content ?? '')
  const [kinds, setKinds] = useState<KindRef[]>(initial?.kinds ?? prefill?.kinds ?? [])
  const [topics, setTopics] = useState<string[]>(initial?.topics ?? prefill?.topics ?? [])
  const [status, setStatus] = useState<PublishStatus | null>(null)

  const busy = status !== null && status !== 'done' && status !== 'error'

  const save = async () => {
    if (!title.trim()) { toast.error('Give the draft a title'); return }
    if (!content.trim()) { toast.error('The draft body is empty'); return }
    if (content.length > LIMITS.body) { toast.error(`The body is too long (max ${LIMITS.body.toLocaleString()} characters)`); return }
    const uuid = initial?.uuid ?? generateUuid()
    const event = buildDraftEvent({
      uuid,
      title,
      summary: summary.trim() || undefined,
      content,
      kinds,
      topics,
      // Drafts are work in progress by definition (§5.1); the release flow
      // restamps this as "released". Shared-kind directories read it too.
      status: initial?.status === 'released' ? 'released' : 'review',
      releaseId: initial?.releaseId,
    })
    // A fork hint so the release form can point at the parent (§4.2 `fork`).
    if (prefill?.forkOfId && !initial) event.tags.push(['fork', prefill.forkOfId])
    else if (initial) {
      const f = initial.event.tags.find((t) => t[0] === 'fork')
      if (f) event.tags.push(f)
    }
    setStatus('mining')
    const res = await signAndPublish(event, setStatus)
    if (!res.success || !res.event) {
      toast.error(res.error || 'Failed to publish draft')
      setStatus('error')
      return
    }
    toast.success(initial ? 'Draft updated' : 'Draft published')
    navigate(`/draft/${draftNaddr(res.event.pubkey, uuid)}`)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-200">Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Threaded chat rooms" className="border-edge bg-panel" maxLength={LIMITS.title} />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-200">Summary <span className="text-neutral-500">(optional)</span></label>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One paragraph: what this spec does and why." rows={2} className="border-edge bg-panel" maxLength={LIMITS.summary} />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-200">Spec</label>
        <MarkdownEditor value={content} onChange={setContent} maxLength={LIMITS.body} placeholder={'# Motivation\n\n…\n\n# Events\n\n…\n\n# Client behavior\n\n…'} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-200">Kinds this spec defines or uses</label>
          <KindsEditor value={kinds} onChange={setKinds} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-200">Topics/Hashtags</label>
          <TopicsEditor value={topics} onChange={setTopics} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {status && status !== 'done' && <span className="text-xs text-neutral-500">{STATUS_TEXT[status]}</span>}
        <Button onClick={save} disabled={busy} className="gap-2 bg-purple-600 text-white hover:bg-purple-700">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {initial ? 'Save draft' : 'Publish draft'}
        </Button>
      </div>
    </div>
  )
}
