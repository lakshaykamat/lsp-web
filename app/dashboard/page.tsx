"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, ArrowsClockwise, WarningCircle } from "@phosphor-icons/react"

import { SiteHeader } from "@/components/lsp/site-header"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
  TransformError,
  UsageItem,
  UsageListResponse,
} from "@/lib/lsp-types"

const PAGE_SIZE = 100
const MAX_RUNS = 2000
const DAYS_WINDOW = 14

export default function DashboardPage() {
  const [items, setItems] = useState<UsageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadedAll, setLoadedAll] = useState(false)
  const [error, setError] = useState<TransformError | null>(null)
  const aborted = useRef(false)

  async function loadAll() {
    aborted.current = false
    setLoading(true)
    setError(null)
    setItems([])
    setLoadedAll(false)

    const all: UsageItem[] = []
    let before: string | null = null

    while (all.length < MAX_RUNS) {
      if (aborted.current) return
      const params = new URLSearchParams()
      params.set("limit", String(PAGE_SIZE))
      if (before) params.set("before", before)

      let page: UsageListResponse
      try {
        const res = await fetch(`/api/usage?${params}`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) {
          setError(data as TransformError)
          setLoading(false)
          return
        }
        page = data as UsageListResponse
      } catch (err) {
        setError({
          error: "network_error",
          detail: err instanceof Error ? err.message : "Network failure.",
          request_id: "—",
        })
        setLoading(false)
        return
      }

      all.push(...page.items)
      setItems([...all])

      if (!page.next_before || page.items.length === 0) break
      before = page.next_before
    }

    setLoadedAll(true)
    setLoading(false)
  }

  useEffect(() => {
    // Initial fetch on mount; loadAll guards against re-entry via aborted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll()
    return () => {
      aborted.current = true
    }
  }, [])

  const agg = useMemo(() => aggregate(items), [items])

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10 sm:px-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-foreground text-lg font-medium tracking-tight">
              Dashboard
            </h1>
            <p className="text-muted-foreground text-xs">
              Aggregated view of every <code className="font-mono">/transform</code>{" "}
              run in the audit log.{" "}
              <span className="tabular-nums">
                {items.length.toLocaleString()}
              </span>{" "}
              {items.length === 1 ? "run" : "runs"}
              {loading
                ? " loaded…"
                : loadedAll
                  ? ""
                  : ` (capped at ${MAX_RUNS.toLocaleString()})`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadAll()}
            disabled={loading}
            className="text-muted-foreground gap-1.5"
          >
            <ArrowsClockwise size={12} weight="bold" />
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </header>

        {error && <ErrorState error={error} />}

        {!error && items.length === 0 && loading && <Skeleton />}

        {!error && items.length === 0 && !loading && <EmptyState />}

        {!error && items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col gap-6"
          >
            <KpiGrid agg={agg} />
            <ActivityChart days={agg.days} />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <BreakdownCard
                title="By style"
                rows={agg.byStyle}
                showCost
              />
              <BreakdownCard
                title="By country"
                rows={agg.byCountry}
                showCost
              />
              <BreakdownCard
                title="By model"
                rows={agg.byModel}
                showCost
              />
              <BreakdownCard
                title="By origin"
                rows={agg.byOrigin}
                showCost={false}
              />
            </div>

            {agg.errors.length > 0 && (
              <BreakdownCard
                title="Errors"
                rows={agg.errors}
                showCost={false}
                mono
              />
            )}

            <TopRuns rows={agg.topByCost} />
          </motion.div>
        )}
      </main>
    </div>
  )
}

/* ─── Aggregation ─────────────────────────────────────────────── */

type Row = {
  key: string
  count: number
  cost_usd: number
}

type Aggregate = {
  totalRuns: number
  totalCostUsd: number
  totalCostInr: number
  totalTokens: number
  totalCachedTokens: number
  totalDurationMs: number
  totalLlmTimeS: number
  totalContentBytes: number
  successCount: number
  errorCount: number
  byStyle: Row[]
  byCountry: Row[]
  byModel: Row[]
  byOrigin: Row[]
  errors: Row[]
  days: { date: string; count: number }[]
  topByCost: UsageItem[]
}

