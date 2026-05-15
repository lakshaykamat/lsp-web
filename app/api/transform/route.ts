import { proxy } from "@/lib/lsp-api"

export async function POST(req: Request) {
  const url = new URL(req.url)
  const query = url.searchParams.toString()
    ? new URLSearchParams(url.searchParams)
    : undefined
  const body = await req.text()
  return proxy(req, "/transform", { method: "POST", body, query })
}
