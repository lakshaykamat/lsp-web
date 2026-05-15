export type Style = {
  key: string
  name: string
  description: string
  shortcut: string
}

export type TransformUsage = {
  model: string
  total_time_s: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cached_tokens: number
  cost_usd: number
  cost_inr: number
}

export type TransformMeta = {
  elapsed_ms: number
  request_id: string
  version: string
  client_request_id: string | null
  artifact_id: string | null
}

export type TransformResponse = {
  content: string
  style: string
  stats: Record<string, unknown>
  usage: TransformUsage
  meta: TransformMeta
}

export type TransformError = {
  error: string
  detail: string
  request_id: string
}

export type UsageArtifacts = {
  input_file_id: string | null
  output_file_id: string | null
  log_file_id: string | null
  input_bytes: number | null
  output_bytes: number | null
  log_bytes: number | null
  input_sha256: string | null
  output_sha256: string | null
  log_sha256: string | null
  input_url: string | null
  output_url: string | null
  log_url: string | null
  write_status: "ok" | "partial" | "failed" | null
}

export type UsageItem = {
  request_id: string
  ts_utc: string
  source: "http" | "cli" | string | null
  version: string | null
  git_sha: string | null
  status_code: number
  duration_ms: number
  error_code: string | null
  user_id: string | null
  session_id: string | null
  client_request_id: string | null
  ip: string | null
  country: string | null
  region: string | null
  city: string | null
  user_agent: string | null
  filename: string | null
  style_requested: string | null
  style_resolved: string | null
  content_bytes: number | null
  only_command_keys: string[] | null
  entries_processed: number | null
  entries_changed: number | null
  pipeline_detail: Record<string, unknown> | null
  usage: TransformUsage | null
  artifacts: UsageArtifacts | null
}

export type UsageListResponse = {
  items: UsageItem[]
  next_before: string | null
  limit: number
}
