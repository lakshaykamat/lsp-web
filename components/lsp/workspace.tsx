"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  Check,
  Copy,
  DownloadSimple,
  FileText,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { DiffView } from "@/components/lsp/diff-view"
import { SiteHeader } from "@/components/lsp/site-header"
import { countEdits, parseDiff } from "@/lib/parse-diff"
import {
  type Style,
  type TransformError,
  type TransformResponse,
} from "@/lib/lsp-types"
import { cn } from "@/lib/utils"

const ERROR_HINTS: Record<string, string> = {
  invalid_style: "The selected style isn't in the catalogue.",
  request_timeout: "Pipeline exceeded the 300 s budget.",
  payload_too_large: "Body over 4 MiB.",
  validation_error: "Request shape rejected.",
  rate_limited: "Quota exceeded — honour Retry-After.",
  pipeline_failed: "Pipeline raised mid-run.",
  service_unavailable: "Backend dependency down.",
  network_error: "Network failure.",
}

type Loaded = { name: string; size: number; content: string }

type Phase = "upload" | "style" | "process" | "output"

const MAX_BYTES = 4 * 1024 * 1024

const EASE = [0.22, 1, 0.36, 1] as const

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.35, ease: EASE },
}

export function Workspace() {
  const [phase, setPhase] = useState<Phase>("upload")
  const [styles, setStyles] = useState<Style[] | null>(null)
  const [styleKey, setStyleKey] = useState<string>("")
  const [file, setFile] = useState<Loaded | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [error, setError] = useState<{
    data: TransformError
    status: number
  } | null>(null)
  const [response, setResponse] = useState<TransformResponse | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef<number>(0)

  useEffect(() => {
    let cancelled = false
    fetch("/api/styles")
      .then((r) => r.json())
      .then((data: Style[]) => {
        if (cancelled) return
        setStyles(data)
        if (data[0]) setStyleKey((k) => k || data[0].key)
      })
      .catch(() => {
        if (!cancelled) setStyles([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (phase !== "process") return
    const id = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000))
    }, 250)
    return () => window.clearInterval(id)
  }, [phase])

  async function loadFile(f: File) {
    setFileError(null)
    if (f.size > MAX_BYTES) {
      setFileError(
        `File is ${(f.size / 1024 / 1024).toFixed(2)} MiB — over 4 MiB.`,
      )
      return
    }
    if (!/\.tex$/i.test(f.name) && f.type !== "" && !f.type.includes("text")) {
      setFileError("Only .tex files are accepted.")
      return
    }
    const content = await f.text()
    setFile({ name: f.name, size: f.size, content })
  }

  async function startTransform() {
    if (!file || !styleKey) return
    setError(null)
    setResponse(null)
    startedAt.current = Date.now()
    setElapsed(0)
    setPhase("process")
    try {
      const res = await fetch("/api/transform", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Request-ID": crypto.randomUUID(),
        },
        body: JSON.stringify({
          content: file.content,
          style: styleKey,
          filename: file.name,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError({ data, status: res.status })
      } else {
        setResponse(data)
        setPhase("output")
      }
    } catch (err) {
      setError({
        status: 0,
        data: {
          error: "network_error",
          detail: err instanceof Error ? err.message : "Network failure.",
          request_id: "—",
        },
      })
    }
  }

  function reset() {
    setFile(null)
    setFileError(null)
    setError(null)
    setResponse(null)
    setPhase("upload")
  }

  return (
    <div className="bg-background relative flex min-h-svh flex-col">
      <SiteHeader />

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <AnimatePresence mode="wait">
          {phase === "upload" && (
            <motion.div key="upload" {...fade} className="w-full max-w-md">
              <UploadStep
                file={file}
                fileError={fileError}
                onFile={loadFile}
                onContinue={() => setPhase("style")}
              />
            </motion.div>
          )}

          {phase === "style" && (
            <motion.div key="style" {...fade} className="w-full max-w-md">
              <StyleStep
                styles={styles}
                value={styleKey}
                onChange={setStyleKey}
                onBack={() => setPhase("upload")}
                onRun={startTransform}
              />
            </motion.div>
          )}

          {phase === "process" && (
            <motion.div
              key="process"
              {...fade}
              className="flex w-full max-w-md flex-col items-center"
            >
              <ProcessStep
                elapsed={elapsed}
                error={error}
                onBack={() => {
                  setError(null)
                  setPhase("style")
                }}
                onRetry={startTransform}
              />
            </motion.div>
          )}

          {phase === "output" && response && (
            <motion.div
              key="output"
              {...fade}
              className="w-full max-w-3xl"
            >
              <OutputStep
                data={response}
                fileName={file?.name}
                onReset={reset}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer phase={phase} />
    </div>
  )
}

function Footer({ phase }: { phase: Phase }) {
  const order: Phase[] = ["upload", "style", "process", "output"]
  const idx = order.indexOf(phase)
  return (
    <footer className="pointer-events-none absolute right-0 bottom-0 left-0 flex justify-center px-8 py-6">
      <div className="flex items-center gap-1.5">
        {order.map((p, i) => (
          <motion.span
            key={p}
            animate={{
              width: i === idx ? 20 : 6,
              opacity: i <= idx ? 1 : 0.3,
            }}
            transition={{ duration: 0.4, ease: EASE }}
            className={cn(
              "h-1 rounded-full",
              i <= idx ? "bg-foreground" : "bg-foreground",
            )}
          />
        ))}
      </div>
    </footer>
  )
}

/* ── Step 1: Upload — single dropzone ────────────────────────── */

function UploadStep({
  file,
  fileError,
  onFile,
  onContinue,
}: {
  file: Loaded | null
  fileError: string | null
  onFile: (f: File) => void
  onContinue: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col items-center gap-6">
      <input
        ref={inputRef}
        type="file"
        accept=".tex,text/plain,text/x-tex"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ""
        }}
      />

      <AnimatePresence mode="wait">
        {!file ? (
          <motion.button
            key="drop"
            type="button"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) void onFile(f)
            }}
            className={cn(
              "group relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed transition-colors",
              dragOver
                ? "border-foreground bg-muted/40"
                : "border-border hover:border-foreground/40",
            )}
          >
            <motion.div
              animate={{ y: dragOver ? -4 : 0 }}
              transition={{ duration: 0.3 }}
              className="text-muted-foreground"
            >
              <UploadSimple size={28} weight="thin" />
            </motion.div>
            <div className="text-center">
              <div className="text-foreground text-sm font-medium">
                Drop a .tex file
              </div>
              <div className="text-muted-foreground mt-1 text-xs">
                or click to browse · max 4 MiB
              </div>
            </div>
          </motion.button>
        ) : (
          <motion.div
            key="loaded"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="flex w-full flex-col items-center gap-6"
          >
            <div className="border-border flex w-full items-center gap-3 rounded-xl border px-4 py-3.5">
              <FileText
                size={18}
                weight="thin"
                className="text-muted-foreground shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" title={file.name}>
                  {file.name}
                </div>
                <div className="text-muted-foreground text-[11px]">
                  {formatBytes(file.size)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 transition hover:underline"
              >
                Replace
              </button>
            </div>

            <Button onClick={onContinue} className="gap-1.5" size="sm">
              Continue <ArrowRight size={13} weight="bold" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fileError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-foreground text-xs"
          >
            {fileError}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Step 2: Style — single list ─────────────────────────────── */

function StyleStep({
  styles,
  value,
  onChange,
  onBack,
  onRun,
}: {
  styles: Style[] | null
  value: string
  onChange: (k: string) => void
  onBack: () => void
  onRun: () => void
}) {
  if (styles === null) {
    return (
      <div className="text-muted-foreground flex h-64 items-center justify-center text-xs">
        Loading styles…
      </div>
    )
  }

  return (
    <div className="flex flex-col items-stretch gap-6">
      <div className="text-center">
        <div className="text-foreground text-sm font-medium">
          Choose target style
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          The manuscript will conform to this citation style.
        </div>
      </div>

      <div className="border-border divide-border divide-y overflow-hidden rounded-xl border">
        {styles.map((s, i) => {
          const selected = s.key === value
          return (
            <motion.button
              key={s.key}
              type="button"
              onClick={() => onChange(s.key)}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className={cn(
                "group relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
                selected ? "bg-muted/60" : "hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition",
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border",
                )}
              >
                {selected && <Check size={9} weight="bold" />}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
                  /{s.shortcut}
                </span>
              </div>
            </motion.button>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground gap-1.5"
        >
          <ArrowLeft size={13} weight="bold" /> Back
        </Button>
        <Button onClick={onRun} disabled={!value} size="sm" className="gap-1.5">
          Run <ArrowRight size={13} weight="bold" />
        </Button>
      </div>
    </div>
  )
}

/* ── Step 3: Process — single spinner OR error ───────────────── */

function ProcessStep({
  elapsed,
  error,
  onBack,
  onRetry,
}: {
  elapsed: number
  error: { data: TransformError; status: number } | null
  onBack: () => void
  onRetry: () => void
}) {
  if (error) {
    const hint = ERROR_HINTS[error.data.error]
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-5 text-center"
      >
        <WarningCircle
          size={28}
          weight="thin"
          className="text-foreground"
        />
        <div className="text-muted-foreground text-[10px] tracking-wider uppercase">
          {error.status || "—"} · {error.data.error}
        </div>
        <p className="text-foreground max-w-sm text-sm">{error.data.detail}</p>
        {hint && (
          <p className="text-muted-foreground max-w-sm text-xs">{hint}</p>
        )}
        <p className="text-muted-foreground font-mono text-[10px]">
          request_id: {error.data.request_id}
        </p>

        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-muted-foreground gap-1.5"
          >
            <ArrowLeft size={13} weight="bold" /> Back
          </Button>
          <Button onClick={onRetry} size="sm" className="gap-1.5">
            <ArrowsClockwise size={13} weight="bold" /> Retry
          </Button>
        </div>
      </motion.div>
    )
  }

  // Per-second tenths so the counter feels alive.
  return <ProcessTimer elapsed={elapsed} />
}

function ProcessTimer({ elapsed: _elapsed }: { elapsed: number }) {
  const secondsRef = useRef<HTMLSpanElement>(null)
  const fillRef = useRef<SVGCircleElement>(null)
  const ghostRef = useRef<SVGCircleElement>(null)

  const R = 88
  const CIRC = 2 * Math.PI * R
  const CYCLE_MS = 15_000

  useEffect(() => {
    const start = Date.now()
    let raf = 0
    const tick = () => {
      const ms = Date.now() - start
      const s = Math.floor(ms / 1000)

      if (secondsRef.current) {
        secondsRef.current.textContent = s.toString().padStart(2, "0")
      }

      const lap = Math.floor(ms / CYCLE_MS)
      const within = (ms % CYCLE_MS) / CYCLE_MS

      if (fillRef.current) {
        fillRef.current.style.strokeDashoffset = String(CIRC * (1 - within))
      }
      if (ghostRef.current) {
        ghostRef.current.style.opacity = lap > 0 ? "1" : "0"
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [CIRC])

  return (
    <div className="relative h-56 w-56">
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth="2"
        />
        <circle
          ref={ghostRef}
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke="currentColor"
          className="text-foreground"
          strokeWidth="2"
          strokeOpacity="0.25"
          style={{ opacity: 0, transition: "opacity 240ms ease" }}
        />
        <circle
          ref={fillRef}
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke="currentColor"
          className="text-foreground"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC}
          style={{ transition: "stroke-dashoffset 80ms linear" }}
        />
      </svg>

      <div className="text-foreground absolute inset-0 flex flex-col items-center justify-center font-mono leading-none tracking-tighter">
        <span
          ref={secondsRef}
          className="text-6xl font-light tabular-nums"
        >
          00
        </span>
      </div>
    </div>
  )
}

/* ── Step 4: Output — single diff surface ────────────────────── */

function OutputStep({
  data,
  fileName,
  onReset,
}: {
  data: TransformResponse
  fileName?: string
  onReset: () => void
}) {
  const tokens = useMemo(() => parseDiff(data.content), [data.content])
  const edits = useMemo(() => countEdits(tokens), [tokens])
  const [showInline, setShowInline] = useState(true)

  function copy() {
    navigator.clipboard.writeText(data.content).catch(() => {})
  }

  function download() {
    const blob = new Blob([data.content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const base = fileName?.replace(/\.tex$/i, "") ?? "manuscript"
    a.href = url
    a.download = `${base}.${data.style}.tex`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-muted-foreground text-xs">
          <span className="text-foreground tabular-nums">{edits.del}</span>{" "}
          removed ·{" "}
          <span className="text-foreground tabular-nums">{edits.ins}</span>{" "}
          inserted ·{" "}
          <span className="tabular-nums">
            {(data.meta.elapsed_ms / 1000).toFixed(1)}s
          </span>{" "}
          · ${data.usage.cost_usd.toFixed(4)}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowInline(!showInline)}
            className="text-muted-foreground hover:text-foreground text-xs transition"
          >
            {showInline ? "Hide deletions" : "Show deletions"}
          </button>
          <span className="text-border mx-1">·</span>
          <button
            type="button"
            onClick={copy}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition"
          >
            <Copy size={11} weight="bold" /> Copy
          </button>
          <span className="text-border mx-1">·</span>
          <button
            type="button"
            onClick={download}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition"
          >
            <DownloadSimple size={11} weight="bold" /> Download
          </button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="border-border bg-card max-h-[64vh] overflow-auto rounded-xl border p-6"
      >
        <DiffView tokens={tokens} showInline={showInline} />
      </motion.div>

      <div className="text-muted-foreground flex items-center justify-between font-mono text-[10px]">
        <span className="truncate">{data.meta.request_id}</span>
        <button
          type="button"
          onClick={onReset}
          className="hover:text-foreground transition"
        >
          ↻ Transform another
        </button>
      </div>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}
