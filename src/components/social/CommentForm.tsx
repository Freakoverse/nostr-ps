import { useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModalStore } from '@/stores/loginModalStore'
import { buildCommentEvent } from '@/lib/nostr/events'
import { signAndPublish, type PublishStatus } from '@/lib/nostr/publish'
import { PublishPhase } from '@/components/shared/PublishPhase'
import type { NostrTarget } from '@/lib/nostr/social'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CharCounter } from '@/components/shared/CharCounter'
import { LIMITS } from '@/lib/limits'

const COMMENT_MAX = LIMITS.comment

interface CommentFormProps {
  root: NostrTarget
  /** When replying to a specific comment; omit for a top-level comment. */
  replyTo?: NostrTarget
  onPublished: () => void
  onCancel?: () => void
  autoFocus?: boolean
  placeholder?: string
}

export function CommentForm({ root, replyTo, onPublished, onCancel, autoFocus, placeholder }: CommentFormProps) {
  const { pubkey } = useAuthStore()
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [phase, setPhase] = useState<PublishStatus | null>(null)

  if (!pubkey) {
    return (
      <p className="text-sm text-neutral-500">
        <button
          type="button"
          onClick={() => useLoginModalStore.getState().open()}
          className="text-purple-400 hover:text-purple-300"
        >
          Log in
        </button>{' '}
        to join the discussion.
      </p>
    )
  }

  const submit = async () => {
    const text = content.trim()
    if (!text || sending) return
    if (text.length > COMMENT_MAX) {
      toast.error(`Comment is too long (max ${COMMENT_MAX.toLocaleString()} characters)`)
      return
    }
    setSending(true)
    try {
      const event = buildCommentEvent({ content: text, rootEvent: root, replyTo })
      const res = await signAndPublish(event, setPhase)
      if (!res.success) throw new Error(res.error)
      setContent('')
      toast.success(replyTo ? 'Reply posted' : 'Comment posted')
      onPublished()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post')
    } finally {
      setSending(false); setPhase(null)
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={placeholder ?? 'Write a comment…'}
        rows={3}
        maxLength={COMMENT_MAX}
        autoFocus={autoFocus}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
        }}
        className="bg-panel-2 border-edge text-foreground resize-y min-h-[76px]"
      />
      <div className="flex items-center justify-between gap-2">
        <CharCounter value={content} max={COMMENT_MAX} />
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-neutral-400">
              Cancel
            </Button>
          )}
          <PublishPhase status={phase} className="mr-auto" />
          <Button
            size="sm"
            onClick={submit}
            disabled={sending || !content.trim()}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {replyTo ? 'Reply' : 'Comment'}
          </Button>
        </div>
      </div>
    </div>
  )
}
