import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlossomImage } from './BlossomImage'
import { embedFromIframe } from '@/lib/embeds'
import { LinkEmbed } from '@/components/social/LinkEmbed'

/**
 * Fenced code block with a header showing the language (if given) and a copy
 * button.
 */
function CodeBlock({ lang, code }: { lang?: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-edge bg-well">
      <div className="flex items-center justify-between border-b border-edge bg-panel px-3 py-1.5">
        <span className="font-mono text-xs text-neutral-500">{lang || 'text'}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-xs text-neutral-400 transition-colors hover:text-foreground"
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5 text-green-400" /> Copied</>
          ) : (
            <><Copy className="h-3.5 w-3.5" /> Copy</>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm">
        <code className="font-mono text-neutral-200">{code}</code>
      </pre>
    </div>
  )
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i
const AUDIO_EXT = /\.(mp3|ogg|oga|wav|m4a|flac)(\?|#|$)/i

/** src of the first `<source>` child of a hast video/audio node, if any. */
function firstChildSourceSrc(node: unknown): string | undefined {
  const kids = (node as { children?: Array<{ tagName?: string; properties?: Record<string, unknown> }> })?.children
  const s = kids?.find((c) => c.tagName === 'source' && typeof c.properties?.src === 'string')
  return s?.properties?.src as string | undefined
}

/**
 * A `<video>`/`<audio>` player for a media file in a post body.
 *
 * Reached two ways: a raw `<video>`/`<audio>` the author pasted, or image
 * syntax whose src is a media file (`![](clip.mp4)`) — markdown has no video
 * syntax, so that's the closest thing to a "markdown way" and it's upgraded
 * here rather than rendered as a broken <img>.
 *
 * `preload="metadata"` so opening a post with several clips doesn't download
 * them all — only the poster frame / duration is fetched until play. Only
 * http(s) srcs are honored; a `javascript:`/`data:` src is dropped.
 */
function MarkdownMedia({ src, kind, poster }: { src: string; kind: 'video' | 'audio'; poster?: string }) {
  if (!/^https?:\/\//i.test(src)) return null
  if (kind === 'audio') {
    return <audio controls preload="metadata" src={src} className="my-4 block w-full" />
  }
  return (
    <video
      controls
      playsInline
      preload="metadata"
      poster={poster}
      src={src}
      className="my-4 block h-auto w-full rounded-lg border border-edge"
    />
  )
}

/**
 * Image rendered inside markdown bodies: lazy-loaded, with a pulsing
 * skeleton while it loads and Blossom server failover (via BlossomImage).
 * Uses <span> elements (not <div>) because markdown images live inside <p>.
 *
 * A src that points at a video/audio file is played instead — markdown's image
 * syntax is the only inline-media syntax it has, so `![](clip.mp4)` should show
 * a player, not a broken image icon.
 */
function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [loaded, setLoaded] = useState(false)
  if (!src) return null
  if (VIDEO_EXT.test(src)) return <MarkdownMedia src={src} kind="video" />
  if (AUDIO_EXT.test(src)) return <MarkdownMedia src={src} kind="audio" />

  return (
    <span
      className={cn(
        'relative my-4 block overflow-hidden rounded-lg border border-edge',
        !loaded && 'min-h-[160px]'
      )}
    >
      {!loaded && (
        <span className="absolute inset-0 z-[1] block bg-edge animate-pulse" />
      )}
      <BlossomImage
        src={src}
        alt={alt || ''}
        className="relative z-[2] block h-auto w-full"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </span>
  )
}

/**
 * An `<iframe>` an author put in a post body.
 *
 * The src is re-parsed and checked against the embed allowlist rather than
 * trusted — see embedFromIframe for why the destination, not the markup, is
 * what matters. A refused src degrades to a plain link so the content isn't
 * lost and the reader can still see where it points.
 *
 * Wrapped in `<span>`s because markdown puts inline HTML inside a `<p>`, where
 * a `<div>` would be invalid nesting (same reason MarkdownImage uses spans).
 */
function MarkdownEmbed({ src, title }: { src?: string; title?: string }) {
  if (!src) return null
  const embed = embedFromIframe(src)

  if (!embed) {
    return (
      <span className="my-4 block">
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-purple-400 underline underline-offset-2 hover:text-purple-300"
        >
          {title || src}
        </a>
      </span>
    )
  }

  return (
    <span className="my-4 block">
      <LinkEmbed embed={title ? { ...embed, title } : embed} />
    </span>
  )
}

/** Plain text of a React subtree, for heading ids. */
function textOf(children: React.ReactNode): string {
  if (children == null || typeof children === 'boolean') return ''
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(textOf).join('')
  if (typeof children === 'object' && 'props' in children) return textOf((children as { props: { children?: React.ReactNode } }).props.children)
  return ''
}

/** GitHub-style heading slug: lowercase, drop punctuation, spaces to hyphens. */
export function headingSlug(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-')
}

/** Fired on an in-page anchor target so a clipped CollapsibleBody above it can open. */
export const REVEAL_EVENT = 'ps:reveal'

/** Find the element a `#fragment` points at: our heading slug, or an author-written id (sanitize prefixes those). */
function anchorTarget(hash: string, within?: HTMLElement | null): HTMLElement | null {
  const id = decodeURIComponent(hash.replace(/^#/, ''))
  if (!id) return null
  const root: ParentNode = within ?? document
  return root.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ?? root.querySelector<HTMLElement>(`#${CSS.escape("user-content-" + id)}`)
}

/** Scroll to an in-page anchor, opening any collapsed body it sits in first. */
export function scrollToAnchor(hash: string, within?: HTMLElement | null): boolean {
  const el = anchorTarget(hash, within)
  if (!el) return false
  el.dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true }))
  // Let a collapsed body expand (React flushes the click's state update first) before measuring where the target is.
  setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0)
  return true
}

