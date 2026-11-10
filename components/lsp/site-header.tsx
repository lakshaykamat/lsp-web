"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { Moon, SignOut, Sun } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

type VersionInfo = {
  version: string
  git_sha: string | null
}

export function SiteHeader() {
  const [version, setVersion] = useState<VersionInfo | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    let cancelled = false
    fetch("/api/version")
      .then((r) => r.json())
      .then((data: VersionInfo) => {
        if (!cancelled) setVersion(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function signOut() {
    setSigningOut(true)
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" })
      if (response.ok) window.location.assign("/login")
      else setSigningOut(false)
    } catch {
      setSigningOut(false)
    }
  }

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border/60 bg-background/80 px-3 py-3 backdrop-blur-sm sm:gap-3 sm:px-6 sm:py-3.5 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 sm:gap-3"
          aria-label="LSP home"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-[11px] font-semibold tracking-tight text-primary">
            LSP
          </div>
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="hidden truncate text-[13px] font-medium tracking-tight text-foreground sm:inline">
              LaTeX Style Processor
            </span>
            <span className="truncate text-[13px] font-medium tracking-tight text-foreground sm:hidden">
              LaTeX SP
            </span>
            {version ? (
              <span className="hidden shrink-0 rounded-full border border-border/80 px-1.5 py-0.5 font-mono text-[10px] tracking-tight text-muted-foreground md:inline-flex">
                v{version.version}
                {version.git_sha ? ` · ${version.git_sha.slice(0, 7)}` : ""}
              </span>
            ) : (
              <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground md:inline">
                —
              </span>
            )}
          </div>
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <NavLink href="/" active={pathname === "/"}>
          Transform
        </NavLink>
        <NavLink href="/history" active={pathname?.startsWith("/history")}>
          History
        </NavLink>
        <NavLink href="/dashboard" active={pathname?.startsWith("/dashboard")}>
          Dashboard
        </NavLink>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          aria-label="Sign out"
          title="Sign out"
          className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
        >
          <SignOut size={14} weight="bold" />
        </button>
        <span
          className="mx-1 hidden h-4 w-px bg-border/60 sm:mx-2 sm:inline"
          aria-hidden
        />
        <ThemeToggle />
      </div>
    </header>
  )
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean | undefined
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-2 py-1.5 text-[11px] transition-colors sm:px-2.5 sm:text-xs",
        active
          ? "bg-muted/60 text-foreground"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      )}
    >
      {children}
    </Link>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Standard next-themes hydration-safe mount flag.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === "dark"

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/80 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
    >
      {mounted ? (
        isDark ? (
          <Sun size={14} weight="bold" />
        ) : (
          <Moon size={14} weight="bold" />
        )
      ) : (
        <Moon size={14} weight="bold" />
      )}
    </button>
  )
}
