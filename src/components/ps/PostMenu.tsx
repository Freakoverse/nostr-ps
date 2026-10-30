import { useState, type ReactNode } from 'react'
import { MoreHorizontal, Copy, FileJson, Check } from 'lucide-react'
import type { Event as NostrEvent } from 'nostr-tools'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { RawEventDialog } from '@/components/shared/RawEventDialog'

/**
 * Three-dot menu for a draft or release: copy link, raw event, plus any
 * caller-supplied items (edit, delete, …) under a separator.
 */
export function PostMenu({ event, link, children }: { event: NostrEvent; link?: string; children?: ReactNode }) {
  const [rawOpen, setRawOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const href = link ?? window.location.href

  const copy = () => {
    navigator.clipboard.writeText(href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <DropdownMenu>
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
    </>
  )
}