const heading = (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', className: string) =>
  ({ node, children, ...props }: React.ComponentProps<typeof Tag> & { node?: unknown }) => (
    <Tag id={headingSlug(textOf(children)) || undefined} className={cn('scroll-mt-20', className)} {...props}>{children}</Tag>
  )

const components: Components = {
  p: ({ node, ...props }) => <p className="mb-3 leading-relaxed" {...props} />,
  iframe: ({ node, src, title }) => <MarkdownEmbed src={src as string} title={title as string} />,
  // <video>/<audio> carry their url either as a src attribute or a <source>
  // child, so both are checked. <source> renders nothing on its own — its
  // parent consumes it.
  video: ({ node, src, poster }) => {
    const url = (src as string) || firstChildSourceSrc(node)
    return url ? <MarkdownMedia src={url} kind="video" poster={poster as string} /> : null
  },
  audio: ({ node, src }) => {
    const url = (src as string) || firstChildSourceSrc(node)
    return url ? <MarkdownMedia src={url} kind="audio" /> : null
  },
  source: () => null,
  a: ({ node, href, ...props }) => {
    const linkClass = 'text-purple-400 underline underline-offset-2 hover:text-purple-300'
    // A `#section` link scrolls within the document; everything else opens a new tab.
    if (href?.startsWith('#')) {
      return (
        <a
          href={href}
          className={linkClass}
          onClick={(e) => {
            const within = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-markdown]')
            if (scrollToAnchor(href, within) || scrollToAnchor(href)) {
              e.preventDefault()
              history.replaceState(history.state, "", href)
            }
          }}
          {...props}
        />
      )
    }
    return <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={linkClass} {...props} />
  },
  img: ({ node, src, alt }) => <MarkdownImage src={src as string} alt={alt as string} />,
  h1: heading('h1', 'mt-6 mb-3 text-2xl font-bold text-neutral-100'),
  h2: heading('h2', 'mt-5 mb-2.5 text-xl font-bold text-neutral-100'),
  h3: heading('h3', 'mt-4 mb-2 text-lg font-semibold text-neutral-100'),
  h4: heading('h4', 'mt-4 mb-2 text-base font-semibold text-neutral-200'),
  h5: heading('h5', 'mt-3 mb-1.5 text-sm font-semibold text-neutral-200'),
  h6: heading('h6', 'mt-3 mb-1.5 text-sm font-semibold text-neutral-400'),
  ul: ({ node, ...props }) => <ul className="mb-3 list-disc space-y-1 pl-6" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-3 list-decimal space-y-1 pl-6" {...props} />,
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className="mb-4 border-l-2 border-purple-500/50 pl-4 italic text-neutral-400" {...props} />
  ),
  hr: ({ node, ...props }) => <hr className="my-6 border-edge" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-neutral-100" {...props} />,
  em: ({ node, ...props }) => <em className="italic" {...props} />,
  // Block code is rendered by the `code` handler as a full <CodeBlock>, so `pre`
  // just unwraps to avoid an extra <pre> wrapper.
  pre: ({ children }) => <>{children}</>,
  code: ({ node, className, children, ...props }) => {
    const raw = String(children)
    const match = /language-(\w+)/.exec(className || '')
    const isBlock = !!match || raw.includes('\n')
    if (!isBlock) {
      return (
        <code
          className="rounded bg-edge px-1.5 py-0.5 font-mono text-[0.85em] text-purple-200"
          {...props}
        >
          {children}
        </code>
      )
    }
    return <CodeBlock lang={match?.[1]} code={raw.replace(/\n$/, '')} />
  },
  table: ({ node, ...props }) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th className="border border-edge bg-panel px-3 py-1.5 text-left font-semibold text-neutral-200" {...props} />
  ),
  td: ({ node, ...props }) => <td className="border border-edge px-3 py-1.5" {...props} />,
}

