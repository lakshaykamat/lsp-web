import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE_NAME, verifyAuthSession } from "@/lib/auth"

const DISABLED_PATH = "/contact-admin"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (process.env.IS_DISABLED === "true") {
    if (pathname.startsWith("/api/")) {
      // Allow version probes so the contact-admin page can still show the build.
      if (pathname === "/api/version") {
        return NextResponse.next()
      }
      return NextResponse.json(
        {
          error: "service_disabled",
          message:
            "This service is temporarily disabled. Please contact the administrator.",
        },
        { status: 503 }
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

  if (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout"
  ) {
    return NextResponse.next()
  }

  const password = process.env.APP_PASSWORD
  const session = req.cookies.get(AUTH_COOKIE_NAME)?.value
  if (await verifyAuthSession(session, password)) {
    return NextResponse.next()
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "unauthorized",
        detail: "Log in to access this service.",
        request_id: crypto.randomUUID(),
      },
      { status: 401 }
    )
  }

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = "/login"
  loginUrl.search = ""
  loginUrl.searchParams.set("next", `${pathname}${req.nextUrl.search}`)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
