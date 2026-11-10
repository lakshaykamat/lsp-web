"use client"

import { useState, type FormEvent } from "react"
import { Eye, EyeSlash } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"

export default function LoginPage() {
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.detail ?? "Unable to sign in.")
        return
      }

      const next = new URLSearchParams(window.location.search).get("next")
      const destination =
        next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
          ? next
          : "/dashboard"
      window.location.assign(destination)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-semibold text-primary">
          LSP
        </div>
        <h1 className="text-xl font-medium tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter the site password to continue.
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2 text-xs font-medium">
            <label htmlFor="password">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                autoFocus
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-10 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:outline-none"
              >
                {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="mt-1 w-full">
            {loading ? "Signing in…" : "Continue"}
          </Button>
        </form>
      </section>
    </main>
  )
}
