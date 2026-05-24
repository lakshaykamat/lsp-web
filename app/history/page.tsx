"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight,
  MagnifyingGlass,
  WarningCircle,
  X,
} from "@phosphor-icons/react"

import { SiteHeader } from "@/components/lsp/site-header"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
  TransformError,
  UsageItem,
  UsageListResponse,
} from "@/lib/lsp-types"

type DateRange = "all" | "24h" | "7d" | "30d"
type StatusFilter = "all" | "ok" | "error"

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "all", label: "All" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
]

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ok", label: "Success" },
  { value: "error", label: "Error" },
]

const DATE_WINDOWS_MS: Record<Exclude<DateRange, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
}

export default function HistoryPage() {
  const [items, setItems] = useState<UsageItem[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<TransformError | null>(null)

  const [query, setQuery] = useState("")
  const [dateRange, setDateRange] = useState<DateRange>("all")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [style, setStyle] = useState<string>("all")

  const fetchPage = useCallback(
    async (opts: { before?: string; append: boolean }) => {
      if (opts.append) setLoadingMore(true)
      else setLoading(true)
      setError(null)

      const params = new URLSearchParams()
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
    [],
  )

  useEffect(() => {
    void fetchPage({ append: false })
  }, [fetchPage])

  const styleOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      const s = it.style_resolved ?? it.style_requested
      if (s) set.add(s)
    }
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    const cutoff =
      dateRange === "all" ? null : Date.now() - DATE_WINDOWS_MS[dateRange]
    const q = query.trim().toLowerCase()

    return items.filter((item) => {
      if (cutoff !== null) {
        const t = new Date(item.ts_utc).getTime()
        if (!Number.isFinite(t) || t < cutoff) return false
      }
      if (status !== "all") {
        const ok = item.status_code >= 200 && item.status_code < 300
        if (status === "ok" && !ok) return false
        if (status === "error" && ok) return false
      }
      if (style !== "all") {
        const s = item.style_resolved ?? item.style_requested
        if (s !== style) return false
      }
      if (q) {
        const hay = `${item.filename ?? ""} ${item.request_id} ${
          item.error_code ?? ""
        }`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, dateRange, status, style, query])

  const filtersActive =
    query.trim().length > 0 ||
    dateRange !== "all" ||
    status !== "all" ||
    style !== "all"

  const resetFilters = () => {
    setQuery("")
    setDateRange("all")
    setStatus("all")
    setStyle("all")
  }

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 sm:px-8">
        <div className="mb-6 flex flex-col gap-1.5">
          <h1 className="text-foreground text-lg font-medium tracking-tight">
            Usage history
          </h1>
          <p className="text-muted-foreground text-xs">
            Past <code className="font-mono">/transform</code> runs from the
            backend audit log. No authentication is required to read this
            endpoint.
          </p>
        </div>

        {!error && (
          <Filters
            query={query}
            onQueryChange={setQuery}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            status={status}
            onStatusChange={setStatus}
            style={style}
            onStyleChange={setStyle}
            styleOptions={styleOptions}
            filtersActive={filtersActive}
            onReset={resetFilters}
            visibleCount={filtered.length}
            totalCount={items.length}
            disabled={loading && items.length === 0}
          />
        )}

        {error && <ErrorState error={error} />}

        {!error && loading && <ListSkeleton />}

        {!error && !loading && items.length === 0 && <EmptyState />}

        {!error && !loading && items.length > 0 && filtered.length === 0 && (
          <NoMatchesState
            onReset={resetFilters}
            hasMore={Boolean(nextBefore)}
            loadingMore={loadingMore}
            onLoadMore={() =>
              nextBefore &&
              void fetchPage({ before: nextBefore, append: true })
            }
          />
        )}

        {!error && !loading && filtered.length > 0 && (
          <>
            <ul className="border-border divide-border bg-card divide-y overflow-hidden rounded-xl border">
              {filtered.map((item, i) => (
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

type FiltersProps = {
  query: string
  onQueryChange: (v: string) => void
  dateRange: DateRange
  onDateRangeChange: (v: DateRange) => void
  status: StatusFilter
  onStatusChange: (v: StatusFilter) => void
  style: string
  onStyleChange: (v: string) => void
  styleOptions: string[]
  filtersActive: boolean
  onReset: () => void
  visibleCount: number
  totalCount: number
  disabled: boolean
}

function Filters({
  query,
  onQueryChange,
  dateRange,
  onDateRangeChange,
  status,
  onStatusChange,
  style,
  onStyleChange,
  styleOptions,
  filtersActive,
  onReset,
  visibleCount,
  totalCount,
  disabled,
}: FiltersProps) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="relative">
        <MagnifyingGlass
          size={14}
          weight="bold"
          className="text-muted-foreground/60 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <input
          type="text"
          inputMode="search"
          placeholder="Filter by filename, request id, or error code"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "border-border bg-card text-foreground placeholder:text-muted-foreground/60 h-9 w-full rounded-lg border pr-9 pl-8 text-xs",
            "focus:border-foreground/30 focus:outline-none",
            "disabled:opacity-50",
          )}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="text-muted-foreground/60 hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 transition"
            aria-label="Clear search"
          >
            <X size={12} weight="bold" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SegmentedControl
          label="Date"
          value={dateRange}
          options={DATE_OPTIONS}
          onChange={onDateRangeChange}
          disabled={disabled}
        />
        <SegmentedControl
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={onStatusChange}
          disabled={disabled}
        />
        {styleOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-[10px] tracking-wider uppercase">
              Style
            </span>
            <select
              value={style}
              onChange={(e) => onStyleChange(e.target.value)}
              disabled={disabled}
              className={cn(
                "border-border bg-card text-foreground h-7 rounded-md border px-2 font-mono text-[11px] tracking-tight uppercase",
                "focus:border-foreground/30 focus:outline-none",
                "disabled:opacity-50",
              )}
            >
              <option value="all">All</option>
              {styleOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="text-muted-foreground ml-auto flex items-center gap-3 text-[11px] tabular-nums">
          {filtersActive && (
            <span>
              {visibleCount} of {totalCount}
            </span>
          )}
          {filtersActive && (
            <button
              type="button"
              onClick={onReset}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px] transition"
            >
              <X size={11} weight="bold" /> Reset
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

type SegmentOption<T extends string> = { value: T; label: string }

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: SegmentOption<T>[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-[10px] tracking-wider uppercase">
        {label}
      </span>
      <div
        className={cn(
          "border-border bg-card inline-flex h-7 items-center rounded-md border p-0.5",
          disabled && "opacity-50",
        )}
        role="group"
        aria-label={label}
      >
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              disabled={disabled}
              className={cn(
                "h-6 rounded px-2 text-[11px] font-medium transition",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NoMatchesState({
  onReset,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  onReset: () => void
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}) {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <p className="text-foreground text-sm">No runs match these filters.</p>
      <p className="text-muted-foreground text-xs">
        {hasMore
          ? "Older runs may match — load more or reset filters."
          : "Try a broader date range or clear the search."}
      </p>
      <div className="mt-1 flex gap-2">
        <Button variant="ghost" size="sm" onClick={onReset}>
          Reset filters
        </Button>
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load older"}
          </Button>
        )}
      </div>
    </div>
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
      <p className="text-foreground text-sm">No runs yet.</p>
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
