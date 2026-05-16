import { NextResponse, type NextRequest } from "next/server"

const DISABLED_PATH = "/contact-admin"

export function middleware(req: NextRequest) {
  if (process.env.IS_DISABLED !== "true") {
    return NextResponse.next()
  }

  const { pathname } = req.nextUrl

  if (pathname.startsWith("/api/")) {
    // Allow version probes so the contact-admin page can still show the build.
    if (pathname === "/api/version") {
      return NextResponse.next()
    }
    return NextResponse.json(
      { error: "service_disabled", message: "This service is temporarily disabled. Please contact the administrator." },
      { status: 503 },
    )
  }

  if (pathname === DISABLED_PATH) {
    return NextResponse.next()
  }

  const url = req.nextUrl.clone()
  url.pathname = DISABLED_PATH
  url.search = ""
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