function aggregate(items: UsageItem[]): Aggregate {
  let totalCostUsd = 0
  let totalCostInr = 0
  let totalTokens = 0
  let totalCachedTokens = 0
  let totalDurationMs = 0
  let totalLlmTimeS = 0
  let totalContentBytes = 0
  let successCount = 0
  let errorCount = 0

  const style = new Map<string, Row>()
  const country = new Map<string, Row>()
  const model = new Map<string, Row>()
  const origin = new Map<string, Row>()
  const errs = new Map<string, Row>()

  function bump(
    bucket: Map<string, Row>,
    key: string | null | undefined,
    cost: number,
  ) {
    const k = key && key.length > 0 ? key : "—"
    const existing = bucket.get(k)
    if (existing) {
      existing.count += 1
      existing.cost_usd += cost
    } else {
      bucket.set(k, { key: k, count: 1, cost_usd: cost })
    }
  }

  for (const it of items) {
    const cost = it.usage?.cost_usd ?? 0
    totalCostUsd += cost
    totalCostInr += it.usage?.cost_inr ?? 0
    totalTokens += it.usage?.total_tokens ?? 0
    totalCachedTokens += it.usage?.cached_tokens ?? 0
    totalLlmTimeS += it.usage?.total_time_s ?? 0
    totalDurationMs += it.duration_ms ?? 0
    totalContentBytes += it.content_bytes ?? 0

    const ok = it.status_code >= 200 && it.status_code < 300
    if (ok) successCount += 1
    else errorCount += 1

    bump(style, it.style_resolved ?? it.style_requested, cost)
    bump(country, it.country, cost)
    bump(model, it.usage?.model, cost)
    bump(origin, originLabel(it.origin), cost)
    if (!ok && it.error_code) bump(errs, it.error_code, 0)
  }

  const sortRows = (m: Map<string, Row>, limit = 8): Row[] =>
    Array.from(m.values())
      .sort((a, b) => b.count - a.count || b.cost_usd - a.cost_usd)
      .slice(0, limit)

  const days = buildDayBuckets(items, DAYS_WINDOW)

  const topByCost = [...items]
    .filter((it) => (it.usage?.cost_usd ?? 0) > 0)
    .sort(
      (a, b) => (b.usage?.cost_usd ?? 0) - (a.usage?.cost_usd ?? 0),
    )
    .slice(0, 6)

  return {
    totalRuns: items.length,
    totalCostUsd,
    totalCostInr,
    totalTokens,
    totalCachedTokens,
    totalDurationMs,
    totalLlmTimeS,
    totalContentBytes,
    successCount,
    errorCount,
    byStyle: sortRows(style),
    byCountry: sortRows(country),
    byModel: sortRows(model),
    byOrigin: sortRows(origin),
    errors: sortRows(errs, 6),
    days,
    topByCost,
  }
}

function originLabel(origin: string | null): string {
  if (!origin) return "direct"
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

function buildDayBuckets(items: UsageItem[], days: number) {
  const buckets = new Map<string, number>()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    buckets.set(isoDate(d), 0)
  }
  const cutoff = new Date(today)
  cutoff.setDate(today.getDate() - (days - 1))
  for (const it of items) {
    const t = new Date(it.ts_utc)
    if (t < cutoff) continue
    const k = isoDate(t)
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1)
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }))
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/* ─── KPI grid ────────────────────────────────────────────────── */

function KpiGrid({ agg }: { agg: Aggregate }) {
  const successRate =
    agg.totalRuns > 0
      ? ((agg.successCount / agg.totalRuns) * 100).toFixed(1)
      : "—"
  const cachedPct =
    agg.totalTokens > 0
      ? ((agg.totalCachedTokens / agg.totalTokens) * 100).toFixed(0)
      : "0"
  const avgDuration =
    agg.totalRuns > 0 ? (agg.totalDurationMs / agg.totalRuns / 1000).toFixed(1) : "—"

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Kpi
        label="Total runs"
        value={agg.totalRuns.toLocaleString()}
        sub={`${agg.successCount.toLocaleString()} ok · ${agg.errorCount.toLocaleString()} err`}
      />
      <Kpi
        label="Total cost"
        value={`$${agg.totalCostUsd.toFixed(2)}`}
        sub={`₹${agg.totalCostInr.toFixed(2)}`}
      />
      <Kpi
        label="Total tokens"
        value={formatCount(agg.totalTokens)}
        sub={`${cachedPct}% cached`}
      />
      <Kpi
        label="LLM time"
        value={formatSeconds(agg.totalLlmTimeS)}
        sub={`avg ${avgDuration}s / run`}
      />
      <Kpi
        label="Success rate"
        value={`${successRate}%`}
        sub={`${formatBytes(agg.totalContentBytes)} in`}
      />
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="border-border bg-card flex flex-col gap-1.5 rounded-xl border p-4">
      <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
        {label}
      </span>
      <span className="text-foreground text-xl font-medium tabular-nums">
        {value}
      </span>
      <span className="text-muted-foreground text-[11px] tabular-nums">
        {sub}
      </span>
    </div>
  )
}

/* ─── Activity chart (14-day bars) ────────────────────────────── */

