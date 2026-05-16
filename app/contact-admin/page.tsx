import Link from "next/link"

export const metadata = {
  title: "Service Unavailable — LSP",
  description: "This service is temporarily disabled. Please contact the administrator.",
}

const ADMIN_EMAIL = "lakshaykamat.dev@gmail.com"

export default function ContactAdminPage() {
  return (
    <main className="bg-background text-foreground flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="bg-primary/10 text-primary inline-flex h-7 w-7 items-center justify-center rounded-md font-mono text-[11px] font-semibold tracking-tight">
          LSP
        </div>

        <h1 className="text-foreground mt-6 text-lg font-medium tracking-tight">
          We&apos;ll be right back.
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Offline for maintenance. Contact the admin for access.
        </p>

        <Link
          href={`mailto:${ADMIN_EMAIL}`}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-6 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium tracking-tight transition-colors"
        >
          Email admin
        </Link>
      </div>
    </main>
  )
}
