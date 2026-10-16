import { existsSync } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { SecretsError } from "./errors.js"

export interface SourceConfig {
  /** Provider name: infisical, doppler, vault, aws, aws-ssm, gcp, azure, 1password, bitwarden, sops, dotenv, exec. */
  provider: string
  /** Label used by `--source` and in logs. Defaults to the provider name. */
  name?: string
  /** When true, a failure is logged and skipped instead of stopping the run. */
  optional?: boolean
  /** Extra credential variables this source logs in with, removed from the child like the built-in ones. */
  withhold?: string[]
  /** Provider-specific options. Strings support `${VAR}` and `${VAR:-default}`. */
  [option: string]: unknown
}

export interface SecretsConfig {
  $schema?: string
  /**
   * Files holding the credentials the providers log in with, e.g.
   * `.env.infisical`. Missing files are skipped. Their values are visible to
   * providers only, never to the child process.
   */
  envFiles?: string[]
  /** Read in parallel, merged in order: on a duplicate key the later source wins. */
  sources: SourceConfig[]
  /** Whether fetched secrets replace variables already set in the environment. Default true. */
  override?: boolean
  /** Start the child from a minimal environment instead of inheriting everything. Default false. */
  pure?: boolean
  /** Pass provider credentials (e.g. INFISICAL_CLIENT_SECRET) through to the child. Default false. */
  keepCredentials?: boolean
}

export const CONFIG_FILES = ["secrets.config.json", ".secretsrc.json"] as const

/** Looks for a config file from `cwd` upward, stopping at the repository root. */
export function findConfig(cwd: string, home = homedir()): string | undefined {
  let dir = resolve(cwd)
  const stopAt = resolve(home)
  for (;;) {
    for (const name of CONFIG_FILES) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
    const parent = dirname(dir)
    if (parent === dir || dir === stopAt || existsSync(join(dir, ".git"))) return undefined
    dir = parent
  }
}

/**
 * The config decides where credentials are sent, so on POSIX it must belong
 * to the current user (or root) and must not be writable by everyone.
 */
export async function assertTrustedFile(path: string): Promise<void> {
  if (process.platform === "win32" || typeof process.getuid !== "function") return
  const info = await stat(path)
  const uid = process.getuid()
  if (info.uid !== uid && info.uid !== 0) {
    throw new SecretsError(`Refusing ${path}: it belongs to another user`, {
      hint: "A config decides where credentials are sent. Use your own copy, or pass --config.",
    })
  }
  if (info.mode & 0o002) {
    throw new SecretsError(`Refusing ${path}: anyone on this machine can edit it`, { hint: `Run: chmod o-w ${path}` })
  }
}

export async function readConfig(path: string): Promise<SecretsConfig> {
  let raw: unknown
  try {
    await assertTrustedFile(path)
    raw = JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    if (error instanceof SecretsError) throw error
    throw new SecretsError(`Cannot read config ${path}: ${(error as Error).message}`, { cause: error })
  }
  return validateConfig(raw, path)
}

const TOP_LEVEL = new Set(["$schema", "envFiles", "sources", "override", "pure", "keepCredentials"])

export function validateConfig(raw: unknown, where = "config"): SecretsConfig {
  const fail = (message: string): never => {
    throw new SecretsError(`${where}: ${message}`, { hint: "See https://secrets.rin.ci/docs/configuration" })
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("must be a JSON object")
  const config = raw as Record<string, unknown>
  for (const key of Object.keys(config)) if (!TOP_LEVEL.has(key)) fail(`unknown key "${key}"`)
  if (!Array.isArray(config.sources) || config.sources.length === 0) fail('"sources" must be a non-empty array')
  if (
    config.envFiles !== undefined &&
    !(Array.isArray(config.envFiles) && config.envFiles.every((f) => typeof f === "string"))
  ) {
    fail('"envFiles" must be an array of paths')
  }
  for (const flag of ["override", "pure", "keepCredentials"]) {
    if (config[flag] !== undefined && typeof config[flag] !== "boolean") fail(`"${flag}" must be true or false`)
  }
  const names = new Set<string>()
  ;(config.sources as unknown[]).forEach((source, i) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) fail(`sources[${i}] must be an object`)
    const { provider, name, withhold } = source as SourceConfig
    if (typeof provider !== "string" || !provider) fail(`sources[${i}].provider is required`)
    if (withhold !== undefined && !(Array.isArray(withhold) && withhold.every((w) => typeof w === "string"))) {
      fail(`sources[${i}].withhold must be an array of variable names`)
    }
    const label = typeof name === "string" && name ? name : provider
    if (names.has(label)) fail(`two sources are named "${label}"; give one a "name"`)
    names.add(label)
    for (const key of Object.keys(source as object)) {
      if (
        /secret|token|password|clientSecret|privateKey/i.test(key) &&
        !["secret", "secrets", "secretId", "secretPath"].includes(key)
      ) {
        fail(
          `sources[${i}].${key} looks like a credential. Credentials come from the environment or envFiles, never the config file`,
        )
      }
    }
  })
  return config as unknown as SecretsConfig
}

export function sourceName(source: SourceConfig): string {
  return source.name || source.provider
}
