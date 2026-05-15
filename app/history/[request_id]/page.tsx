"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowLeft, Copy, WarningCircle } from "@phosphor-icons/react"

import { SiteHeader } from "@/components/lsp/site-header"
import type { TransformError, UsageItem } from "@/lib/lsp-types"
import { cn } from "@/lib/utils"

export default function HistoryDetailPage({
  params,
}: {
  params: Promise<{ request_id: string }>
}) {
  const { request_id } = use(params)
  const [item, setItem] = useState<UsageItem | null>(null)
  const [error, setError] = useState<{
    data: TransformError
    status: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(
          `/api/usage/${encodeURIComponent(request_id)}`,
          { cache: "no-store", signal: ctrl.signal },
        )
        const data = await res.json()
        if (ctrl.signal.aborted) return
        if (!res.ok) {
          setError({ data: data as TransformError, status: res.status })
        } else {
          setItem(data as UsageItem)
        }
      } catch (err) {
        if (ctrl.signal.aborted) return
        setError({
          status: 0,
          data: {
            error: "network_error",
            detail: err instanceof Error ? err.message : "Network failure.",
            request_id: "—",
          },
        })
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    })()
    return () => ctrl.abort()
  }, [request_id])

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-8">
        <Link
          href="/history"
          className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-xs transition"
        >
          <ArrowLeft size={12} weight="bold" /> All runs
        </Link>

        {loading && <DetailSkeleton />}

        {error && (
          <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border p-10 text-center">
            <WarningCircle size={24} weight="thin" className="text-foreground" />
            <div className="text-muted-foreground text-[10px] tracking-wider uppercase">
              {error.status || "—"} · {error.data.error}
            </div>
            <p className="text-foreground max-w-md text-sm">
              {error.data.detail}
            </p>
            <p className="text-muted-foreground font-mono text-[10px]">
              request_id: {error.data.request_id}
            </p>
          </div>
        )}

        {item && <DetailView item={item} />}
      </main>
    </div>
  )
}

