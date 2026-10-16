import { type ChildProcess, spawn, type SpawnOptions } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { delimiter, extname, isAbsolute, join } from "node:path"

const META = /([()\][%!^"`<>&|;, *?])/g

/** Quotes one argument for CreateProcess, then escapes cmd.exe metacharacters. */
export function escapeCmdArgument(arg: string, doubleEscape = false): string {
  let out = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1")
  out = `"${out}"`.replace(META, "^$1")
  return doubleEscape ? out.replace(META, "^$1") : out
}

export function escapeCmdCommand(command: string): string {
  return command.replace(META, "^$1")
}

function lookup(env: Record<string, string | undefined>, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name)
  return key === undefined ? undefined : env[key]
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Finds a command on PATH the way Windows would, minus the current directory:
 * running `bun` should never pick up a `bun.cmd` someone dropped in the repo.
 */
export function resolveWindowsCommand(command: string, env: Record<string, string | undefined>): string | undefined {
  const exts = (lookup(env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
  const candidates = (base: string) =>
    extname(base) ? [base, ...exts.map((e) => base + e)] : exts.map((e) => base + e)
  if (isAbsolute(command) || /[\\/]/.test(command)) return candidates(command).find(isFile)
  for (const dir of (lookup(env, "PATH") ?? "").split(delimiter).filter(Boolean)) {
    const found = candidates(join(dir, command)).find(isFile)
    if (found) return found
  }
  return undefined
}

/**
 * Spawns without a shell, so each argument reaches the program exactly as
 * given. On Windows, `.cmd` and `.bat` files (npm and bun shims) can only run
 * through cmd.exe, so those get escaped explicitly, as cross-spawn does.
 *
 * Throws an ENOENT error on Windows when the command is not on PATH: handing
 * the bare name to CreateProcess would let it search the current directory.
 */
export function spawnCommand(
  command: string,
  args: readonly string[],
  options: SpawnOptions & { env: Record<string, string | undefined> },
): ChildProcess {
  if (process.platform !== "win32") return spawn(command, args, { ...options, shell: false })

  const resolved = resolveWindowsCommand(command, options.env)
  if (!resolved) {
    throw Object.assign(new Error(`spawn ${command} ENOENT`), { code: "ENOENT", path: command })
  }
  if (!/\.(cmd|bat)$/i.test(resolved)) return spawn(resolved, args, { ...options, shell: false })

  const shim = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i.test(resolved)
  const line = [escapeCmdCommand(resolved), ...args.map((a) => escapeCmdArgument(a, shim))].join(" ")
  const comspec = lookup(options.env, "COMSPEC") ?? "cmd.exe"
  return spawn(comspec, ["/d", "/s", "/c", `"${line}"`], { ...options, shell: false, windowsVerbatimArguments: true })
}
