const USER_KEY = "lsp.user_id"
const SESSION_KEY = "lsp.session_id"

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function getUserId(): string {
  if (typeof window === "undefined") return ""
  try {
    let v = window.localStorage.getItem(USER_KEY)
    if (!v) {
      v = `u_${uuid()}`
      window.localStorage.setItem(USER_KEY, v)
    }
    return v
  } catch {
    return ""
  }
}

export function getSessionId(): string {
  if (typeof window === "undefined") return ""
  try {
    let v = window.sessionStorage.getItem(SESSION_KEY)
    if (!v) {
      v = `s_${uuid()}`
      window.sessionStorage.setItem(SESSION_KEY, v)
    }
    return v
  } catch {
    return ""
  }
}

export function setUserId(value: string): void {
  if (typeof window === "undefined") return
  try {
    if (value) window.localStorage.setItem(USER_KEY, value)
    else window.localStorage.removeItem(USER_KEY)
  } catch {
    /* noop */
  }
}
