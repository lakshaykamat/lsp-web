# LSP Frontend → Backend Integration Notes

> Audience: backend / LSP API team.
> Purpose: explain everything the LSP web client sends on each request so the
> audit record can identify the caller, locate them geographically, and
> correlate runs across sessions.

This document covers **what we send, why we send it, and what the backend
needs to do to record it correctly.** It assumes the API surface documented
in `docs/api.md`.

---

## 1. Request topology

```
Browser  ─►  Vercel Edge  ─►  Next.js Function (our proxy)  ─►  LSP API
 (user)      (CDN/edge)        (lsp-web on Vercel)             (your service)
```

- The user's browser talks to **`https://<our-app>.vercel.app`**, not directly
  to the LSP API.
- Our Next.js API routes (`/api/transform`, `/api/usage`, …) forward the
  request to `LSP_API_BASE_URL` server-side.
- The TCP connection the LSP backend sees originates from the **Vercel
  function**, not the end user. To recover the real client IP, the backend
  must read forwarded headers (see §4).

This matters because without forwarded-header support, every audit row will
record `ip = <vercel-edge>` (typically `us-east-1`, Ashburn, VA) regardless of
where the user actually is.

---

## 2. Identity headers sent on `/transform`

Every `POST /transform` from this frontend carries the following headers in
addition to `Content-Type: application/json`:

| Header                | Always sent? | Source                              | Purpose                                                                     |
| --------------------- | ------------ | ----------------------------------- | --------------------------------------------------------------------------- |
| `X-User-ID`           | yes          | UUID in `localStorage` (per device) | Primary stable identity. Survives tab/session changes. ≤128 chars.          |
| `X-Session-ID`        | yes          | UUID in `sessionStorage` (per tab)  | Groups runs within one browser session. ≤128 chars.                         |
| `X-Client-Request-ID` | yes          | `crypto.randomUUID()` per call      | Per-call correlator. Echoed back in `meta.client_request_id`. ≤128 chars.   |
| `User-Agent`          | yes          | Browser default                     | Forwarded as-is for client identification.                                  |
| `X-Forwarded-For`     | yes          | Vercel edge → our proxy → you       | Chain of client IPs. **Leftmost = real client.** See §4.                    |
| `X-Real-IP`           | yes          | Vercel edge                         | Single real-client IP, when Vercel populates it.                            |
| `X-Forwarded-Proto`   | yes          | Vercel edge                         | Original scheme (`https`). Set so any `Location`/redirect logic stays HTTPS.|
| `X-Forwarded-Host`    | yes          | Vercel edge                         | Original `Host` header (our Vercel domain).                                 |

### How the IDs are minted (frontend side)

```ts
// lib/identity.ts
const USER_KEY = "lsp.user_id"
const SESSION_KEY = "lsp.session_id"

function getUserId() {
  let v = localStorage.getItem(USER_KEY)
  if (!v) {
    v = `u_${crypto.randomUUID()}`
    localStorage.setItem(USER_KEY, v)
  }
  return v
}

function getSessionId() {
  let v = sessionStorage.getItem(SESSION_KEY)
  if (!v) {
    v = `s_${crypto.randomUUID()}`
    sessionStorage.setItem(SESSION_KEY, v)
  }
  return v
}
```

So an `X-User-ID` looks like `u_5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6`.

**Caveats** — both IDs are client-controlled storage:

- `user_id` is wiped if the user clears site data / uses incognito. We're OK
  with this for now; it's a stable correlator, not authenticated identity.
- `session_id` is wiped per tab close.
- The user can theoretically tamper with these. Treat them as
  **caller-asserted** — useful for analytics and debugging, *not* for access
  control.

---

## 3. Request body fields

`POST /transform` body — what we send today:

```json
{
  "content": "<entire .tex source>",
  "style": "<style key or shortcut from /styles>",
  "filename": "<original-basename.tex>"
}
```

