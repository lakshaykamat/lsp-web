"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { Moon, Sun } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

type VersionInfo = {
  version: string
  git_sha: string | null
}

export function SiteHeader() {
  const [version, setVersion] = useState<VersionInfo | null>(null)
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

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-20 flex items-center justify-between gap-2 border-b px-3 py-3 backdrop-blur-sm sm:gap-3 sm:px-6 sm:py-3.5 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 sm:gap-3"
          aria-label="LSP home"
        >
          <div className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold tracking-tight">
            LSP
          </div>
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-foreground hidden truncate text-[13px] font-medium tracking-tight sm:inline">
              LaTeX Style Processor
            </span>
            <span className="text-foreground truncate text-[13px] font-medium tracking-tight sm:hidden">
              LaTeX SP
            </span>
            {version ? (
              <span className="text-muted-foreground border-border/80 hidden shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[10px] tracking-tight md:inline-flex">
                v{version.version}
                {version.git_sha ? ` · ${version.git_sha.slice(0, 7)}` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground hidden shrink-0 font-mono text-[10px] md:inline">
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
        <NavLink
          href="/dashboard"
          active={pathname?.startsWith("/dashboard")}
        >
          Dashboard
        </NavLink>
        <span className="bg-border/60 mx-1 hidden h-4 w-px sm:mx-2 sm:inline" aria-hidden />
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
          ? "text-foreground bg-muted/60"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
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
      className="border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/60 inline-flex h-8 w-8 items-center justify-center rounded-md border transition"
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
