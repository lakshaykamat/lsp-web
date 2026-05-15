export type DiffToken =
  | { kind: "text"; value: string }
  | { kind: "del"; value: string }
  | { kind: "ins"; value: string }

const PATTERN = /\\(del|ins)\{((?:[^{}]|\{[^{}]*\})*)\}/g

export function parseDiff(source: string): DiffToken[] {
  const tokens: DiffToken[] = []
  let cursor = 0

  for (const match of source.matchAll(PATTERN)) {
    const start = match.index ?? 0
    if (start > cursor) {
      tokens.push({ kind: "text", value: source.slice(cursor, start) })
    }
    const kind = match[1] as "del" | "ins"
    tokens.push({ kind, value: match[2] })
    cursor = start + match[0].length
  }

  if (cursor < source.length) {
    tokens.push({ kind: "text", value: source.slice(cursor) })
  }

  return tokens
}

export function countEdits(tokens: DiffToken[]) {
  let del = 0
  let ins = 0
  for (const t of tokens) {
    if (t.kind === "del") del += 1
    else if (t.kind === "ins") ins += 1
  }
  return { del, ins }
}
