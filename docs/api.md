# LSP Transform API — Frontend Integration Guide

> Audience: developers integrating the LSP API from a frontend or backend service.
> For internals (architecture, sinks, pipeline), see `docs/low-level-design.md`.

---

## Table of contents

- [LSP Transform API — Frontend Integration Guide](#lsp-transform-api--frontend-integration-guide)
  - [Table of contents](#table-of-contents)
  - [1. Overview](#1-overview)
  - [2. Base URL, content type, conventions](#2-base-url-content-type-conventions)
  - [3. Authentication \& rate limiting](#3-authentication--rate-limiting)
  - [4. Endpoints](#4-endpoints)
    - [4.1 `GET /healthz`](#41-get-healthz)
    - [4.2 `GET /version`](#42-get-version)
    - [4.3 `GET /styles`](#43-get-styles)
    - [4.4 `POST /transform`](#44-post-transform)
    - [4.5 `GET /usage`](#45-get-usage)
    - [4.6 `GET /usage/{request_id}`](#46-get-usagerequest_id)
    - [4.7 `GET /usage/{request_id}/input.tex`](#47-get-usagerequest_idinputtex)
    - [4.8 `GET /usage/{request_id}/output.tex`](#48-get-usagerequest_idoutputtex)
    - [4.9 `GET /usage/{request_id}/log.txt`](#49-get-usagerequest_idlogtxt)
  - [5. Error model](#5-error-model)
  - [6. Identifying users](#6-identifying-users)
    - [What the server records per `/transform`](#what-the-server-records-per-transform)
    - [Picking `X-User-ID`](#picking-x-user-id)
    - [Picking `X-Session-ID`](#picking-x-session-id)
    - [Picking `X-Client-Request-ID`](#picking-x-client-request-id)
  - [7. Quick reference](#7-quick-reference)

---

## 1. Overview

LSP rewrites academic LaTeX manuscripts so they conform to a target citation style (numbered / Vancouver / AMA / Harvard / APA), with every change marked inline as `\del{old}\ins{new}` so a human can review.

**What it does**

- Section headings, captions, and `\bibinfo` titles → sentence-case ↔ title-case ↔ ALL-CAPS as the style demands.
- Journal names → full ↔ abbreviated, with/without periods.
- Citation commands → `\cite` → `\citet` / `\citep` for author-date styles.
- Cross-references → `\ref` / `\eqref` → `\linkref`.
- Author/address blocks → normalised.
- Every change is wrapped `\del{old}\ins{new}` so a copy editor can accept/reject in their normal LaTeX diff workflow.

**What it does not do**

- Touch math, proper nouns, acronyms, or anything inside protected environments.
- Render PDF or HTML — it's a text-in / text-out transformation.
- Stream progress (the call is synchronous; transforms typically take 5–60 s).

**Latency**

| Phase                | Typical | Notes                                    |
| -------------------- | ------- | ---------------------------------------- |
| Cold start           | + ~1 s  | First request after idle                 |
| Typical transform    | 5–30 s  | Real manuscript                          |
| Hard ceiling         | 300 s   | Server returns `408 request_timeout`     |

Surface progress in the UI (skeleton, "still working…" copy). Don't leave a frozen spinner.

---

## 2. Base URL, content type, conventions

- **Base URL**: configured per environment, e.g. `https://api.lsp.example.com`.
- **Content type**: `application/json` for all request and response bodies.
- **Encoding**: UTF-8.
- **Timestamps**: ISO-8601 in UTC with millisecond precision and a trailing `Z` (e.g. `2026-05-07T14:08:11.412Z`).
- **IDs**: opaque ASCII strings ≤128 chars (`request_id` is a UUID v4).
- **Live OpenAPI / Swagger UI**: `GET /docs` — keep it open while integrating.

---

## 3. Authentication & rate limiting

> ⚠️ **There is no authentication on this API.** No bearer tokens, no API keys, no signed requests. Anyone who can reach the URL can call any endpoint, including `/usage`.

Operational guards:

| Guard                  | Default          | How to change (env var)            |
| ---------------------- | ---------------- | ---------------------------------- |
| Per-IP rate limit      | 30 req/min on `/transform` | `LSP_RATE_LIMIT_PER_MIN` |
| Request body cap       | 4 MiB            | (compile-time)                     |
| CORS allowed origins   | `*`              | `LSP_API_ALLOWED_ORIGINS` (comma-separated) |
| Pipeline timeout       | 300 s            | (compile-time)                     |

`X-User-ID` and `X-Session-ID` are **caller-asserted**. The server stores whatever the client sends and never verifies it. If you need verified identity, terminate auth in front of the API (Clerk, Auth0, NextAuth, an API gateway) and pass the verified user id through as `X-User-ID`.

`/usage` accepts but does not enforce a `user_id` filter — anyone can list anyone's runs (or all runs). Treat run summaries as low-confidentiality.

When the rate limit trips, the response is `429 rate_limited` with a `Retry-After: <seconds>` header.

---

## 4. Endpoints

### 4.1 `GET /healthz`

Liveness probe. Cheap, unauthenticated, safe to hit from any monitoring system.

**Request**

```http
GET /healthz HTTP/1.1
Host: api.lsp.example.com
```

```bash
curl https://api.lsp.example.com/healthz
```

**Response — 200**

```json
{
  "status": "ok",
  "version": "5.0.0",
  "cold_start": true
}
```

| Field        | Type    | Notes                                                              |
| ------------ | ------- | ------------------------------------------------------------------ |
| `status`     | string  | Always `"ok"` for a healthy server.                                |
| `version`    | string  | Application semantic version.                                      |
| `cold_start` | boolean | `true` only on the first request after process boot, `false` after.|

---

### 4.2 `GET /version`

Detailed build and runtime information. Use it for an "About" panel, debug overlay, or compatibility check before issuing a transform. The payload is static for the lifetime of the process — safe to cache for a few minutes on the client.

**Request**

```bash
curl https://api.lsp.example.com/version
```

**Response — 200**

```json
{
  "version": "5.0.0",
  "git_sha": "abc1234",
  "started_at": "2026-05-07T15:21:14Z",
  "uptime_seconds": 1283,
  "runtime": {
    "python": "3.13.9",
    "platform": "Darwin 25.3.0",
    "implementation": "cpython"
  },
  "models": {
    "transform_high": "gpt-4o",
    "transform_mid": "gpt-4o-mini",
    "review": "gpt-4o"
  },
  "styles": {
    "count": 5,
    "keys": ["numbered", "vancouver", "ama", "harvard", "apa"]
  },
  "limits": {
    "max_body_bytes": 4194304,
    "transform_timeout_s": 300.0,
    "rate_limit_per_min": 30
  },
  "auth": {
    "enabled": false,
    "scheme": null,
    "rate_limit": "per_ip",
    "cors_open": true
  }
}
```

| Field                          | Type            | Notes                                                                      |
| ------------------------------ | --------------- | -------------------------------------------------------------------------- |
| `version`                      | string          | Application semver, matches `pyproject.toml`.                              |
| `git_sha`                      | string \| null  | Set when `GIT_SHA` or `VERCEL_GIT_COMMIT_SHA` is exported at deploy time.  |
| `started_at`                   | ISO-8601        | UTC time the process booted.                                               |
| `uptime_seconds`               | integer         | Seconds since boot.                                                        |
| `runtime.python`               | string          | Interpreter version.                                                       |
| `runtime.platform`             | string          | OS family + release.                                                       |
| `runtime.implementation`       | string          | e.g. `"cpython"`.                                                          |
| `models.transform_high`        | string          | Model used for casing/abbreviation/expansion transforms.                   |
| `models.transform_mid`         | string          | Model used for citation classification.                                    |
| `models.review`                | string          | Model used for the review pipeline (not exposed via HTTP today).           |
| `styles.count` / `styles.keys` | int / string[]  | All supported style keys. Same as the `key` field in `GET /styles`.        |
| `limits.max_body_bytes`        | integer         | Server-enforced cap on request body bytes.                                 |
| `limits.transform_timeout_s`   | number          | Hard ceiling on `/transform` runtime.                                      |
| `limits.rate_limit_per_min`    | integer         | Per-IP request budget for `/transform`.                                    |
| `auth.enabled`                 | boolean         | Currently always `false`. See §3.                                          |
| `auth.scheme`                  | string \| null  | Currently always `null`.                                                   |
| `auth.rate_limit`              | string          | `"per_ip"` today.                                                          |
| `auth.cors_open`               | boolean         | `true` when `LSP_API_ALLOWED_ORIGINS` is `*`.                              |

---

### 4.3 `GET /styles`

Returns the catalogue of supported citation styles. **Always fetch this — never hardcode style keys.** The server can add or rename styles without a client release.

**Request**

```bash
curl https://api.lsp.example.com/styles
```

**Response — 200**

```json
[
  {
    "key": "numbered",
    "name": "Numbered",
    "description": "Numeric citations in square brackets, references listed in citation order.",
    "shortcut": "num"
  },
  {
    "key": "vancouver",
    "name": "Vancouver",
    "description": "Numeric superscript citations, references in citation order, abbreviated journal names.",
    "shortcut": "van"
  },
  {
    "key": "ama",
    "name": "AMA",
    "description": "American Medical Association — numeric citations, abbreviated journal names with periods.",
    "shortcut": "ama"
  },
  {
    "key": "harvard",
    "name": "Harvard",
    "description": "Author-date citations, references in alphabetical order, full journal names.",
    "shortcut": "har"
  },
  {
    "key": "apa",
    "name": "APA",
    "description": "American Psychological Association — author-date citations, full journal names.",
    "shortcut": "apa"
  }
]
```

| Field         | Type           | Notes                                                                |
| ------------- | -------------- | -------------------------------------------------------------------- |
| `key`         | string         | Canonical style id. Pass to `POST /transform` as `style`.            |
| `name`        | string         | Human-readable label.                                                |
| `description` | string \| null | Short description for the UI.                                        |
| `shortcut`    | string \| null | Three-character alias. Also accepted as `style` in `POST /transform`.|

---

### 4.4 `POST /transform`

Run the pipeline. Synchronous: the response returns when the transform finishes (or when the 300 s timeout fires).

> **What you get back**
>
> The endpoint returns the **complete `.tex` file** — every byte of the input, with every edit inline-wrapped as `\del{old}\ins{new}`. It is **not** a diff, patch, or partial document. The API never strips, accepts, or rejects edits — that's the copy editor's job downstream. Untouched regions (math, protected environments, acronyms, proper nouns) come back byte-identical to the input.
>
> **Two response modes**, selected by the request:
>
> | Mode               | When                                                                          | Body                                  |
> | ------------------ | ----------------------------------------------------------------------------- | ------------------------------------- |
> | `application/json` | Default. `Accept: application/json`, `Accept: */*`, or no `Accept` header.    | JSON envelope with `content` + stats + usage + meta. |
> | `text/plain`       | `Accept: text/plain` (or `text/x-tex` / `application/x-tex`), **or** query string `?format=tex`. | Raw `.tex` body. Telemetry on response headers. |
>
> Both modes run the same pipeline; only the response shape differs. JSON mode is the default for browser/SPA integrations that want stats and cost. Plain-text mode is for "give me back a file I can save to disk."

**Request headers**

| Header                | Required | Notes                                                                                                                                       |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Type`        | yes      | `application/json`                                                                                                                          |
| `Accept`              | no       | Selects the response mode. Default JSON. Send `text/plain` (or `text/x-tex` / `application/x-tex`) to get the raw `.tex` body. See below.   |
| `X-User-ID`           | no       | Stable opaque id for the end user. ≤128 chars. See §6.                                                                                      |
| `X-Session-ID`        | no       | Per-session id (browser tab / login session). ≤128 chars.                                                                                   |
| `X-Client-Request-ID` | no       | Tracing hint. Echoed in `meta.client_request_id` (JSON) or `X-Client-Request-ID` response header (plain). ≤128 chars.                       |

**Request body**

| Field               | Type              | Required | Notes                                                                                  |
| ------------------- | ----------------- | -------- | -------------------------------------------------------------------------------------- |
| `content`           | string            | yes      | LaTeX source. Min length 1. Total request body capped at **4 MiB**.                    |
| `style`             | string            | yes      | A `key` or `shortcut` from `GET /styles`. Min length 1.                                |
| `only_command_keys` | string[] \| null  | no       | Optional whitelist. ≤ **128** entries × ≤ **64** chars each. `null` runs everything.   |
| `filename`          | string \| null    | no       | Original file basename (e.g. `"TRE13243.tex"`). ≤ **255** chars, basename only — no `/` or `\`. Stored on the audit record and used as the `Content-Disposition` filename when re-downloading the input/output via `/usage/{id}/input.tex` and `/output.tex`. |

**Example — minimal request**

```bash
curl -X POST https://api.lsp.example.com/transform \
  -H "Content-Type: application/json" \
  -H "X-User-ID: user_2fK91ABc" \
  -H "X-Session-ID: sess_42" \
  -H "X-Client-Request-ID: 6f2c1f4e-9a55-4f7b-8a6d-2b1f5b9b3f2d" \
  -d '{
    "content": "\\section{Introduction}\nWe build on \\cite{smith2020}. See Fig. 1.",
    "style": "numbered",
    "filename": "TRE13243.tex"
  }'
```

**Example — request with whitelist**

```json
{
  "content": "\\section{Introduction}\n...",
  "style": "vancouver",
  "only_command_keys": ["section", "subsection", "caption"]
}
```

**Response — 200 (`application/json`, default)**

```json
{
  "content": "\\section{\\del{Introduction}\\ins{INTRODUCTION}}\nWe build on \\del{\\cite}\\ins{\\citep}{smith2020}. See \\del{Fig.}\\ins{Figure} 1.",
  "style": "numbered",
  "stats": {
    "total_entries_processed": 412,
    "total_entries_changed": 87,
    "by_step": {
      "AuthorAddressNormalization": { "processed": 4, "changed": 1 },
      "LinkNormalization":          { "processed": 22, "changed": 11 },
      "CitationNormalization":      { "processed": 156, "changed": 34 },
      "StyleTransformation":        { "processed": 230, "changed": 41 }
    },
    "token_usage": {
      "prompt_tokens": 9821,
      "completion_tokens": 1402,
      "total_tokens": 11223,
      "cached_tokens": 256
    }
  },
  "usage": {
    "model": "gpt-4o",
    "total_time_s": 11.97,
    "input_tokens": 9821,
    "output_tokens": 1402,
    "total_tokens": 11223,
    "cached_tokens": 256,
    "cost_usd": 0.0823,
    "cost_inr": 7.41
  },
  "meta": {
    "elapsed_ms": 12480,
    "request_id": "5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6",
    "version": "5.0.0",
    "client_request_id": "6f2c1f4e-9a55-4f7b-8a6d-2b1f5b9b3f2d",
    "artifact_id": "65f1c2a3b4d5e6f7a8b9c0d1"
  }
}
```

**Response headers**

| Header         | Notes                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| `X-Request-ID` | Mirrors `meta.request_id`. Log on every call.                          |

| Field                       | Type               | Notes                                                                                  |
| --------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| `content`                   | string             | **Complete `.tex` file** — full input rewritten, with every edit inline-wrapped as `\del{old}\ins{new}`. Save as `.tex` directly. Never a diff or partial document. |
| `style`                     | string             | Resolved canonical style key (e.g. `"numbered"` even if `"num"` was sent).             |
| `stats`                     | object             | Pipeline counters. Shape may evolve — surface as-is or ignore.                         |
| `usage.model`               | string             | Model that produced the transform.                                                     |
| `usage.total_time_s`        | number             | Wall-clock seconds spent in LLM calls.                                                 |
| `usage.input_tokens`        | integer            | Total prompt tokens charged (includes cached).                                         |
| `usage.output_tokens`       | integer            | Completion tokens.                                                                     |
| `usage.total_tokens`        | integer            | `input + output`.                                                                      |
| `usage.cached_tokens`       | integer            | Subset of `input_tokens` served from prompt cache (cheaper rate).                      |
| `usage.cost_usd`            | number             | Server-computed cost in USD. Use for billing/display.                                  |
| `usage.cost_inr`            | number             | Same, in INR (`USD_TO_INR_RATIO`).                                                     |
| `meta.elapsed_ms`           | integer            | End-to-end server time (incl. I/O, sinks).                                             |
| `meta.request_id`           | string (UUID v4)   | Canonical id. Also in `X-Request-ID` header.                                           |
| `meta.version`              | string             | Server version that handled this request.                                              |
| `meta.client_request_id`    | string \| null     | Echo of `X-Client-Request-ID`.                                                         |
| `meta.artifact_id`          | string \| null     | GridFS id of the stored input artifact, when audit storage is healthy.                 |

**Response — 200 (`text/plain`, file mode)**

Trigger by sending `Accept: text/plain` (or `text/x-tex` / `application/x-tex`), or by appending `?format=tex` to the URL.

The response body is the **raw `.tex` content** — no JSON wrapper. All telemetry that would otherwise live in `meta` and `usage` is moved to response headers, so you don't lose cost/correlation data.

```bash
curl -X POST "https://api.lsp.example.com/transform" \
  -H "Content-Type: application/json" \
  -H "Accept: text/plain" \
  -H "X-User-ID: user_2fK91ABc" \
  -d '{ "content": "\\section{Introduction}\n...", "style": "numbered" }' \
  -o transformed.tex

# equivalent:
curl -X POST "https://api.lsp.example.com/transform?format=tex" \
  -H "Content-Type: application/json" \
  -d '{ "content": "\\section{Introduction}\n...", "style": "numbered" }' \
  -o transformed.tex
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Content-Disposition: attachment; filename="transformed-numbered.tex"
X-Request-ID: 5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6
X-LSP-Version: 5.0.0
X-LSP-Style: numbered
X-LSP-Elapsed-MS: 12480
X-LSP-Model: gpt-4o
X-LSP-Tokens-Total: 11223
X-LSP-Tokens-Input: 9821
X-LSP-Tokens-Output: 1402
X-LSP-Tokens-Cached: 256
X-LSP-Cost-USD: 0.082300
X-LSP-Cost-INR: 7.4070
X-LSP-Artifact-ID: 65f1c2a3b4d5e6f7a8b9c0d1
X-Client-Request-ID: 6f2c1f4e-9a55-4f7b-8a6d-2b1f5b9b3f2d

\section{\del{Introduction}\ins{INTRODUCTION}}
We build on \del{\cite}\ins{\citep}{smith2020}. See \del{Fig.}\ins{Figure} 1.
```

| Header                | Notes                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| `Content-Type`        | `text/plain; charset=utf-8`                                                        |
| `Content-Disposition` | `attachment; filename="transformed-<style>.tex"` — browsers prompt to save.        |
| `X-Request-ID`        | Same UUID you'd find at `meta.request_id` in JSON mode.                            |
| `X-LSP-Version`       | Server version that handled the request.                                           |
| `X-LSP-Style`         | Resolved canonical style key.                                                      |
| `X-LSP-Elapsed-MS`    | End-to-end server time, milliseconds.                                              |
| `X-LSP-Model`         | LLM model that produced the transform.                                             |
| `X-LSP-Tokens-Total` / `-Input` / `-Output` / `-Cached` | Token counts (cached is a subset of input).      |
| `X-LSP-Cost-USD`      | Cost in USD, 6 decimal places.                                                     |
| `X-LSP-Cost-INR`      | Cost in INR, 4 decimal places.                                                     |
| `X-LSP-Artifact-ID`   | GridFS id of the stored input artifact, when present.                              |
| `X-Client-Request-ID` | Echoed only when the caller sent it on the request.                                |

**Notes**

- `pipeline.stats` is **not** exposed in plain-text mode. Use JSON mode if you need the per-step counters.
- Errors still come back as JSON (the `application/json` envelope from §5) — `text/plain` only switches the **success** body.
- Negotiation precedence: `?format=tex` wins, then the `Accept` header. `Accept: */*` or no `Accept` → JSON.

---

### 4.5 `GET /usage`

Read the audit history of past `/transform` runs. Returns a sanitised projection — **no IPs, geo, or content hashes**.

All filters are optional. Call shapes:

| Goal                              | Query string                                |
| --------------------------------- | ------------------------------------------- |
| List all runs (most recent first) | *(none)*                                    |
| One user's history                | `?user_id=user_2fK91ABc`                    |
| One session's history             | `?session_id=sess_42`                       |
| Both filters (intersection)       | `?user_id=user_2fK91ABc&session_id=sess_42` |
| Page through results              | append `&before=<ts_utc-from-prev-page>`    |

**Query parameters**

| Name         | Type    | Required | Notes                                                                                |
| ------------ | ------- | -------- | ------------------------------------------------------------------------------------ |
| `user_id`    | string  | no       | Match `X-User-ID` from the original transform. ≤128 chars.                           |
| `session_id` | string  | no       | Match `X-Session-ID` from the original transform. ≤128 chars.                        |
| `limit`      | integer | no       | 1..100, default **20**.                                                              |
| `before`     | string  | no       | ISO-8601 timestamp. Returns runs strictly older than this — for paging.              |

When both `user_id` and `session_id` are present, results match **both** (intersection).

**Example — fetch all (default limit)**

```bash
curl https://api.lsp.example.com/usage
```

**Example — filter by user, paged**

```bash
curl "https://api.lsp.example.com/usage?user_id=user_2fK91ABc&limit=50"
# next page:
curl "https://api.lsp.example.com/usage?user_id=user_2fK91ABc&limit=50&before=2026-05-07T14:08:11.412Z"
```

**Response — 200**

```json
{
  "items": [
    {
      "request_id": "5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6",
      "ts_utc": "2026-05-07T14:08:11.412Z",
      "source": "http",
      "version": "5.0.0",
      "git_sha": "abc1234",
      "status_code": 200,
      "duration_ms": 12480,
      "error_code": null,
      "user_id": "user_2fK91ABc",
      "session_id": "sess_42",
      "client_request_id": "6f2c1f4e-9a55-4f7b-8a6d-2b1f5b9b3f2d",
      "ip": "203.0.113.7",
      "country": "IN",
      "region": "Maharashtra",
      "city": "Pune",
      "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "filename": "TRE13243.tex",
      "style_requested": "numbered",
      "style_resolved": "numbered",
      "content_bytes": 184321,
      "only_command_keys": null,
      "entries_processed": 412,
      "entries_changed": 87,
      "pipeline_detail": {
        "total_entries_processed": 412,
        "total_entries_changed": 87,
        "by_step": {
          "AuthorAddressNormalization": { "processed": 4, "changed": 1 },
          "LinkNormalization":          { "processed": 22, "changed": 11 },
          "CitationNormalization":      { "processed": 156, "changed": 34 },
          "StyleTransformation":        { "processed": 230, "changed": 41 }
        },
        "token_usage": {
          "prompt_tokens": 9821,
          "completion_tokens": 1402,
          "total_tokens": 11223,
          "cached_tokens": 256
        }
      },
      "usage": {
        "model": "gpt-4o",
        "total_time_s": 11.97,
        "input_tokens": 9821,
        "output_tokens": 1402,
        "total_tokens": 11223,
        "cached_tokens": 256,
        "cost_usd": 0.0823,
        "cost_inr": 7.41
      },
      "artifacts": {
        "input_file_id": "65f1c2a3b4d5e6f7a8b9c0d1",
        "output_file_id": "65f1c2a3b4d5e6f7a8b9c0d2",
        "log_file_id": "65f1c2a3b4d5e6f7a8b9c0d3",
        "input_bytes": 184321,
        "output_bytes": 199402,
        "log_bytes": 18204,
        "input_sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        "output_sha256": "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
        "log_sha256": "3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b",
        "input_url": "/usage/5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6/input.tex",
        "output_url": "/usage/5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6/output.tex",
        "log_url": "/usage/5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6/log.txt",
        "write_status": "ok"
      }
    },
    {
      "request_id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "ts_utc": "2026-05-07T13:55:02.118Z",
      "source": "cli",
      "version": "5.0.0",
      "git_sha": "abc1234",
      "status_code": 408,
      "duration_ms": 300010,
      "error_code": "request_timeout",
      "user_id": "user_2fK91ABc",
      "session_id": "sess_42",
      "client_request_id": null,
      "ip": null,
      "country": null,
      "region": null,
      "city": null,
      "user_agent": null,
      "filename": "BigManuscript.tex",
      "style_requested": "vancouver",
      "style_resolved": "vancouver",
      "content_bytes": 3987210,
      "only_command_keys": ["section", "subsection"],
      "entries_processed": 0,
      "entries_changed": 0,
      "pipeline_detail": null,
      "usage": null,
      "artifacts": {
        "input_file_id": "65f0e1d2c3b4a5968778899a",
        "output_file_id": null,
        "log_file_id": "65f0e1d2c3b4a5968778899b",
        "input_bytes": 3987210,
        "output_bytes": null,
        "log_bytes": 2104,
        "input_sha256": "44b2f4ee6f5d2e8c39a54a8f6b1d7c2e9a8b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
        "output_sha256": null,
        "log_sha256": "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",
        "input_url": "/usage/1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d/input.tex",
        "output_url": null,
        "log_url": "/usage/1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d/log.txt",
        "write_status": "partial"
      }
    }
  ],
  "next_before": "2026-05-07T13:55:02.118Z",
  "limit": 20
}
```

| Field                  | Type                | Notes                                                                                  |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| `items[].request_id`   | string              | Pass to `GET /usage/{request_id}` for the same record.                                 |
| `items[].ts_utc`       | ISO-8601            | Server timestamp of the original request.                                              |
| `items[].source`       | string \| null      | `"http"` for `/transform` calls; `"cli"` for local CLI runs (the `lsp` terminal client also writes audit records to the same store). |
| `items[].version`      | string \| null      | Server semantic version that produced the record. Use to filter audit when triaging a regression. |
| `items[].git_sha`      | string \| null      | Build commit (from `GIT_SHA` / `VERCEL_GIT_COMMIT_SHA` at deploy time). `null` outside deployed builds. |
| `items[].status_code`  | integer             | HTTP status the original `/transform` returned. CLI runs use `200` for success / `500` for failure. |
| `items[].duration_ms`  | integer             | Server-side end-to-end duration.                                                       |
| `items[].error_code`   | string \| null      | Set on non-2xx (e.g. `"request_timeout"`, `"pipeline_failed"`).                        |
| `items[].user_id`      | string \| null      | Echo of the `X-User-ID` header sent on the original call. For CLI runs, taken from the `LSP_USER_ID` env var. |
| `items[].session_id`   | string \| null      | Echo of `X-Session-ID`. For CLI runs, taken from `LSP_SESSION_ID`.                     |
| `items[].client_request_id` | string \| null | Echo of `X-Client-Request-ID`. Always `null` for CLI runs.                              |
| `items[].ip`           | string \| null      | Observed client IP (uvicorn proxy-headers settings determine whether this is the real IP or the reverse-proxy's). `null` for CLI runs. |
| `items[].country` / `region` / `city` | string \| null | GeoIP lookup of `ip`. Coarse — country is reliable, city is best-effort. `null` for CLI runs. |
| `items[].user_agent`   | string \| null      | Verbatim `User-Agent` header. `null` for CLI runs.                                     |
| `items[].filename`     | string \| null      | Original file basename when provided. For HTTP, comes from the `filename` request field; for CLI, set automatically from the input path. |
| `items[].style_requested` | string \| null   | Raw value from the request body (could be a shortcut).                                 |
| `items[].style_resolved` | string \| null    | Canonical style key.                                                                   |
| `items[].content_bytes`| integer \| null     | Bytes of input LaTeX.                                                                  |
| `items[].only_command_keys` | string[] \| null | Echo of the whitelist passed on the original request. `null` when none was applied (full pipeline ran). |
| `items[].entries_processed` / `entries_changed` | integer \| null | Pipeline summary.                                                  |
| `items[].pipeline_detail` | object \| null   | Full pipeline stats dict — per-step processed/changed counts, retry counts, token usage breakdown, casing-restore replacements, etc. Opaque shape; surface as-is for debugging or skip. `null` on error rows. |
| `items[].usage`        | object \| null      | Token + cost block (same shape as `POST /transform`'s `usage`). `null` on error rows.  |
| `items[].artifacts`    | object \| null      | GridFS pointers + sizes + hashes + download URLs for the input, output, and run log. See below. |
| `next_before`          | ISO-8601 \| null    | Pass back as `before` for the next page. `null` when there are no more results.        |
| `limit`                | integer             | Echo of the applied limit.                                                             |

**`items[].artifacts`** — for each run, the server stores the input, output, and a full run log in a GridFS bucket. The block reports what got persisted **and** gives you a relative URL to download each one:

| Field            | Type            | Notes                                                                                   |
| ---------------- | --------------- | --------------------------------------------------------------------------------------- |
| `input_file_id`  | string \| null  | GridFS file id of the original input. `null` if the input write failed.                 |
| `output_file_id` | string \| null  | GridFS file id of the transformed output. `null` if the request errored before output.  |
| `log_file_id`    | string \| null  | GridFS file id of the captured run log. `null` if no log was written.                   |
| `input_bytes`    | integer \| null | Byte size of the stored input.                                                          |
| `output_bytes`   | integer \| null | Byte size of the stored output.                                                         |
| `log_bytes`      | integer \| null | Byte size of the stored log.                                                            |
| `input_sha256`   | string \| null  | SHA-256 of the input bytes.                                                             |
| `output_sha256`  | string \| null  | SHA-256 of the output bytes.                                                            |
| `log_sha256`     | string \| null  | SHA-256 of the log bytes.                                                               |
| `input_url`      | string \| null  | Relative URL to download the input. `null` when no input artifact exists.               |
| `output_url`     | string \| null  | Relative URL to download the output. `null` when no output artifact exists.             |
| `log_url`        | string \| null  | Relative URL to download the run log. `null` when no log artifact exists.               |
| `write_status`   | string \| null  | `"ok"` (every expected artifact written), `"partial"` (some written), `"failed"` (none).|

The `input_url` / `output_url` / `log_url` values are paths only (e.g. `/usage/<request_id>/input.tex`) — prefix them with the API base URL to fetch. See §§4.7–4.9.

> ⚠️ Artifact download endpoints are **unauthenticated** — same posture as the rest of `/usage` (§3). Any caller who can read `/usage` can re-download every artifact. Put auth in front of the API if that's not acceptable.

**Notes**

- Most-recent-first ordering by `ts_utc`.
- `usage` is `null` when the original request errored before billing was finalised.
- `client_request_id`, `ip`, `country`, `region`, `city`, `user_agent` are `null` when the original request didn't carry that information (or geo lookup was unavailable).
- The audit endpoint is **unauthenticated** (§3). Anyone with a `user_id` can read its IPs, geo, and artifact ids. Treat this surface accordingly.

---

### 4.6 `GET /usage/{request_id}`

Look up a single past run by its `request_id`. The id comes from `meta.request_id` in the original `/transform` response or the `X-Request-ID` response header.

**Request**

```bash
curl https://api.lsp.example.com/usage/5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6
```

**Response — 200**

```json
{
  "request_id": "5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6",
  "ts_utc": "2026-05-07T14:08:11.412Z",
  "source": "http",
  "version": "5.0.0",
  "git_sha": "abc1234",
  "status_code": 200,
  "duration_ms": 12480,
  "error_code": null,
  "user_id": "user_2fK91ABc",
  "session_id": "sess_42",
  "client_request_id": "6f2c1f4e-9a55-4f7b-8a6d-2b1f5b9b3f2d",
  "ip": "203.0.113.7",
  "country": "IN",
  "region": "Maharashtra",
  "city": "Pune",
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "filename": "TRE13243.tex",
  "style_requested": "numbered",
  "style_resolved": "numbered",
  "content_bytes": 184321,
  "only_command_keys": null,
  "entries_processed": 412,
  "entries_changed": 87,
  "pipeline_detail": {
    "total_entries_processed": 412,
    "total_entries_changed": 87,
    "by_step": {
      "AuthorAddressNormalization": { "processed": 4, "changed": 1 },
      "LinkNormalization":          { "processed": 22, "changed": 11 },
      "CitationNormalization":      { "processed": 156, "changed": 34 },
      "StyleTransformation":        { "processed": 230, "changed": 41 }
    },
    "token_usage": {
      "prompt_tokens": 9821,
      "completion_tokens": 1402,
      "total_tokens": 11223,
      "cached_tokens": 256
    },
    "processing_time_seconds": 11.97
  },
  "usage": {
    "model": "gpt-4o",
    "total_time_s": 11.97,
    "input_tokens": 9821,
    "output_tokens": 1402,
    "total_tokens": 11223,
    "cached_tokens": 256,
    "cost_usd": 0.0823,
    "cost_inr": 7.41
  },
  "artifacts": {
    "input_file_id": "65f1c2a3b4d5e6f7a8b9c0d1",
    "output_file_id": "65f1c2a3b4d5e6f7a8b9c0d2",
    "log_file_id": "65f1c2a3b4d5e6f7a8b9c0d3",
    "input_bytes": 184321,
    "output_bytes": 199402,
    "log_bytes": 18204,
    "input_sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "output_sha256": "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
    "log_sha256": "3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b",
    "input_url": "/usage/5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6/input.tex",
    "output_url": "/usage/5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6/output.tex",
    "log_url": "/usage/5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6/log.txt",
    "write_status": "ok"
  }
}
```

**Response — 404**

```json
{
  "error": "not_found",
  "detail": "no audit record for request_id=5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6",
  "request_id": "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f"
}
```

---

### 4.7 `GET /usage/{request_id}/input.tex`

Re-download the **original** `.tex` content the caller submitted to `/transform` (or the file the CLI ran on). The bytes are exactly what the server saw — no normalisation.

**Request**

```bash
curl -OJ https://api.lsp.example.com/usage/5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6/input.tex
```

`-OJ` tells curl to honour `Content-Disposition`, so the file is saved as `TRE13243.tex` (or whatever filename was stored on the audit record) rather than `input.tex`.

**Response — 200**

```http
HTTP/1.1 200 OK
Content-Type: application/x-tex
Content-Disposition: attachment; filename="TRE13243.tex"

\section{Introduction}
We build on \cite{smith2020}. See Fig. 1.
```

| Header                | Notes                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `Content-Type`        | `application/x-tex`.                                                                        |
| `Content-Disposition` | `attachment; filename="..."`. Uses the stored `filename` field if present, else `input.tex`. |

**Errors**

| Status | `error`     | When                                                                                       |
| ------ | ----------- | ------------------------------------------------------------------------------------------ |
| 404    | `not_found` | Unknown `request_id`, or input was never written (artifact sink failed during the run).    |

---

### 4.8 `GET /usage/{request_id}/output.tex`

Re-download the **transformed** `.tex` produced by the pipeline — the full file with `\del{old}\ins{new}` markup, byte-identical to what `/transform` returned in `content`.

```bash
curl -OJ https://api.lsp.example.com/usage/5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6/output.tex
```

| Header                | Notes                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `Content-Type`        | `application/x-tex`.                                                                           |
| `Content-Disposition` | `attachment; filename="..."`. Uses the stored `filename` field if present, else `output.tex`.  |

**Errors**

| Status | `error`     | When                                                                                        |
| ------ | ----------- | ------------------------------------------------------------------------------------------- |
| 404    | `not_found` | Unknown `request_id`, or the run errored before output was written (`output_file_id` null). |

---

### 4.9 `GET /usage/{request_id}/log.txt`

Re-download the **run log** captured during the pipeline — every line emitted by the transformation steps for that request. Useful when investigating why a specific run produced surprising output. Plain text, UTF-8.

```bash
curl -OJ https://api.lsp.example.com/usage/5f3a9e1b-7d2c-4a18-9f4b-c1e2d3a4b5c6/log.txt
```

| Header                | Notes                                                                            |
| --------------------- | -------------------------------------------------------------------------------- |
| `Content-Type`        | `text/plain; charset=utf-8`.                                                     |
| `Content-Disposition` | `attachment; filename="run.log"`.                                                |

**Errors**

| Status | `error`     | When                                                                                    |
| ------ | ----------- | --------------------------------------------------------------------------------------- |
| 404    | `not_found` | Unknown `request_id`, or no log was captured for the run (`log_file_id` null).          |

---

## 5. Error model

Every non-2xx response uses the same envelope:

```json
{
  "error": "<short_code>",
  "detail": "<human-readable message>",
  "request_id": "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f"
}
```

| Status | `error`               | When it fires                                                                                          | Caller action                                     |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 400    | `invalid_style`       | `style` is not a known key or shortcut.                                                                | Re-fetch `/styles`; surface a "pick another" UI.  |
| 404    | `not_found`           | `/usage/{request_id}` for an unknown id.                                                               | Show a "no record" state.                         |
| 408    | `request_timeout`     | `/transform` exceeded the 300 s budget.                                                                | Retry with smaller content, or accept loss.       |
| 413    | `payload_too_large`   | Request body > 4 MiB.                                                                                  | Reject on the client before posting.              |
| 422    | `validation_error`    | Body schema rejection — missing field, wrong type, header > 128 chars, `only_command_keys` over limits, bad `before`/`limit` on `/usage`. | Fix the request shape.    |
| 429    | `rate_limited`        | Per-IP quota exceeded on `/transform`.                                                                 | Honour `Retry-After` header (seconds).            |
| 503    | `pipeline_failed`     | Pipeline raised mid-run.                                                                               | Retry once, then fail.                            |
| 503    | `service_unavailable` | Mongo or another dependency is down (also `/usage` when the audit store is unreachable).               | Surface as transient; retry with backoff.         |

Always log `request_id` on the client. It's the one shared correlator into the server's audit log and traces.

**Example — 422**

```json
{
  "error": "validation_error",
  "detail": "limit must be 1..100",
  "request_id": "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f"
}
```

**Example — 429**

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 17
Content-Type: application/json

{
  "error": "rate_limited",
  "detail": "Rate limit of 30/min exceeded",
  "request_id": "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f"
}
```

---

## 6. Identifying users

The API does not authenticate callers but **does record who ran each transform**. That powers per-user history (`/usage`), support investigations ("which of my users hit this error?"), and usage dashboards.

### What the server records per `/transform`

| Field                                       | Source                       | Purpose                                          |
| ------------------------------------------- | ---------------------------- | ------------------------------------------------ |
| `user_id`                                   | `X-User-ID` header           | Group requests by end user                       |
| `session_id`                                | `X-Session-ID` header        | Group requests within a single session           |
| `client_request_id`                         | `X-Client-Request-ID` header | Correlate one client action with the server log  |
| `request_id`                                | server-generated             | Canonical id for this request                    |
| `style`                                     | request body                 | Which style was requested                        |
| `content_size`                              | derived                      | Bytes of input LaTeX                             |
| `usage` (tokens, cost)                      | LLM response                 | Per-request token counts and dollar cost         |
| `user_agent`, `origin`, `referer`, `host`   | request headers              | Observed client metadata for debugging           |
| `ip`, `country`, `region`, `city`           | observed + geo lookup        | Coarse origin for support and abuse triage       |
| `timestamp`                                 | server clock                 | When the request was processed                   |

`/usage` returns most of the audit record — claimed identity, IP + geo, user-agent, request shape, pipeline counters, token/cost telemetry, and the GridFS artifact pointers + SHA-256 hashes. Only the server-side `fingerprint`, the request-content hash, and a couple of routing fields stay private. Because the API has **no auth**, anyone who knows a `user_id` can read these — see §3.

### Picking `X-User-ID`

- Opaque to LSP — any string ≤128 chars.
- Stable across network changes. Don't derive it from IP — IPs change on Wi-Fi/mobile/VPN switches and the user will look like a stranger every time.
- Recommended sources, in order of preference:
  1. The user id from your auth provider (Clerk's `user.id`, Auth0 `sub`, NextAuth user id).
  2. A UUID minted on first visit and persisted (server-side cookie or `localStorage`).
- **Never send raw email addresses, full names, or other PII** — `X-User-ID` shows up in logs and audit records. Send a stable id; resolve the human name in the frontend.

### Picking `X-Session-ID`

A per-session opaque id (login session, browser tab session — whatever is meaningful to your UI). Useful for grouping the four transforms a user ran during one editing sitting. Same ≤128 char / no-PII rule.

### Picking `X-Client-Request-ID`

A per-call opaque id, typically `crypto.randomUUID()` at the call site. Echoed in `meta.client_request_id`. Use it to thread a single user-visible action through your client logs and the server's audit log.

---

## 7. Quick reference

| Capability        | Endpoint                            | Notes                                                |
| ----------------- | ----------------------------------- | ---------------------------------------------------- |
| Health check      | `GET /healthz`                      | Liveness                                             |
| Build / runtime   | `GET /version`                      | Models, limits, auth posture — for "About" panels    |
| Style catalogue   | `GET /styles`                       | Always fetch, never hardcode                         |
| Run a transform   | `POST /transform`                   | JSON by default; `Accept: text/plain` or `?format=tex` returns a raw `.tex` body. Send `X-User-ID` for tracking. Pass `filename` to preserve the original basename in history. |
| Usage history     | `GET /usage`                        | Filterless = all runs; filter by `user_id` and/or `session_id`; page via `before` |
| Single run lookup | `GET /usage/{request_id}`           | Sanitised summary of one past run                    |
| Re-download input | `GET /usage/{request_id}/input.tex` | Stream the original `.tex` from GridFS               |
| Re-download output| `GET /usage/{request_id}/output.tex`| Stream the transformed `.tex` from GridFS            |
| Re-download log   | `GET /usage/{request_id}/log.txt`   | Stream the captured pipeline run log                 |
| OpenAPI / Swagger | `GET /docs`                         | Live schema — keep this open while integrating       |
