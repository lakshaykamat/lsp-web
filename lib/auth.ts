export const AUTH_COOKIE_NAME = "lsp_session"
export const AUTH_SESSION_MAX_AGE = 60 * 60 * 24 * 7

const encoder = new TextEncoder()

async function signingKey(password: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new ArrayBuffer(binary.length)
  const view = new Uint8Array(bytes)
  for (let index = 0; index < binary.length; index += 1) {
    view[index] = binary.charCodeAt(index)
  }
  return bytes
}

export async function createAuthSession(password: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + AUTH_SESSION_MAX_AGE
  const payload = String(expiresAt)
  const key = await signingKey(password)
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  )

  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`
}

export async function verifyAuthSession(
  token: string | undefined,
  password: string | undefined
): Promise<boolean> {
  if (!token || !password) return false

  const [expiresAtText, signatureText, extra] = token.split(".")
  if (!expiresAtText || !signatureText || extra !== undefined) return false

  const expiresAt = Number(expiresAtText)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() / 1000) {
    return false
  }

  try {
    const key = await signingKey(password)
    return await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signatureText),
      encoder.encode(expiresAtText)
    )
  } catch {
    return false
  }
}