function ActivityChart({ days }: { days: { date: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count))
  const total = days.reduce((a, b) => a + b.count, 0)
  return (
    <section className="border-border bg-card rounded-xl border">
      <div className="border-border/60 flex items-baseline justify-between border-b px-4 py-2.5">
        <h2 className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
          Activity · last {DAYS_WINDOW} days
        </h2>
        <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
          {total.toLocaleString()} runs
        </span>
      </div>
      <div className="flex items-end gap-1.5 px-4 py-5 sm:gap-2">
        {days.map((d) => {
          const h = (d.count / max) * 100
          return (
            <div
              key={d.date}
              className="flex flex-1 flex-col items-center gap-1.5"
            >
              <div
                className="bg-muted relative flex h-24 w-full items-end overflow-hidden rounded-sm"
                title={`${d.date}: ${d.count}`}
              >
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "bg-foreground w-full",
                    d.count === 0 && "opacity-0",
                  )}
                />
              </div>
              <span className="text-muted-foreground font-mono text-[9px] tabular-nums">
                {d.date.slice(5)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ─── Breakdown cards (style / country / model / origin / errors) */

function BreakdownCard({
  title,
  rows,
  showCost,
  mono = false,
}: {
  title: string
  rows: Row[]
  showCost: boolean
  mono?: boolean
}) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <section className="border-border bg-card flex flex-col rounded-xl border">
      <h2 className="border-border/60 text-muted-foreground border-b px-4 py-2.5 font-mono text-[10px] tracking-wider uppercase">
        {title}
      </h2>
      {rows.length === 0 ? (
        <div className="text-muted-foreground px-4 py-6 text-center text-xs">
          —
        </div>
      ) : (
        <ul className="divide-border/60 divide-y">
          {rows.map((r) => {
            const pct = (r.count / max) * 100
            return (
              <li key={r.key} className="relative px-4 py-2.5 text-xs">
                <div
                  className="bg-muted/50 absolute inset-y-0 left-0 -z-0"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
                <div className="relative flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      "text-foreground truncate",
                      mono && "font-mono text-[11px]",
                    )}
                    title={r.key}
                  >
                    {r.key}
                  </span>
                  <span className="text-muted-foreground flex shrink-0 items-center gap-3 font-mono text-[11px] tabular-nums">
                    <span>{r.count.toLocaleString()}</span>
                    {showCost && (
                      <span className="text-foreground/80">
                        ${r.cost_usd.toFixed(2)}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ─── Top costly runs ─────────────────────────────────────────── */

function TopRuns({ rows }: { rows: UsageItem[] }) {
  if (rows.length === 0) return null
  return (
    <section className="border-border bg-card rounded-xl border">
      <h2 className="border-border/60 text-muted-foreground border-b px-4 py-2.5 font-mono text-[10px] tracking-wider uppercase">
        Most expensive runs
      </h2>
      <ul className="divide-border/60 divide-y">
        {rows.map((it) => {
          const ok = it.status_code >= 200 && it.status_code < 300
          return (
            <li key={it.request_id}>
              <Link
                href={`/history/${it.request_id}`}
                className="hover:bg-muted/40 group flex items-center gap-4 px-4 py-3 transition-colors"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    ok ? "bg-foreground" : "bg-foreground/30",
                  )}
                  aria-hidden
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className="text-foreground truncate text-sm"
                    title={it.filename ?? undefined}
                  >
                    {it.filename ?? "Untitled"}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-2 truncate font-mono text-[11px]">
                    <span className="uppercase tracking-wider">
                      {it.style_resolved ?? it.style_requested ?? "—"}
                    </span>
                    <span className="text-border">·</span>
                    <span>{[it.city, it.country].filter(Boolean).join(", ") || "—"}</span>
                  </span>
                </div>
                <div className="text-muted-foreground flex flex-col items-end font-mono text-[11px] tabular-nums">
                  <span className="text-foreground">
                    ${it.usage?.cost_usd.toFixed(4) ?? "—"}
                  </span>
                  <span>
                    {(it.duration_ms / 1000).toFixed(1)}s ·{" "}
                    {it.usage ? formatCount(it.usage.total_tokens) : "—"} tok
                  </span>
                </div>
                <ArrowRight
                  size={14}
                  weight="bold"
                  className="text-muted-foreground/40 group-hover:text-foreground shrink-0 transition"
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ─── Misc states ─────────────────────────────────────────────── */

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
      <p className="text-foreground text-sm">No runs in the audit log yet.</p>
      <p className="text-muted-foreground text-xs">
        Run a transform from the home page, then return here.
      </p>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
          >
            <span className="bg-muted/60 h-2 w-16 rounded" />
            <span className="bg-muted/60 h-5 w-20 rounded" />
            <span className="bg-muted/40 h-2 w-24 rounded" />
          </div>
        ))}
      </div>
      <div className="border-border bg-card h-44 rounded-xl border" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border-border bg-card h-48 rounded-xl border"
          />
        ))}
      </div>
    </div>
  )
}

/* ─── Formatters ──────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`
}

function formatCount(n: number): string {
  if (n < 1000) return n.toString()
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  return `${(n / 1_000_000_000).toFixed(2)}B`
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s.toFixed(1)}s`
  const m = s / 60
  if (m < 60) return `${m.toFixed(1)}m`
  const h = m / 60
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}
