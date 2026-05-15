"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react"

import { SiteHeader } from "@/components/lsp/site-header"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
  TransformError,
  UsageItem,
  UsageListResponse,
} from "@/lib/lsp-types"

export default function HistoryPage() {
  const [userId, setUserId] = useState("")
  const [sessionId, setSessionId] = useState("")
  const [items, setItems] = useState<UsageItem[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<TransformError | null>(null)

  const fetchPage = useCallback(
    async (opts: { before?: string; append: boolean }) => {
      if (opts.append) setLoadingMore(true)
      else setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (userId.trim()) params.set("user_id", userId.trim())
      if (sessionId.trim()) params.set("session_id", sessionId.trim())
      params.set("limit", "20")
      if (opts.before) params.set("before", opts.before)

      try {
        const res = await fetch(`/api/usage?${params}`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) {
          setError(data as TransformError)
          if (!opts.append) setItems([])
          setNextBefore(null)
        } else {
          const page = data as UsageListResponse
          setItems((prev) => (opts.append ? [...prev, ...page.items] : page.items))
          setNextBefore(page.next_before)
        }
      } catch (err) {
        setError({
          error: "network_error",
          detail: err instanceof Error ? err.message : "Network failure.",
          request_id: "—",
        })
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [userId, sessionId],
  )

  useEffect(() => {
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`/api/usage?limit=20`, {
          cache: "no-store",
          signal: ctrl.signal,
        })
        const data = await res.json()
        if (ctrl.signal.aborted) return
        if (!res.ok) {
          setError(data as TransformError)
        } else {
          const page = data as UsageListResponse
          setItems(page.items)
          setNextBefore(page.next_before)
        }
      } catch (err) {
        if (ctrl.signal.aborted) return
        setError({
          error: "network_error",
          detail: err instanceof Error ? err.message : "Network failure.",
          request_id: "—",
        })
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    })()
    return () => ctrl.abort()
  }, [])

  function applyFilters(e: React.FormEvent) {
    e.preventDefault()
    void fetchPage({ append: false })
  }

  function clearFilters() {
    setUserId("")
    setSessionId("")
    setTimeout(() => void fetchPage({ append: false }), 0)
  }

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 sm:px-8">
        <div className="mb-8 flex flex-col gap-1.5">
          <h1 className="text-foreground text-lg font-medium tracking-tight">
            Usage history
          </h1>
          <p className="text-muted-foreground text-xs">
            Past <code className="font-mono">/transform</code> runs from the
            backend audit log. No authentication is required to read this
            endpoint.
          </p>
        </div>

        <form
          onSubmit={applyFilters}
          className="border-border bg-card mb-6 flex flex-wrap items-end gap-3 rounded-xl border p-4"
        >
          <FilterField
            label="user_id"
            value={userId}
            onChange={setUserId}
            placeholder="user_2fK91ABc"
          />
          <FilterField
            label="session_id"
            value={sessionId}
            onChange={setSessionId}
            placeholder="sess_42"
          />
          <div className="ml-auto flex items-center gap-2">
            {(userId || sessionId) && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 transition hover:underline"
              >
                Clear
              </button>
            )}
            <Button type="submit" size="sm" className="gap-1.5">
              <MagnifyingGlass size={12} weight="bold" /> Apply
            </Button>
          </div>
        </form>

        {error && <ErrorState error={error} />}

        {!error && loading && <ListSkeleton />}

        {!error && !loading && items.length === 0 && <EmptyState />}

        {!error && !loading && items.length > 0 && (
          <>
            <ul className="border-border divide-border bg-card divide-y overflow-hidden rounded-xl border">
              {items.map((item, i) => (
                <motion.li
                  key={item.request_id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.02 }}
                >
                  <RunRow item={item} />
                </motion.li>
              ))}
            </ul>

            {nextBefore && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void fetchPage({ before: nextBefore, append: true })
                  }
                  disabled={loadingMore}
                  className="gap-1.5"
                >
                  {loadingMore ? "Loading…" : "Load older"}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function FilterField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border-border bg-background focus:border-foreground/40 h-8 w-48 rounded-md border px-2.5 font-mono text-xs outline-none transition"
      />
    </label>
  )
}

function RunRow({ item }: { item: UsageItem }) {
  const ok = item.status_code >= 200 && item.status_code < 300
  return (
    <Link
      href={`/history/${item.request_id}`}
      className="hover:bg-muted/40 group flex items-center gap-4 px-4 py-3.5 transition-colors"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          ok ? "bg-foreground" : "bg-foreground/30",
        )}
        aria-hidden
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className="text-foreground truncate text-sm font-medium"
            title={item.filename ?? undefined}
          >
            {item.filename ?? "Untitled"}
          </span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 font-mono text-[10px] tracking-tight",
              ok
                ? "text-muted-foreground border-border/80 border"
                : "bg-foreground/10 text-foreground",
            )}
          >
            {item.status_code}
            {item.error_code ? ` · ${item.error_code}` : ""}
          </span>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 truncate font-mono text-[11px]">
          <span className="uppercase tracking-wider">
            {item.style_resolved ?? item.style_requested ?? "—"}
          </span>
          <span className="text-border">·</span>
          <span className="truncate">{item.request_id}</span>
        </div>
      </div>

      <div className="text-muted-foreground hidden flex-col items-end text-[11px] tabular-nums sm:flex">
        <span>{formatRelative(item.ts_utc)}</span>
        <span>
          {(item.duration_ms / 1000).toFixed(1)}s
          {item.usage ? ` · $${item.usage.cost_usd.toFixed(4)}` : ""}
        </span>
      </div>

      <ArrowRight
        size={14}
        weight="bold"
        className="text-muted-foreground/40 group-hover:text-foreground shrink-0 transition"
      />
    </Link>
  )
}

function ErrorState({ error }: { error: TransformError }) {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border p-10 text-center">
      <WarningCircle size={24} weight="thin" className="text-foreground" />
      <div className="text-muted-foreground text-[10px] tracking-wider uppercase">
        {error.error}
      </div>
      <p className="text-foreground max-w-md text-sm">{error.detail}</p>
      <p className="text-muted-foreground font-mono text-[10px]">
        request_id: {error.request_id}
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      <p className="text-foreground text-sm">No runs match these filters.</p>
      <p className="text-muted-foreground text-xs">
        Run a transform from the home page, then return here.
      </p>
    </div>
  )
}

function ListSkeleton() {
  return (
    <ul className="border-border divide-border bg-card divide-y overflow-hidden rounded-xl border">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center gap-4 px-4 py-4">
          <span className="bg-muted/60 h-1.5 w-1.5 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="bg-muted/60 h-3 w-32 rounded" />
            <span className="bg-muted/40 h-2.5 w-56 rounded" />
          </div>
          <span className="bg-muted/40 hidden h-3 w-20 rounded sm:block" />
        </li>
      ))}
    </ul>
  )
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return new Date(iso).toLocaleString()
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}
