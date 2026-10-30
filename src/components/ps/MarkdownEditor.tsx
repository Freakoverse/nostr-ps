import { useRef, useState } from 'react'
import { Eye, Pencil, ImagePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IMAGE_UPLOAD_ACCEPT } from '@/lib/constants'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/shared/Markdown'
import { MarkdownToolbar } from '@/components/shared/MarkdownToolbar'
import { CharCounter } from '@/components/shared/CharCounter'
import { BlossomUploadField } from '@/components/upload/BlossomUploadField'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

/** Markdown textarea with toolbar, preview toggle and Blossom image insert. */
export function MarkdownEditor({
  value, onChange, placeholder, minRows = 16, className, maxLength,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minRows?: number
  className?: string
  /** Hard cap on the body; a counter appears as the text approaches it. */
  maxLength?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)

  const insertAtCursor = (text: string) => {
    const ta = ref.current
    if (!ta) { onChange(value + text); return }
    const start = ta.selectionStart ?? value.length
    const end = ta.selectionEnd ?? value.length
    const next = value.slice(0, start) + text + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = start + text.length
    })
  }

  return (
    <div className={cn('rounded-lg border border-edge bg-panel', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-2 py-1.5">
        {!preview ? <MarkdownToolbar textareaRef={ref} value={value} onChange={onChange} /> : <span className="px-1 text-xs text-neutral-500">Preview</span>}
        <div className="flex items-center gap-1">
          {!preview && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setImageOpen(true)} className="h-7 gap-1 px-2 text-xs text-neutral-400">
              <ImagePlus className="h-3.5 w-3.5" /> Image
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((v) => !v)} className="h-7 gap-1 px-2 text-xs text-neutral-400">
            {preview ? <><Pencil className="h-3.5 w-3.5" /> Edit</> : <><Eye className="h-3.5 w-3.5" /> Preview</>}
          </Button>
        </div>
      </div>
      {preview ? (
        <div className="min-h-[200px] p-4">
          {value.trim() ? <Markdown content={value} /> : <p className="text-sm text-neutral-600">Nothing to preview.</p>}
        </div>
      ) : (
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={minRows}
          maxLength={maxLength}
          className="min-h-[300px] resize-y rounded-t-none border-0 bg-transparent font-mono text-[13px] leading-relaxed text-neutral-200"
        />
      )}
      {maxLength && !preview && <div className="px-3 pb-2"><CharCounter value={value} max={maxLength} /></div>}

      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="border-edge bg-dialog sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Insert image</DialogTitle>
            <DialogDescription className="text-neutral-400">Uploads to your Blossom servers and inserts a markdown image at the cursor.</DialogDescription>
          </DialogHeader>
          <BlossomUploadField
            accept={IMAGE_UPLOAD_ACCEPT}
            label="Drop an image or click to browse"
            resetAfter
            onUploaded={(r) => {
              insertAtCursor(`\n![${r.filename ?? 'image'}](${r.url})\n`)
              setImageOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
