export type LogLevel = "quiet" | "normal" | "verbose"

export interface Logger {
  level: LogLevel
  info(message: string): void
  debug(message: string): void
  warn(message: string): void
  error(message: string): void
}

type Paint = (text: string) => string

function painter(enabled: boolean, open: string): Paint {
  return enabled ? (text) => `\x1b[${open}m${text}\x1b[0m` : (text) => text
}

export function colorsEnabled(stream: NodeJS.WriteStream = process.stderr): boolean {
  if (process.env.NO_COLOR !== undefined) return false
  if (process.env.FORCE_COLOR !== undefined) return process.env.FORCE_COLOR !== "0"
  return stream.isTTY === true
}

export function createPaint(enabled = colorsEnabled()) {
  return {
    signal: painter(enabled, "38;2;111;191;149"),
    dim: painter(enabled, "2"),
    bold: painter(enabled, "1"),
    warn: painter(enabled, "33"),
    error: painter(enabled, "31"),
  }
}

/**
 * Everything goes to stderr, so stdout carries only what a command was asked
 * to print (`export`, `list --json`) and can be piped safely.
 */
export function createLogger(
  level: LogLevel = "normal",
  write = (line: string) => process.stderr.write(`${line}\n`),
): Logger {
  const paint = createPaint()
  const tag = paint.signal("secrets")
  return {
    level,
    info: (message) => level !== "quiet" && write(`${tag} ${message}`),
    debug: (message) => level === "verbose" && write(`${tag} ${paint.dim(message)}`),
    warn: (message) => write(`${tag} ${paint.warn("warn")} ${message}`),
    error: (message) => write(`${tag} ${paint.error("error")} ${message}`),
  }
}

export const silentLogger: Logger = {
  level: "quiet",
  info() {},
  debug() {},
  warn() {},
  error() {},
}
