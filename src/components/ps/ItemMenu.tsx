import { useState, type ReactNode } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Event as NostrEvent } from 'nostr-tools'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { RequestDeleteDialog } from '@/components/shared/RequestDeleteDialog'
import { PostMenu } from './PostMenu'

/**
 * Three-dot menu for a claim, review or verdict: copy link and raw event
 * for everyone; edit and request deletion for the author. Deletion follows
 * the kind: addressable events get the tombstone replacement plus NIP-09,
 * regular events NIP-09 only (decided inside the dialog).
 */
export function ItemMenu({ event, link, mine, onEdit, noun, title, onDeleted, children }: {
  event: NostrEvent
  link?: string
  /** Viewer is the author: shows edit (when `onEdit` given) and delete. */
  mine?: boolean
  onEdit?: () => void
  /** Lowercase noun for the delete prompt, e.g. "claim". */
  noun: string
  /** What the delete prompt names, e.g. the software name. */
  title: string
  onDeleted?: () => void
  children?: ReactNode
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  return (
    <>
      <PostMenu event={event} link={link}>
        {children}
        {mine && onEdit && (
          <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </DropdownMenuItem>
        )}
        {mine && (
          <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="cursor-pointer text-red-400 focus:text-red-300">
            <Trash2 className="h-4 w-4 mr-2" /> Request deletion
          </DropdownMenuItem>
        )}
      </PostMenu>
      {mine && (
        <RequestDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          event={event}
          title={title}
          noun={noun}
          onDeleted={() => { setDeleteOpen(false); onDeleted?.() }}
        />
      )}
    </>
  )
}
