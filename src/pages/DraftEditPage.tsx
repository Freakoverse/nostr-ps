import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { Loader2 } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAuthStore } from '@/stores/authStore'
import { useLoginModalStore } from '@/stores/loginModalStore'
import { KINDS } from '@/lib/constants'
import { fetchDraft, type Draft, type KindRef } from '@/lib/nostr/nipps'
import { useSeoMeta } from '@/hooks/useSeoMeta'
import { Button } from '@/components/ui/button'
import { DraftEditor } from '@/components/ps/DraftEditor'

export interface ForkPrefill {
  title: string
  summary?: string
  content: string
  kinds: KindRef[]
  topics: string[]
  forkOfId: string
}

/** /submit-draft (new, optionally prefilled by a fork) and /draft/:naddr/edit. */
export function DraftEditPage() {
  const { naddr } = useParams<{ naddr?: string }>()
  const location = useLocation()
  const pubkey = useAuthStore((s) => s.pubkey)
  const prefill = (location.state as { fork?: ForkPrefill } | null)?.fork
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(!!naddr)
  useSeoMeta({ title: naddr ? 'Edit draft' : 'New draft' })

  const addr = useMemo(() => {
    if (!naddr) return null
    try {
      const d = nip19.decode(naddr)
      if (d.type === 'naddr' && d.data.kind === KINDS.PS_DRAFT) return d.data
    } catch { /* fallthrough */ }
    return null
  }, [naddr])

  useEffect(() => {
    if (!addr) return
    let cancelled = false
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    fetchDraft(relays, addr.pubkey, addr.identifier)
      .then((d) => { if (!cancelled) setDraft(d) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [addr])

  if (!pubkey) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-neutral-300">Publishing a draft needs a signer.</p>
        <Button variant="outline" className="border-edge" onClick={() => useLoginModalStore.getState().open()}>Log in</Button>
      </div>
    )
  }
  if (loading) return <div className="flex items-center justify-center gap-2 py-24 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading draft…</div>
  if (naddr && (!draft || draft.pubkey !== pubkey)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-neutral-300">{draft ? 'Only the author can edit this draft.' : 'Draft not found.'}</p>
        <Button asChild variant="outline" className="border-edge"><Link to="/drafts">Back to drafts</Link></Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{draft ? 'Edit draft' : prefill ? 'Fork into a new draft' : 'New draft'}</h1>
        <p className="text-sm text-neutral-400">
          {draft
            ? 'Edits replace the draft in place. Releases already published are unaffected.'
            : prefill
              ? 'A fork is a new proposal with its own identity. The release form will record where it came from.'
              : 'Drafts are editable and open for discussion. Keep it in draft until it has been used and has stopped changing.'}
        </p>
      </div>
      <DraftEditor initial={draft ?? undefined} prefill={prefill} />
    </div>
  )
}