function DetailView({ item }: { item: UsageItem }) {
  const ok = item.status_code >= 200 && item.status_code < 300

  function copyId() {
    navigator.clipboard.writeText(item.request_id).catch(() => {})
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1
            className="text-foreground truncate text-lg font-medium tracking-tight"
            title={item.filename ?? undefined}
          >
            {item.filename ?? "Untitled"}
          </h1>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[10px] tracking-tight",
              ok
                ? "text-muted-foreground border-border/80 border"
                : "bg-foreground/10 text-foreground",
            )}
          >
            {item.status_code}
            {item.error_code ? ` · ${item.error_code}` : ""}
          </span>
          <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
            {item.style_resolved ?? item.style_requested ?? "—"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={copyId}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-mono text-[11px] transition"
            title="Copy request_id"
          >
            <Copy size={11} weight="bold" /> {item.request_id}
          </button>
          <span className="text-border">·</span>
          <span className="text-muted-foreground tabular-nums">
            {new Date(item.ts_utc).toLocaleString()}
          </span>
        </div>
      </header>

      <Section title="Pipeline">
        <Row label="Filename">
          <Mono>{item.filename ?? "—"}</Mono>
        </Row>
        <Row label="Source">
          <Mono>{item.source ?? "—"}</Mono>
        </Row>
        <Row label="Server version">
          <Mono>
            {item.version ?? "—"}
            {item.git_sha ? ` · ${item.git_sha}` : ""}
          </Mono>
        </Row>
        <Row label="Duration">
          {(item.duration_ms / 1000).toFixed(2)} s
        </Row>
        <Row label="Style requested">
          <Mono>{item.style_requested ?? "—"}</Mono>
        </Row>
        <Row label="Style resolved">
          <Mono>{item.style_resolved ?? "—"}</Mono>
        </Row>
        <Row label="Content bytes">
          {item.content_bytes !== null ? formatBytes(item.content_bytes) : "—"}
        </Row>
        <Row label="only_command_keys">
          {item.only_command_keys && item.only_command_keys.length > 0 ? (
            <Mono>{item.only_command_keys.join(", ")}</Mono>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Entries processed / changed">
          {item.entries_processed ?? "—"} / {item.entries_changed ?? "—"}
        </Row>
      </Section>

      {item.usage && (
        <Section title="Usage & cost">
          <Row label="Model">
            <Mono>{item.usage.model}</Mono>
          </Row>
          <Row label="LLM time">
            {item.usage.total_time_s.toFixed(2)} s
          </Row>
          <Row label="Tokens (in / out / total)">
            <span className="tabular-nums">
              {item.usage.input_tokens.toLocaleString()} /{" "}
              {item.usage.output_tokens.toLocaleString()} /{" "}
              {item.usage.total_tokens.toLocaleString()}
            </span>
          </Row>
          <Row label="Cached tokens">
            <span className="tabular-nums">
              {item.usage.cached_tokens.toLocaleString()}
            </span>
          </Row>
          <Row label="Cost (USD / INR)">
            <span className="tabular-nums">
              ${item.usage.cost_usd.toFixed(4)} · ₹
              {item.usage.cost_inr.toFixed(2)}
            </span>
          </Row>
        </Section>
      )}

      <Section title="Caller">
        <Row label="user_id">
          <Mono>{item.user_id ?? "—"}</Mono>
        </Row>
        <Row label="session_id">
          <Mono>{item.session_id ?? "—"}</Mono>
        </Row>
        <Row label="client_request_id">
          <Mono>{item.client_request_id ?? "—"}</Mono>
        </Row>
        <Row label="IP">
          <Mono>{item.ip ?? "—"}</Mono>
        </Row>
        <Row label="Geo">
          {[item.city, item.region, item.country].filter(Boolean).join(", ") ||
            "—"}
        </Row>
        <Row label="User-Agent">
          <span className="text-muted-foreground truncate font-mono text-[11px]">
            {item.user_agent ?? "—"}
          </span>
        </Row>
      </Section>

      {item.artifacts && (
        <Section title="Artifacts">
          <Row label="Write status">
            <Mono>{item.artifacts.write_status ?? "—"}</Mono>
          </Row>
          <Row label="Downloads">
            <ArtifactLinks
              requestId={item.request_id}
              hasInput={!!item.artifacts.input_file_id}
              hasOutput={!!item.artifacts.output_file_id}
              hasLog={!!item.artifacts.log_file_id}
            />
          </Row>
          <Row label="Input file id">
            <Mono>{item.artifacts.input_file_id ?? "—"}</Mono>
          </Row>
          <Row label="Output file id">
            <Mono>{item.artifacts.output_file_id ?? "—"}</Mono>
          </Row>
          <Row label="Log file id">
            <Mono>{item.artifacts.log_file_id ?? "—"}</Mono>
          </Row>
          <Row label="Input / output / log bytes">
            {item.artifacts.input_bytes !== null
              ? formatBytes(item.artifacts.input_bytes)
              : "—"}{" "}
            /{" "}
            {item.artifacts.output_bytes !== null
              ? formatBytes(item.artifacts.output_bytes)
              : "—"}{" "}
            /{" "}
            {item.artifacts.log_bytes !== null
              ? formatBytes(item.artifacts.log_bytes)
              : "—"}
          </Row>
          <Row label="Input SHA-256">
            <Mono truncate>{item.artifacts.input_sha256 ?? "—"}</Mono>
          </Row>
          <Row label="Output SHA-256">
            <Mono truncate>{item.artifacts.output_sha256 ?? "—"}</Mono>
          </Row>
          <Row label="Log SHA-256">
            <Mono truncate>{item.artifacts.log_sha256 ?? "—"}</Mono>
          </Row>
        </Section>
      )}
    </motion.div>
  )
}

function ArtifactLinks({
  requestId,
  hasInput,
  hasOutput,
  hasLog,
}: {
  requestId: string
  hasInput: boolean
  hasOutput: boolean
  hasLog: boolean
}) {
  const base = `/api/usage/${encodeURIComponent(requestId)}`
  const items: { label: string; href: string; enabled: boolean }[] = [
    { label: "input.tex", href: `${base}/input.tex`, enabled: hasInput },
    { label: "output.tex", href: `${base}/output.tex`, enabled: hasOutput },
    { label: "log.txt", href: `${base}/log.txt`, enabled: hasLog },
  ]
  if (!items.some((i) => i.enabled)) return <span>—</span>
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((it, i) => (
        <span key={it.label} className="flex items-center gap-2">
          {i > 0 && <span className="text-border">·</span>}
          {it.enabled ? (
            <a
              href={it.href}
              className="text-foreground hover:underline font-mono text-[11px] underline-offset-4"
            >
              {it.label}
            </a>
          ) : (
            <span className="text-muted-foreground font-mono text-[11px] line-through">
              {it.label}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-border bg-card rounded-xl border">
      <h2 className="text-muted-foreground border-border/60 border-b px-4 py-2.5 font-mono text-[10px] tracking-wider uppercase">
        {title}
      </h2>
      <dl className="divide-border/60 divide-y">{children}</dl>
    </section>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-center gap-4 px-4 py-2.5 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground min-w-0">{children}</dd>
    </div>
  )
}

function Mono({
  children,
  truncate,
}: {
  children: React.ReactNode
  truncate?: boolean
}) {
  return (
    <span
      className={cn(
        "font-mono text-[11px]",
        truncate && "block truncate",
      )}
    >
      {children}
    </span>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-muted/40 h-6 w-48 rounded" />
      <div className="bg-muted/20 h-3 w-72 rounded" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
        >
          <div className="bg-muted/40 h-2.5 w-20 rounded" />
          <div className="bg-muted/20 h-3 w-full rounded" />
          <div className="bg-muted/20 h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}
