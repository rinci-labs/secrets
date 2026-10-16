import { readFile } from "node:fs/promises"
import { SecretsError } from "./errors.js"

const LINE =
  /^[ \t]*(?:export[ \t]+)?([\w.-]+)[ \t]*(?:=|:)[ \t]*('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|`(?:\\`|[^`])*`|[^#\n]*)?[ \t]*(?:#.*)?$/gm

/**
 * Parses a .env file. Follows the common dotenv rules:
 * - `KEY=value`, `export KEY=value`, `#` comments and blank lines
 * - single quotes are literal; double quotes expand `\n`, `\r`, `\t`, `\"` and `\\`
 * - quoted values may span lines; unquoted values end at ` #`
 * Later duplicates win. No variable expansion: a value is what the file says.
 */
export function parseDotenv(source: string): Record<string, string> {
  const result: Record<string, string> = {}
  const text = source.replace(/\r\n?/g, "\n")
  for (const match of text.matchAll(LINE)) {
    const key = match[1]
    if (!key) continue
    let value = (match[2] ?? "").trim()
    const quote = value[0]
    if ((quote === '"' || quote === "'" || quote === "`") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1)
      if (quote === '"') {
        value = value.replace(/\\([nrt"\\])/g, (_, ch: string) =>
          ch === "n" ? "\n" : ch === "r" ? "\r" : ch === "t" ? "\t" : ch,
        )
      } else {
        value = value.replaceAll(`\\${quote}`, quote)
      }
    }
    result[key] = value
  }
  return result
}

export async function readDotenv(path: string, { required = true } = {}): Promise<Record<string, string>> {
  try {
    return parseDotenv(await readFile(path, "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !required) return {}
    throw new SecretsError(`Cannot read env file ${path}`, { cause: error })
  }
}

/** Serialises to .env, double-quoted so every value round-trips through `parseDotenv`. */
export function stringifyDotenv(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => {
      const escaped = value
        .replaceAll("\\", "\\\\")
        .replaceAll('"', '\\"')
        .replaceAll("\n", "\\n")
        .replaceAll("\r", "\\r")
        .replaceAll("\t", "\\t")
      return `${key}="${escaped}"`
    })
    .join("\n")
}
