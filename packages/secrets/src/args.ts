import { SecretsError } from "./errors.js"

export interface Flags {
  config?: string
  env?: string
  source: string[]
  envFile: string[]
  provider?: string
  set: string[]
  format?: string
  pure?: boolean
  override?: boolean
  keepCredentials?: boolean
  quiet?: boolean
  verbose?: boolean
  json?: boolean
  force?: boolean
  help?: boolean
  version?: boolean
}

export interface ParsedArgs {
  command: string
  flags: Flags
  /** For `run`, the command and its arguments, untouched. */
  rest: string[]
}

const VALUE_FLAGS: Record<string, keyof Flags> = {
  "-c": "config",
  "--config": "config",
  "-e": "env",
  "--env": "env",
  "-s": "source",
  "--source": "source",
  "--env-file": "envFile",
  "-p": "provider",
  "--provider": "provider",
  "--set": "set",
  "--format": "format",
}

const BOOLEAN_FLAGS: Record<string, [keyof Flags, boolean]> = {
  "--pure": ["pure", true],
  "--override": ["override", true],
  "--no-override": ["override", false],
  "--keep-credentials": ["keepCredentials", true],
  "-q": ["quiet", true],
  "--quiet": ["quiet", true],
  "-v": ["verbose", true],
  "--verbose": ["verbose", true],
  "--json": ["json", true],
  "--force": ["force", true],
  "-h": ["help", true],
  "--help": ["help", true],
  "-V": ["version", true],
  "--version": ["version", true],
}

export const COMMANDS = new Set(["run", "list", "check", "export", "init", "providers", "help"])

/**
 * Options come before the command to run. Everything from `--` or the first
 * non-option onward belongs to that command, so `run bun dev --port 3000`
 * passes `--port 3000` to bun rather than reading it here.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags: Flags = { source: [], envFile: [], set: [] }
  // Options without a command, like `-e prod -- bun dev`, mean `run`.
  let command = "run"
  let i = 0
  const first = argv[0]
  const explicit = first !== undefined && COMMANDS.has(first)
  if (explicit) {
    command = first
    i = 1
  } else if (first && !first.startsWith("-")) {
    throw new SecretsError(`Unknown command "${first}"`, {
      hint: `Did you mean \`rinci-secrets run ${argv.join(" ")}\`?`,
    })
  }

  const rest: string[] = []
  for (; i < argv.length; i++) {
    const token = argv[i] as string
    if (token === "--") {
      rest.push(...argv.slice(i + 1))
      break
    }
    if (!token.startsWith("-") || token === "-") {
      if (command === "run") {
        rest.push(...argv.slice(i))
        break
      }
      rest.push(token)
      continue
    }
    const eq = token.startsWith("--") ? token.indexOf("=") : -1
    const name = eq > 0 ? token.slice(0, eq) : token
    const inline = eq > 0 ? token.slice(eq + 1) : undefined

    const valueKey = VALUE_FLAGS[name]
    if (valueKey) {
      const value = inline ?? argv[++i]
      if (value === undefined) throw new SecretsError(`${name} needs a value`)
      const current = flags[valueKey]
      if (Array.isArray(current)) current.push(value)
      else (flags as unknown as Record<string, unknown>)[valueKey] = value
      continue
    }
    const bool = BOOLEAN_FLAGS[name]
    if (bool && inline === undefined) {
      ;(flags as unknown as Record<string, unknown>)[bool[0]] = bool[1]
      continue
    }
    throw new SecretsError(`Unknown option ${name}`, { hint: "Run `rinci-secrets --help` for the list." })
  }
  if (flags.version) command = "version"
  else if (flags.help || (!explicit && rest.length === 0)) command = "help"
  return { command, flags, rest }
}
