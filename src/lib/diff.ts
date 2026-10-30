/**
 * Line diff for spec text (release bodies). Classic LCS dynamic programme:
 * O(n·m) cells, fine for the few hundred lines a release body holds, and it
 * needs no dependency.
 */

export type DiffOp = 'same' | 'add' | 'del'

export interface DiffLine {
  op: DiffOp
  text: string
  /** 1-based line number in the old text (del/same). */
  a?: number
  /** 1-based line number in the new text (add/same). */
  b?: number
}

export interface DiffStats {
  added: number
  removed: number
}

function splitLines(s: string): string[] {
  const lines = s.replace(/\r\n?/g, '\n').split('\n')
  // A trailing newline yields an empty last element that is not a real line.
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  const n = a.length
  const m = b.length

  // Trim the common prefix and suffix first: specs change in the middle.
  let start = 0
  while (start < n && start < m && a[start] === b[start]) start++
  let endA = n
  let endB = m
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }

  const out: DiffLine[] = []
  for (let i = 0; i < start; i++) out.push({ op: 'same', text: a[i], a: i + 1, b: i + 1 })

  // LCS table over the middle section.
  const la = endA - start
  const lb = endB - start
  const dp: Uint32Array[] = []
  for (let i = 0; i <= la; i++) dp.push(new Uint32Array(lb + 1))
  for (let i = la - 1; i >= 0; i--) {
    for (let j = lb - 1; j >= 0; j--) {
      dp[i][j] = a[start + i] === b[start + j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < la && j < lb) {
    if (a[start + i] === b[start + j]) {
      out.push({ op: 'same', text: a[start + i], a: start + i + 1, b: start + j + 1 })
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ op: 'del', text: a[start + i], a: start + i + 1 })
      i++
    } else {
      out.push({ op: 'add', text: b[start + j], b: start + j + 1 })
      j++
    }
  }
  while (i < la) { out.push({ op: 'del', text: a[start + i], a: start + i + 1 }); i++ }
  while (j < lb) { out.push({ op: 'add', text: b[start + j], b: start + j + 1 }); j++ }

  for (let k = 0; k < n - endA; k++) {
    out.push({ op: 'same', text: a[endA + k], a: endA + k + 1, b: endB + k + 1 })
  }
  return out
}

export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.op === 'add') added++
    else if (l.op === 'del') removed++
  }
  return { added, removed }
}

/** A hunk is a run of changed lines with `context` unchanged lines around it; gaps are collapsed. */
export type DiffChunk = { kind: 'lines'; lines: DiffLine[] } | { kind: 'gap'; count: number }

export function toChunks(lines: DiffLine[], context = 3): DiffChunk[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].op === 'same') continue
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true
  }
  const out: DiffChunk[] = []
  let i = 0
  while (i < lines.length) {
    if (keep[i]) {
      const run: DiffLine[] = []
      while (i < lines.length && keep[i]) run.push(lines[i++])
      out.push({ kind: 'lines', lines: run })
    } else {
      let count = 0
      while (i < lines.length && !keep[i]) { count++; i++ }
      out.push({ kind: 'gap', count })
    }
  }
  return out
}
