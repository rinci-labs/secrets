import { parseDotenv } from "../dotenv.js"
import { SecretsError } from "../errors.js"
import type { Logger } from "../log.js"

export type Env = Readonly<Record<string, string | undefined>>
export type Secrets = Record<string, string>
export type SourceOptions = Readonly<Record<string, unknown>>

export interface ProviderContext {
  /** Process env plus any `envFiles`. Credentials are read from here, never from the config file. */
  env: Env
  /** Directory of the config file, or the working directory. Relative paths resolve against it. */
  cwd: string
  log: Logger
  /** Injectable for tests. */
  fetch: typeof fetch
}

export interface Provider {
  name: string
  /** One line for `rinci-secrets providers` and the docs. */
  description: string
  /** Env vars the provider reads credentials from. Informational. */
  credentials: readonly string[]
  /**
   * Env vars that only this tool should see: they are removed from the child
   * process unless `keepCredentials` is set. General cloud credentials such as
   * AWS_ACCESS_KEY_ID are not listed, because apps often use them directly.
   */
  withhold: readonly string[]
  load(options: SourceOptions, ctx: ProviderContext): Promise<Secrets>
}

export function defineProvider(provider: Provider): Provider {
  return provider
}

/** Typed reads from a source's options, with errors that name the source. */
export function options(source: string, raw: SourceOptions) {
  const fail = (key: string, expected: string): never => {
    throw new SecretsError(`${source}: "${key}" must be ${expected}`)
  }
  return {
    string(key: string): string | undefined {
      const value = raw[key]
      if (value === undefined || value === "") return undefined
      return typeof value === "string" ? value : fail(key, "a string")
    },
    /** A value passed to a vendor CLI as an argument: it must not be readable as a flag. */
    argument(key: string): string | undefined {
      const value = this.string(key)
      if (value?.startsWith("-")) fail(key, "a value that does not start with '-'")
      return value
    },
    required(key: string, fallback?: string, hint?: string): string {
      const value = this.string(key) ?? (fallback || undefined)
      if (value === undefined) throw new SecretsError(`${source}: "${key}" is required`, { hint })
      return value
    },
    boolean(key: string, fallback = false): boolean {
      const value = raw[key]
      if (value === undefined) return fallback
      if (typeof value === "boolean") return value
      if (value === "true" || value === "false") return value === "true"
      return fail(key, "true or false")
    },
    number(key: string, fallback: number): number {
      const value = raw[key]
      if (value === undefined) return fallback
      const n = typeof value === "number" ? value : Number(value)
      return Number.isFinite(n) && n > 0 ? n : fail(key, "a positive number")
    },
    /** `["A", "B"]` maps each name to itself; `{ "ENV_NAME": "remote-name" }` renames. */
    mapping(key: string): Record<string, string> | undefined {
      const value = raw[key]
      if (value === undefined) return undefined
      if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        return Object.fromEntries(value.map((v) => [v, v]))
      }
      if (value && typeof value === "object" && Object.values(value).every((v) => typeof v === "string")) {
        return value as Record<string, string>
      }
      return fail(key, "an array of names or an object of ENV_NAME: remote-name")
    },
    stringList(key: string): string[] | undefined {
      const value = raw[key]
      if (value === undefined) return undefined
      if (typeof value === "string") return [value]
      if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value
      return fail(key, "a string or an array of strings")
    },
  }
}

export type PayloadFormat = "auto" | "json" | "dotenv" | "raw"

/**
 * Turns one stored secret into env vars. `auto` reads a JSON object as many
 * vars, or stores the whole payload under `key` when one is given.
 */
export function parsePayload(
  text: string,
  { format = "auto", key, label }: { format?: string; key?: string; label: string },
): Secrets {
  const asRaw = (): Secrets => {
    if (!key) {
      throw new SecretsError(`${label} is not a JSON object`, {
        hint: 'Set "key" to store the whole value under one name, or "format": "dotenv".',
      })
    }
    return { [key]: text }
  }
  switch (format) {
    case "raw":
      return asRaw()
    case "dotenv":
      return parseDotenv(text)
    case "json":
    case "auto": {
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        if (format === "json") throw new SecretsError(`${label} is not valid JSON`)
        return asRaw()
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        if (format === "json") throw new SecretsError(`${label} is not a JSON object`)
        return asRaw()
      }
      return flatten(parsed as Record<string, unknown>)
    }
    default:
      throw new SecretsError(`${label}: unknown format "${format}"`, { hint: "Use auto, json, dotenv or raw." })
  }
}

/** Env values are strings: numbers and booleans are stringified, nested objects become JSON. */
export function flatten(values: Record<string, unknown>): Secrets {
  const out: Secrets = {}
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue
    out[key] = typeof value === "string" ? value : JSON.stringify(value)
  }
  return out
}

export function decodeBase64(data: string): string {
  return Buffer.from(data, "base64").toString("utf8")
}
