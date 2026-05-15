import { proxy } from "@/lib/lsp-api"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const query = new URLSearchParams(url.searchParams)
  return proxy(req, "/usage", { query })
}
