import { proxy } from "@/lib/lsp-api"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ request_id: string }> },
) {
  const { request_id } = await params
  return proxy(req, `/usage/${encodeURIComponent(request_id)}/input.tex`)
}
