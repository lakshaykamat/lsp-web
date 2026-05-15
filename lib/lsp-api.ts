import { NextResponse } from "next/server"
import crypto from "node:crypto"

const FORWARD_HEADERS = [
  "x-user-id",
  "x-session-id",
  "x-client-request-id",
  "user-agent",
  "accept",
] as const

export function apiBase(): string | null {
  const u = process.env.LSP_API_BASE_URL
  if (!u) return null
  return u.replace(/\/+$/, "")
}

export function notConfigured(): NextResponse {
  return NextResponse.json(
    {
      error: "service_unavailable",
      detail:
        "LSP_API_BASE_URL is not configured on the server. See .env.example.",
      request_id: crypto.randomUUID(),
    },
    { status: 503 },
  )
}

function pickHeaders(req: Request, extra?: Record<string, string>): Headers {
  const out = new Headers()
  for (const name of FORWARD_HEADERS) {
    const v = req.headers.get(name)
    if (v) out.set(name, v)
  }
  if (extra) for (const [k, v] of Object.entries(extra)) out.set(k, v)
  return out
}

export async function proxy(
  req: Request,
  path: string,
  init?: { method?: string; body?: BodyInit | null; query?: URLSearchParams },
): Promise<NextResponse> {
  const base = apiBase()
  if (!base) return notConfigured()

  const qs = init?.query?.toString()
  const url = `${base}${path}${qs ? `?${qs}` : ""}`
  const method = init?.method ?? "GET"
  const headers = pickHeaders(req, {
    ...(init?.body ? { "content-type": "application/json" } : {}),
  })

  let upstream: Response
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: init?.body,
      cache: "no-store",
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: "service_unavailable",
        detail:
          err instanceof Error ? err.message : "Upstream fetch failed.",
        request_id: crypto.randomUUID(),
      },
      { status: 503 },
    )
  }

  const body = await upstream.text()
  const contentType =
    upstream.headers.get("content-type") ?? "application/json"
  const res = new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": contentType },
  })

  // Forward useful response headers.
  const passthroughHeaders = [
    "x-request-id",
    "retry-after",
    "content-disposition",
  ]
  for (const h of passthroughHeaders) {
    const v = upstream.headers.get(h)
    if (v) res.headers.set(h, v)
  }
  return res
}
