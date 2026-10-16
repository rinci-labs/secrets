import { stat } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { findConfig, readConfig, type SecretsConfig, sourceName, validateConfig } from "./config.js"
import { readDotenv } from "./dotenv.js"
import { errorMessage, SecretsError } from "./errors.js"
import { interpolateDeep } from "./interpolate.js"
import { createLogger, type Logger } from "./log.js"
import { getProvider } from "./providers/index.js"
import type { Env, Secrets } from "./providers/types.js"
import { hasControlChars } from "./text.js"

export interface LoadOptions {
  /** Where to look for the config and resolve relative paths. Default `process.cwd()`. */
  cwd?: string
  /** A config path, an inline config, or undefined to search for `secrets.config.json`. */
  config?: string | SecretsConfig
  /** Exposed to the config as `${SECRETS_ENV}`. */
  environment?: string
  /** Only read the sources with these names. */
  sources?: string[]
  /** Extra credential files, on top of the config's `envFiles`. Must exist. */
  envFiles?: string[]
  /** Base environment. Default `process.env`. Never mutated. */
  env?: Env
  log?: Logger
  fetch?: typeof fetch
}

export interface SourceReport {
  name: string
  provider: string
  keys: string[]
  ms: number
  error?: string
}

export interface LoadResult {
  secrets: Secrets
  sources: SourceReport[]
  /** Env var names to remove from the child unless credentials are kept. */
  withhold: string[]
  config: SecretsConfig
  configPath: string | undefined
}

/** Keys a child process can actually receive. */
export function isValidKey(key: string): boolean {
  return key.length > 0 && !key.includes("=") && !hasControlChars(key) && key !== "__proto__"
}

async function readableByOthers(path: string): Promise<boolean> {
  if (process.platform === "win32") return false
  try {
    return ((await stat(path)).mode & 0o044) !== 0
  } catch {
    return false
  }
}

/**
 * Resolves the config, reads every source in parallel and merges them in
 * declared order. Fails closed: if a required source fails, nothing is
 * returned, so a command never starts with half its secrets.
 */
export async function resolveConfig(
  options: Pick<LoadOptions, "cwd" | "config"> = {},
): Promise<{ config: SecretsConfig; configPath: string | undefined }> {
  const cwd = resolve(options.cwd ?? process.cwd())
  if (typeof options.config === "object")
    return { config: validateConfig(options.config, "inline config"), configPath: undefined }
  const configPath = options.config ? resolve(cwd, options.config) : findConfig(cwd)
  if (!configPath) {
    throw new SecretsError("No secrets.config.json found", {
      hint: "Run `rinci-secrets init`, pass --config, or pick a provider with --provider.",
    })
  }
  return { config: await readConfig(configPath), configPath }
}

export async function loadSecrets(options: LoadOptions = {}): Promise<LoadResult> {
  const cwd = resolve(options.cwd ?? process.cwd())
  const log = options.log ?? createLogger()
  const doFetch = options.fetch ?? fetch

  const { config, configPath } = await resolveConfig(options)
  if (configPath) log.debug(`config ${configPath}`)
  const baseDir = configPath ? dirname(configPath) : cwd

  // Credentials: the real environment wins over files, like a normal dotenv load.
  const env: Record<string, string | undefined> = {}
  const files = [
    ...(config.envFiles ?? []).map((path) => ({ path: resolve(baseDir, path), required: false })),
    ...(options.envFiles ?? []).map((path) => ({ path: resolve(cwd, path), required: true })),
  ]
  for (const file of files) {
    const values = await readDotenv(file.path, { required: file.required })
    const count = Object.keys(values).length
    if (count) {
      log.debug(`credentials ${file.path} (${count} vars)`)
      if (await readableByOthers(file.path))
        log.warn(`${file.path} is readable by other users. Run: chmod 600 ${file.path}`)
    }
    Object.assign(env, values)
  }
  Object.assign(env, options.env ?? process.env)
  if (options.environment) env.SECRETS_ENV = options.environment

  let selected = config.sources
  if (options.sources?.length) {
    const wanted = new Set(options.sources)
    selected = config.sources.filter((s) => wanted.has(sourceName(s)))
    const missing = [...wanted].filter((name) => !config.sources.some((s) => sourceName(s) === name))
    if (missing.length) {
      throw new SecretsError(`No source named ${missing.map((m) => `"${m}"`).join(", ")}`, {
        hint: `Configured: ${config.sources.map(sourceName).join(", ")}.`,
      })
    }
  }

  const runs = selected.map(async (source) => {
    const name = sourceName(source)
    const provider = getProvider(source.provider)
    const started = performance.now()
    try {
      const { provider: _p, name: _n, optional: _o, ...raw } = source
      const resolved = interpolateDeep(raw, env, `source "${name}"`)
      const values = await provider.load(resolved, { env, cwd: baseDir, log, fetch: doFetch })
      return {
        source,
        provider,
        values,
        report: {
          name,
          provider: provider.name,
          keys: Object.keys(values),
          ms: Math.round(performance.now() - started),
        },
      }
    } catch (error) {
      const report: SourceReport = {
        name,
        provider: provider.name,
        keys: [],
        ms: Math.round(performance.now() - started),
        error: errorMessage(error),
      }
      if (source.optional) {
        log.warn(`source "${name}" skipped: ${report.error}`)
        return { source, provider, values: {}, report }
      }
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { report })
    }
  })

  const settled = await Promise.allSettled(runs)
  const failures = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected")
  if (failures.length) {
    const first = failures[0]?.reason as SecretsError
    if (failures.length === 1) throw first
    const messages = failures.map((f) => `  - ${errorMessage(f.reason)}`).join("\n")
    throw new SecretsError(`${failures.length} sources failed:\n${messages}`, { hint: first?.hint, cause: first })
  }

  const secrets: Secrets = {}
  const withhold = new Set<string>()
  const sources: SourceReport[] = []
  for (const result of settled) {
    if (result.status !== "fulfilled") continue
    const { values, provider, report } = result.value
    for (const name of provider.withhold) withhold.add(name)
    for (const [key, value] of Object.entries(values)) {
      if (!isValidKey(key) || typeof value !== "string" || value.includes("\0")) {
        log.warn(`source "${report.name}": skipped ${JSON.stringify(key)} (not a valid env var)`)
        continue
      }
      secrets[key] = value
    }
    sources.push(report)
  }
  return { secrets, sources, withhold: [...withhold], config, configPath }
}
