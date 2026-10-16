import { SecretsError } from "./errors.js"

const REFERENCE = /\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g

/**
 * Expands `${NAME}` and `${NAME:-fallback}` in a config string; `$$` is a
 * literal `$`. A reference to an unset variable without a fallback is an error
 * rather than an empty string, so a typo cannot silently point a fetch at the
 * wrong project or environment.
 */
export function interpolate(
  value: string,
  env: Readonly<Record<string, string | undefined>>,
  where = "config",
): string {
  return value.replace(REFERENCE, (match, name: string | undefined, fallback: string | undefined) => {
    if (match === "$$") return "$"
    const resolved = env[name as string]
    if (resolved !== undefined && resolved !== "") return resolved
    if (fallback !== undefined) return fallback
    throw new SecretsError(`${where} references \${${name}}, which is not set`, {
      hint: `Set ${name} in the environment or an env file, or write \${${name}:-default}.`,
    })
  })
}

/** Applies `interpolate` to every string inside a JSON value. */
export function interpolateDeep<T>(value: T, env: Readonly<Record<string, string | undefined>>, where = "config"): T {
  if (typeof value === "string") return interpolate(value, env, where) as T
  if (Array.isArray(value)) return value.map((item, i) => interpolateDeep(item, env, `${where}[${i}]`)) as T
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolateDeep(item, env, `${where}.${key}`)]),
    ) as T
  }
  return value
}
