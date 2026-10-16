import type { Env, Secrets } from "./providers/types.js"

/** What a process needs to start and find its tools, and nothing app-specific. */
const PURE_KEEP = [
  "PATH",
  "PATHEXT",
  "HOME",
  "USER",
  "USERNAME",
  "LOGNAME",
  "SHELL",
  "TERM",
  "COLORTERM",
  "LANG",
  "LC_ALL",
  "TZ",
  "TMPDIR",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "COMSPEC",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
]

export interface ChildEnvOptions {
  base?: Env
  /** Replace variables already set in `base`. Default true. */
  override?: boolean
  /** Start from `PURE_KEEP` only. Default false. */
  pure?: boolean
  /** Names removed from `base` before secrets are added. */
  withhold?: readonly string[]
  /** Windows env names are case-insensitive. Default: the current platform. */
  caseInsensitive?: boolean
}

export interface ChildEnvReport {
  env: Record<string, string>
  added: string[]
  overridden: string[]
  /** Secrets not applied because `override` is off and the variable was already set. */
  kept: string[]
  withheld: string[]
}

export function buildChildEnv(secrets: Secrets, options: ChildEnvOptions = {}): ChildEnvReport {
  const {
    base = process.env,
    override = true,
    pure = false,
    withhold = [],
    caseInsensitive = process.platform === "win32",
  } = options
  const norm = caseInsensitive ? (k: string) => k.toUpperCase() : (k: string) => k
  const keep = new Set(PURE_KEEP.map(norm))
  const drop = new Set(withhold.map(norm))

  const env: Record<string, string> = {}
  const index = new Map<string, string>()
  const withheld: string[] = []
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue
    if (pure && !keep.has(norm(key))) continue
    if (drop.has(norm(key))) {
      withheld.push(key)
      continue
    }
    env[key] = value
    index.set(norm(key), key)
  }

  const added: string[] = []
  const overridden: string[] = []
  const kept: string[] = []
  for (const [key, value] of Object.entries(secrets)) {
    const existing = index.get(norm(key))
    if (existing !== undefined) {
      if (!override) {
        kept.push(key)
        continue
      }
      delete env[existing]
      overridden.push(key)
    } else {
      added.push(key)
    }
    env[key] = value
    index.set(norm(key), key)
  }
  return { env, added, overridden, kept, withheld }
}
