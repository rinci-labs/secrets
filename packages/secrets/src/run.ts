import { spawn } from "node:child_process"
import { buildChildEnv, type ChildEnvReport } from "./env.js"
import { SecretsError } from "./errors.js"
import { createLogger } from "./log.js"
import { type LoadOptions, type LoadResult, loadSecrets } from "./load.js"
import { spawnCommand } from "./spawn.js"

export interface RunOptions extends LoadOptions {
  /** Overrides the config's `override`. */
  override?: boolean
  /** Overrides the config's `pure`. */
  pure?: boolean
  /** Overrides the config's `keepCredentials`. */
  keepCredentials?: boolean
}

export interface RunResult {
  code: number
  signal: NodeJS.Signals | null
  loaded: LoadResult
  childEnv: Omit<ChildEnvReport, "env">
}

/**
 * Loads secrets, then runs `command` with them in its environment. Resolves
 * with the child's exit code once it exits; never rejects after the child
 * has started.
 */
export async function runWithSecrets(
  command: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const log = options.log ?? createLogger()
  const loaded = await loadSecrets({ ...options, log })
  const { config } = loaded
  const keepCredentials = options.keepCredentials ?? config.keepCredentials ?? false
  const { env, ...childEnv } = buildChildEnv(loaded.secrets, {
    base: options.env ?? process.env,
    override: options.override ?? config.override ?? true,
    pure: options.pure ?? config.pure ?? false,
    withhold: keepCredentials ? [] : loaded.withhold,
  })

  const summary = loaded.sources.map((s) => `${s.name} ${s.keys.length} (${s.ms}ms)`).join(", ")
  log.info(`${Object.keys(loaded.secrets).length} secrets from ${summary}`)
  if (childEnv.overridden.length)
    log.info(`overriding ${childEnv.overridden.length} existing: ${childEnv.overridden.join(", ")}`)
  if (childEnv.kept.length)
    log.info(`kept ${childEnv.kept.length} existing (override off): ${childEnv.kept.join(", ")}`)
  if (childEnv.withheld.length) log.debug(`withheld from child: ${childEnv.withheld.join(", ")}`)
  log.debug(`injected: ${[...childEnv.added, ...childEnv.overridden].toSorted().join(", ")}`)

  let child: ReturnType<typeof spawnCommand>
  try {
    child = spawnCommand(command, args, { stdio: "inherit", env, cwd: options.cwd })
  } catch (error) {
    throw startError(command, error)
  }

  // Ctrl+C reaches the whole foreground process group, child included, so
  // SIGINT is only swallowed here: the parent waits for the child to finish
  // shutting down instead of exiting first and orphaning it. SIGTERM and
  // SIGHUP are sent to this process alone and are passed on.
  const onInt = () => {}
  const forward = (signal: NodeJS.Signals) => () => {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true })
    } else {
      child.kill(signal)
    }
  }
  const onTerm = forward("SIGTERM")
  const onHup = forward("SIGHUP")
  process.on("SIGINT", onInt)
  process.on("SIGTERM", onTerm)
  process.on("SIGHUP", onHup)

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      process.off("SIGINT", onInt)
      process.off("SIGTERM", onTerm)
      process.off("SIGHUP", onHup)
    }
    child.once("error", (error) => {
      cleanup()
      reject(startError(command, error))
    })
    child.once("exit", (code, signal) => {
      cleanup()
      resolve({ code: code ?? (signal ? 128 + signalNumber(signal) : 1), signal, loaded, childEnv })
    })
  })
}

function startError(command: string, error: unknown): SecretsError {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    return new SecretsError(`Command not found: ${command}`, {
      hint: "Check the spelling and that it is on PATH.",
      exitCode: 127,
      cause: error,
    })
  }
  return new SecretsError(`Could not start ${command}: ${(error as Error).message}`, { exitCode: 126, cause: error })
}

function signalNumber(signal: NodeJS.Signals): number {
  return ({ SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGKILL: 9, SIGTERM: 15 } as Record<string, number>)[signal] ?? 1
}
