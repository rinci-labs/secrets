import { readFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { type Flags, parseArgs } from "./args.js"
import { CONFIG_FILES, type SourceConfig, sourceName } from "./config.js"
import { stringifyDotenv } from "./dotenv.js"
import { errorMessage, SecretsError } from "./errors.js"
import { createLogger, createPaint, type LogLevel } from "./log.js"
import { type LoadOptions, loadSecrets, resolveConfig } from "./load.js"
import { listProviders } from "./providers/index.js"
import { runWithSecrets } from "./run.js"
import { TEMPLATES } from "./templates.js"

export const VERSION = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version

const HELP = `rinci-secrets ${VERSION}
One entry point for every secrets manager. \`rsec\` is a short alias.

Usage
  rinci-secrets run [options] [--] <command> [args...]   Run a command with secrets injected
  rinci-secrets list [options] [--json]                  Show which keys each source provides, no values
  rinci-secrets check [options]                          Log in to every source and report, no values
  rinci-secrets export [options] [--format <f>]          Print secrets as dotenv, json, shell or powershell
  rinci-secrets init [provider] [--force]                Write a starter secrets.config.json
  rinci-secrets providers                                List supported providers and their credentials

Options
  -c, --config <path>      Config file (default: nearest secrets.config.json)
  -e, --env <name>         Sets \${SECRETS_ENV} for the config, e.g. dev, staging, prod
  -s, --source <name>      Only read this source (repeatable)
      --env-file <path>    Load provider credentials from this file (repeatable)
  -p, --provider <name>    Skip the config file and read from one provider
      --set <key=value>    Option for --provider (repeatable), e.g. --set projectId=abc
      --pure               Start the command from a minimal environment
      --no-override        Keep variables already set instead of replacing them
      --keep-credentials   Pass provider credentials through to the command
  -q, --quiet              Only print errors
  -v, --verbose            Also print key names, files read and credentials withheld
  -h, --help               Show this help
  -V, --version            Show the version

Docs: https://secrets.rin.ci/docs`

function loadOptions(flags: Flags, level: LogLevel): LoadOptions {
  const options: LoadOptions = {
    log: createLogger(level),
    environment: flags.env,
    sources: flags.source,
    envFiles: flags.envFile,
  }
  if (flags.provider) {
    if (flags.config) throw new SecretsError("Use either --config or --provider, not both")
    const source: SourceConfig = { provider: flags.provider }
    for (const pair of flags.set) {
      const eq = pair.indexOf("=")
      if (eq < 1) throw new SecretsError(`--set expects key=value, got "${pair}"`)
      source[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
    options.config = { sources: [source] }
  } else {
    if (flags.set.length) throw new SecretsError("--set only applies with --provider")
    options.config = flags.config
  }
  return options
}

const SHELL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export function formatExport(
  secrets: Record<string, string>,
  format: string,
  warn: (message: string) => void = () => {},
): string {
  const shellSafe = () =>
    Object.entries(secrets).filter(([key]) => {
      if (SHELL_NAME.test(key)) return true
      warn(`skipped ${JSON.stringify(key)}: not a valid shell variable name`)
      return false
    })
  switch (format) {
    case "dotenv":
      return stringifyDotenv(secrets)
    case "json":
      return JSON.stringify(secrets, null, 2)
    case "shell":
      return shellSafe()
        .map(([k, v]) => `export ${k}='${v.replaceAll("'", `'\\''`)}'`)
        .join("\n")
    case "powershell":
      return shellSafe()
        .map(([k, v]) => `$env:${k} = '${v.replaceAll("'", "''")}'`)
        .join("\n")
    default:
      throw new SecretsError(`Unknown format "${format}"`, { hint: "Use dotenv, json, shell or powershell." })
  }
}

export async function main(argv: readonly string[]): Promise<number> {
  const { command, flags, rest } = parseArgs(argv)
  const level: LogLevel = flags.quiet ? "quiet" : flags.verbose ? "verbose" : "normal"
  const paint = createPaint()
  const out = (text: string) => process.stdout.write(`${text}\n`)

  switch (command) {
    case "version":
      out(VERSION)
      return 0

    case "help":
      out(HELP)
      return 0

    case "providers":
      for (const provider of listProviders()) {
        out(`${paint.signal(provider.name.padEnd(10))} ${provider.description}`)
        if (provider.credentials.length) out(`${" ".repeat(11)}${paint.dim(provider.credentials.join(", "))}`)
      }
      return 0

    case "init": {
      const provider = rest[0] ?? flags.provider ?? "infisical"
      const template = TEMPLATES[provider]
      if (!template)
        throw new SecretsError(`No template for "${provider}"`, {
          hint: `Pick one of: ${Object.keys(TEMPLATES).join(", ")}.`,
        })
      const path = resolve(flags.config ?? CONFIG_FILES[0])
      try {
        await writeFile(path, `${JSON.stringify(template.config, null, 2)}\n`, { flag: flags.force ? "w" : "wx" })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new SecretsError(`${path} already exists`, { hint: "Pass --force to replace it." })
        }
        throw error
      }
      const log = createLogger(level)
      log.info(`wrote ${path}`)
      log.info(`next: ${template.next}`)
      if (template.config.envFiles) log.info(`make sure git ignores ${template.config.envFiles.join(", ")}`)
      return 0
    }

    case "run": {
      const [program, ...args] = rest
      if (!program) throw new SecretsError("Nothing to run", { hint: "rinci-secrets run -- <command> [args...]" })
      const result = await runWithSecrets(program, args, {
        ...loadOptions(flags, level),
        override: flags.override,
        pure: flags.pure,
        keepCredentials: flags.keepCredentials,
      })
      return result.code
    }

    case "list": {
      const loaded = await loadSecrets(loadOptions(flags, level))
      const owner = new Map<string, string>()
      for (const source of loaded.sources) for (const key of source.keys) owner.set(key, source.name)
      if (flags.json) {
        const keys = Object.fromEntries([...owner].toSorted(([a], [b]) => a.localeCompare(b)))
        out(JSON.stringify({ sources: loaded.sources, keys }, null, 2))
        return 0
      }
      for (const source of loaded.sources) {
        out(
          `${paint.signal(source.name)} ${paint.dim(`${source.provider} · ${source.keys.length} keys · ${source.ms}ms`)}`,
        )
        for (const key of source.keys.toSorted()) {
          const winner = owner.get(key)
          out(`  ${winner === source.name ? key : paint.dim(`${key} (overridden by ${winner})`)}`)
        }
      }
      return 0
    }

    case "check": {
      const base = loadOptions(flags, "quiet")
      const { config } = await resolveConfig(base)
      const names = flags.source.length ? flags.source : config.sources.map(sourceName)
      const results = await Promise.all(
        names.map(async (name) => {
          try {
            const loaded = await loadSecrets({ ...base, sources: [name] })
            const report = loaded.sources[0]
            if (report?.error) return { name, ok: false, line: `skipped (optional): ${report.error}`, hint: undefined }
            return { name, ok: true, line: `${report?.keys.length ?? 0} keys · ${report?.ms ?? 0}ms`, hint: undefined }
          } catch (error) {
            return {
              name,
              ok: false,
              line: errorMessage(error),
              hint: error instanceof SecretsError ? error.hint : undefined,
            }
          }
        }),
      )
      for (const r of results) {
        out(`${r.ok ? paint.signal("ok  ") : paint.error("fail")} ${r.name} ${paint.dim(r.line)}`)
        if (r.hint) out(`     ${paint.dim(r.hint)}`)
      }
      return results.every((r) => r.ok) ? 0 : 1
    }

    case "export": {
      if (process.stdout.isTTY && !flags.force) {
        throw new SecretsError("export prints secret values; refusing to write them to a terminal", {
          hint: "Redirect or pipe it (rinci-secrets export > .env.local), or pass --force.",
        })
      }
      const log = createLogger(level)
      const loaded = await loadSecrets(loadOptions(flags, level))
      out(formatExport(loaded.secrets, flags.format ?? "dotenv", log.warn))
      log.info(`exported ${Object.keys(loaded.secrets).length} secrets`)
      return 0
    }
  }
  return 0
}

/** Prints an error the way a user needs it: message, then what to do. Returns the exit code. */
export function reportError(error: unknown): number {
  const log = createLogger()
  if (error instanceof SecretsError) {
    log.error(error.message)
    if (error.hint) log.info(createPaint().dim(error.hint))
    return error.exitCode
  }
  log.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  return 1
}
