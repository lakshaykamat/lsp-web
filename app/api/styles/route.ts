import { proxy } from "@/lib/lsp-api"

export async function GET(req: Request) {
  return proxy(req, "/styles")
}
