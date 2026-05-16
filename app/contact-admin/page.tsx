"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

const ADMIN_EMAIL = "lakshaykamat.dev@gmail.com"

type VersionInfo = {
  version: string
  git_sha: string | null
}

export default function ContactAdminPage() {
  const [version, setVersion] = useState<VersionInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/version")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: VersionInfo | null) => {
        if (!cancelled && data) setVersion(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const versionLabel = version
    ? `v${version.version}${version.git_sha ? ` (${version.git_sha.slice(0, 7)})` : ""}`
    : "—"

  return (
    <main className="bg-background text-foreground flex min-h-screen items-center justify-center px-6 py-16 font-mono">
      <div className="w-full max-w-md text-[13px] leading-7">
        <div className="text-muted-foreground">
          <span className="text-primary">$</span> lsp status
        </div>

        <div className="mt-5 space-y-1">
          <Row label="status" value="maintenance" valueClass="text-amber-600 dark:text-amber-400" />
          <Row label="message" value="we’ll be right back" />
          <Row label="version" value={versionLabel} />
          <Row label="contact" value={ADMIN_EMAIL} />
        </div>

        <Link
          href={`mailto:${ADMIN_EMAIL}`}
          className="text-foreground hover:text-primary mt-6 inline-block transition-colors"
        >
          <span className="text-muted-foreground">[ </span>
          email admin
          <span className="text-muted-foreground"> ]</span>
        </Link>
      </div>
    </main>
  )
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex gap-3">
      <span className="text-primary select-none">▸</span>
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className={valueClass ?? "text-foreground"}>{value}</span>
    </div>
  )
}
