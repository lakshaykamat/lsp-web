import Link from "next/link"

export const metadata = {
  title: "Service Unavailable — LSP",
  description: "This service is temporarily disabled. Please contact the administrator.",
}

export default function ContactAdminPage() {
  return (
    <main className="bg-background text-foreground flex min-h-screen items-center justify-center px-6 py-16">
      <div className="border-border/60 bg-card/40 w-full max-w-md rounded-xl border p-8 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-md font-mono text-[11px] font-semibold tracking-tight">
            LSP
          </div>
          <span className="text-muted-foreground font-mono text-[10px] tracking-tight uppercase">
            Service unavailable
          </span>
        </div>

        <h1 className="text-foreground mt-6 text-xl font-medium tracking-tight">
          This service is temporarily disabled
        </h1>

        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          The LaTeX Style Processor is offline for maintenance. All pages and API
          endpoints are paused. Please contact the administrator for access or an
          estimated time to restore.
        </p>

        <div className="border-border/60 bg-muted/30 mt-6 rounded-md border p-4">
          <div className="text-muted-foreground font-mono text-[10px] tracking-tight uppercase">
            Contact
          </div>
          <Link
            href="mailto:admin@example.com"
            className="text-foreground hover:text-primary mt-1 inline-block font-mono text-sm"
          >
            admin@example.com
          </Link>
        </div>

        <p className="text-muted-foreground/80 mt-6 font-mono text-[10px] tracking-tight">
          Status: 503 · IS_DISABLED=true
        </p>
      </div>
    </main>
  )
}
