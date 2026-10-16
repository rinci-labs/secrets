import { SecretsError } from "../errors.js"
import { spawnCommand } from "../spawn.js"
import { sanitize } from "../text.js"
import type { Env } from "./types.js"

const MAX_OUTPUT = 16 * 1024 * 1024

/**
 * Runs a vendor CLI and parses its JSON stdout. Goes through `spawnCommand`,
 * so there is no shell, arguments from the config cannot be read as shell
 * syntax, and Windows `.cmd` installs of a CLI still work.
 */
export function execJson<T>(
  command: string,
  args: string[],
  { env, what, install, timeoutMs = 30_000 }: { env: Env; what: string; install: string; timeoutMs?: number },
): Promise<T> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawnCommand>
    try {
      child = spawnCommand(command, args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
    } catch (error) {
      reject(notInstalled(error, command, what, install))
      return
    }
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let size = 0
    let failure: SecretsError | undefined
    const stop = (error: SecretsError) => {
      failure ??= error
      child.kill()
    }
    const timer = setTimeout(() => stop(new SecretsError(`${what} timed out after ${timeoutMs}ms`)), timeoutMs)
    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_OUTPUT) stop(new SecretsError(`${what} printed more than ${MAX_OUTPUT} bytes`))
      else into.push(chunk)
    }
    child.stdout?.on("data", collect(stdout))
    child.stderr?.on("data", collect(stderr))
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(notInstalled(error, command, what, install))
    })
    child.once("close", (code) => {
      clearTimeout(timer)
      if (failure) return reject(failure)
      if (code !== 0) {
        const detail = sanitize(Buffer.concat(stderr).toString("utf8").split("\n").slice(-3).join(" "))
        return reject(new SecretsError(`${what} failed: ${detail || `exit code ${code}`}`))
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")) as T)
      } catch (cause) {
        reject(new SecretsError(`${what} printed invalid JSON`, { cause }))
      }
    })
  })
}

function notInstalled(error: unknown, command: string, what: string, install: string): SecretsError {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    return new SecretsError(`${what}: \`${command}\` is not installed or not on PATH`, { hint: install })
  }
  return new SecretsError(`${what}: could not start \`${command}\`: ${(error as Error).message}`, { cause: error })
}