| Field      | Always sent?              | Notes                                                                 |
| ---------- | ------------------------- | --------------------------------------------------------------------- |
| `content`  | yes                       | Raw LaTeX, up to 4 MiB.                                               |
| `style`    | yes                       | Canonical key or 3-char shortcut.                                     |
| `filename` | yes when known            | Original `.tex` basename. **Please store on the audit record** so it
appears in the history list as the heading and on `Content-Disposition` when
re-downloading via `/usage/{id}/input.tex`. |

We **do not** send `only_command_keys` from the web UI today; expect `null`.

---

## 4. Real client IP — uvicorn / proxy-headers checklist

The frontend now forwards `X-Forwarded-For` and `X-Real-IP` on every call,
populated by Vercel's edge with the real client IP. The backend has to be
configured to **trust** them.

### Required uvicorn flags

```bash
uvicorn lsp.api:app \
  --proxy-headers \
  --forwarded-allow-ips="*"   # or a Vercel egress range if you want stricter
```

- `--proxy-headers` tells uvicorn to read `X-Forwarded-*` headers.
- `--forwarded-allow-ips="*"` tells it to trust them from any upstream
  (because Vercel function IPs are not stable).

Without these flags, `request.client.host` returns the Vercel function's IP
and every geo lookup will resolve to **Ashburn, VA, US** regardless of the
user's actual location.

### How to parse `X-Forwarded-For` correctly

`X-Forwarded-For` is a comma-separated chain:

```
X-Forwarded-For: 203.0.113.7, 76.76.21.21
                 ^-- real client    ^-- Vercel edge
```

The **leftmost** value is the original client. Uvicorn does this for you when
`--proxy-headers` is enabled. If you parse it manually, take `split(",")[0]`.

### Verification

A `POST /transform` from a user in India should produce an audit record with:

```json
"identity": {
  "network": {
    "ip": "<their real IP>",
    "country": "IN",
    "region": "<state>",
    "city": "<city>"
  }
}
```

If you still see `country: "US"`, `city: "Ashburn"` after a known-Indian user
runs a transform, the uvicorn flags above are missing.

---

## 5. Recommended audit-record fields

The frontend assumes the audit record stores at least the following (most are
already in the documented `/usage` projection):

| Field                                | Where it comes from           | Required for our UI? |
| ------------------------------------ | ----------------------------- | -------------------- |
| `request_id`                         | server-generated UUID v4      | yes                  |
| `ts_utc`                             | server clock                  | yes                  |
| `source`                             | `"http"` for our calls        | yes                  |
| `version`, `git_sha`                 | server build metadata         | nice to have         |
| `status_code`, `duration_ms`         | server-side                   | yes                  |
| `error_code`                         | on non-2xx                    | yes                  |
| `user_id`                            | `X-User-ID` header            | **yes — primary id** |
| `session_id`                         | `X-Session-ID` header         | yes                  |
| `client_request_id`                  | `X-Client-Request-ID` header  | yes                  |
| `ip`, `country`, `region`, `city`    | resolved from `X-Forwarded-For` (§4) | yes           |
| `user_agent`                         | `User-Agent` header           | yes                  |
| `filename`                           | request body                  | **yes — shown as heading** |
| `style_requested`, `style_resolved`  | request body / server resolve | yes                  |
| `content_bytes`                      | derived                       | yes                  |
| `only_command_keys`                  | request body                  | yes (may be null)    |
| `pipeline_detail`                    | pipeline                      | nice to have         |
| `usage` (tokens, cost)               | LLM                           | yes                  |
| `artifacts.{input,output,log}_*`     | GridFS                        | yes — downloads      |
| `fingerprint`                        | server-derived (see §6)       | not exposed today    |

---

## 6. Fingerprint (server-side hash)

The audit record already includes an `identity.fingerprint` field that the
backend computes — appears to be a SHA-256 over IP + user-agent (or similar).

Two requests would be helpful:

1. **Document the formula** in `docs/api.md` so we can recompute it locally
   when debugging ("did *this* device run that?").
