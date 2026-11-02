import { useEffect, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { withSelector, type PostLinks } from '@/lib/nostr/postLinks'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tip } from '@/components/shared/Tip'
import { cn } from '@/lib/utils'

/** One copyable value with a label and a word on what it is. */
function Row({ label, hint, value, highlight }: { label: string; hint: string; value: string; highlight?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className={cn('rounded-lg border bg-panel p-3', highlight ? 'border-purple-500/40' : 'border-edge')}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-200">{label}</p>
          <p className="text-[11px] text-neutral-500">{hint}</p>
        </div>
        <Tip label={copied ? 'Copied' : 'Copy'}>
          <button type="button" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`} className="shrink-0 rounded-md border border-edge bg-panel-2 p-2 text-neutral-400 transition-colors hover:border-purple-500/40 hover:text-purple-300">
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </Tip>
      </div>
      <p className="mt-2 break-all rounded-md bg-well px-2.5 py-2 font-mono text-[11px] leading-relaxed text-neutral-300">{value}</p>
    </div>
  )
}

/**
 * Every way to share a draft or release: the short link and the native link,
 * the short address and the native address. The short forms exist only when
 * the event carries a verified NIP-SHORT code; the dialog says so otherwise.
 * While open it checks relays once for a collision and appends a selector to
 * the short forms if the author has another event on the same code.
 */
export function ShareDialog({ open, onOpenChange, links: base, title }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  links: PostLinks
  title: string
}) {
  const [links, setLinks] = useState(base)
  useEffect(() => { setLinks(base) }, [base])
  useEffect(() => {
    if (!open || !base.shortAddress) return
    let cancelled = false
    const relays = useSettingsStore.getState().getAllEnabledRelayUrls('read')
    void withSelector(base, relays).then((exact) => { if (!cancelled) setLinks(exact) })
    return () => { cancelled = true }
  }, [open, base])

  const isDraft = links.nativePath.startsWith('/draft/')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-edge bg-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground"><Share2 className="h-5 w-5 text-purple-400" /> Share</DialogTitle>
          <DialogDescription className="text-neutral-400">
            <span className="text-neutral-200">{title}</span>. Links open this site; addresses work in any Nostr client that understands them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {links.shortUrl && links.shortAddress ? (
            <>
              <Row label="Short link" hint="This site, NIP-SHORT address in the path" value={links.shortUrl} highlight />
              <Row label="Short address" hint="NIP-SHORT: author in base 36 plus a 6-character code" value={links.shortAddress} />
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-edge px-3 py-2 text-xs text-neutral-500">
              This {isDraft ? 'draft' : 'release'} was published before short addresses, so only the long forms exist.
            </p>
          )}
          <Row label="Link" hint="This site, NIP-19 address in the path" value={links.nativeUrl} />
          <Row label="Address" hint={isDraft ? 'NIP-19 naddr: kind, author, and identifier' : 'NIP-19 nevent: event id and author'} value={links.nativeAddress} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
