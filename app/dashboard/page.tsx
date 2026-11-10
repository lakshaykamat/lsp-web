"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowsClockwise, WarningCircle } from "@phosphor-icons/react"

import { SiteHeader } from "@/components/lsp/site-header"
import { Button } from "@/components/ui/button"
import type { UsageItem, UsageListResponse } from "@/lib/lsp-types"

const DAY_OPTIONS = [7, 30, 90, 180] as const
const PAGE_SIZE = 100
const MAX_RUNS = 2000
// Keep this aligned with the API's USD_TO_INR_RATIO for usage.cost_inr.
const USD_TO_INR_RATIO = 94

type OpenAIStats = {
  period: { days: number }
  total_spent_usd: number
}

type DailyCount = { date: string; count: number }

export default function DashboardPage() {
  const [days, setDays] = useState<number>(30)
  const [refreshKey, setRefreshKey] = useState(0)
  const [statsLoading, setStatsLoading] = useState(true)
  const [usageLoading, setUsageLoading] = useState(true)
  const [spend, setSpend] = useState<number | null>(null)
  const [spendError, setSpendError] = useState<string | null>(null)
  const [items, setItems] = useState<UsageItem[]>([])
  const [usageError, setUsageError] = useState<string | null>(null)
  const [runsCapped, setRunsCapped] = useState(false)
  const loading = statsLoading || usageLoading

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    async function loadSpend() {
      setStatsLoading(true)
      setSpend(null)
      setSpendError(null)
      try {
        const data = await fetchJson<OpenAIStats>(
          `/api/openai/stats?days=${days}`,
          signal
        )
        if (!signal.aborted) setSpend(data.total_spent_usd)
      } catch (error) {
        if (!signal.aborted) setSpendError(errorMessage(error))
      } finally {
        if (!signal.aborted) setStatsLoading(false)
      }
    }

    async function loadUsage() {
      setUsageLoading(true)
      setItems([])
      setUsageError(null)
      setRunsCapped(false)
      try {
        const data = await fetchUsage(days, signal)
        if (signal.aborted) return
        setItems(data.items)
        setRunsCapped(data.capped)
      } catch (error) {
        if (!signal.aborted) setUsageError(errorMessage(error))
      } finally {
        if (!signal.aborted) setUsageLoading(false)
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSpend()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUsage()

    return () => controller.abort()
  }, [days, refreshKey])

  const daily = useMemo(() => buildDailyCounts(items, days), [items, days])
  const totalRuns = daily.reduce((total, day) => total + day.count, 0)

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10 sm:px-8">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-medium tracking-tight text-foreground">
              Dashboard
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Spend and transform activity for the selected period.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="dashboard-period"
              className="text-[10px] tracking-wider text-muted-foreground uppercase"
            >
              Period
            </label>
            <select
              id="dashboard-period"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-foreground/40"
            >
              {DAY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  Last {option} days
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Refresh dashboard"
              title="Refresh dashboard"
              onClick={() => setRefreshKey((key) => key + 1)}
              disabled={loading}
              className="text-muted-foreground"
            >
              <ArrowsClockwise
                size={13}
                weight="bold"
                className={loading ? "animate-spin" : undefined}
              />
            </Button>
          </div>
        </header>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="OpenAI organization spend"
            value={
              spend === null
                ? statsLoading
                  ? "…"
                  : "Unavailable"
                : formatInr(spend * USD_TO_INR_RATIO)
            }
            detail={
              spendError ??
              (spend === null
                ? ""
                : `At ₹${USD_TO_INR_RATIO}/USD; may include other apps in this organization.`)
            }
            loading={statsLoading && spend === null}
            error={Boolean(spendError)}
          />
          <MetricCard
            label="Runs"
            value={usageError ? "Unavailable" : totalRuns.toLocaleString()}
            detail={
              usageError ??
              (runsCapped
                ? `Showing the most recent ${MAX_RUNS.toLocaleString()} runs.`
                : `Last ${days} days`)
            }
            loading={usageLoading && items.length === 0 && !usageError}
            error={Boolean(usageError)}
          />
        </div>

        <DailyChart
          days={daily}
          period={days}
          loading={usageLoading && items.length === 0 && !usageError}
          error={usageError}
        />
      </main>
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  loading,
  error,
}: {
  label: string
  value: string
  detail: string
  loading: boolean
  error: boolean
}) {
  return (
    <section className="flex min-h-28 flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <div>
        <div
          className={`text-2xl font-medium text-foreground tabular-nums ${loading ? "animate-pulse" : ""}`}
        >
          {value}
        </div>
        <p
          className={`mt-1 text-[11px] ${error ? "text-foreground" : "text-muted-foreground"}`}
        >
          {detail || (loading ? "Loading…" : " ")}
        </p>
      </div>
    </section>
  )
}

