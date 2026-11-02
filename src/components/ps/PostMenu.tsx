import { useState, type ReactNode } from 'react'
import { MoreHorizontal, Copy, FileJson, Check, Share2 } from 'lucide-react'
import type { Event as NostrEvent } from 'nostr-tools'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { RawEventDialog } from '@/components/shared/RawEventDialog'
import { ShareDialog } from './ShareDialog'
import type { PostLinks } from '@/lib/nostr/postLinks'

/**
 * Three-dot menu for a draft or release: share, copy link, raw event, plus any
 * caller-supplied items (edit, delete, …) under a separator. With `share`
 * given, Copy link copies the short link when the post has one.
 */
export function PostMenu({ event, link, share, children }: {
  event: NostrEvent
  link?: string
  /** Every address of the post, for the Share dialog and the best link to copy. */
  share?: { links: PostLinks; title: string }
  children?: ReactNode
}) {
  const [rawOpen, setRawOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const href = share?.links.bestUrl ?? link ?? window.location.href

  const copy = () => {
    navigator.clipboard.writeText(href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      {/* Non-modal: a modal dropdown disables pointer events behind it, so a click
          inside a parent dialog would land on the body and dismiss the dialog. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-edge hover:text-foreground"
            aria-label="More"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-panel border-edge">
          {share && (
            <DropdownMenuItem onClick={() => setShareOpen(true)} className="cursor-pointer">
              <Share2 className="h-4 w-4 mr-2" /> Share
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={copy} className="cursor-pointer">
            {copied ? <Check className="h-4 w-4 mr-2 text-emerald-400" /> : <Copy className="h-4 w-4 mr-2" />} Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRawOpen(true)} className="cursor-pointer">
            <FileJson className="h-4 w-4 mr-2" /> Raw event
          </DropdownMenuItem>
          {children && (
            <>
              <DropdownMenuSeparator className="bg-edge" />
              {children}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <RawEventDialog open={rawOpen} onOpenChange={setRawOpen} event={event} />
      {share && <ShareDialog open={shareOpen} onOpenChange={setShareOpen} links={share.links} title={share.title} />}
    </>
  )
}
