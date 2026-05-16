import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key] = value
  })

  const ipCandidates: Record<string, string | null> = {
    "x-forwarded-for": req.headers.get("x-forwarded-for"),
    "x-real-ip": req.headers.get("x-real-ip"),
    "cf-connecting-ip": req.headers.get("cf-connecting-ip"),
    "true-client-ip": req.headers.get("true-client-ip"),
    "fastly-client-ip": req.headers.get("fastly-client-ip"),
    "x-vercel-forwarded-for": req.headers.get("x-vercel-forwarded-for"),
  }

  const leftmostXff =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null

  return NextResponse.json(
    {
      note: "Read by lsp-web Next.js proxy. Use this to see what client-IP header your deployment platform injects.",
      ip_candidates: ipCandidates,
      leftmost_xff: leftmostXff,
      url: req.url,
      all_headers: headers,
    },
    {
      headers: { "cache-control": "no-store" },
    },
  )
}