function DailyChart({
  days,
  period,
  loading,
  error,
}: {
  days: DailyCount[]
  period: number
  loading: boolean
  error: string | null
}) {
  const max = Math.max(1, ...days.map((day) => day.count))
  const total = days.reduce((sum, day) => sum + day.count, 0)
  const labelEvery = Math.max(1, Math.ceil(period / 8))

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Runs by day
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {loading ? "Loading…" : `${total.toLocaleString()} total`}
        </span>
      </div>

      {error ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground">
          <WarningCircle size={20} weight="thin" />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="flex h-56 items-end gap-1 px-4 py-5">
          {Array.from({ length: 14 }).map((_, index) => (
            <span
              key={index}
              className="h-1/2 flex-1 animate-pulse rounded-t-sm bg-muted/60"
              style={{ opacity: 0.35 + (index % 4) * 0.15 }}
            />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
          No runs in this period.
        </div>
      ) : (
        <div className="overflow-x-auto px-4 py-5">
          <div
            className="flex h-52 items-end gap-1"
            style={{ minWidth: `${Math.max(640, period * 5)}px` }}
          >
            {days.map((day, index) => {
              const showLabel =
                index % labelEvery === 0 || index === days.length - 1
              const height =
                day.count === 0 ? 0 : Math.max(4, (day.count / max) * 100)

              return (
                <div
                  key={day.date}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                  title={`${formatDate(day.date)}: ${day.count} ${day.count === 1 ? "run" : "runs"}`}
                  aria-label={`${formatDate(day.date)}: ${day.count} runs`}
                >
                  <div className="flex min-h-0 flex-1 items-end">
                    <div
                      className="w-full rounded-t-sm bg-foreground/80 transition-colors hover:bg-foreground"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className="mt-2 h-3 text-center font-mono text-[9px] text-muted-foreground tabular-nums">
                    {showLabel ? formatDate(day.date) : ""}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.detail ?? `Request failed (${response.status}).`)
  }
  return data as T
}

async function fetchUsage(
  days: number,
  signal: AbortSignal
): Promise<{ items: UsageItem[]; capped: boolean }> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const items: UsageItem[] = []
  let before: string | null = null

  while (items.length < MAX_RUNS) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
    if (before) params.set("before", before)

    const page = await fetchJson<UsageListResponse>(
      `/api/usage?${params}`,
      signal
    )
    const pageItems = page.items.filter(
      (item) => new Date(item.ts_utc).getTime() >= cutoff
    )
    items.push(...pageItems)

    const oldest = page.items.at(-1)
    if (
      !page.next_before ||
      page.items.length === 0 ||
      (oldest && new Date(oldest.ts_utc).getTime() < cutoff)
    ) {
      break
    }
    before = page.next_before
  }

  return { items: items.slice(0, MAX_RUNS), capped: items.length >= MAX_RUNS }
}

function buildDailyCounts(items: UsageItem[], period: number): DailyCount[] {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const counts = new Map<string, number>()
  for (let offset = period - 1; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setUTCDate(today.getUTCDate() - offset)
    counts.set(date.toISOString().slice(0, 10), 0)
  }

  for (const item of items) {
    const key = item.ts_utc.slice(0, 10)
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts, ([date, count]) => ({ date, count }))
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to load dashboard data."
}

function formatInr(amount: number): string {
  return amount < 1
    ? `₹${amount.toFixed(3)}`
    : `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}
