import { isIP } from "node:net"
import { SecretsError } from "./errors.js"
import { sanitize } from "./text.js"

export interface RequestOptions extends Omit<RequestInit, "signal"> {
  /** Names the call in errors, e.g. "Infisical login". */
  what: string
  timeoutMs?: number
  /** Extra attempts for network errors, 429 and 5xx. Only safe for idempotent calls. */
  retries?: number
  fetch?: typeof fetch
}

const PRIVATE_SUFFIXES = [".local", ".internal", ".lan", ".home.arpa", ".svc", ".cluster.local", ".localhost"]

/** True for hosts that never leave the machine or the private network. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (host === "localhost") return true
  if (PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true
  const family = isIP(host)
  if (family === 4) {
    const [a = 0, b = 0] = host.split(".").map(Number)
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    )
  }
  if (family === 6) return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")
  return false
}

/**
 * Refuses to send credentials over plain HTTP to a public host. Private
 * addresses (localhost, RFC 1918, CGNAT/WARP, *.svc.cluster.local) are allowed,
 * since in-cluster APIs are often HTTP behind a private network.
 */
export function assertSecureUrl(raw: string, { allowInsecure = false, what = "URL" } = {}): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SecretsError(`${what} is not a valid URL: ${raw}`)
  }
  if (url.protocol === "https:") return url
  if (url.protocol !== "http:") throw new SecretsError(`${what} must be http(s): ${raw}`)
  if (allowInsecure || isPrivateHost(url.hostname)) return url
  throw new SecretsError(`${what} uses plain HTTP to a public host: ${url.origin}`, {
    hint: 'Use https, or set "allowInsecure": true on the source if the network is trusted.',
  })
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504])

export async function request(url: string | URL, options: RequestOptions): Promise<Response> {
  const { what, timeoutMs = 15_000, retries = 0, fetch: doFetch = fetch, ...init } = options
  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await doFetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      if (attempt < retries) {
        await sleep(250 * 2 ** attempt)
        continue
      }
      const reason =
        (error as Error).name === "TimeoutError" ? `timed out after ${timeoutMs}ms` : describeNetworkError(error)
      throw new SecretsError(`${what} failed: ${reason}`, {
        hint: `Check that ${new URL(url).origin} is reachable from this machine (VPN, WARP, DNS).`,
        cause: error,
      })
    }
    if (response.ok) return response
    if (attempt < retries && RETRYABLE.has(response.status)) {
      await response.body?.cancel()
      await sleep(250 * 2 ** attempt)
      continue
    }
    throw new SecretsError(`${what} failed: HTTP ${response.status} ${await errorBody(response)}`.trim(), {
      hint:
        response.status === 401 || response.status === 403
          ? "Check the credentials and their access to this project."
          : undefined,
    })
  }
}

export async function requestJson<T>(url: string | URL, options: RequestOptions): Promise<T> {
  const response = await request(url, options)
  try {
    return (await response.json()) as T
  } catch (error) {
    throw new SecretsError(`${options.what} returned invalid JSON`, { cause: error })
  }
}

/** A short, single-line excerpt. Error bodies are for diagnosis, not a dump. */
async function errorBody(response: Response): Promise<string> {
  return sanitize(await response.text().catch(() => ""))
}

function describeNetworkError(error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } }).cause
  return cause?.code ?? cause?.message ?? (error as Error).message ?? String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Maps with at most `limit` promises in flight. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