2. **Optionally expose `fingerprint` on `/usage` items** (it's currently
   stripped from the sanitized projection) so we can group runs by hash in
   the dashboard. This is a weak correlator — fingerprint changes when a user
   switches network or upgrades their browser — but it's useful when
   `user_id` is missing (e.g., requests from cURL or older clients).

Even without (2), `ip` + `user_agent` are already in the projection, so the
frontend can show "same device" hints heuristically.

---

## 7. Debugging workflow — "who ran request X?"

Given a `request_id`, the answer key in priority order:

1. **`identity.claimed.user_id`** — if present, this is a stable per-device id
   minted by the web client. Filter `/usage?user_id=<id>` to see every other
   run from the same device.
2. **`identity.claimed.session_id`** — runs in the same browser tab/session.
3. **`identity.network.{ip, country, region, city}`** — coarse but real
   (once §4 is configured). Useful for support tickets like "I'm in Pune and
   my upload failed."
4. **`identity.network.user_agent`** — distinguishes Chrome vs Safari, Mac vs
   Windows, etc.
5. **`identity.fingerprint`** — fallback hash when the others are missing.
6. **`client_request_id`** — only useful if the user has client-side logs
   that mention the same UUID.

For a request with `user_id: null` (CLI runs, older browser without
`localStorage`, etc.), fall back to the order above.

---

## 8. Things the frontend deliberately does **not** send

- **Email / name / any PII** — `X-User-ID` is a UUID, never a human name.
- **Auth tokens** — there is no auth layer between our web client and the LSP
  API today. If you add one, we'll wire it up; the proxy already passes
  through arbitrary headers configured in `FORWARD_HEADERS`.
- **Cookies** — none crossing the boundary today.
- **`X-Real-IP` from the browser** — only Vercel's edge-injected value, never
  user-supplied.

---

## 9. Quick checklist for the backend team

- [ ] uvicorn started with `--proxy-headers --forwarded-allow-ips="*"`
- [ ] Audit record reads `X-User-ID` / `X-Session-ID` / `X-Client-Request-ID`
      and stores them as `user_id` / `session_id` / `client_request_id`
- [ ] Audit record stores the `filename` body field
- [ ] Geo lookup uses the IP resolved *after* proxy-headers parsing
- [ ] (Optional) `fingerprint` formula documented in `docs/api.md`
- [ ] (Optional) `fingerprint` exposed on `/usage` items, or a
      `?fingerprint=` filter added

---

## 10. Sample request the backend should see

After all of the above is wired, a typical inbound `POST /transform` from a
user in India looks like this on the LSP API:

```http
POST /transform HTTP/1.1
Host: latex-style-processor-api.example.com
Content-Type: application/json
X-User-ID: u_5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6
X-Session-ID: s_1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d
X-Client-Request-ID: 6f2c1f4e-9a55-4f7b-8a6d-2b1f5b9b3f2d
X-Forwarded-For: 49.207.x.x, 76.76.21.21
X-Real-IP: 49.207.x.x
X-Forwarded-Proto: https
X-Forwarded-Host: lsp-web.vercel.app
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...

{
  "content": "\\section{Introduction}...",
  "style": "harvard",
  "filename": "TRE104945.tex"
}
```

And the resulting audit row should look like (abbreviated):

```json
{
  "request_id": "<server uuid>",
  "source": "http",
  "identity": {
    "claimed": {
      "user_id": "u_5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6",
      "session_id": "s_1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "client_request_id": "6f2c1f4e-9a55-4f7b-8a6d-2b1f5b9b3f2d"
    },
    "network": {
      "ip": "49.207.x.x",
      "country": "IN",
      "region": "Maharashtra",
      "city": "Pune",
      "user_agent": "Mozilla/5.0 ..."
    },
    "fingerprint": "<sha256>"
  },
  "request": {
    "filename": "TRE104945.tex",
    "style_requested": "harvard",
    "style_resolved": "harvard",
    ...
  }
}
```

If any of those fields are missing or wrong after a real user runs a
transform, walk back through §§2–4 to find the gap.
