import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE,
  createAuthSession,
} from "@/lib/auth"

export async function POST(req: Request) {
  const expectedPassword = process.env.APP_PASSWORD
  if (!expectedPassword) {
    return NextResponse.json(
      {
        error: "service_unavailable",
        detail: "APP_PASSWORD is not configured on the server.",
      },
      { status: 503 }
    )
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { error: "validation_error", detail: "Send a valid JSON request." },
      { status: 400 }
    )
  }

  const password =
    typeof payload === "object" &&
    payload !== null &&
    "password" in payload &&
    typeof payload.password === "string"
      ? payload.password
      : ""

  const expected = Buffer.from(expectedPassword)
  const provided = Buffer.from(password)
  const matches =
    provided.length === expected.length && timingSafeEqual(provided, expected)

  if (!matches) {
    return NextResponse.json(
      { error: "unauthorized", detail: "Incorrect password." },
      { status: 401 }
    )
  }

  const token = await createAuthSession(expectedPassword)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: AUTH_SESSION_MAX_AGE,
  })
  return response
}