interface MarkdownProps {
  content: string
  className?: string
  /** Treat single newlines as paragraph flow (for hard-wrapped documents like the spec). Default: line breaks. */
  softBreaks?: boolean
}

// Sanitize schema (GitHub's, hardened). rehype-sanitize runs AFTER rehype-raw,
// so it cleans any embedded/raw HTML before it becomes React elements: scripts,
// event handlers (onclick…), `javascript:`/`data:` URLs, <style>, etc. are
// dropped. We keep the code-block language class so fenced code still
// highlights, and let anchors carry href/title (our <a> component forces
// target=_blank rel=noopener noreferrer nofollow regardless).
//
// `iframe` is allowed through with a deliberately tiny attribute list so authors
// can paste a platform embed code. Note what is NOT allowed: `srcdoc` (which
// would let arbitrary HTML — and script — run in the frame), `name`, `style`,
// and every event handler. `src` survives sanitizing but is not trusted here;
// MarkdownEmbed re-parses it and refuses any origin that isn't a known player,
// so passing the sanitizer is necessary but not sufficient to get framed.
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'iframe', 'video', 'audio', 'source'],
  attributes: {
    ...defaultSchema.attributes,
    iframe: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'allowFullScreen'],
    // Media plays a file, it doesn't execute a page, so this is close to the
    // <img> risk profile the schema already accepts. The component ignores most
    // of these and renders its own controlled player; they're listed so a pasted
    // tag survives sanitizing to reach it. Event handlers (onerror…) and srcdoc
    // are still dropped, since they're not on the list.
    video: ['src', 'poster', 'controls', 'width', 'height', 'preload', 'loop', 'muted', 'playsinline'],
    audio: ['src', 'controls', 'preload', 'loop'],
    source: ['src', 'type'],
  },
}

/**
 * Renders user-authored markdown (spec bodies, reviews, comments) with GFM support,
 * single-newline line breaks, and dark-theme styling. Some legacy posts store
 * raw HTML bodies rather than markdown, so raw HTML IS rendered — but only after
 * rehype-sanitize strips anything unsafe, so output stays XSS-safe.
 */
export function Markdown({ content, className, softBreaks = false }: MarkdownProps) {
  const root = useRef<HTMLDivElement>(null)

  // Arriving with a `#section` in the URL: scroll once the headings exist.
  useEffect(() => {
    const hash = window.location.hash
    if (hash && root.current) scrollToAnchor(hash, root.current)
  }, [content])

  return (
    <div ref={root} data-markdown className={cn('text-sm leading-relaxed text-neutral-300 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}>
      <ReactMarkdown
        remarkPlugins={softBreaks ? [remarkGfm] : [remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
