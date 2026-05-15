import { Fragment } from "react"

import { type DiffToken } from "@/lib/parse-diff"
import { cn } from "@/lib/utils"

export function DiffView({
  tokens,
  showInline = true,
  className,
}: {
  tokens: DiffToken[]
  showInline?: boolean
  className?: string
}) {
  return (
    <pre
      className={cn(
        "font-mono text-[12.5px] leading-[1.7] whitespace-pre-wrap break-words",
        "text-foreground/85",
        className,
      )}
    >
      {tokens.map((t, i) => {
        if (t.kind === "text") return <Fragment key={i}>{t.value}</Fragment>
        if (!showInline && t.kind === "del") return null
        return (
          <span
            key={i}
            className={t.kind === "del" ? "diff-del" : "diff-ins"}
            data-kind={t.kind}
          >
            {t.value}
          </span>
        )
      })}
    </pre>
  )
}
